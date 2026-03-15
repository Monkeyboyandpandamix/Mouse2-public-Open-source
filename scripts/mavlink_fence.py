#!/usr/bin/env python3
import argparse
import json
import sys
import time
from typing import Any, Dict, List, Optional


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


def wait_param(mav, name: str, timeout: float) -> Optional[float]:
    name = name.upper()
    mav.mav.param_request_read_send(mav.target_system, mav.target_component, name.encode("utf-8"), -1)
    started = time.time()
    while time.time() - started < timeout:
        msg = mav.recv_match(type="PARAM_VALUE", blocking=True, timeout=0.6)
        if msg is None:
            continue
        pname = msg.param_id.decode("utf-8", errors="ignore").rstrip("\x00")
        if pname.upper() == name:
            return float(msg.param_value)
    return None


def set_param(mav, mavutil, name: str, value: float, timeout: float = 3.0) -> bool:
    name = name.upper()
    mav.mav.param_set_send(
        mav.target_system,
        mav.target_component,
        name.encode("utf-8"),
        float(value),
        mavutil.mavlink.MAV_PARAM_TYPE_REAL32,
    )
    v = wait_param(mav, name, timeout)
    return v is not None


def cmd_upload(args):
    mavutil = require_mavutil()
    try:
        payload = json.load(sys.stdin)
        points = payload.get("points", [])
        action = payload.get("action", "warn")
        alt_min = payload.get("minAltitude")
        alt_max = payload.get("maxAltitude")
        enable = bool(payload.get("enable", True))

        if not isinstance(points, list) or len(points) < 3:
            raise RuntimeError("Fence upload requires at least 3 points")

        mav = connect_mav(mavutil, args.connection, args.timeout)

        # Disable fence while writing
        set_param(mav, mavutil, "FENCE_ENABLE", 0)
        set_param(mav, mavutil, "FENCE_TOTAL", len(points))

        for idx, p in enumerate(points):
            lat = float(p["lat"])
            lng = float(p["lng"])
            # ardupilotmega extension message
            mav.mav.fence_point_send(mav.target_system, mav.target_component, idx, len(points), lat, lng)
            time.sleep(0.04)

        action_map = {"warn": 0, "rtl": 1, "land": 2, "hover": 3}
        set_param(mav, mavutil, "FENCE_ACTION", action_map.get(action, 0))
        if alt_min is not None:
            set_param(mav, mavutil, "FENCE_ALT_MIN", float(alt_min))
        if alt_max is not None:
            set_param(mav, mavutil, "FENCE_ALT_MAX", float(alt_max))
        if enable:
            set_param(mav, mavutil, "FENCE_ENABLE", 1)

        print(json.dumps({"success": True, "uploadedPoints": len(points)}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def cmd_download(args):
    mavutil = require_mavutil()
    try:
        mav = connect_mav(mavutil, args.connection, args.timeout)
        total = wait_param(mav, "FENCE_TOTAL", args.timeout)
        if total is None:
            raise RuntimeError("Unable to read FENCE_TOTAL")

        count = int(total)
        points: List[Dict[str, float]] = []

        for idx in range(count):
            mav.mav.fence_fetch_point_send(mav.target_system, mav.target_component, idx)
            started = time.time()
            got = None
            while time.time() - started < 2.5:
                msg = mav.recv_match(type="FENCE_POINT", blocking=True, timeout=0.6)
                if msg is None:
                    continue
                if int(msg.idx) == idx:
                    got = msg
                    break
            if got is not None:
                points.append({"lat": float(got.lat), "lng": float(got.lng)})

        action = wait_param(mav, "FENCE_ACTION", 2.0)
        alt_min = wait_param(mav, "FENCE_ALT_MIN", 2.0)
        alt_max = wait_param(mav, "FENCE_ALT_MAX", 2.0)
        enabled = wait_param(mav, "FENCE_ENABLE", 2.0)

        print(
            json.dumps(
                {
                    "success": True,
                    "count": len(points),
                    "points": points,
                    "action": int(action) if action is not None else None,
                    "minAltitude": alt_min,
                    "maxAltitude": alt_max,
                    "enabled": bool(int(enabled)) if enabled is not None else None,
                }
            )
        )
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    p_up = sub.add_parser("upload")
    p_up.add_argument("--connection", required=True)
    p_up.add_argument("--timeout", type=float, default=10.0)
    p_up.set_defaults(fn=cmd_upload)

    p_down = sub.add_parser("download")
    p_down.add_argument("--connection", required=True)
    p_down.add_argument("--timeout", type=float, default=10.0)
    p_down.set_defaults(fn=cmd_download)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()

