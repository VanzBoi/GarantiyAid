import React from 'react';
import { View } from 'react-native';
import { Txt } from './components';
import { colors as c } from './theme';

type Translate = (en: string, bs: string) => string;

/** Password strength shown while typing; the server enforces 8+ characters with a letter and a number. */
export function passwordStrength(value: string) {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/\p{L}/u.test(value) && /\d/.test(value)) score++;
  if (/[^\p{L}\d]/u.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) score++;
  return score;
}
export const meetsPasswordRules = (value: string) => value.length >= 8 && value.length <= 128 && /\p{L}/u.test(value) && /\d/.test(value);

export function StrengthMeter({ value, t }: { value: string; t: Translate }) {
  const score = passwordStrength(value);
  const labels = [t('Too weak', 'Huyang kaayo'), t('Weak', 'Huyang'), t('Fair', 'Pwede na'), t('Good', 'Maayo'), t('Strong', 'Lig-on')];
  const colors = [c.error, c.error, '#D39B22', c.green, c.greenInk];
  return (
    <View accessible accessibilityLabel={`${t('Password strength', 'Kalig-on sa password')}: ${labels[score]}`} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: index < score ? colors[score] : c.outline }} />
        ))}
      </View>
      <Txt variant="small">
        {value ? labels[score] : ''}
        {value ? ' · ' : ''}
        {t('Use 8+ characters with letters and numbers.', 'Gamita ang 8+ ka karakter nga adunay letra ug numero.')}
      </Txt>
    </View>
  );
}

