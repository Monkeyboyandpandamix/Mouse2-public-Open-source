#!/bin/bash
# List data directory contents (relative to plugin cwd when run from server)
ls -lah data 2>/dev/null || echo "data directory not found or inaccessible"
