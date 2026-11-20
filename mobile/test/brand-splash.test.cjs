const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Minimal hook runner: re-renders the component and runs effects whose dependencies changed.
function mount(props, { reducedMotion = false, animationFinishes = true } = {}) {
  const slots = [], effects = [], timers = [];
  let cursor = 0, now = 0, hidden = 0, nativeHidden = 0, rendering = false, pending = false;
  const rerender = () => { if (rendering) { pending = true; return; } render(); };
  const react = {
    createElement: (type, p, ...children) => ({ type, props: p, children }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; rerender(); }];
    },
    useRef: (initial) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect: (effect, deps) => {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || !deps || deps.some((dep, i) => dep !== previous.deps[i])) {
        effects[index] = { deps, effect, cleanup: previous?.cleanup, run: true };
      } else previous.run = false;
    },
  };
  const animated = () => {
    const value = { interpolate: () => value };
    return value;
  };
  const schedule = (cb, ms) => { const t = { at: now + ms, cb, live: true }; timers.push(t); return t; };
  const timing = () => ({ start: (done) => { if (animationFinishes && done) schedule(() => done({ finished: true }), 320); } });
  const source = (() => {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/brand-splash.tsx'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mocks = {
      react,
      'react-native': {
        ActivityIndicator: 'ActivityIndicator', View: 'View', StyleSheet: { create: (s) => s, absoluteFill: {} },
        Easing: { out: () => null, in: () => null, cubic: null, quad: null },
        Animated: { View: 'Animated.View', Value: function () { return animated(); }, timing, sequence: () => ({ start: () => {} }) },
      },
      'expo-status-bar': { StatusBar: 'StatusBar' },
      'expo-splash-screen': { preventAutoHideAsync: async () => true, setOptions: () => {}, hide: () => { nativeHidden++; } },
      './components': { Logo: 'Logo', Txt: 'Txt', useReducedMotion: () => reducedMotion },
      './theme': { colors: {}, fonts: {} },
    };
    vm.runInNewContext(code, {
      exports, require: (name) => { assert.ok(name in mocks, name); return mocks[name]; },
      setTimeout: schedule,
      clearTimeout: (t) => { if (t) t.live = false; },
    });
    return exports;
  })();
  let current = { ...props, onHidden: () => { hidden++; } };
  function render() {
    rendering = true;
    cursor = 0;
    source.BrandSplash(current);
    rendering = false;
    for (const entry of effects) {
      if (!entry?.run) continue;
      entry.run = false;
      entry.cleanup?.();
      entry.cleanup = entry.effect() || undefined;
    }
    if (pending) { pending = false; render(); }
  }
  render();
  return {
    update(next) { current = { ...current, ...next }; render(); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((t) => t.live && t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at; next.live = false; next.cb();
      }
      now = end;
    },
    get hidden() { return hidden; },
    get nativeHidden() { return nativeHidden; },
  };
}

test('the splash stays at least briefly, then hides once the app is ready', () => {
  const splash = mount({ fontsReady: false, appReady: false });
  assert.equal(splash.nativeHidden, 0, 'Native splash stays until fonts are ready');
  splash.update({ fontsReady: true, appReady: true });
  assert.equal(splash.nativeHidden, 1);
  splash.advance(500);
  assert.equal(splash.hidden, 0, 'Still showing the name and spinner');
  splash.advance(1100);
  assert.equal(splash.hidden, 1);
});

test('the splash is removed even if the fade animation never reports back', () => {
  const splash = mount({ fontsReady: true, appReady: true }, { animationFinishes: false });
  splash.advance(1100 + 320 + 600);
  assert.equal(splash.hidden, 1);
});

test('slow fonts do not keep the native splash on screen', () => {
  const splash = mount({ fontsReady: false, appReady: false });
  splash.advance(4000);
  assert.equal(splash.nativeHidden, 1);
  assert.equal(splash.hidden, 0, 'The app is not ready yet, so the branded splash stays');
  splash.update({ fontsReady: true, appReady: true });
  splash.advance(1100 + 320);
  assert.equal(splash.hidden, 1);
});

test('reduced motion hides without animating', () => {
  const splash = mount({ fontsReady: true, appReady: true }, { reducedMotion: true });
  splash.advance(1100);
  assert.equal(splash.hidden, 1);
});
