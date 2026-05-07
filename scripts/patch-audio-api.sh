#!/bin/bash
# Patches react-native-audio-api C++ sources to remove std::format (C++20)
# which is not supported by the Android NDK on EAS build servers.
# This replaces the patch-package approach which was unreliable due to line ending issues.

set -e

RECORDER="node_modules/react-native-audio-api/android/src/main/cpp/audioapi/android/core/AndroidAudioRecorder.cpp"
FILEOPTS="node_modules/react-native-audio-api/android/src/main/cpp/audioapi/android/core/utils/FileOptions.cpp"

if [ ! -f "$RECORDER" ]; then
  echo "WARNING: $RECORDER not found, skipping patch"
  exit 0
fi

echo "Patching react-native-audio-api C++ sources..."

# --- AndroidAudioRecorder.cpp ---
# Replace: std::format("file://{}", filePath_)
# With:    "file://" + filePath_
sed -i 's/std::format("file:\/\/{}", filePath_)/"file:\/\/" + filePath_/g' "$RECORDER"

# --- FileOptions.cpp ---
# Remove #include <format>
sed -i '/#include <format>/d' "$FILEOPTS"

# Add #include <ctime> before #include <filesystem>
sed -i 's/#include <filesystem>/#include <ctime>\n#include <filesystem>/' "$FILEOPTS"

# Replace std::format("{}/{}", directory, properties->subDirectory)
sed -i 's/std::format("{}\/{}", directory, properties->subDirectory)/directory + "\/" + properties->subDirectory/g' "$FILEOPTS"

# Replace the multi-line std::format timestamp call
# Original: return std::format("{:%Y%m%d_%H%M%S}", std::chrono::floor<std::chrono::seconds>(tNow));
# New: strftime-based equivalent
python3 - "$FILEOPTS" <<'PYEOF'
import sys, re

path = sys.argv[1]
with open(path, 'r') as f:
    content = f.read()

# Replace timestamp format call
old = r'return std::format\("\{:%Y%m%d_%H%M%S\}", std::chrono::floor<std::chrono::seconds>\(tNow\)\);'
new = ('std::time_t tNowT = std::chrono::system_clock::to_time_t(tNow);\n'
       '  char buf[32];\n'
       '  std::strftime(buf, sizeof(buf), "%Y%m%d_%H%M%S", std::localtime(&tNowT));\n'
       '  return std::string(buf);')
content = re.sub(old, new, content)

# Replace file path format calls
old2 = r'std::format\("\{\}/\{\}\.\{\}", subDirectory, fileNameOverride, extension\)'
new2 = 'subDirectory + "/" + fileNameOverride + "." + extension'
content = re.sub(old2, new2, content)

old3 = (r'std::format\(\s*"\{\}/\{\}_\{\}\.\{\}",\s*subDirectory,\s*'
        r'properties->fileNamePrefix,\s*fileTimestamp,\s*extension\)')
new3 = 'subDirectory + "/" + properties->fileNamePrefix + "_" + fileTimestamp + "." + extension'
content = re.sub(old3, new3, content, flags=re.DOTALL)

with open(path, 'w') as f:
    f.write(content)

print("FileOptions.cpp patched successfully")
PYEOF

echo "react-native-audio-api C++ patches applied successfully"
