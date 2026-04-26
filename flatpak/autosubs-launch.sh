#!/bin/bash
# Wrapper script for the Flatpak build.
# Copies DaVinci Resolve integration files to user-space paths before launching,
# since the Flatpak sandbox prevents the package installer from writing to system paths.

BUNDLE_RESOURCES="/app/lib/autosubs/resources"
FUSION_SCRIPTS="$HOME/.local/share/DaVinciResolve/Fusion/Scripts/Utility"
USER_RESOURCES="$HOME/.local/share/autosubs/resources"

# Copy Lua integration files and all resource modules to user-writable locations
# so DaVinci Resolve (running outside the sandbox) can find them.
if [ -d "$BUNDLE_RESOURCES" ]; then
    mkdir -p "$FUSION_SCRIPTS"
    cp "$BUNDLE_RESOURCES/AutoSubs.lua" "$FUSION_SCRIPTS/" 2>/dev/null || true
    cp -r "$BUNDLE_RESOURCES/AutoSubs" "$FUSION_SCRIPTS/" 2>/dev/null || true

    mkdir -p "$USER_RESOURCES"
    cp -r "$BUNDLE_RESOURCES/." "$USER_RESOURCES/" 2>/dev/null || true
fi

exec /app/bin/autosubs "$@"
