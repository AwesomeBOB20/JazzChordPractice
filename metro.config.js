const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// WEB ONLY: stub react-native-google-mobile-ads. It's a native-only module whose internals import
// `react-native/Libraries/Utilities/codegenNativeCommands`, which the web bundler can't resolve, so
// it fails the whole web build. At runtime adsModule.ts already no-ops ads on web (adsReady=false),
// so resolving the package to an empty module on web is harmless — and it lets `expo start --web`
// bundle for previewing/verifying UI. Native (iOS/Android) resolution is untouched.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-google-mobile-ads') {
    return { type: 'empty' };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
