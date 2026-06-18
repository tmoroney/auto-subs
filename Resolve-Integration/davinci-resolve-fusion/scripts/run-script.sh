#!/bin/bash

# DaVinci Resolve Script Runner for Mac & Linux
# Usage: ./run-script.sh <path_to_script.lua>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <path_to_script.lua>"
    exit 1
fi

SCRIPT_PATH="$1"

# Check if script file exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Error: Script file '$SCRIPT_PATH' not found"
    exit 1
fi

# Run the script with DaVinci Resolve's fuscript
"/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fuscript" "$SCRIPT_PATH"
