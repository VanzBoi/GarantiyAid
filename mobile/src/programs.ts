// DSWD programs a beneficiary can say they belong to at sign-up. Codes match backend/src/programs.ts.
// Choosing one only sends a pending request; staff confirm membership before schedules appear.

export type ProgramGroup = 'featured' | 'cash' | 'livelihood' | 'disaster' | 'children' | 'other';
export type DswdProgram = {
  code: string;
  /** Short name for badges, e.g. "4Ps". */
  short: string;
  en: string;
  bs: string;
  descEn: string;
  descBs: string;
  group: ProgramGroup;
  /** Label for the member or reference number this program usually gives its members. */
  referenceEn?: string;
  referenceBs?: string;
};

export const DSWD_PROGRAMS: DswdProgram[] = [
  { code: '4PS', short: '4Ps', group: 'featured', en: '4Ps – Pantawid Pamilyang Pilipino Program', bs: '4Ps – Pantawid Pamilyang Pilipino Program',
    descEn: 'Cash grants for poor families with children, tied to health and school conditions.',
    descBs: 'Cash grant sa kabus nga pamilya nga adunay mga anak, uban sa kondisyon sa panglawas ug eskwela.',
    referenceEn: '4Ps Household ID number', referenceBs: 'Numero sa 4Ps Household ID' },
  { code: 'SOCPEN', short: 'Social Pension', group: 'featured', en: 'Social Pension for Indigent Senior Citizens', bs: 'Social Pension para sa Kabus nga Senior Citizen',
    descEn: 'Monthly pension for senior citizens 60 and above with no regular income or pension.',
    descBs: 'Binulan nga pension sa senior citizen 60 pataas nga walay regular nga kita o pension.',
    referenceEn: 'OSCA or Social Pension ID number', referenceBs: 'Numero sa OSCA o Social Pension ID' },
  { code: 'AICS', short: 'AICS', group: 'featured', en: 'AICS – Assistance to Individuals in Crisis Situation', bs: 'AICS – Tabang sa mga Tawo nga Anaa sa Krisis',
    descEn: 'Help with medical, burial, transport, food or school costs during a crisis.',
    descBs: 'Tabang sa gasto sa medikal, lubong, pamasahe, pagkaon o eskwela panahon sa krisis.' },
  { code: 'AKAP', short: 'AKAP', group: 'featured', en: 'AKAP – Ayuda para sa Kapos ang Kita Program', bs: 'AKAP – Ayuda para sa Kapos ang Kita',
    descEn: 'One-time cash aid for low-income workers.',
    descBs: 'Usa ka higayon nga cash aid sa mga trabahante nga gamay ang kita.' },
  { code: 'WALANG_GUTOM', short: 'Walang Gutom', group: 'cash', en: 'Walang Gutom Program (Food Stamp)', bs: 'Walang Gutom Program (Food Stamp)',
    descEn: 'Monthly food credits for families who do not have enough food.',
    descBs: 'Binulan nga food credits sa pamilya nga kulang sa pagkaon.' },
  { code: 'UCT', short: 'UCT', group: 'cash', en: 'Unconditional / Targeted Cash Transfer', bs: 'Unconditional / Targeted Cash Transfer',
    descEn: 'Cash subsidy for poor households, such as rice or fuel subsidies.',
    descBs: 'Cash subsidy sa kabus nga panimalay, sama sa subsidy sa bugas o krudo.' },
  { code: 'CENTENARIAN', short: 'Centenarian', group: 'cash', en: 'Centenarian Cash Gift (Expanded Centenarians Act)', bs: 'Cash Gift sa Centenarian (Expanded Centenarians Act)',
    descEn: 'Cash gift for Filipinos who turn 80, 85, 90, 95 and 100.',
    descBs: 'Cash gift sa mga Pilipino nga moabot og 80, 85, 90, 95 ug 100 anyos.' },
  { code: 'SLP', short: 'SLP', group: 'livelihood', en: 'Sustainable Livelihood Program (SLP)', bs: 'Sustainable Livelihood Program (SLP)',
    descEn: 'Capital, skills training or job help so families can earn a living.',
    descBs: 'Puhonan, skills training o tabang sa trabaho aron makapanginabuhi ang pamilya.' },
  { code: 'KALAHI', short: 'KALAHI-CIDSS', group: 'livelihood', en: 'KALAHI-CIDSS', bs: 'KALAHI-CIDSS',
    descEn: 'Community projects and paid community work chosen by the barangay.',
    descBs: 'Mga proyekto sa komunidad ug bayad nga trabaho nga gipili sa barangay.' },
  { code: 'CFW', short: 'Cash-for-Work', group: 'livelihood', en: 'Cash-for-Work / Project LAWA at BINHI', bs: 'Cash-for-Work / Project LAWA at BINHI',
    descEn: 'Paid community work, often after disasters or during dry spells.',
    descBs: 'Bayad nga trabaho sa komunidad, kasagaran human sa kalamidad o panahon sa hulaw.' },
  { code: 'DRRM', short: 'Disaster Response', group: 'disaster', en: 'Disaster Response / Family Food Packs', bs: 'Disaster Response / Family Food Packs',
    descEn: 'Relief goods and family food packs after typhoons, floods or fires.',
    descBs: 'Relief goods ug family food packs human sa bagyo, baha o sunog.' },
  { code: 'ECT', short: 'ECT', group: 'disaster', en: 'Emergency Cash Transfer (ECT)', bs: 'Emergency Cash Transfer (ECT)',
    descEn: 'Cash for families affected by a disaster.',
    descBs: 'Cash para sa pamilya nga naapektuhan sa kalamidad.' },
  { code: 'SFP', short: 'Feeding Program', group: 'children', en: 'Supplementary Feeding Program', bs: 'Supplementary Feeding Program',
    descEn: 'Meals for children in child development centers (daycare).',
    descBs: 'Pagkaon sa mga bata sa child development center (daycare).' },
  { code: 'TARA_BASA', short: 'Tara, Basa!', group: 'children', en: 'Tara, Basa! Tutoring Program', bs: 'Tara, Basa! Tutoring Program',
    descEn: 'Reading help for young learners; college students are paid as tutors.',
    descBs: 'Tabang sa pagbasa sa gagmay nga estudyante; gibayran ang college students isip tutor.' },
  { code: 'TUPAD', short: 'TUPAD', group: 'livelihood', en: 'TUPAD – DOLE emergency employment', bs: 'TUPAD – emergency nga trabaho sa DOLE',
    descEn: 'Short-term paid community work for displaced, underemployed and seasonal workers. Run by DOLE.',
    descBs: 'Mubo nga bayad nga trabaho sa komunidad para sa nawad-an, kulang, o seasonal nga trabahante. Gidumala sa DOLE.' },
  { code: 'PAG_ABOT', short: 'Pag-abot', group: 'other', en: 'Pag-abot Program', bs: 'Pag-abot Program',
    descEn: 'Help for families and individuals living on the streets.',
    descBs: 'Tabang sa mga pamilya ug tawo nga nagpuyo sa kadalanan.' },
  { code: 'OTHER', short: 'Other', group: 'other', en: 'Other – not on this list', bs: 'Uban pa – wala sa listahan',
    descEn: 'Type the name of your program.', descBs: 'I-type ang ngalan sa imong programa.' },
];

