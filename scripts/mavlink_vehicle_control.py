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


def connect(conn: str, timeout: float):
    mavutil = require_mavutil()
    conn_str = parse_connection(conn)
    if not conn_str:
        raise RuntimeError("Connection string required")
    mav = mavutil.mavlink_connection(conn_str, autoreconnect=False)
    hb = mav.wait_heartbeat(timeout=timeout)
    if hb is None:
        raise RuntimeError("No heartbeat received")
    return mavutil, mav


def wait_command_ack(mav, timeout: float):
    started = time.time()
    while time.time() - started < timeout:
        msg = mav.recv_match(type="COMMAND_ACK", blocking=True, timeout=0.4)
        if msg is None:
            continue
        return int(msg.result)
    return None


def cmd_action(args):
    try:
        mavutil, mav = connect(args.connection, args.timeout)
        action = (args.action or "").strip().lower()

        if action == "arm":
            mav.mav.command_long_send(
                mav.target_system,
                mav.target_component,
                mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                0,
                1,
                0,
                0,
                0,
                0,
                0,
                0,
            )
        elif action == "disarm":
            mav.mav.command_long_send(
                mav.target_system,
                mav.target_component,
                mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
            )
        elif action == "set_mode":
            mode = (args.mode or "").strip().upper()
            if not mode:
                raise RuntimeError("mode is required for set_mode")
            mode_mapping = mav.mode_mapping() or {}
            if mode not in mode_mapping:
                raise RuntimeError(f"Unknown mode: {mode}")
            mav.set_mode(mode_mapping[mode])
        elif action == "reboot":
            mav.mav.command_long_send(
                mav.target_system,
                mav.target_component,
                mavutil.mavlink.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN,
                0,
                1,
                0,
                0,
                0,
                0,
                0,
                0,
            )
        else:
            raise RuntimeError("action must be arm|disarm|set_mode|reboot")

        ack = wait_command_ack(mav, args.timeout)
        print(json.dumps({"success": True, "action": action, "mode": args.mode, "ack": ack}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def clamp(v: int, lo: int, hi: int):
    return max(lo, min(hi, int(v)))


def cmd_manual(args):
    try:
        _, mav = connect(args.connection, args.timeout)
        x = clamp(args.x, -1000, 1000)
        y = clamp(args.y, -1000, 1000)
        z = clamp(args.z, 0, 1000)
        r = clamp(args.r, -1000, 1000)
        buttons = max(0, int(args.buttons))
        duration_ms = max(100, int(args.duration_ms))
        period = 0.1
        count = max(1, int(duration_ms / int(period * 1000)))

        for _ in range(count):
            mav.mav.manual_control_send(mav.target_system, x, y, z, r, buttons)
            time.sleep(period)

        print(
            json.dumps(
                {
                    "success": True,
                    "x": x,
                    "y": y,
                    "z": z,
                    "r": r,
                    "buttons": buttons,
                    "durationMs": duration_ms,
                }
            )
        )
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("action")
    a.add_argument("--connection", required=True)
    a.add_argument("--action", required=True)
    a.add_argument("--mode", required=False)
    a.add_argument("--timeout", type=float, default=8.0)
    a.set_defaults(fn=cmd_action)

    m = sub.add_parser("manual")
    m.add_argument("--connection", required=True)
    m.add_argument("--x", type=int, default=0)
    m.add_argument("--y", type=int, default=0)
    m.add_argument("--z", type=int, default=500)
    m.add_argument("--r", type=int, default=0)
    m.add_argument("--buttons", type=int, default=0)
    m.add_argument("--duration-ms", type=int, default=400)
    m.add_argument("--timeout", type=float, default=6.0)
    m.set_defaults(fn=cmd_manual)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
