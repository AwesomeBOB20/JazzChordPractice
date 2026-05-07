#!/bin/bash
# Patches react-native-audio-api C++ and Kotlin sources to fix build errors
# on EAS build servers (Android NDK / Kotlin version incompatibilities).
# This replaces the patch-package approach which was unreliable due to line ending issues.

set -e

RECORDER="node_modules/react-native-audio-api/android/src/main/cpp/audioapi/android/core/AndroidAudioRecorder.cpp"
FILEOPTS="node_modules/react-native-audio-api/android/src/main/cpp/audioapi/android/core/utils/FileOptions.cpp"
KTMODULE="node_modules/react-native-audio-api/android/src/main/java/com/swmansion/audioapi/AudioAPIModule.kt"

if [ ! -f "$RECORDER" ]; then
  echo "WARNING: react-native-audio-api sources not found, skipping patch"
  exit 0
fi

echo "Patching react-native-audio-api sources..."

# ── AndroidAudioRecorder.cpp ──────────────────────────────────────────────────
# Replace std::format("file://{}", filePath_) with "file://" + filePath_
sed -i 's/std::format("file:\/\/{}", filePath_)/"file:\/\/" + filePath_/g' "$RECORDER"

# ── FileOptions.cpp ───────────────────────────────────────────────────────────
# Remove #include <format> (C++20, not supported by NDK)
sed -i '/#include <format>/d' "$FILEOPTS"

# Add #include <ctime> before #include <filesystem>
sed -i 's/#include <filesystem>/#include <ctime>\n#include <filesystem>/' "$FILEOPTS"

# Replace std::format("{}/{}", directory, properties->subDirectory)
sed -i 's/std::format("{}\/{}", directory, properties->subDirectory)/directory + "\/" + properties->subDirectory/g' "$FILEOPTS"

# Use python3 for multi-line replacements
python3 - "$FILEOPTS" "$KTMODULE" <<'PYEOF'
import sys, re

fileopts_path = sys.argv[1]
ktmodule_path = sys.argv[2]

# ── FileOptions.cpp multi-line fixes ─────────────────────────────────────────
with open(fileopts_path, 'r') as f:
    content = f.read()

# Replace timestamp format call
old = r'return std::format\("\{:%Y%m%d_%H%M%S\}", std::chrono::floor<std::chrono::seconds>\(tNow\)\);'
new = ('std::time_t tNowT = std::chrono::system_clock::to_time_t(tNow);\n'
       '  char buf[32];\n'
       '  std::strftime(buf, sizeof(buf), "%Y%m%d_%H%M%S", std::localtime(&tNowT));\n'
       '  return std::string(buf);')
content = re.sub(old, new, content)

# Replace single-line file path format call
old2 = r'std::format\("\{\}/\{\}\.\{\}", subDirectory, fileNameOverride, extension\)'
new2 = 'subDirectory + "/" + fileNameOverride + "." + extension'
content = re.sub(old2, new2, content)

# Replace multi-line file path format call
old3 = (r'std::format\(\s*"\{\}/\{\}_\{\}\.\{\}",\s*subDirectory,\s*'
        r'properties->fileNamePrefix,\s*fileTimestamp,\s*extension\)')
new3 = 'subDirectory + "/" + properties->fileNamePrefix + "_" + fileTimestamp + "." + extension'
content = re.sub(old3, new3, content, flags=re.DOTALL)

with open(fileopts_path, 'w') as f:
    f.write(content)
print("FileOptions.cpp patched successfully")

# ── AudioAPIModule.kt fixes ───────────────────────────────────────────────────
with open(ktmodule_path, 'r') as f:
    content = f.read()

# Fix 1: Remove all @OptIn(FrameworkAPI::class) annotations (both standalone lines
# and the class-level one). FrameworkAPI is not an @RequiresOptIn marker in this
# version of React Native, so the annotation is invalid.
content = re.sub(r'@OptIn\(FrameworkAPI::class\)\n', '', content)

# Fix 2: Change "override fun resolveAndroidReleaseAsset" to just "fun resolveAndroidReleaseAsset"
# The Java abstract base class (NativeAudioAPIModuleSpec) doesn't declare this method
# in the version being compiled, so "override" causes a compile error.
content = content.replace(
    'override fun resolveAndroidReleaseAsset(',
    'fun resolveAndroidReleaseAsset('
)

with open(ktmodule_path, 'w') as f:
    f.write(content)
print("AudioAPIModule.kt patched successfully")
PYEOF

echo "react-native-audio-api patches applied successfully"
