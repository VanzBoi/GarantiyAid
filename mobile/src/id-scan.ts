import { idTypeByCode } from './id-types';

// Reads beneficiary details from the text recognized on the front of a Philippine ID.
// Results are suggestions only: the person reviews and corrects every field before saving.

export type ScannedId = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  birthDate?: string;
  address?: string;
  idNumber?: string;
};

const LABELS = {
  last: /^(?:(?:apelyido|last\s*name|surname|family\s*name|apelyedo)[\s/:.,-]*)+/i,
  first: /^(?:(?:mga\s*pangalan|given\s*names?|first\s*name|pangalan)[\s/:.,-]*)+/i,
  middle: /^(?:(?:gitnang\s*apelyido|middle\s*name)[\s/:.,-]*)+/i,
  // Driver's licence and some LGU IDs print "Last Name, First Name, Middle Name" above one value line.
  combinedHeading: /^last\s*name\s*,?\s*first\s*name\s*,?\s*middle\s*name\s*$/i,
  name: /^(?:(?:full\s*name|name|pangalan)[\s/:.,-]*)+/i,
  birth: /(?:petsa\s*ng\s*kapanganakan|date\s*of\s*birth|birth\s*date|birthdate|birthday|kaarawan|\bdob\b)[\s/:.,-]*/i,
  address: /^(?:(?:tirahan|address|home\s*address|permanent\s*address)[\s/:.,-]*)+/i,
};
const ANY_LABEL = /^(apelyido|last\s*name|surname|given\s*names?|first\s*name|mga\s*pangalan|gitnang|middle\s*name|petsa|date\s*of|birth|sex|kasarian|nationality|address|tirahan|blood|civil|status|height|weight|expir|valid|issued|signature|lagda|agency|restriction|condition|eyes|id\s*no|pcn|crn|tin)/i;
const HEADER_NOISE = /republi[ck]|pilipinas|philippines|identification|national\s*id|department|office|senior\s*citizen|social\s*security|driver|license|card|osca|city\s*of|municipality\s*of|province\s*of|lungsod|bayan/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SURNAME_PARTICLES = new Set(['de', 'del', 'dela', 'della', 'delas', 'delos', 'la', 'las', 'los', 'san', 'santa', 'sta', 'sto', 'santo', 'van', 'von', 'y']);

const clean = (line: string) => line.replace(/[|_*"`~^]+/g, ' ').replace(/\s+/g, ' ').trim();
const letters = (text: string) => text.match(/\p{L}/gu)?.length ?? 0;

/** "DELA CRUZ" -> "Dela Cruz", keeping hyphens and apostrophes. */
export function titleCase(text: string) {
  return text.toLocaleLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
}

function nameValue(raw: string | undefined) {
  if (!raw) return undefined;
  const value = raw.replace(/[^\p{L}\p{M} .'-]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^[.'-]+|[ '-]+$/g, '');
  if (letters(value) < 2 || value.length > 60 || HEADER_NOISE.test(value) || ANY_LABEL.test(value)) return undefined;
  return titleCase(value);
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  const ok = year >= 1900 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date <= new Date();
  return ok ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : undefined;
}
const monthIndex = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;

/** Every calendar date written in a line, in the formats used on Philippine IDs. */
export function datesIn(line: string): string[] {
  const found: string[] = [];
  const add = (value: string | undefined) => { if (value) found.push(value); };
  for (const m of line.matchAll(/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g)) add(validDate(+m[1], +m[2], +m[3]));
  for (const m of line.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) add(validDate(+m[3], +m[1], +m[2]) ?? validDate(+m[3], +m[2], +m[1]));
  for (const m of line.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) if (monthIndex(m[1])) add(validDate(+m[3], monthIndex(m[1]), +m[2]));
  for (const m of line.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})(?:\/[A-Za-z]{3,4})?\.?,?\s+(\d{4})\b/g)) if (monthIndex(m[2])) add(validDate(+m[3], monthIndex(m[2]), +m[1]));
  return found;
}

/** Value printed after a label: the rest of the label line, or the next line that is not another label. */
function valueAfter(lines: string[], label: RegExp, accept: (value: string) => boolean = (v) => letters(v) >= 2) {
  for (let i = 0; i < lines.length; i++) {
    const match = label.exec(lines[i]);
    if (!match) continue;
    const rest = clean(lines[i].slice(match.index + match[0].length));
    if (rest && accept(rest)) return { value: rest, index: i };
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      if (ANY_LABEL.test(lines[j]) && !accept(lines[j].replace(ANY_LABEL, ''))) break;
      if (accept(lines[j])) return { value: lines[j], index: j };
    }
  }
  return undefined;
}

