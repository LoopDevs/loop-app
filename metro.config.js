const path = require('node:path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
const webSymbolView = path.resolve(__dirname, 'src/components/ui/symbol-view.web.tsx');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-symbols' && context.originModulePath !== webSymbolView) {
    return { type: 'sourceFile', filePath: webSymbolView };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
