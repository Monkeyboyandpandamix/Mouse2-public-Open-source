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


def command_ack(mav, command: int, timeout: float = 5.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        msg = mav.recv_match(type="COMMAND_ACK", blocking=True, timeout=0.8)
        if msg is None:
            continue
        if int(msg.command) == int(command):
            return int(msg.result)
    return None


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
    time.sleep(0.15)


def cmd_start(args):
    mavutil = require_mavutil()
    try:
        mav = connect_mav(mavutil, args.connection, args.timeout)
        mode = args.mode.lower()
        cmd = mavutil.mavlink.MAV_CMD_PREFLIGHT_CALIBRATION
        p1 = p2 = p3 = p4 = p5 = p6 = p7 = 0
        if mode == "compass":
            p2 = 1
        elif mode == "radio":
            p4 = 1
        elif mode == "accel":
            p5 = 1
        elif mode == "gyro":
            p1 = 1
        elif mode == "level":
            p5 = 2
        elif mode == "baro":
            p3 = 1
        elif mode == "esc":
            set_param(mav, mavutil, "ESC_CALIBRATION", 3)
            cmd = mavutil.mavlink.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN
            mav.mav.command_long_send(
                mav.target_system,
                mav.target_component,
                cmd,
                0,
                1, 0, 0, 0, 0, 0, 0,
            )
            ack = command_ack(mav, cmd, timeout=4.0)
            print(json.dumps({"success": True, "mode": mode, "ack": ack, "message": "ESC calibration mode set; reboot command sent"}))
            return
        else:
            raise RuntimeError("Unsupported calibration mode")

        mav.mav.command_long_send(
            mav.target_system,
            mav.target_component,
            cmd,
            0,
            p1, p2, p3, p4, p5, p6, p7,
        )
        ack = command_ack(mav, cmd, timeout=6.0)
        success = ack in (0, 1, None)  # accepted or in progress; None means no ack but command sent
        print(json.dumps({"success": success, "mode": mode, "ack": ack}))
        if not success:
            sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def cmd_cancel(args):
    mavutil = require_mavutil()
    try:
        mav = connect_mav(mavutil, args.connection, args.timeout)
        cmd = mavutil.mavlink.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN
        mav.mav.command_long_send(
            mav.target_system,
            mav.target_component,
            cmd,
            0,
            0, 0, 0, 0, 0, 0, 0,
        )
        ack = command_ack(mav, cmd, timeout=4.0)
        print(json.dumps({"success": True, "ack": ack}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("start")
    s.add_argument("--connection", required=True)
    s.add_argument("--mode", required=True, choices=["compass", "accel", "radio", "esc", "gyro", "baro", "level"])
    s.add_argument("--timeout", type=float, default=8.0)
    s.set_defaults(fn=cmd_start)

    c = sub.add_parser("cancel")
    c.add_argument("--connection", required=True)
    c.add_argument("--timeout", type=float, default=8.0)
    c.set_defaults(fn=cmd_cancel)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
