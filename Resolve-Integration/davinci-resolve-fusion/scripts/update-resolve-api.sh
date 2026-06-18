#!/bin/bash
# Sync the DaVinci Resolve scripting API reference into references/resolve-api.txt.
# Run this after a DaVinci Resolve update so the reference stays current.
# Override the source location by exporting RESOLVE_SCRIPT_API to the Scripting folder.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HERE/../references/resolve-api.txt"

candidates=(
  "${RESOLVE_SCRIPT_API:-}/README.txt"
  "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/README.txt"
  "$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/README.txt"
  "/opt/resolve/Developer/Scripting/README.txt"
  "/home/resolve/Developer/Scripting/README.txt"
)
SRC=""
for c in "${candidates[@]}"; do
  if [ -n "$c" ] && [ -f "$c" ]; then SRC="$c"; break; fi
done
if [ -z "$SRC" ]; then
  echo "ERROR: Could not find Resolve's README.txt." >&2
  echo "Set RESOLVE_SCRIPT_API to your Resolve 'Developer/Scripting' folder and retry." >&2
  exit 1
fi

{
  echo "# ============================================================================"
  echo "# DaVinci Resolve Scripting API Reference  —  SOURCE OF TRUTH"
  echo "#"
  echo "# Plain text on purpose (monospace column-aligned; unreadable as Markdown)."
  echo "# Synced from: $SRC"
  echo "# Synced on:   $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "# Re-sync after a Resolve update: scripts/update-resolve-api.sh"
  echo "# ============================================================================"
  echo
  cat "$SRC"
} > "$DEST"
echo "Updated $DEST"
echo "  from $SRC"
