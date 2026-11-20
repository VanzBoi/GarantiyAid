// Government-issued and commonly accepted Philippine IDs for assistance registration.
// `pattern` matches the ID number format printed on the card so the scanner can find it.

export type IdGroup = 'featured' | 'government' | 'social' | 'other';
export type IdTypeCode =
  | 'philsys' | 'senior_citizen' | 'pwd' | 'drivers_license' | 'umid' | 'sss' | 'gsis'
  | 'philhealth' | 'passport' | 'postal' | 'voters' | 'prc' | 'tin' | 'pagibig' | 'nbi'
  | 'police' | 'barangay' | 'fourps' | 'solo_parent' | 'ncip' | 'ofw' | 'seafarer'
  | 'ibp' | 'government_office' | 'school' | 'other';

export type IdType = {
  code: IdTypeCode;
  en: string;
  bs: string;
  issuer: string;
  group: IdGroup;
  /** Some documents, such as barangay certificates, may not show a number. */
  numberOptional?: boolean;
  pattern?: RegExp;
  numberLabel?: RegExp;
};

export const ID_TYPES: IdType[] = [
  { code: 'philsys', en: 'Philippine National ID (PhilSys / ePhilID)', bs: 'Philippine National ID (PhilSys / ePhilID)', issuer: 'PSA', group: 'featured',
    pattern: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/, numberLabel: /\b(PCN|PSN|PhilSys\s*Card\s*Number)\b/i },
  { code: 'senior_citizen', en: 'Senior Citizen ID (OSCA)', bs: 'Senior Citizen ID (OSCA)', issuer: 'OSCA / LGU', group: 'featured',
    numberLabel: /\b(OSCA\s*(ID)?\s*(No|Number)?|ID\s*No|Control\s*No|Ctrl\s*No)\b/i },
  { code: 'pwd', en: 'PWD ID', bs: 'PWD ID', issuer: 'PDAO / NCDA', group: 'featured',
    pattern: /\b\d{2}-\d{4}-\d{3}-\d{7}\b/, numberLabel: /\b(PWD\s*(ID)?\s*(No|Number)|ID\s*No)\b/i },
  { code: 'drivers_license', en: "Driver's License", bs: "Driver's License", issuer: 'LTO', group: 'government',
    pattern: /\b[A-Z]\d{2}-\d{2}-\d{6}\b/, numberLabel: /\b(License\s*No|Lisensya)\b/i },
  { code: 'umid', en: 'UMID', bs: 'UMID', issuer: 'SSS / GSIS', group: 'government',
    pattern: /\b\d{4}-\d{7}-\d\b/, numberLabel: /\bCRN\b/i },
  { code: 'sss', en: 'SSS ID', bs: 'SSS ID', issuer: 'SSS', group: 'government',
    pattern: /\b\d{2}-\d{7}-\d\b/, numberLabel: /\bSS\s*(No|Number)\b/i },
  { code: 'gsis', en: 'GSIS eCard', bs: 'GSIS eCard', issuer: 'GSIS', group: 'government',
    pattern: /\b\d{11}\b/, numberLabel: /\b(BP\s*No|GSIS\s*No|CRN)\b/i },
  { code: 'philhealth', en: 'PhilHealth ID', bs: 'PhilHealth ID', issuer: 'PhilHealth', group: 'government',
    pattern: /\b\d{2}-\d{9}-\d\b/, numberLabel: /\b(PIN|PhilHealth\s*(No|Number))\b/i },
  { code: 'passport', en: 'Philippine Passport', bs: 'Philippine Passport', issuer: 'DFA', group: 'government',
    pattern: /\b[A-Z]{1,2}\d{6,7}[A-Z]?\b/, numberLabel: /\b(Passport\s*No|Pasaporte)\b/i },
  { code: 'postal', en: 'Postal ID', bs: 'Postal ID', issuer: 'PHLPost', group: 'government',
    pattern: /\b[A-Z]{3,4}\d{8,12}\b/, numberLabel: /\b(PRN|Postal\s*ID\s*No)\b/i },
  { code: 'voters', en: "Voter's ID / Certification", bs: "Voter's ID / Certification", issuer: 'COMELEC', group: 'government',
    numberLabel: /\b(VIN|Precinct\s*No|Voter'?s?\s*ID\s*No)\b/i },
  { code: 'prc', en: 'PRC ID', bs: 'PRC ID', issuer: 'PRC', group: 'government',
    pattern: /\b\d{7}\b/, numberLabel: /\b(Registration\s*No|Reg\.?\s*No)\b/i },
  { code: 'tin', en: 'TIN ID', bs: 'TIN ID', issuer: 'BIR', group: 'government',
    pattern: /\b\d{3}-\d{3}-\d{3}(?:-\d{3,5})?\b/, numberLabel: /\bTIN\b/i },
  { code: 'pagibig', en: 'Pag-IBIG Loyalty Card', bs: 'Pag-IBIG Loyalty Card', issuer: 'HDMF', group: 'government',
    pattern: /\b\d{4}-\d{4}-\d{4}\b/, numberLabel: /\b(MID|Pag-?IBIG\s*(MID)?\s*No)\b/i },
  { code: 'nbi', en: 'NBI Clearance', bs: 'NBI Clearance', issuer: 'NBI', group: 'government',
    numberLabel: /\b(NBI\s*ID\s*No|Clearance\s*No)\b/i },
  { code: 'police', en: 'Police Clearance', bs: 'Police Clearance', issuer: 'PNP', group: 'government',
    numberLabel: /\b(Clearance\s*No|Control\s*No)\b/i },
  { code: 'barangay', en: 'Barangay ID / Certificate', bs: 'Barangay ID / Sertipiko', issuer: 'Barangay', group: 'social', numberOptional: true,
    numberLabel: /\b(ID\s*No|Control\s*No|Ctrl\s*No)\b/i },
  { code: 'fourps', en: '4Ps / DSWD ID', bs: '4Ps / DSWD ID', issuer: 'DSWD', group: 'social',
    numberLabel: /\b(Household\s*ID|HH\s*ID|ID\s*No)\b/i },
  { code: 'solo_parent', en: 'Solo Parent ID', bs: 'Solo Parent ID', issuer: 'MSWDO / LGU', group: 'social',
    numberLabel: /\b(ID\s*No|Control\s*No)\b/i },
  { code: 'ncip', en: 'NCIP Certificate (Indigenous Peoples)', bs: 'NCIP Sertipiko (Lumad)', issuer: 'NCIP', group: 'social', numberOptional: true,
    numberLabel: /\b(Control\s*No|Certificate\s*No)\b/i },
  { code: 'ofw', en: 'OFW ID / OWWA ID', bs: 'OFW ID / OWWA ID', issuer: 'DMW / OWWA', group: 'other',
    numberLabel: /\b(ID\s*No|OWWA\s*No)\b/i },
  { code: 'seafarer', en: "Seafarer's Record Book", bs: "Seafarer's Record Book", issuer: 'MARINA', group: 'other',
    numberLabel: /\b(SRB\s*No|SIRB\s*No)\b/i },
  { code: 'ibp', en: 'IBP ID', bs: 'IBP ID', issuer: 'IBP', group: 'other', numberLabel: /\b(Roll\s*No|ID\s*No)\b/i },
  { code: 'government_office', en: 'Government Office ID', bs: 'ID sa Opisina sa Gobyerno', issuer: 'Government agency', group: 'other',
    numberLabel: /\b(Employee\s*No|ID\s*No)\b/i },
  { code: 'school', en: 'School ID', bs: 'School ID', issuer: 'School', group: 'other', numberLabel: /\b(Student\s*No|ID\s*No|LRN)\b/i },
  { code: 'other', en: 'Other government-issued ID', bs: 'Laing ID nga gi-isyu sa gobyerno', issuer: '', group: 'other', numberOptional: true,
    numberLabel: /\b(ID\s*No|Control\s*No|No\.)\b/i },
];

export const idTypeByCode = (code: string) => ID_TYPES.find((type) => type.code === code);

/** Document category used when the photo is saved to the beneficiary's records. */
export function documentTypeForId(code: string, sharedBackend: boolean) {
  if (sharedBackend && code === 'senior_citizen') return 'senior_citizen_id' as const;
  if (sharedBackend && code === 'pwd') return 'pwd_id' as const;
  return 'valid_id' as const;
}
