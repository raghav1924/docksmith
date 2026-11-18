#!/usr/bin/env bash
set -euo pipefail

echo "⚡ Running DockSmith CI validation pipeline..."
node dist/bin.js --version
echo "✔ DockSmith executable verified."
