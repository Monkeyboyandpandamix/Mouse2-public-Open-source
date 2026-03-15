#!/usr/bin/env python3
import argparse
import json
import os
import shlex
import subprocess
import sys
from typing import Tuple


def parse_connection(conn: str) -> Tuple[str, str]:
    conn = (conn or "").strip()
    if not conn:
        return "", ""
    if conn.startswith("serial:"):
        parts = conn.split(":")
        if len(parts) >= 3:
            return parts[1], parts[2] or "115200"
    if conn.startswith("/dev/") or conn.upper().startswith("COM"):
        return conn, "115200"
    return conn, "115200"


def run_with_template(template: str, firmware_path: str, port: str, baud: str):
    cmd = (
        template.replace("{file}", shlex.quote(firmware_path))
        .replace("{port}", shlex.quote(port))
        .replace("{baud}", shlex.quote(str(baud)))
    )
    proc = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def cmd_flash(args):
    firmware = args.file
    if not os.path.exists(firmware):
        print(json.dumps({"success": False, "error": f"Firmware file not found: {firmware}"}))
        sys.exit(1)

    port, baud = parse_connection(args.connection)
    if not port:
        print(json.dumps({"success": False, "error": "Serial connection is required for firmware flashing"}))
        sys.exit(1)

    # Must be explicitly configured for real hardware flashing.
    template = os.environ.get("MOUSE_FIRMWARE_UPLOADER", "").strip()
    if not template:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "MOUSE_FIRMWARE_UPLOADER is not configured. Set a real uploader command template.",
                    "example": "python3 /path/to/uploader.py --port {port} --baud-bootloader {baud} {file}",
                }
            )
        )
        sys.exit(1)

    rc, out, err = run_with_template(template, firmware, port, baud)
    if rc != 0:
        print(json.dumps({"success": False, "error": "Firmware upload failed", "stdout": out[-2000:], "stderr": err[-2000:]}))
        sys.exit(1)

    print(json.dumps({"success": True, "message": "Firmware uploaded", "stdout": out[-2000:]}))


def cmd_recover(args):
    port, baud = parse_connection(args.connection)
    if not port:
        print(json.dumps({"success": False, "error": "Serial connection is required for bootloader recovery"}))
        sys.exit(1)

    template = os.environ.get("MOUSE_BOOTLOADER_RECOVERY_CMD", "").strip()
    if not template:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "MOUSE_BOOTLOADER_RECOVERY_CMD is not configured.",
                    "example": "python3 /path/to/uploader.py --port {port} --baud-bootloader {baud} --identify",
                }
            )
        )
        sys.exit(1)

    rc, out, err = run_with_template(template, "", port, baud)
    if rc != 0:
        print(json.dumps({"success": False, "error": "Bootloader recovery failed", "stdout": out[-2000:], "stderr": err[-2000:]}))
        sys.exit(1)

    print(json.dumps({"success": True, "message": "Bootloader recovery command completed", "stdout": out[-2000:]}))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("flash")
    f.add_argument("--connection", required=True)
    f.add_argument("--file", required=True)
    f.set_defaults(fn=cmd_flash)

    r = sub.add_parser("recover")
    r.add_argument("--connection", required=True)
    r.set_defaults(fn=cmd_recover)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()

