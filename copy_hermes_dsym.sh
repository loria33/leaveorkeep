#!/bin/bash

# Script to copy Hermes dSYM to a specified leaveMkeepM archive
# Usage: ./copy_hermes_dsym.sh "leaveMkeepM 12-07-2025, 2.44.xcarchive"

if [ $# -eq 0 ]; then
    echo "Error: Please provide the archive name as an argument."
    echo "Usage: ./copy_hermes_dsym.sh \"leaveMkeepM DD-MM-2025, HH.MM.xcarchive\""
    echo "Example: ./copy_hermes_dsym.sh \"leaveMkeepM 12-07-2025, 2.44.xcarchive\""
    exit 1
fi

ARCHIVE_NAME="$1"
HERMES_FRAMEWORK_PATH="./ios/Pods/hermes-engine/destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64/hermes.framework"
HERMES_DSYM_PATH="./ios/Pods/hermes-engine/destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64/hermes.framework.dSYM"
ARCHIVE_BASE_PATH="$HOME/Library/Developer/Xcode/Archives"

# Extract date from archive name (assuming format "leaveMkeepM DD-MM-2025, HH.MM.xcarchive")
if [[ $ARCHIVE_NAME =~ leaveMkeepM\ ([0-9]{2}-[0-9]{2}-[0-9]{4}) ]]; then
    DATE_PART="${BASH_REMATCH[1]}"
    YEAR="20${DATE_PART: -2}"  # Extract last 2 digits for year folder
    ARCHIVE_FULL_PATH="$ARCHIVE_BASE_PATH/$YEAR-${DATE_PART:3:2}-${DATE_PART:0:2}/$ARCHIVE_NAME"
else
    echo "Error: Archive name doesn't match expected format 'leaveMkeepM DD-MM-2025, HH.MM.xcarchive'"
    exit 1
fi

echo "🔍 Looking for archive: $ARCHIVE_NAME"
echo "📁 Expected path: $ARCHIVE_FULL_PATH"

# Check if Hermes framework exists
if [ ! -d "$HERMES_FRAMEWORK_PATH" ]; then
    echo "❌ Error: Hermes framework not found at: $HERMES_FRAMEWORK_PATH"
    echo "Make sure you're running this script from the leaveMkeepM project root directory."
    exit 1
fi

# Check if Hermes dSYM exists, if not generate it
if [ ! -d "$HERMES_DSYM_PATH" ]; then
    echo "⚠️  Hermes dSYM not found, generating from framework..."
    
    # Use dsymutil to generate dSYM from framework
    dsymutil "$HERMES_FRAMEWORK_PATH/hermes" -o "$HERMES_DSYM_PATH"
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully generated hermes.framework.dSYM"
    else
        echo "❌ Error: Failed to generate Hermes dSYM"
    exit 1
    fi
else
    echo "✅ Found existing Hermes dSYM"
fi

# Check if archive exists
if [ ! -d "$ARCHIVE_FULL_PATH" ]; then
    echo "❌ Error: Archive not found at: $ARCHIVE_FULL_PATH"
    echo "Please check the archive name and make sure it exists."
    exit 1
fi

# Check if dSYMs directory exists in archive
DSYM_DIR="$ARCHIVE_FULL_PATH/dSYMs"
if [ ! -d "$DSYM_DIR" ]; then
    echo "❌ Error: dSYMs directory not found in archive: $DSYM_DIR"
    exit 1
fi

# Copy the Hermes dSYM
echo "📦 Copying Hermes dSYM to archive..."
cp -R "$HERMES_DSYM_PATH" "$DSYM_DIR/"

if [ $? -eq 0 ]; then
    echo "✅ Successfully copied hermes.framework.dSYM to:"
    echo "   $DSYM_DIR/"
    echo ""
    echo "📋 Archive now contains:"
    ls -la "$DSYM_DIR/"
    echo ""
    echo "🎉 Your archive is ready for distribution!"
else
    echo "❌ Error: Failed to copy Hermes dSYM"
    exit 1
fi 