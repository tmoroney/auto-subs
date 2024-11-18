#!/bin/bash

# Path to the uninstaller script
UNINSTALLER_SCRIPT="/tmp/uninstaller.sh"

# Copy the uninstaller script to a temporary location
cp "${PWD}/uninstaller.sh" "$UNINSTALLER_SCRIPT"

# Execute the uninstaller script
bash "$UNINSTALLER_SCRIPT"

# Clean up
rm -f "$UNINSTALLER_SCRIPT"

exit 0