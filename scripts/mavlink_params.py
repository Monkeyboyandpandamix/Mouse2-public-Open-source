#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import time
from typing import Dict, Tuple


def parse_connection(conn: str) -> str:
    conn = (conn or "").strip()
    if not conn:
        return ""
    if conn.startswith("serial:"):
      # serial:/dev/ttyACM0:57600 -> /dev/ttyACM0,57600
      parts = conn.split(":")
      if len(parts) >= 3:
        port = parts[1]
        baud = parts[2] or "57600"
        return f"{port},{baud}"
    if conn.startswith("udp:"):
      # udp:127.0.0.1:14550 -> udp:127.0.0.1:14550
      return conn
    if conn.startswith("tcp:"):
      return conn
    return conn


def to_number(v):
    try:
        if isinstance(v, (int, float)):
            return v
        s = str(v)
        if re.match(r"^-?\d+$", s):
            return int(s)
        return float(s)
    except Exception:
        return v


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
        mav.mav.param_request_list_send(mav.target_system, mav.target_component)

        started = time.time()
        last_rx = time.time()
        params: Dict[str, float] = {}
        expected_count = None

        while True:
            msg = mav.recv_match(type='PARAM_VALUE', blocking=True, timeout=0.8)
            now = time.time()
            if msg is not None:
                name = msg.param_id.decode('utf-8', errors='ignore').rstrip('\x00') if isinstance(msg.param_id, (bytes, bytearray)) else str(msg.param_id).rstrip('\x00')
                params[name] = msg.param_value
                expected_count = int(msg.param_count)
                last_rx = now

            # stop once we got all expected params or timed out after receiving data
            if expected_count is not None and len(params) >= expected_count:
                break
            if now - started > args.timeout:
                break
            if expected_count is not None and now - last_rx > 1.4:
                break

        items = [{"name": k, "value": params[k]} for k in sorted(params.keys())]
        print(json.dumps({
            "success": True,
            "count": len(items),
            "expectedCount": expected_count,
            "params": items,
        }))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def cmd_get(args):
    mavutil = require_mavutil()
    try:
        mav = connect_mav(mavutil, args.connection, args.timeout)
        pname = args.name.strip().upper()
        mav.mav.param_request_read_send(
            mav.target_system,
            mav.target_component,
            pname.encode('utf-8'),
            -1,
        )
        started = time.time()
        while time.time() - started < args.timeout:
            msg = mav.recv_match(type='PARAM_VALUE', blocking=True, timeout=0.7)
            if msg is None:
                continue
            name = msg.param_id.decode('utf-8', errors='ignore').rstrip('\x00') if isinstance(msg.param_id, (bytes, bytearray)) else str(msg.param_id).rstrip('\x00')
            if name.upper() == pname:
                print(json.dumps({"success": True, "name": name, "value": msg.param_value, "type": int(msg.param_type)}))
                return
        print(json.dumps({"success": False, "error": f"Parameter not found or timed out: {pname}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def cmd_set(args):
    mavutil = require_mavutil()
    try:
        mav = connect_mav(mavutil, args.connection, args.timeout)
        pname = args.name.strip().upper()
        value = float(args.value)

        ptype = int(args.param_type) if args.param_type is not None else mavutil.mavlink.MAV_PARAM_TYPE_REAL32
        mav.mav.param_set_send(
            mav.target_system,
            mav.target_component,
            pname.encode('utf-8'),
            value,
            ptype,
        )

        started = time.time()
        while time.time() - started < args.timeout:
            msg = mav.recv_match(type='PARAM_VALUE', blocking=True, timeout=0.7)
            if msg is None:
                continue
            name = msg.param_id.decode('utf-8', errors='ignore').rstrip('\x00') if isinstance(msg.param_id, (bytes, bytearray)) else str(msg.param_id).rstrip('\x00')
            if name.upper() == pname:
                print(json.dumps({"success": True, "name": name, "value": msg.param_value, "type": int(msg.param_type)}))
                return

        print(json.dumps({"success": False, "error": f"Timed out waiting for ack on {pname}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def cmd_import(args):
    try:
        if args.file:
            with open(args.file, 'r', encoding='utf-8') as f:
                payload = json.load(f)
        else:
            payload = json.load(sys.stdin)

        raw = payload.get("params", payload)
        if isinstance(raw, dict):
            items = [{"name": k, "value": v} for k, v in raw.items()]
        elif isinstance(raw, list):
            items = raw
        else:
            raise RuntimeError("Invalid params payload")

        applied = []
        failed = []
        for item in items:
            name = str(item.get("name", "")).strip().upper()
            value = to_number(item.get("value"))
            if not name:
                continue
            rc = os.system(
                f"{sys.executable} {__file__} set --connection {args.connection!s} --name {name!s} --value {float(value)!s} --timeout {args.timeout!s} >/tmp/mav_set_out.json 2>/tmp/mav_set_err.log"
            )
            if rc == 0:
                applied.append({"name": name, "value": value})
            else:
                failed.append({"name": name, "value": value})

        print(json.dumps({"success": True, "applied": applied, "failed": failed}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list")
    p_list.add_argument("--connection", required=True)
    p_list.add_argument("--timeout", type=float, default=10.0)
    p_list.set_defaults(fn=cmd_list)

    p_get = sub.add_parser("get")
    p_get.add_argument("--connection", required=True)
    p_get.add_argument("--name", required=True)
    p_get.add_argument("--timeout", type=float, default=6.0)
    p_get.set_defaults(fn=cmd_get)

    p_set = sub.add_parser("set")
    p_set.add_argument("--connection", required=True)
    p_set.add_argument("--name", required=True)
    p_set.add_argument("--value", required=True)
    p_set.add_argument("--param-type", required=False)
    p_set.add_argument("--timeout", type=float, default=6.0)
    p_set.set_defaults(fn=cmd_set)

    p_import = sub.add_parser("import")
    p_import.add_argument("--connection", required=True)
    p_import.add_argument("--file", required=False)
    p_import.add_argument("--timeout", type=float, default=6.0)
    p_import.set_defaults(fn=cmd_import)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
