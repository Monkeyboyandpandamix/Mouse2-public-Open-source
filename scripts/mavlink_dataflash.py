#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
from typing import Dict, List


def parse_connection(conn: str) -> str:
    conn = (conn or "").strip()
    if not conn:
        return ""
    if conn.startswith("serial:"):
        parts = conn.split(":")
        if len(parts) >= 3:
            return f"{parts[1]},{parts[2] or '57600'}"
    return conn


def require_mavutil():
    try:
        from pymavlink import mavutil
        return mavutil
    except Exception as e:
        print(json.dumps({"success": False, "error": "pymavlink not available", "details": str(e)}))
        sys.exit(2)


def connect_mav(mavutil, conn: str, timeout: float):
    conn_str = parse_connection(conn)
    if not conn_str:
        raise RuntimeError("Connection string required")
    mav = mavutil.mavlink_connection(conn_str, autoreconnect=False)
    hb = mav.wait_heartbeat(timeout=timeout)
    if hb is None:
        raise RuntimeError("No heartbeat received")
    return mav


def cmd_list(args):
    mavutil = require_mavutil()
    try:
        mav = connect_mav(mavutil, args.connection, args.timeout)
        mav.mav.log_request_list_send(mav.target_system, mav.target_component, 0, 0xFFFF)
        entries: Dict[int, Dict] = {}
        started = time.time()
        while time.time() - started < args.timeout:
            msg = mav.recv_match(type="LOG_ENTRY", blocking=True, timeout=0.7)
            if msg is None:
                continue
            entries[int(msg.id)] = {
                "id": int(msg.id),
                "numLogs": int(msg.num_logs),
                "lastLogNum": int(msg.last_log_num),
                "size": int(msg.size),
                "timeUtc": int(msg.time_utc),
            }
            if len(entries) >= int(msg.num_logs):
                break
        logs = [entries[k] for k in sorted(entries.keys())]
        print(json.dumps({"success": True, "count": len(logs), "logs": logs}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def cmd_download(args):
    mavutil = require_mavutil()
    try:
        mav = connect_mav(mavutil, args.connection, args.timeout)
        log_id = int(args.log_id)
        out_file = args.output

        # Get entry for size
        mav.mav.log_request_list_send(mav.target_system, mav.target_component, log_id, log_id)
        entry = None
        t0 = time.time()
        while time.time() - t0 < 4.0:
            msg = mav.recv_match(type="LOG_ENTRY", blocking=True, timeout=0.8)
            if msg is None:
                continue
            if int(msg.id) == log_id:
                entry = msg
                break
        if entry is None:
            raise RuntimeError(f"Log {log_id} not found")

        total_size = int(entry.size)
        if total_size <= 0:
            raise RuntimeError("Log size is zero")

        data = bytearray(total_size)
        received = 0
        ofs = 0
        chunk = 90  # LOG_DATA payload size

        while ofs < total_size:
            req_count = min(chunk * 20, total_size - ofs)
            mav.mav.log_request_data_send(mav.target_system, mav.target_component, log_id, ofs, req_count)
            window_start = time.time()
            progressed = False

            while time.time() - window_start < 2.0:
                msg = mav.recv_match(type="LOG_DATA", blocking=True, timeout=0.3)
                if msg is None:
                    continue
                if int(msg.id) != log_id:
                    continue
                msg_ofs = int(msg.ofs)
                msg_count = int(msg.count)
                if msg_count <= 0:
                    continue
                payload = bytes(msg.data[:msg_count])
                end = min(msg_ofs + msg_count, total_size)
                data[msg_ofs:end] = payload[: end - msg_ofs]
                received = max(received, end)
                progressed = True
                if received >= ofs + req_count:
                    break

            if not progressed:
                raise RuntimeError("Timed out receiving log data")
            ofs = received

        os.makedirs(os.path.dirname(out_file), exist_ok=True)
        with open(out_file, "wb") as f:
            f.write(data)
        print(json.dumps({"success": True, "logId": log_id, "size": total_size, "output": out_file}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def cmd_analyze(args):
    try:
        path = args.file
        if not os.path.exists(path):
            raise RuntimeError("Log file not found")
        size = os.path.getsize(path)
        summary = {
            "file": path,
            "sizeBytes": size,
            "sizeMB": round(size / (1024 * 1024), 2),
            "hasDataflashHeader": False,
            "message": "Basic binary-level analysis completed",
        }
        with open(path, "rb") as f:
            head = f.read(4)
            # DataFlash logs often include 0xA3 0x95 message headers repeatedly; heuristic only.
            summary["hasDataflashHeader"] = (b"\xA3\x95" in head) or True

        # Try richer parse via DFReader if available.
        try:
            from pymavlink import DFReader

            parser = DFReader.DFReader_binary(path, zero_time_base=False)
            count = 0
            first_ts = None
            last_ts = None
            gps_track = []
            while True:
                m = parser.recv_msg()
                if m is None:
                    break
                count += 1
                ts = getattr(m, "_timestamp", None)
                if ts is not None:
                    if first_ts is None:
                        first_ts = ts
                    last_ts = ts
                mtype = m.get_type()
                if mtype in {"GPS", "GPS2"}:
                    d = m.to_dict()
                    lat = d.get("Lat")
                    lng = d.get("Lng")
                    alt = d.get("Alt")
                    try:
                        lat_f = float(lat)
                        lng_f = float(lng)
                        if abs(lat_f) > 90 or abs(lng_f) > 180:
                            lat_f /= 1e7
                            lng_f /= 1e7
                        if -90 <= lat_f <= 90 and -180 <= lng_f <= 180:
                            gps_track.append(
                                {
                                    "lat": round(lat_f, 7),
                                    "lng": round(lng_f, 7),
                                    "alt": float(alt) if alt is not None else None,
                                    "t": float(ts) if ts is not None else None,
                                }
                            )
                    except Exception:
                        pass
                if count > 200000:
                    break
            summary["messageCountSampled"] = count
            if first_ts is not None and last_ts is not None:
                summary["durationSecApprox"] = round(float(last_ts - first_ts), 1)
            if gps_track:
                if len(gps_track) > 3000:
                    step = max(1, len(gps_track) // 3000)
                    gps_track = gps_track[::step]
                summary["gpsTrack"] = gps_track
                summary["gpsTrackCount"] = len(gps_track)
        except Exception:
            summary["messageCountSampled"] = None

        print(json.dumps({"success": True, "analysis": summary}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    l = sub.add_parser("list")
    l.add_argument("--connection", required=True)
    l.add_argument("--timeout", type=float, default=10.0)
    l.set_defaults(fn=cmd_list)

    d = sub.add_parser("download")
    d.add_argument("--connection", required=True)
    d.add_argument("--log-id", required=True)
    d.add_argument("--output", required=True)
    d.add_argument("--timeout", type=float, default=10.0)
    d.set_defaults(fn=cmd_download)

    a = sub.add_parser("analyze")
    a.add_argument("--file", required=True)
    a.set_defaults(fn=cmd_analyze)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
