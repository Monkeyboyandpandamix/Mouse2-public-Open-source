#!/usr/bin/env python3
import argparse
import json
import sys
import time
from typing import Dict, List, Tuple, Any


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


def frame_from_params(mavutil, params: Dict[str, Any]) -> int:
    frame = str(params.get("frame") or params.get("altitudeFrame") or "relative").lower()
    if frame in {"amsl", "global"}:
        return int(getattr(mavutil.mavlink, "MAV_FRAME_GLOBAL", 0))
    if frame in {"terrain", "terrain_follow", "terrain-follow"}:
        return int(getattr(mavutil.mavlink, "MAV_FRAME_GLOBAL_TERRAIN_ALT", 10))
    return int(getattr(mavutil.mavlink, "MAV_FRAME_GLOBAL_RELATIVE_ALT", 3))


def action_to_command(mavutil, action: str, params: Dict) -> Tuple[int, List[float]]:
    a = (action or "flythrough").lower()
    if a in {"flythrough", "waypoint"}:
        return mavutil.mavlink.MAV_CMD_NAV_WAYPOINT, [0, 0, 0, 0, 0, 0, 0]
    if a == "spline_waypoint":
        return mavutil.mavlink.MAV_CMD_NAV_SPLINE_WAYPOINT, [0, 0, 0, 0, 0, 0, 0]
    if a == "rtl":
        return mavutil.mavlink.MAV_CMD_NAV_RETURN_TO_LAUNCH, [0, 0, 0, 0, 0, 0, 0]
    if a == "land":
        return mavutil.mavlink.MAV_CMD_NAV_LAND, [0, 0, 0, 0, 0, 0, 0]
    if a == "takeoff":
        pitch = float(params.get("pitch", 0))
        yaw = float(params.get("yaw", 0))
        return mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, [pitch, 0, 0, yaw, 0, 0, 0]
    if a == "hover":
        hold = float(params.get("hoverTime", 5))
        return mavutil.mavlink.MAV_CMD_NAV_LOITER_TIME, [hold, 0, 0, 0, 0, 0, 0]
    if a == "loiter_turns":
        turns = float(params.get("turns", 1))
        radius = float(params.get("radius", 20))
        return mavutil.mavlink.MAV_CMD_NAV_LOITER_TURNS, [turns, radius, 0, 0, 0, 0, 0]
    if a == "do_set_servo":
        ch = float(params.get("servoChannel", 9))
        pwm = float(params.get("servoPwm", 1700))
        return mavutil.mavlink.MAV_CMD_DO_SET_SERVO, [ch, pwm, 0, 0, 0, 0, 0]
    if a == "open_gripper":
        ch = float(params.get("servoChannel", 9))
        pwm = float(params.get("servoPwm", 2000))
        return mavutil.mavlink.MAV_CMD_DO_SET_SERVO, [ch, pwm, 0, 0, 0, 0, 0]
    if a == "do_set_roi":
        roi_lat = float(params.get("roiLat", 0))
        roi_lng = float(params.get("roiLng", 0))
        roi_alt = float(params.get("roiAlt", 0))
        return mavutil.mavlink.MAV_CMD_DO_SET_ROI, [0, 0, 0, 0, roi_lat, roi_lng, roi_alt]
    if a == "do_change_speed":
        spd = float(params.get("speedMps", 5))
        return mavutil.mavlink.MAV_CMD_DO_CHANGE_SPEED, [1, spd, -1, 0, 0, 0, 0]
    if a == "do_set_cam_trig_dist":
        dist = float(params.get("distanceM", 20))
        return mavutil.mavlink.MAV_CMD_DO_SET_CAM_TRIGG_DIST, [dist, 0, 0, 0, 0, 0, 0]
    if a == "do_mount_control":
        pitch = float(params.get("pitchDeg", 0))
        roll = float(params.get("rollDeg", 0))
        yaw = float(params.get("yawDeg", 0))
        return mavutil.mavlink.MAV_CMD_DO_MOUNT_CONTROL, [pitch, roll, yaw, 0, 0, 0, 0]
    if a == "do_set_home":
        use_current = float(params.get("useCurrent", 1))
        lat = float(params.get("homeLat", 0))
        lng = float(params.get("homeLng", 0))
        alt = float(params.get("homeAlt", 0))
        return mavutil.mavlink.MAV_CMD_DO_SET_HOME, [use_current, 0, 0, 0, lat, lng, alt]
    if a == "do_jump":
        seq = float(params.get("targetSeq", 1))
        repeat = float(params.get("repeatCount", 1))
        return mavutil.mavlink.MAV_CMD_DO_JUMP, [seq, repeat, 0, 0, 0, 0, 0]
    if a == "condition_delay":
        sec = float(params.get("delaySec", 5))
        return mavutil.mavlink.MAV_CMD_CONDITION_DELAY, [sec, 0, 0, 0, 0, 0, 0]
    if a == "condition_yaw":
        yaw = float(params.get("yawDeg", 90))
        speed = float(params.get("yawSpeedDegS", 30))
        direction = float(params.get("direction", 1))
        relative = float(params.get("relative", 0))
        return mavutil.mavlink.MAV_CMD_CONDITION_YAW, [yaw, speed, direction, relative, 0, 0, 0]
    if a == "condition_distance":
        dist = float(params.get("distanceM", 20))
        return mavutil.mavlink.MAV_CMD_CONDITION_DISTANCE, [dist, 0, 0, 0, 0, 0, 0]
    if a == "condition_change_alt":
        rate = float(params.get("rateMps", 1))
        alt = float(params.get("targetAltM", 20))
        frame = float(params.get("frame", 0))
        return mavutil.mavlink.MAV_CMD_CONDITION_CHANGE_ALT, [rate, 0, 0, frame, 0, 0, alt]
    if a == "custom_command":
        cmd = int(params.get("command", mavutil.mavlink.MAV_CMD_NAV_WAYPOINT))
        plist = [
            float(params.get("param1", 0)),
            float(params.get("param2", 0)),
            float(params.get("param3", 0)),
            float(params.get("param4", 0)),
            float(params.get("param5", 0)),
            float(params.get("param6", 0)),
            float(params.get("param7", 0)),
        ]
        return cmd, plist
    return mavutil.mavlink.MAV_CMD_NAV_WAYPOINT, [0, 0, 0, 0, 0, 0, 0]


