#!/bin/bash

# Netflix Movie Explorer - App Bundle Compatibility Script
# References the existing TerminalLaunch script for app bundle compatibility

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Call the actual launch script from the .internal directory
exec "$SCRIPT_DIR/.internal/launch.sh" "$@"
