const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const load = (file, mocks, globals = {}) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, ...globals });
  return exports;
};
const guide = load('face-guidance.ts', {});
const face = { count: 1, x: .3, y: .2, width: .4, height: .55, yaw: 0, roll: 0, leftEye: .95, rightEye: .95, brightness: 120, sharpness: 35 };
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
function rig(analyze, verify, login) {
  let now = 0, photos = 0, cursor = 0, effects = [], cleanup = [], deleted = 0, closed = 0, results = 0, sending = 0, errors = 0, uploads = 0, logins = 0;
  let initialized = false;
  const slots = [], timers = new Map();
  const useState = initial => { const id = cursor++; if (!(id in slots)) slots[id] = initial; return [slots[id], v => { slots[id] = v; }]; };
  const react = { useState, useRef: initial => useState({ current: initial })[0], useCallback: cb => cb, useEffect: cb => { if (!initialized) effects.push(cb); } };
  const source = load('automatic-face.ts', {
    react, 'expo-router': { useFocusEffect: () => {} },
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'expo-file-system': { File: class { exists = true; delete() { deleted++; } } },
    './face-guidance': guide,
    './face-detector': { createFaceDetector: async () => ({ analyze, close() { closed++; } }) },
    './api': { getFaceChallenge: async () => ({ id: 'challenge', poses: ['center', 'blink'], expiresAt: new Date(90000).toISOString() }),
      verifyFace: async (_token, frames, challengeId) => { uploads++; assert.equal(frames.length, 3); assert.equal(challengeId, 'challenge'); return verify(); }, enrollFace: () => { throw Error('Unexpected enrollment'); },
      getFaceLoginChallenge: async (device) => { assert.equal(device, login); return { id: 'login-challenge', poses: ['center', 'blink'], expiresAt: new Date(90000).toISOString() }; },
      faceLogin: async (device, frames, challengeId) => { uploads++; assert.equal(device, login); assert.equal(frames.length, 3); assert.equal(challengeId, 'login-challenge'); return verify(); } },
  }, { Date: class extends Date { static now() { return now; } }, setTimeout: (cb, delay) => { timers.set(cb, now + delay); return cb; }, clearTimeout: cb => timers.delete(cb) });
  const options = { active: true, ready: true, accessToken: login ? '' : 'owner', consentId: login ? undefined : 'consent', verify: true, login,
    onLogin: () => { results++; logins++; },
    camera: { current: { takePictureAsync: async () => { photos++; return { uri: 'file:///private/frame.jpg', base64: 'frame-' + photos }; } } },
    onSending: () => sending++, onResult: () => results++, onError: () => errors++, onPause() {} };
  const render = () => { cursor = 0; source.useAutomaticFace(options); if (!initialized) { initialized = true; cleanup = effects.map(cb => cb()).filter(Boolean); } };
  render();
  return { options, render, stats: () => ({ photos, deleted, closed, results, sending, errors, uploads, logins }),
    tick: async () => { now += 300; const next = [...timers].filter(([, due]) => due <= now); next.forEach(([cb]) => { timers.delete(cb); cb(); }); await flush(); }, stop: () => cleanup.forEach(cb => cb()) };
}

test('face prompts trigger exactly one automatic submission with closed/open eye evidence and clean cached snapshots', async () => {
  let observations = 0;
  const r = rig(async () => (++observations === 5 ? { ...face, leftEye: .1, rightEye: .1 } : face), async () => ({ result: 'simulated_capture' }));
  await flush();
  for (let i = 0; i < 7; i++) await r.tick();
  assert.equal(r.stats().uploads, 1); assert.equal(r.stats().results, 1); assert.equal(r.stats().sending, 1);
  assert.equal(r.stats().deleted, r.stats().photos); assert.equal(r.stats().errors, 0); r.stop();
});

test('leaving while analysis is pending prevents capture/upload and deletes the pending snapshot', async () => {
  let resolve;
  const r = rig(() => new Promise(done => { resolve = done; }), async () => ({}));
  await flush(); r.stop(); resolve(face); await flush();
  assert.equal(r.stats().uploads, 0); assert.equal(r.stats().results, 0); assert.equal(r.stats().deleted, 1);
});

test('a late verification response cannot update a replacement account', async () => {
  let observations = 0, complete;
  const r = rig(async () => (++observations === 5 ? { ...face, leftEye: .1, rightEye: .1 } : face), () => new Promise(resolve => { complete = resolve; }));
  await flush(); for (let i = 0; i < 6; i++) await r.tick();
  assert.equal(r.stats().uploads, 1);
  r.options.accessToken = 'replacement'; r.render(); complete({ result: 'matched' }); await flush();
  assert.equal(r.stats().results, 0); r.stop();
});

test('face login uses only the phone key, never a session, and hands back the new session', async () => {
  let observations = 0;
  const device = { deviceId: 'device', deviceSecret: 'secret' };
  const r = rig(async () => (++observations === 5 ? { ...face, leftEye: .1, rightEye: .1 } : face), async () => ({ accessToken: 'face-session', simulated: true }), device);
  await flush();
  for (let i = 0; i < 7; i++) await r.tick();
  assert.equal(r.stats().uploads, 1);
  assert.equal(r.stats().logins, 1);
  assert.equal(r.stats().errors, 0);
  r.stop();
});
