const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAbiFilters(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = config.modResults.contents.replace(
        /defaultConfig\s*\{/,
        `defaultConfig {
        ndk {
            abiFilters 'armeabi-v7a', 'arm64-v8a'
        }`
      );
    }
    return config;
  });
};
