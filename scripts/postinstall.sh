#!/bin/bash
UNINSTALLER="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/AutoSubs-Uninstaller.sh"
cat <<EOF > "$UNINSTALLER"
#!/bin/bash
echo "Removing AutoSubs files..."
rm -rf "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/AutoSubs"
echo "AutoSubs uninstalled successfully!"
EOF
chmod +x "$UNINSTALLER"
echo "Uninstaller created at: $UNINSTALLER"
exit 0
