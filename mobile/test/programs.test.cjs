const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const load = (file) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => { throw new Error(`Unexpected import ${name}`); } });
  return exports;
};
const { DSWD_PROGRAMS, suggestPrograms, programShortName, enrollmentState } = load('programs.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('the program list matches the codes the server accepts, ends with Other, and is bilingual', () => {
  const server = fs.readFileSync(path.join(__dirname, '../../backend/src/programs.ts'), 'utf8');
  const serverCodes = [...server.matchAll(/code: "([A-Z0-9_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(plain(DSWD_PROGRAMS.map((program) => program.code)).sort(), serverCodes.sort());
  assert.equal(DSWD_PROGRAMS.at(-1).code, 'OTHER');
  for (const program of DSWD_PROGRAMS) assert.ok(program.en && program.bs && program.descEn && program.descBs, program.code);
});

test('suggestions come from the ID chosen and the birth date', () => {
  const now = new Date(2026, 10, 20);
  assert.deepEqual(plain(suggestPrograms('fourps', '1990-01-01', now)), ['4PS']);
  assert.deepEqual(plain(suggestPrograms('philsys', '1960-05-01', now)), ['SOCPEN']);
  assert.deepEqual(plain(suggestPrograms('senior_citizen', '1940-01-01', now)), ['SOCPEN', 'CENTENARIAN']);
  assert.deepEqual(plain(suggestPrograms('pwd', '2000-01-01', now)), ['AICS']);
  assert.deepEqual(plain(suggestPrograms('', '', now)), []);
  // Turns 60 tomorrow: not yet suggested.
  assert.deepEqual(plain(suggestPrograms('philsys', '1966-11-21', now)), []);
});

test('dashboard badges use short program names and group statuses', () => {
  assert.equal(programShortName('4PS', 'Pantawid Pamilyang Pilipino Program'), '4Ps');
  assert.equal(programShortName('TUPAD', 'TUPAD'), 'TUPAD');
  assert.equal(programShortName('OTHER', 'Lingap sa Barangay'), 'Lingap sa Barangay');
  assert.equal(programShortName('STAFF_ONLY', 'Barangay Rice Subsidy'), 'Barangay Rice Subsidy');
  assert.equal(enrollmentState('approved'), 'approved');
  assert.equal(enrollmentState('active'), 'approved');
  assert.equal(enrollmentState('pending'), 'pending');
  assert.equal(enrollmentState('needs_correction'), 'pending');
  assert.equal(enrollmentState('rejected'), 'blocked');
  for (const program of DSWD_PROGRAMS) assert.ok(program.short && program.short.length <= 20, program.code);
});
