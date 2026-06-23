const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// WEB ONLY: stub native-only modules that the web bundler can't resolve (they import native codegen
// internals and would fail the whole web build). react-native-google-mobile-ads → ads no-op on web
// (adsReady=false); react-native-purchases → has no web support, and purchases.ts no-ops on web. Stubbing
// them to an empty module on web is harmless and lets `expo start --web` bundle for preview/verify.
// Native (iOS/Android) resolution is untouched.
const WEB_STUBBED = ['react-native-google-mobile-ads', 'react-native-purchases'];
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_STUBBED.includes(moduleName)) {
    return { type: 'empty' };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
