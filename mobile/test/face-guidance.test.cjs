const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/face-guidance.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
vm.runInNewContext(source, { exports: exportsObject });
const { emptyGuide, guideFace } = exportsObject;
const face = { count: 1, x: .3, y: .2, width: .4, height: .55, yaw: 0, roll: 0, leftEye: .95, rightEye: .95, brightness: 120, sharpness: 35 };

test('automatic capture requires a stable, centered, visible single face and quality checks', () => {
  for (const [change, expected] of [[{ count: 0 }, 'searching'], [{ count: 2 }, 'multiple'], [{ brightness: 20 }, 'light'], [{ width: .1 }, 'closer'], [{ width: .95 }, 'farther'], [{ x: .01 }, 'center'], [{ roll: 22 }, 'straight'], [{ sharpness: 2 }, 'blur']]) {
    const result = guideFace({ ...face, ...change }, 'center', emptyGuide(), 1000);
    assert.equal(result.guidance, expected); assert.equal(result.capture, false);
  }
  const first = guideFace(face, 'center', emptyGuide(), 1000);
  assert.equal(first.capture, false);
  assert.equal(guideFace(face, 'center', first.state, 1800).capture, false);
  assert.equal(guideFace(face, 'center', first.state, 1900).capture, true);
  const lost = guideFace({ ...face, count: 0 }, 'center', first.state, 1800);
  assert.equal(guideFace(face, 'center', lost.state, 4000).capture, false, 'Lost faces reset the stability window');
});

test('an eye prompt requires closed then reopened eyes; time and static photos cannot complete it', () => {
  let state = emptyGuide();
  for (const now of [1000, 3000, 10000]) { const result = guideFace(face, 'blink', state, now); assert.equal(result.capture, false); state = result.state; }
  const closed = guideFace({ ...face, leftEye: .1, rightEye: .1 }, 'blink', state, 11000);
  assert.equal(closed.evidence, true); assert.equal(closed.capture, false);
  assert.equal(guideFace(face, 'blink', closed.state, 11500).capture, true);
  assert.equal(guideFace(face, 'blink', closed.state, 19000).capture, false, 'A stale close cannot complete a new prompt');
  assert.equal(guideFace({ ...face, leftEye: -1, rightEye: -1 }, 'blink', emptyGuide(), 1000).evidence, false);
});

test('head turns are observed and held rather than accepted on a countdown', () => {
  const first = guideFace({ ...face, yaw: -24 }, 'left', emptyGuide(), 1000);
  assert.equal(guideFace({ ...face, yaw: -24 }, 'left', first.state, 2000).capture, true);
  assert.equal(guideFace(face, 'right', emptyGuide(), 5000).capture, false);
});
