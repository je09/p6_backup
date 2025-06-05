#!/bin/bash

# P6 Backup Tool Icon Generator
# This script generates all required icon sizes for the Electron app

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Set source icon path
SOURCE_ICON="icon.png"
ICONSET_DIR="app.iconset"

# Check if source icon exists
if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon '$SOURCE_ICON' not found!"
    echo "Please place your new icon as 'icon.png' in the assets directory."
    exit 1
fi

# Create iconset directory if it doesn't exist
mkdir -p "$ICONSET_DIR"

echo "Generating icons from $SOURCE_ICON..."

# Check if ImageMagick or sips is available (sips is built into macOS)
if command -v sips &> /dev/null; then
    RESIZE_CMD="sips"
    echo "Using sips (macOS built-in) for image resizing..."
elif command -v convert &> /dev/null; then
    RESIZE_CMD="convert"
    echo "Using ImageMagick for image resizing..."
else
    echo "Error: Neither sips nor ImageMagick found!"
    echo "On macOS, sips should be available by default."
    echo "To install ImageMagick: brew install imagemagick"
    exit 1
fi

# Function to resize using sips
resize_with_sips() {
    local input="$1"
    local output="$2"
    local size="$3"
    
    sips -z "$size" "$size" "$input" --out "$output" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✓ Created $output (${size}x${size})"
    else
        echo "✗ Failed to create $output"
        return 1
    fi
}

# Function to resize using ImageMagick
resize_with_convert() {
    local input="$1"
    local output="$2"
    local size="$3"
    
    convert "$input" -resize "${size}x${size}" "$output" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✓ Created $output (${size}x${size})"
    else
        echo "✗ Failed to create $output"
        return 1
    fi
}

# Generate all required icon sizes
generate_icons() {
    local resize_func="$1"
    
    # Standard sizes for macOS app icons
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_16x16.png" 16
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_16x16@2x.png" 32
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_32x32.png" 32
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_32x32@2x.png" 64
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_128x128.png" 128
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_128x128@2x.png" 256
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_256x256.png" 256
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_256x256@2x.png" 512
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_512x512.png" 512
    $resize_func "$SOURCE_ICON" "$ICONSET_DIR/icon_512x512@2x.png" 1024
    
    # Additional small icon sizes for Windows and Linux
    mkdir -p "icons"
    $resize_func "$SOURCE_ICON" "icons/icon_24x24.png" 24
    $resize_func "$SOURCE_ICON" "icons/icon_48x48.png" 48
    $resize_func "$SOURCE_ICON" "icons/icon_64x64.png" 64
    $resize_func "$SOURCE_ICON" "icons/icon_96x96.png" 96
}

# Generate icons based on available tool
if [ "$RESIZE_CMD" = "sips" ]; then
    generate_icons resize_with_sips
else
    generate_icons resize_with_convert
fi

# Generate .icns file for macOS (if iconutil is available)
if command -v iconutil &> /dev/null; then
    echo "Generating app.icns file..."
    iconutil -c icns "$ICONSET_DIR" -o app.icns
    if [ $? -eq 0 ]; then
        echo "✓ Created app.icns"
    else
        echo "✗ Failed to create app.icns"
    fi
else
    echo "⚠ iconutil not found - skipping .icns generation"
    echo "  (This is needed for macOS app packaging)"
fi

echo ""
echo "Icon generation complete!"
echo ""
echo "Generated files:"
echo "- app.iconset/ - Individual PNG files for macOS"
echo "- icons/ - Additional small icons for Windows/Linux"
echo "- app.icns - macOS app icon bundle"
echo ""
echo "You can now build your app with the new icons."
