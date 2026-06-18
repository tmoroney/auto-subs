#!/bin/bash

# AutoSubs Server Launcher with proper signal handling for Mac
# This script allows Ctrl+C to properly stop the AutoSubs server.
# It runs the development launcher "AutoSubs (Dev).lua" that
# `npm run setup-resolve` writes into Resolve's Scripts/Utility folder.

# Default paths - adjust these if your Resolve installation is different
SCRIPT_DIR="$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility"
FUSCRIPT="/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fuscript"
DEV_SCRIPT="$SCRIPT_DIR/AutoSubs (Dev).lua"

# Allow override of script directory
if [ "$1" != "" ]; then
    SCRIPT_DIR="$1"
    DEV_SCRIPT="$SCRIPT_DIR/AutoSubs (Dev).lua"
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping AutoSubs server..."

    # Try to send Exit command first
    curl -s -X POST -H "Content-Type: application/json" -d '{"func":"Exit"}' http://127.0.0.1:56002 2>/dev/null

    # Wait a moment for graceful shutdown
    sleep 2

    # Kill the fuscript process if still running
    if kill -0 $FUSCRIPT_PID 2>/dev/null; then
        echo "Force killing fuscript process..."
        kill -TERM $FUSCRIPT_PID 2>/dev/null
        sleep 1
        if kill -0 $FUSCRIPT_PID 2>/dev/null; then
            kill -KILL $FUSCRIPT_PID 2>/dev/null
        fi
    fi

    echo "AutoSubs server stopped."
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo "Starting AutoSubs server..."
echo "Script directory: $SCRIPT_DIR"
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server in background
"$FUSCRIPT" "$DEV_SCRIPT" &
FUSCRIPT_PID=$!

# Wait for the process to finish or for signals
wait $FUSCRIPT_PID

# This will only be reached if the server exits normally
echo "AutoSubs server has stopped."
