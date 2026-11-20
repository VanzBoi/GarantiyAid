const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const load = (file, mocks) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return exports;
};
const types = load('id-types.ts', {});
const { parseIdText, splitFullName, datesIn } = load('id-scan.ts', { './id-types': types });
const plain = value => JSON.parse(JSON.stringify(value));

test('reads a PhilSys national ID with bilingual labels on separate lines', () => {
  const result = parseIdText([
    'REPUBLIKA NG PILIPINAS', 'Republic of the Philippines', 'PAMBANSANG PAGKAKAKILANLAN', 'Philippine Identification Card',
    '1234-5678-9012-3456',
    'Apelyido/Last Name', 'DELA CRUZ',
    'Mga Pangalan/Given Names', 'JUAN CARLOS',
    'Gitnang Apelyido/Middle Name', 'SANTOS',
    'Petsa ng Kapanganakan/Date of Birth', 'JANUARY 15, 1958',
    'Tirahan/Address', '24 MABINI ST. BRGY. LAHUG', 'CEBU CITY, CEBU',
  ], 'philsys');
  assert.deepEqual(plain(result), {
    lastName: 'Dela Cruz', firstName: 'Juan Carlos', middleName: 'Santos', birthDate: '1958-01-15',
    address: '24 Mabini St. Brgy. Lahug Cebu City, Cebu', idNumber: '1234-5678-9012-3456',
  });
});

test("reads an LTO driver's license with one combined name line", () => {
  const result = parseIdText([
    'REPUBLIC OF THE PHILIPPINES', 'LAND TRANSPORTATION OFFICE', "DRIVER'S LICENSE",
    'Last Name, First Name, Middle Name', 'REYES, MARIA CRISTINA GARCIA',
    'Nationality Sex Date of Birth Weight (kg) Height(m)', 'PHL F 1990/03/31 55 1.55',
    'Address', '12 RIZAL AVE, MANDAUE CITY, CEBU',
    'License No. Expiration Date Agency Code', 'G01-23-456789 2030/03/31 G01',
  ], 'drivers_license');
  assert.equal(result.lastName, 'Reyes');
  assert.equal(result.firstName, 'Maria Cristina');
  assert.equal(result.middleName, 'Garcia');
  assert.equal(result.birthDate, '1990-03-31');
  assert.equal(result.idNumber, 'G01-23-456789');
  assert.equal(result.address, '12 Rizal Ave, Mandaue City, Cebu');
});

test('reads an LGU senior citizen ID with inline labels and a middle initial', () => {
  const result = parseIdText([
    'Republic of the Philippines', 'City of Cebu', 'OFFICE OF THE SENIOR CITIZENS AFFAIRS',
    'Name: PEDRO B. DE LOS SANTOS',
    'Address: Sitio Mangga, Brgy. Guadalupe',
    'Date of Birth: 05/20/1950   Sex: M',
    'OSCA ID No. 2024-00123', 'Date Issued: 01/10/2024',
  ], 'senior_citizen');
  assert.equal(result.firstName, 'Pedro');
  assert.equal(result.lastName, 'De Los Santos');
  assert.equal(result.middleName, undefined);
  assert.equal(result.birthDate, '1950-05-20');
  assert.equal(result.idNumber, '2024-00123');
  assert.equal(result.address, 'Sitio Mangga, Brgy. Guadalupe');
});

test('reads a UMID with inline labels and falls back to the earliest date', () => {
  const result = parseIdText([
    'UNIFIED MULTI-PURPOSE ID', 'CRN-0111-2345678-9',
    'SURNAME', 'VILLANUEVA', 'GIVEN NAME', 'ANA', 'MIDDLE NAME', 'LIM',
    'SEX F 1975/12/02',
  ], 'umid');
  assert.equal(result.lastName, 'Villanueva');
  assert.equal(result.firstName, 'Ana');
  assert.equal(result.middleName, 'Lim');
  assert.equal(result.birthDate, '1975-12-02');
  assert.equal(result.idNumber, '0111-2345678-9');
});

test('returns nothing it cannot read instead of guessing', () => {
  assert.deepEqual(plain(parseIdText(['REPUBLIC OF THE PHILIPPINES', 'blurry', '###'], 'other')), {});
});

test('name and date helpers handle common Philippine formats', () => {
  assert.deepEqual(plain(splitFullName('JUAN DELA CRUZ')), { firstName: 'Juan', lastName: 'Dela Cruz' });
  assert.deepEqual(plain(datesIn('15 JAN/ENE 1960')), ['1960-01-15']);
  assert.deepEqual(plain(datesIn('1990-02-30')), []);
});