export const programByCode = (code: string) => DSWD_PROGRAMS.find((program) => program.code === code);

const ageFrom = (birthDate: string, now = new Date()) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  return now.getFullYear() - y - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? 1 : 0);
};

/** Programs worth showing first, from the ID chosen and the birth date. Suggestions never select anything. */
export function suggestPrograms(idType: string, birthDate: string, now = new Date()) {
  const age = ageFrom(birthDate, now);
  const codes: string[] = [];
  if (idType === 'fourps') codes.push('4PS');
  if (idType === 'senior_citizen' || (age !== null && age >= 60)) codes.push('SOCPEN');
  if (age !== null && age >= 80) codes.push('CENTENARIAN');
  if (idType === 'pwd' || idType === 'solo_parent') codes.push('AICS');
  return [...new Set(codes)];
}

/** Short badge name for an enrollment; programs typed in as "Other" or unknown to the app keep their saved name. */
export function programShortName(code: string, savedName: string) {
  const program = programByCode(code);
  return program && program.code !== 'OTHER' ? program.short : savedName;
}

export type EnrollmentState = 'approved' | 'pending' | 'blocked';
export function enrollmentState(status: string): EnrollmentState {
  if (status === 'approved' || status === 'active') return 'approved';
  if (['rejected', 'suspended', 'withdrawn', 'cancelled'].includes(status)) return 'blocked';
  return 'pending';
}
