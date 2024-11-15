#!/bin/bash

# Define variables
IDENTITY="Developer ID Application: THOMAS PATRICK MORONEY (88HTAX87W2)"
ENTITLEMENTS="$(pwd)/entitlements.plist"  # Use absolute path to avoid issues
APP_DIR="$(pwd)/dist/Transcription-Server"  # Use absolute path

# Function to sign a single file
sign_file() {
    local file="$1"
    echo "Signing $file..."
    codesign --force --options runtime --timestamp --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$file"
}

export -f sign_file  # Export the function so it's available in subshells
export IDENTITY       # Export IDENTITY so it's available in subshells
export ENTITLEMENTS   # Export ENTITLEMENTS so it's available in subshells

# Sign the main executable
sign_file "$APP_DIR/transcription-server"

# Sign all embedded binaries and executables in the _internal directory
find "$APP_DIR/_internal" -type f \( -name "*.dylib" -o -name "*.so" -o -name "*.exe" -o -name "*.bin" -o -name "ffmpeg*" \) -exec bash -c 'sign_file "$0"' {} \;

# Sign any other executables in the main app directory
find "$APP_DIR" -type f -perm +111 -exec bash -c 'sign_file "$0"' {} \;

# Verify the signatures
echo "Verifying signatures..."
codesign --verify --deep --strict --verbose=2 "$APP_DIR"