def cmd_upload(args):
    mavutil = require_mavutil()
    try:
        payload = json.load(sys.stdin)
        waypoints = payload.get("waypoints", [])
        if not isinstance(waypoints, list) or len(waypoints) == 0:
            raise RuntimeError("waypoints array required")

        mav = connect_mav(mavutil, args.connection, args.timeout)
        # clear existing mission first
        mav.mav.mission_clear_all_send(mav.target_system, mav.target_component)
        time.sleep(0.2)
        mav.mav.mission_count_send(mav.target_system, mav.target_component, len(waypoints))

        sent = 0
        started = time.time()
        while sent < len(waypoints) and time.time() - started < args.timeout + 20:
            msg = mav.recv_match(
                type=["MISSION_REQUEST", "MISSION_REQUEST_INT", "MISSION_ACK"],
                blocking=True,
                timeout=2.0,
            )
            if msg is None:
                continue
            mtype = msg.get_type()
            if mtype in ["MISSION_REQUEST", "MISSION_REQUEST_INT"]:
                seq = int(msg.seq)
                if seq < 0 or seq >= len(waypoints):
                    continue
                wp = waypoints[seq]
                action_params = wp.get("actionParams") or {}
                cmd, p = action_to_command(mavutil, str(wp.get("action") or "flythrough"), action_params)
                frame = frame_from_params(mavutil, action_params)
                lat = int(float(wp.get("lat")) * 1e7)
                lon = int(float(wp.get("lng")) * 1e7)
                alt = float(wp.get("altitude", wp.get("alt", 50)))
                current = int(wp.get("current", 1 if seq == 0 else 0))
                autocontinue = int(wp.get("autocontinue", 1))
                mav.mav.mission_item_int_send(
                    mav.target_system,
                    mav.target_component,
                    seq,
                    frame,
                    cmd,
                    current,
                    autocontinue,
                    float(p[0]),
                    float(p[1]),
                    float(p[2]),
                    float(p[3]),
                    lat,
                    lon,
                    alt,
                    mavutil.mavlink.MAV_MISSION_TYPE_MISSION,
                )
                sent += 1
            elif mtype == "MISSION_ACK":
                break

        print(json.dumps({"success": True, "uploadedItems": len(waypoints), "sent": sent}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def command_to_action(mavutil, command: int):
    mapping = {
        int(mavutil.mavlink.MAV_CMD_NAV_WAYPOINT): "flythrough",
        int(mavutil.mavlink.MAV_CMD_NAV_SPLINE_WAYPOINT): "spline_waypoint",
        int(mavutil.mavlink.MAV_CMD_NAV_LOITER_TIME): "hover",
        int(mavutil.mavlink.MAV_CMD_NAV_LOITER_TURNS): "loiter_turns",
        int(mavutil.mavlink.MAV_CMD_NAV_RETURN_TO_LAUNCH): "rtl",
        int(mavutil.mavlink.MAV_CMD_NAV_TAKEOFF): "takeoff",
        int(mavutil.mavlink.MAV_CMD_NAV_LAND): "land",
        int(mavutil.mavlink.MAV_CMD_DO_SET_SERVO): "do_set_servo",
        int(mavutil.mavlink.MAV_CMD_DO_SET_ROI): "do_set_roi",
        int(mavutil.mavlink.MAV_CMD_DO_SET_HOME): "do_set_home",
        int(mavutil.mavlink.MAV_CMD_DO_JUMP): "do_jump",
        int(mavutil.mavlink.MAV_CMD_DO_MOUNT_CONTROL): "do_mount_control",
        int(mavutil.mavlink.MAV_CMD_DO_SET_CAM_TRIGG_DIST): "do_set_cam_trig_dist",
        int(mavutil.mavlink.MAV_CMD_DO_CHANGE_SPEED): "do_change_speed",
        int(mavutil.mavlink.MAV_CMD_CONDITION_DELAY): "condition_delay",
        int(mavutil.mavlink.MAV_CMD_CONDITION_YAW): "condition_yaw",
        int(mavutil.mavlink.MAV_CMD_CONDITION_DISTANCE): "condition_distance",
        int(mavutil.mavlink.MAV_CMD_CONDITION_CHANGE_ALT): "condition_change_alt",
    }
    return mapping.get(int(command), "custom_command")


def cmd_download(args):
    mavutil = require_mavutil()
    try:
        mav = connect_mav(mavutil, args.connection, args.timeout)
        mav.mav.mission_request_list_send(mav.target_system, mav.target_component, mavutil.mavlink.MAV_MISSION_TYPE_MISSION)

        count = None
        started = time.time()
        while time.time() - started < args.timeout:
            msg = mav.recv_match(type=["MISSION_COUNT"], blocking=True, timeout=1.2)
            if msg is None:
                continue
            count = int(msg.count)
            break
        if count is None:
            raise RuntimeError("Unable to get mission count")

        items = []
        for i in range(count):
            mav.mav.mission_request_int_send(
                mav.target_system,
                mav.target_component,
                i,
                mavutil.mavlink.MAV_MISSION_TYPE_MISSION,
            )
            got = None
            t0 = time.time()
            while time.time() - t0 < 2.2:
                msg = mav.recv_match(type=["MISSION_ITEM_INT", "MISSION_ITEM"], blocking=True, timeout=0.8)
                if msg is None:
                    continue
                if int(msg.seq) == i:
                    got = msg
                    break
            if got is None:
                continue

            if got.get_type() == "MISSION_ITEM_INT":
                lat = float(got.x) / 1e7
                lon = float(got.y) / 1e7
                alt = float(got.z)
            else:
                lat = float(got.x)
                lon = float(got.y)
                alt = float(got.z)
            action = command_to_action(mavutil, int(got.command))
            action_params = {}
            if action == "hover":
                action_params = {"hoverTime": int(got.param1 or 5)}
            elif action == "loiter_turns":
                action_params = {"turns": float(got.param1 or 1), "radius": float(got.param2 or 20)}
            elif action == "do_set_servo":
                action_params = {"servoChannel": int(got.param1 or 9), "servoPwm": int(got.param2 or 1700)}
            elif action == "do_set_roi":
                action_params = {"roiLat": float(got.param5 or 0), "roiLng": float(got.param6 or 0), "roiAlt": float(got.param7 or 0)}
            elif action == "do_change_speed":
                action_params = {"speedMps": float(got.param2 or 5)}
            elif action == "do_set_cam_trig_dist":
                action_params = {"distanceM": float(got.param1 or 0)}
            elif action == "do_mount_control":
                action_params = {"pitchDeg": float(got.param1 or 0), "rollDeg": float(got.param2 or 0), "yawDeg": float(got.param3 or 0)}
            elif action == "do_set_home":
                action_params = {"useCurrent": float(got.param1 or 1), "homeLat": float(got.param5 or 0), "homeLng": float(got.param6 or 0), "homeAlt": float(got.param7 or 0)}
            elif action == "do_jump":
                action_params = {"targetSeq": int(got.param1 or 1), "repeatCount": int(got.param2 or 1)}
            elif action == "condition_delay":
                action_params = {"delaySec": int(got.param1 or 5)}
            elif action == "condition_yaw":
                action_params = {"yawDeg": float(got.param1 or 0), "yawSpeedDegS": float(got.param2 or 0), "direction": float(got.param3 or 1), "relative": float(got.param4 or 0)}
            elif action == "condition_distance":
                action_params = {"distanceM": float(got.param1 or 0)}
            elif action == "condition_change_alt":
                action_params = {"rateMps": float(got.param1 or 0), "frame": float(got.param4 or 0), "targetAltM": float(got.param7 or 0)}
            elif action == "custom_command":
                action_params = {
                    "command": int(got.command),
                    "param1": float(got.param1 or 0),
                    "param2": float(got.param2 or 0),
                    "param3": float(got.param3 or 0),
                    "param4": float(got.param4 or 0),
                    "param5": float(got.param5 or 0),
                    "param6": float(got.param6 or 0),
                    "param7": float(got.param7 or 0),
                }

            frame_name = "relative"
            if int(got.frame) == int(getattr(mavutil.mavlink, "MAV_FRAME_GLOBAL", 0)):
                frame_name = "amsl"
            elif int(got.frame) == int(getattr(mavutil.mavlink, "MAV_FRAME_GLOBAL_TERRAIN_ALT", 10)):
                frame_name = "terrain"
            action_params["frame"] = frame_name

            items.append(
                {
                    "order": i + 1,
                    "lat": lat,
                    "lng": lon,
                    "altitude": alt,
                    "action": action,
                    "actionParams": action_params,
                    "current": int(getattr(got, "current", 0)),
                    "autocontinue": int(getattr(got, "autocontinue", 1)),
                    "command": int(got.command),
                    "frame": int(got.frame),
                }
            )

        print(json.dumps({"success": True, "count": len(items), "waypoints": items}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    up = sub.add_parser("upload")
    up.add_argument("--connection", required=True)
    up.add_argument("--timeout", type=float, default=12.0)
    up.set_defaults(fn=cmd_upload)

    down = sub.add_parser("download")
    down.add_argument("--connection", required=True)
    down.add_argument("--timeout", type=float, default=12.0)
    down.set_defaults(fn=cmd_download)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
