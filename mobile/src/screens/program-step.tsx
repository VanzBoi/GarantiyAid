import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BookOpen, Sparkles } from 'lucide-react-native';
import { Button, Card, Field, flow, Notice, Page, StepProgress, styles, Txt } from '../components';
import { OptionPicker } from '../option-picker';
import { DSWD_PROGRAMS, programByCode, suggestPrograms } from '../programs';
import { requestProgram } from '../api';
import { useDemo, type RegistrationInfo } from '../state';
import { colors as c } from '../theme';
import { REGISTRATION_STEPS, registrationStepLabel } from './valid-id';

const plausibleProgramName = (value: string) =>
  value.length <= 120 && (value.match(/\p{L}/gu)?.length ?? 0) >= 3 && /^[\p{L}\p{M}\d][\p{L}\p{M}\d .,'()&/-]*$/u.test(value);

export function ProgramStep() {
  const { registration, setRegistration, t } = useDemo();
  const [code, setCode] = useState(registration.programCode);
  const [otherName, setOtherName] = useState(registration.otherProgramName);
  const [reference, setReference] = useState(registration.memberReference);
  const [errors, setErrors] = useState<{ code?: boolean; otherName?: boolean; reference?: boolean }>({});
  const program = programByCode(code);
  const suggestions = suggestPrograms(registration.idType, registration.birthDate).map(programByCode).filter(Boolean);

  const choose = (next: string) => {
    setCode(next);
    setErrors({});
  };
  const continueToNumber = () => {
    const name = otherName.trim().replace(/\s+/g, ' ');
    const ref = reference.trim();
    const next = {
      code: !program,
      otherName: code === 'OTHER' && !plausibleProgramName(name),
      reference: !!ref && !/^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/.test(ref),
    };
    setErrors(next);
    if (next.code || next.otherName || next.reference) return;
    setRegistration({ programCode: code, otherProgramName: code === 'OTHER' ? name : '', memberReference: ref.toUpperCase() });
    flow('mobile-number');
  };

  return (
    <Page title={t('Create account', 'Paghimo og account')} footer={<Button onPress={continueToNumber}>{t('Continue', 'Padayon')}</Button>}>
      <StepProgress step={4} total={REGISTRATION_STEPS} label={registrationStepLabel(4, t)} />
      <View style={{ gap: 7 }}>
        <Txt accessibilityRole="header" variant="title">{t('Your assistance program', 'Imong programa sa ayuda')}</Txt>
        <Txt style={{ color: c.muted }}>
          {t('Choose the program you receive or applied for, such as 4Ps or TUPAD. The app will show its schedules and claim updates.',
            'Pilia ang programa nga imong nadawat o gi-applyan, sama sa 4Ps o TUPAD. Ipakita sa app ang iskedyul ug update sa claim niini.')}
        </Txt>
      </View>

      {suggestions.length > 0 && !program && (
        <Card style={{ gap: 10 }}>
          <View style={[styles.row, { gap: 8 }]}>
            <Sparkles size={18} color={c.primary} />
            <Txt variant="label" style={{ flex: 1 }}>{t('Suggested from your ID and age', 'Gisugyot gikan sa imong ID ug edad')}</Txt>
          </View>
          {suggestions.map((item) => (
            <Pressable
              key={item!.code}
              accessibilityRole="button"
              onPress={() => choose(item!.code)}
              style={({ pressed }) => [s.suggestion, pressed && { backgroundColor: c.primarySoft }]}
            >
              <Txt variant="label" style={{ color: c.primary }}>{t(item!.en, item!.bs)}</Txt>
              <Txt variant="small">{t(item!.descEn, item!.descBs)}</Txt>
            </Pressable>
          ))}
        </Card>
      )}

      <Card style={{ gap: 14 }}>
        <OptionPicker
          icon={BookOpen}
          label={t('Program', 'Programa')}
          placeholder={t('Choose a program', 'Pagpili og programa')}
          title={t('Assistance programs', 'Mga programa sa ayuda')}
          searchPlaceholder={t('Search, e.g. 4Ps, TUPAD, pension', 'Pangita, pananglitan 4Ps, TUPAD, pension')}
          emptyText={t('No match. Choose "Other – not on this list".', 'Walay nagtugma. Pilia ang "Uban pa – wala sa listahan".')}
          value={code}
          onChange={choose}
          error={errors.code ? t('Choose your program, or "Other" if it is not listed.', 'Pilia ang imong programa, o "Uban pa" kon wala sa listahan.') : undefined}
          options={DSWD_PROGRAMS.map((item) => ({ value: item.code, label: t(item.en, item.bs), detail: t(item.descEn, item.descBs), group: item.group, keywords: `${item.en} ${item.bs} ${item.code}` }))}
          groups={[
            { key: 'featured', label: t('Most common', 'Kasagaran') },
            { key: 'cash', label: t('Cash and food aid', 'Cash ug pagkaon') },
            { key: 'livelihood', label: t('Livelihood and community work', 'Panginabuhian ug trabaho sa komunidad') },
            { key: 'disaster', label: t('Disaster assistance', 'Tabang sa kalamidad') },
            { key: 'children', label: t('Children and learning', 'Mga bata ug pagkat-on') },
            { key: 'other', label: t('Other', 'Uban pa') },
          ]}
        />
        {program && program.code !== 'OTHER' && (
          <View style={s.about}>
            <Txt variant="small" style={{ color: c.navy }}>{t(program.descEn, program.descBs)}</Txt>
          </View>
        )}
        {code === 'OTHER' && (
          <Field
            label={t('Program name', 'Ngalan sa programa')}
            value={otherName}
            onChangeText={(value) => { setOtherName(value); setErrors((previous) => ({ ...previous, otherName: false })); }}
            placeholder={t('Example: Lingap sa Barangay', 'Pananglitan: Lingap sa Barangay')}
            autoCapitalize="words"
            maxLength={120}
            error={errors.otherName ? t('Type the name of your program.', 'I-type ang ngalan sa imong programa.') : undefined}
          />
        )}
        {program && (
          <Field
            label={`${program.referenceEn ? t(program.referenceEn, program.referenceBs ?? program.referenceEn) : t('Member or reference number', 'Numero sa miyembro o reference')} ${t('(optional)', '(opsyonal)')}`}
            value={reference}
            onChangeText={(value) => { setReference(value); setErrors((previous) => ({ ...previous, reference: false })); }}
            placeholder={t('If you have one', 'Kon naa kay')}
            autoCapitalize="characters"
            maxLength={40}
            helper={t('Helps staff find your record faster.', 'Makatabang sa staff nga dali makit-an ang imong rekord.')}
            error={errors.reference ? t('Use letters, numbers, spaces or dashes only.', 'Gamita lang ang letra, numero, space o dash.') : undefined}
          />
        )}
      </Card>
      <Notice>
        {t('Staff will confirm your program first. Your schedule appears on Home once they approve and publish it.',
          'Kumpirmahon una sa staff ang imong programa. Makita ang imong iskedyul sa Home kon aprobahan ug i-publish na nila.')}
      </Notice>
    </Page>
  );
}

/** Saves the chosen program as a pending request after the account is verified. Returns false if it must be added later. */
export async function saveRegistrationProgram(accessToken: string, registration: RegistrationInfo) {
  if (!registration.programCode) return true;
  try {
    await requestProgram(accessToken, {
      programCode: registration.programCode,
      ...(registration.otherProgramName ? { otherProgramName: registration.otherProgramName } : {}),
      ...(registration.memberReference ? { memberReference: registration.memberReference } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

const s = StyleSheet.create({
  suggestion: { gap: 2, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: c.primaryTint, backgroundColor: c.card },
  about: { padding: 12, borderRadius: 12, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primaryTint },
});
