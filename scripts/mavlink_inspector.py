#!/usr/bin/env python3
import argparse
import json
import sys
import time


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


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--connection", required=True)
    p.add_argument("--timeout", type=float, default=6.0)
    p.add_argument("--live", action="store_true")
    p.add_argument("--duration", type=float, default=2.0)
    args = p.parse_args()

    mavutil = require_mavutil()
    try:
        conn_str = parse_connection(args.connection)
        if not conn_str:
            raise RuntimeError("Connection string required")
        mav = mavutil.mavlink_connection(conn_str, autoreconnect=False)
        hb = mav.wait_heartbeat(timeout=args.timeout)
        if hb is None:
            raise RuntimeError("No heartbeat received")

        snapshot = {
            "heartbeat": {
                "type": int(hb.type),
                "autopilot": int(hb.autopilot),
                "baseMode": int(hb.base_mode),
                "customMode": int(hb.custom_mode),
                "systemStatus": int(hb.system_status),
            },
            "attitude": None,
            "gps": None,
            "sysStatus": None,
            "receivedTypes": [],
        }

        if args.live:
            duration = max(0.5, float(args.duration))
            start = time.time()
            bucket_start = start
            current_bucket = {"attitude": 0, "gps": 0, "sys": 0, "heartbeat": 0, "total": 0}
            bins = []
            counts = {}
            latest = {"attitude": None, "gps": None, "sysStatus": None}

            while time.time() - start < duration:
                msg = mav.recv_match(blocking=True, timeout=0.2)
                now = time.time()
                if now - bucket_start >= 1.0:
                    bins.append(
                        {
                            "t": round(bucket_start - start, 2),
                            "attitude": current_bucket["attitude"],
                            "gps": current_bucket["gps"],
                            "sys": current_bucket["sys"],
                            "heartbeat": current_bucket["heartbeat"],
                            "total": current_bucket["total"],
                        }
                    )
                    bucket_start = now
                    current_bucket = {"attitude": 0, "gps": 0, "sys": 0, "heartbeat": 0, "total": 0}
                if msg is None:
                    continue
                mtype = msg.get_type()
                if mtype == "BAD_DATA":
                    continue
                counts[mtype] = int(counts.get(mtype, 0)) + 1
                current_bucket["total"] += 1
                if mtype == "ATTITUDE":
                    current_bucket["attitude"] += 1
                    latest["attitude"] = {
                        "roll": float(msg.roll),
                        "pitch": float(msg.pitch),
                        "yaw": float(msg.yaw),
                    }
                elif mtype == "GPS_RAW_INT":
                    current_bucket["gps"] += 1
                    latest["gps"] = {
                        "fixType": int(msg.fix_type),
                        "lat": float(msg.lat) / 1e7 if msg.lat is not None else None,
                        "lng": float(msg.lon) / 1e7 if msg.lon is not None else None,
                        "satellitesVisible": int(msg.satellites_visible),
                    }
                elif mtype == "SYS_STATUS":
                    current_bucket["sys"] += 1
                    latest["sysStatus"] = {
                        "batteryVoltage": float(msg.voltage_battery) / 1000.0 if msg.voltage_battery is not None else None,
                        "batteryRemaining": int(msg.battery_remaining) if msg.battery_remaining is not None else None,
                    }
                elif mtype == "HEARTBEAT":
                    current_bucket["heartbeat"] += 1

            if current_bucket["total"] > 0 or current_bucket["attitude"] > 0 or current_bucket["gps"] > 0 or current_bucket["sys"] > 0:
                bins.append(
                    {
                        "t": round(bucket_start - start, 2),
                        "attitude": current_bucket["attitude"],
                        "gps": current_bucket["gps"],
                        "sys": current_bucket["sys"],
                        "heartbeat": current_bucket["heartbeat"],
                        "total": current_bucket["total"],
                    }
                )

            elapsed = max(0.001, time.time() - start)
            rates = {k: round(v / elapsed, 2) for k, v in counts.items()}
            print(
                json.dumps(
                    {
                        "success": True,
                        "live": {
                            "durationSec": round(elapsed, 2),
                            "messageCounts": counts,
                            "messageRates": rates,
                            "bins": bins,
                            "latest": latest,
                        },
                    }
                )
            )
            return

        want = {"ATTITUDE", "GPS_RAW_INT", "SYS_STATUS"}
        seen = set()
        started = time.time()
        while time.time() - started < args.timeout:
            msg = mav.recv_match(blocking=True, timeout=0.5)
            if msg is None:
                continue
            mtype = msg.get_type()
            if mtype == "BAD_DATA":
                continue
            seen.add(mtype)
            if mtype == "ATTITUDE":
                snapshot["attitude"] = {
                    "roll": float(msg.roll),
                    "pitch": float(msg.pitch),
                    "yaw": float(msg.yaw),
                    "rollspeed": float(msg.rollspeed),
                    "pitchspeed": float(msg.pitchspeed),
                    "yawspeed": float(msg.yawspeed),
                }
            elif mtype == "GPS_RAW_INT":
                snapshot["gps"] = {
                    "fixType": int(msg.fix_type),
                    "lat": float(msg.lat) / 1e7 if msg.lat is not None else None,
                    "lng": float(msg.lon) / 1e7 if msg.lon is not None else None,
                    "alt": float(msg.alt) / 1000.0 if msg.alt is not None else None,
                    "satellitesVisible": int(msg.satellites_visible),
                }
            elif mtype == "SYS_STATUS":
                snapshot["sysStatus"] = {
                    "batteryVoltage": float(msg.voltage_battery) / 1000.0 if msg.voltage_battery is not None else None,
                    "batteryCurrent": float(msg.current_battery) / 100.0 if msg.current_battery is not None and msg.current_battery != -1 else None,
                    "batteryRemaining": int(msg.battery_remaining) if msg.battery_remaining is not None else None,
                }
            if want.issubset(seen):
                break

        snapshot["receivedTypes"] = sorted(list(seen))
        print(json.dumps({"success": True, "snapshot": snapshot}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
