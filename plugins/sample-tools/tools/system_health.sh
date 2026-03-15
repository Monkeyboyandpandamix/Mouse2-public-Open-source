#!/bin/bash
set -euo pipefail

echo "=== M.O.U.S.E Sample Plugin: System Health ==="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Host: $(hostname)"
echo "Node: $(node -v 2>/dev/null || echo 'not found')"
echo "Python: $(/usr/bin/python3 --version 2>/dev/null || python3 --version 2>/dev/null || echo 'not found')"
echo ""
echo "--- Disk (workspace) ---"
df -h . | sed -n '1,2p'
echo ""
echo "--- Uptime ---"
uptime || true
echo ""
echo "--- Data directory snapshot ---"
if [ -d "data" ]; then
  ls -lah data | sed -n '1,30p'
else
  echo "data directory not found"
fi
