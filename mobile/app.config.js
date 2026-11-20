// Extends app.json. The `lan-apk` EAS profile sets ALLOW_HTTP_API=1 to build a
// standalone test APK that reaches a backend on the local network over plain
// http://. It uses a fixed runtime version so EAS does not compare fingerprints
// for this test-only build; other profiles keep the fingerprint policy.
const { withAndroidManifest } = require('expo/config-plugins');

function withCleartextTraffic(config) {
  return withAndroidManifest(config, (mod) => {
    mod.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
}

module.exports = ({ config }) =>
  process.env.ALLOW_HTTP_API === '1'
    ? withCleartextTraffic({ ...config, runtimeVersion: 'lan-apk-1' })
    : config;
