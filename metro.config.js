const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web ships a WebAssembly build and needs SharedArrayBuffer (COOP/COEP headers).
// Native builds ignore all of this; it only matters for `expo start --web` previews.
config.resolver.assetExts.push('wasm');
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  },
};

module.exports = config;
