@echo off
"C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.10.7-hotspot\\bin\\java" ^
  --class-path ^
  "C:\\Users\\antho\\.gradle\\caches\\modules-2\\files-2.1\\com.google.prefab\\cli\\2.1.0\\aa32fec809c44fa531f01dcfb739b5b3304d3050\\cli-2.1.0-all.jar" ^
  com.google.prefab.cli.AppKt ^
  --build-system ^
  cmake ^
  --platform ^
  android ^
  --abi ^
  arm64-v8a ^
  --os-version ^
  21 ^
  --stl ^
  c++_shared ^
  --ndk-version ^
  26 ^
  --output ^
  "C:\\Users\\antho\\AppData\\Local\\Temp\\agp-prefab-staging8080572917572104761\\staged-cli-output" ^
  "C:\\Users\\antho\\.gradle\\caches\\8.10.2\\transforms\\39a43825f0882dc267ff066a4b334b7c\\transformed\\oboe-1.8.1\\prefab"
