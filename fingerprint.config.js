const { DEFAULT_SOURCE_SKIPS, SourceSkips } = require('@expo/fingerprint');

module.exports = {
  sourceSkips: DEFAULT_SOURCE_SKIPS | SourceSkips.ExpoConfigExtraSection,
};
