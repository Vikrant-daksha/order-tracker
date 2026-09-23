const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};
config.resolver.blockList = [
  ...(config.resolver.blockList ? [config.resolver.blockList].flat() : []),
  /react-native_tmp_.*/,
];

// Use hermes-v0 transform profile for React Native 0.81 (Hermes v0)
// This ensures class properties and private fields (#x, #y) are transpiled down
// so hermesc does not throw 'private properties are not supported'.
config.transformer = config.transformer || {};
config.transformer.unstable_transformProfile = "hermes-v0";

module.exports = config;
