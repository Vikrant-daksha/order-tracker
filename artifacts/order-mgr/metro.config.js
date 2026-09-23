const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};
config.resolver.blockList = [
  ...(config.resolver.blockList ? [config.resolver.blockList].flat() : []),
  /react-native_tmp_.*/,
];

// Force Hermes-compatible transforms for ALL modules including node_modules.
// Without this, libraries that use modern JS private class fields (#x, #y, etc.)
// pass through Metro without being transpiled, and Hermes rejects them at
// bytecode compilation time with "private properties are not supported".
config.transformer = config.transformer || {};
config.transformer.unstable_transformProfile = "hermes-stable";

module.exports = config;
