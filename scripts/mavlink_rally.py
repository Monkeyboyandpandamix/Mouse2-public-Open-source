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


def connect_mav(mavutil, conn: str, timeout: float):
    conn_str = parse_connection(conn)
    if not conn_str:
        raise RuntimeError("Connection string required")
    mav = mavutil.mavlink_connection(conn_str, autoreconnect=False)
    hb = mav.wait_heartbeat(timeout=timeout)
    if hb is None:
        raise RuntimeError("No heartbeat received")
    return mav


def wait_param(mav, name: str, timeout: float = 3.0):
    name = name.upper()
    mav.mav.param_request_read_send(mav.target_system, mav.target_component, name.encode("utf-8"), -1)
    t0 = time.time()
    while time.time() - t0 < timeout:
        msg = mav.recv_match(type="PARAM_VALUE", blocking=True, timeout=0.6)
        if msg is None:
            continue
        pname = msg.param_id.decode("utf-8", errors="ignore").rstrip("\x00")
        if pname.upper() == name:
            return float(msg.param_value)
    return None


def set_param(mav, mavutil, name: str, value: float):
    mav.mav.param_set_send(
        mav.target_system,
        mav.target_component,
        name.encode("utf-8"),
        float(value),
        mavutil.mavlink.MAV_PARAM_TYPE_REAL32,
    )
    time.sleep(0.1)


def cmd_upload(args):
    mavutil = require_mavutil()
    try:
        payload = json.load(sys.stdin)
        points = payload.get("points", [])
        if not isinstance(points, list):
            raise RuntimeError("points array required")
        if len(points) > 10:
            points = points[:10]

        mav = connect_mav(mavutil, args.connection, args.timeout)
        set_param(mav, mavutil, "RALLY_TOTAL", len(points))

        for idx, p in enumerate(points):
            lat = float(p["lat"])
            lng = float(p["lng"])
            alt = float(p.get("alt", p.get("altitude", 50)))
            break_alt = float(p.get("breakAlt", alt))
            land_dir = float(p.get("landDir", 0))
            flags = int(p.get("flags", 0))
            mav.mav.rally_point_send(
                mav.target_system,
                mav.target_component,
                idx,
                len(points),
                lat,
                lng,
                alt,
                break_alt,
                land_dir,
                flags,
            )
            time.sleep(0.08)

        print(json.dumps({"success": True, "uploadedRallyPoints": len(points)}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def cmd_download(args):
    mavutil = require_mavutil()
    try:
        mav = connect_mav(mavutil, args.connection, args.timeout)
        total = wait_param(mav, "RALLY_TOTAL", args.timeout)
        if total is None:
            raise RuntimeError("Unable to read RALLY_TOTAL")
        count = int(total)
        points = []
        for idx in range(count):
            mav.mav.rally_fetch_point_send(mav.target_system, mav.target_component, idx)
            got = None
            t0 = time.time()
            while time.time() - t0 < 2.2:
                msg = mav.recv_match(type="RALLY_POINT", blocking=True, timeout=0.8)
                if msg is None:
                    continue
                if int(msg.idx) == idx:
                    got = msg
                    break
            if got is None:
                continue
            points.append(
                {
                    "lat": float(got.lat),
                    "lng": float(got.lng),
                    "altitude": float(got.alt),
                    "breakAlt": float(got.break_alt),
                    "landDir": float(got.land_dir),
                    "flags": int(got.flags),
                }
            )

        print(json.dumps({"success": True, "count": len(points), "points": points}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    up = sub.add_parser("upload")
    up.add_argument("--connection", required=True)
    up.add_argument("--timeout", type=float, default=10.0)
    up.set_defaults(fn=cmd_upload)

    down = sub.add_parser("download")
    down.add_argument("--connection", required=True)
    down.add_argument("--timeout", type=float, default=10.0)
    down.set_defaults(fn=cmd_download)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()

