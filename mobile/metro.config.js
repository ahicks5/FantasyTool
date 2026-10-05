// The app reads a few modules straight out of the web app (`web/src/lib`): the words
// (`vocab.ts`, the one home of every word a user reads), the ESPN key's format and the
// kickoff clock. Metro only bundles inside the project unless told to look further.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../web/src/lib")];

module.exports = config;
