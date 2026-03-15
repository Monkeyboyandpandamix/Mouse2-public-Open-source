#!/usr/bin/env python3
import importlib
import json
import subprocess
import sys
from typing import Dict, List


REQUIRED_PACKAGES: Dict[str, str] = {
    "pymavlink": "pymavlink",
    "PIL": "Pillow",
    "piexif": "piexif",
}


def can_import(module_name: str) -> bool:
    try:
        importlib.import_module(module_name)
        return True
    except Exception:
        return False


def run(cmd: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def ensure_pip() -> bool:
    probe = run([sys.executable, "-m", "pip", "--version"])
    if probe.returncode == 0:
        return True
    ensure = run([sys.executable, "-m", "ensurepip", "--upgrade"])
    return ensure.returncode == 0


def main():
    installed = []
    already = []
    failed = []

    if not ensure_pip():
        print(json.dumps({"success": False, "error": "pip is unavailable", "installed": [], "already": [], "failed": list(REQUIRED_PACKAGES.values())}))
        sys.exit(1)

    for module_name, package_name in REQUIRED_PACKAGES.items():
        if can_import(module_name):
            already.append(package_name)
            continue
        install = run([sys.executable, "-m", "pip", "install", package_name])
        if install.returncode == 0 and can_import(module_name):
            installed.append(package_name)
        else:
            failed.append({"package": package_name, "stderr": install.stderr[-500:]})

    print(json.dumps({"success": len(failed) == 0, "installed": installed, "already": already, "failed": failed}))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