/** Splits a full name such as "DELA CRUZ, JUAN PEDRO" or "JUAN P. DELA CRUZ". */
export function splitFullName(full: string): Pick<ScannedId, 'firstName' | 'middleName' | 'lastName'> {
  const text = full.replace(/\s+/g, ' ').trim();
  if (text.includes(',')) {
    const [last, ...restParts] = text.split(',');
    const rest = restParts.join(' ').trim().split(' ').filter(Boolean);
    const middle = rest.length >= 2 && rest[rest.length - 1].replace('.', '').length > 1 ? rest.pop() : undefined;
    if (rest.length && /^\p{L}\.?$/u.test(rest[rest.length - 1])) rest.pop();
    return { lastName: nameValue(last), firstName: nameValue(rest.join(' ')), middleName: nameValue(middle) };
  }
  const words = text.split(' ').filter(Boolean);
  if (words.length < 2) return {};
  const initial = words.findIndex((word, index) => index > 0 && /^\p{L}\.?$/u.test(word));
  if (initial > 0 && initial < words.length - 1) {
    return { firstName: nameValue(words.slice(0, initial).join(' ')), lastName: nameValue(words.slice(initial + 1).join(' ')) };
  }
  let start = words.length - 1;
  while (start > 1 && SURNAME_PARTICLES.has(words[start - 1].toLowerCase())) start--;
  return { firstName: nameValue(words.slice(0, start).join(' ')), lastName: nameValue(words.slice(start).join(' ')) };
}

function idNumber(lines: string[], idType: string) {
  const type = idTypeByCode(idType);
  const text = lines.join('\n');
  const tidy = (value: string) => value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').replace(/\s+/g, ' ').trim();
  if (type?.pattern) {
    const match = type.pattern.exec(text.toUpperCase());
    if (match) return tidy(match[0]);
  }
  const plausible = (value: string) => /\d{3,}/.test(value) && /^[A-Z0-9][A-Z0-9 -]{3,30}$/i.test(value.trim()) && !datesIn(value).length;
  const label = type?.numberLabel ?? /\b(ID\s*No|No\.)\b/i;
  for (let i = 0; i < lines.length; i++) {
    const match = label.exec(lines[i]);
    if (!match) continue;
    const rest = lines[i].slice(match.index + match[0].length).replace(/^[\s.:#/-]+/, '');
    if (plausible(rest)) return tidy(rest);
    if (lines[i + 1] && plausible(lines[i + 1])) return tidy(lines[i + 1]);
  }
  return undefined;
}

export function parseIdText(rawLines: string[], idType: string): ScannedId {
  const lines = rawLines.map(clean).filter(Boolean);
  const result: ScannedId = {};
  const isName = (value: string) => !/,/.test(value) && !!nameValue(value);
  const headingIndex = lines.findIndex((line) => LABELS.combinedHeading.test(line));
  const separate = lines.filter((_, index) => index !== headingIndex);

  result.lastName = nameValue(valueAfter(separate, LABELS.last, isName)?.value);
  result.firstName = nameValue(valueAfter(separate, LABELS.first, isName)?.value);
  result.middleName = nameValue(valueAfter(separate, LABELS.middle, isName)?.value);

  if (!result.lastName || !result.firstName) {
    const combined = headingIndex >= 0 && lines[headingIndex + 1] && /,/.test(lines[headingIndex + 1])
      ? lines[headingIndex + 1]
      : valueAfter(lines.filter((line) => !LABELS.last.test(line) && !LABELS.first.test(line)), LABELS.name, (v) => letters(v) >= 4 && /\s/.test(v.trim()))?.value
        ?? lines.find((line) => /^[\p{L}\p{M} .'-]+,\s*[\p{L}\p{M} .'-]+$/u.test(line) && letters(line) >= 5 && !HEADER_NOISE.test(line));
    if (combined) {
      const split = splitFullName(combined);
      result.lastName ??= split.lastName;
      result.firstName ??= split.firstName;
      result.middleName ??= split.middleName;
    }
  }

  const birth = valueAfter(lines, LABELS.birth, (v) => datesIn(v).length > 0);
  result.birthDate = birth ? datesIn(birth.value)[0] : undefined;
  if (!result.birthDate) {
    // Without a label, the birth date is the earliest date on the card; issue and expiry dates come later.
    const all = lines.flatMap(datesIn).filter((date) => Date.parse(date) < Date.now() - 365 * 864e5).sort();
    result.birthDate = all[0];
  }

  const address = valueAfter(lines, LABELS.address, (v) => letters(v) >= 4 && !ANY_LABEL.test(v));
  if (address) {
    const parts = [address.value];
    const next = lines[address.index + 1];
    const fieldWords = /\b(license|licence|expir\w*|agency|date|sex|nationality|signature|issued|valid|blood|no\.)/i;
    if (next && !ANY_LABEL.test(next) && !fieldWords.test(next) && letters(next) >= 4 && !datesIn(next).length && parts[0].length < 60) parts.push(next);
    const value = parts.join(' ').replace(/[^\p{L}\p{M}\d .,'#/-]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/[ ,'#/-]+$/g, '');
    if (value.length >= 5) result.address = titleCase(value).slice(0, 120).trim();
  }

  result.idNumber = idNumber(lines, idType);
  for (const key of Object.keys(result) as (keyof ScannedId)[]) if (!result[key]) delete result[key];
  return result;
}
