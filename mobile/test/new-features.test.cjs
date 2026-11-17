const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Loads a screen module with every import replaced by inert stand-ins, to test its pure helpers.
function loadPure(file, overrides = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const inert = new Proxy({}, { get: (_, key) => (key === '__esModule' ? false : key === 'StyleSheet' ? { create: (value) => value, absoluteFill: {} } : String(key)) });
  const exports = {};
  vm.runInNewContext(output, { exports, require: (name) => overrides[name] ?? inert });
  return exports;
}

test('scanner accepts GarantiyAid wallet codes, flags claim passes, and rejects other codes', () => {
  const { classifyScan } = loadPure('screens/scanner.tsx', { './wallet-actions': { WALLET_QR_PREFIX: 'GARANTIYAID-WALLET:' } });
  assert.deepEqual({ ...classifyScan('GARANTIYAID-WALLET:GA-1a2b3c4d') }, { kind: 'wallet', walletNumber: 'GA-1A2B3C4D' });
  assert.equal(classifyScan('GARANTIYAID-WALLET:GA-XYZ').kind, 'unknown');
  assert.equal(classifyScan(`GAI1.${'a'.repeat(43)}`).kind, 'claim-pass');
  for (const value of ['https://example.com', '', 'GA-1A2B3C4D']) assert.equal(classifyScan(value).kind, 'unknown');
});

test('wallet amounts accept peso formatting with at most two decimals', () => {
  const { parseAmountInput } = loadPure('screens/wallet-actions.tsx');
  assert.equal(parseAmountInput('₱1,250.50'), 1250.5);
  assert.equal(parseAmountInput(' 500 '), 500);
  for (const value of ['', 'abc', '1.234', '-5', '1e3']) assert.equal(parseAmountInput(value), null);
});

test('password rules match the server and strength rises with length and variety', () => {
  const { meetsPasswordRules, passwordStrength } = loadPure('screens/account.tsx');
  assert.equal(meetsPasswordRules('Garantiy2026'), true);
  for (const value of ['short1', 'onlyletters', '1234567890', 'x'.repeat(127) + '1a']) assert.equal(meetsPasswordRules(value), false);
  assert.ok(passwordStrength('Garantiy2026!') > passwordStrength('abc12345'));
  assert.equal(passwordStrength(''), 0);
});

test('chat history groups messages into conversations, newest first', () => {
  const { groupConversations } = loadPure('screens/chat-history.tsx');
  const at = (minutes) => new Date(Date.UTC(2026, 10, 17, 0, minutes)).toISOString();
  const messages = [
    { id: '1', role: 'user', text: 'a', createdAt: at(0) },
    { id: '2', role: 'assistant', text: 'b', createdAt: at(1) },
    { id: '3', role: 'user', text: 'c', createdAt: at(90) },
    { id: '4', role: 'assistant', text: 'd', createdAt: at(91) },
  ];
  const groups = groupConversations(messages);
  assert.equal(JSON.stringify(groups.map((group) => group.map((item) => item.id))), JSON.stringify([['3', '4'], ['1', '2']]));
});
