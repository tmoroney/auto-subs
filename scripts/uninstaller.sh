#!/bin/bash

echo "Uninstalling AutoSubs..."

# Define paths to remove
AUTOSUBS_DIR="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/AutoSubs"
LUA_SCRIPT="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/AutoSubs V2.lua"

# Remove the AutoSubs directory
if [ -d "$AUTOSUBS_DIR" ]; then
    rm -rf "$AUTOSUBS_DIR"
    echo "Removed directory: $AUTOSUBS_DIR"
else
    echo "Directory not found: $AUTOSUBS_DIR"
fi

# Remove the Lua script
if [ -f "$LUA_SCRIPT" ]; then
    rm -f "$LUA_SCRIPT"
    echo "Removed file: $LUA_SCRIPT"
else
    echo "File not found: $LUA_SCRIPT"
fi

echo "Uninstallation complete."
exit 0