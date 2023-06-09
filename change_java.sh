#!/bin/bash

# Execute java_home to retrieve available Java versions
java_home_output=$(eval "/usr/libexec/java_home" -V)

# Parse the output to extract the available versions
versions=$(echo "$java_home_output" | awk -F '[,=]' '/^[[:space:]]*JDK/{print $2}')

# Display the available Java versions
echo "Available Java versions:"
echo "$versions"

# Prompt the user to choose a version
read -p "Select a Java version (e.g., 1.8, 11, 16): " selected_version

# Set JAVA_HOME to the selected version
export JAVA_HOME=$(/usr/libexec/java_home -v "$selected_version")

# Verify if JAVA_HOME was set successfully
if [[ -n "$JAVA_HOME" ]]; then
  echo "JAVA_HOME is set to $JAVA_HOME"
else
  echo "Failed to set JAVA_HOME. Please check the selected version."
fi
