import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BiometricConsentScreen, BiometricEnrollmentScreen } from './biometrics';
import { IdCameraScreen, REGISTRATION_STEPS, registrationStepLabel, saveRegistrationId, ValidIdStep } from './valid-id';
import { ProgramStep, saveRegistrationProgram } from './program-step';
import { LoginScreen } from './login';
import { StatusBar } from 'expo-status-bar';
import {
  CalendarDays,
  ArrowRight,
  ContactRound,
  MapPin,
  MessageSquareText,
  QrCode,
  IdCard,
  ScanFace,
  ShieldCheck,
  UserPlus,
} from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  Field,
  flow,
  GradientCard,
  IconCircle,
  LanguageToggle,
  Logo,
  Notice,
  Page,
  PasswordInput,
  PhoneField,
  ScreenIntro,
  Shake,
  StepProgress,
  styles,
  TextLink,
  Txt,
  WelcomeIllustration,
} from '../components';
import { useDemo } from '../state';
import { BarangayPicker } from '../barangay-picker';
import { BirthDatePicker } from '../birth-date-picker';
import { meetsPasswordRules, StrengthMeter } from '../password';
import {
  ApiRequestError,
  IS_SHARED_BACKEND,
  changePassword,
  getBarangays,
  registerBeneficiary,
  requestOtp,
  verifyOtp,
  type Barangay,
} from '../api';
import { colors as c, fonts } from '../theme';

export function Onboarding() {
  const { t } = useDemo();
  const features = [
    {
      Icon: CalendarDays,
      title: t('Know your schedule', 'Hibaloi imong iskedyul'),
      body: t(
        'Get exact dates and times to avoid long lines.',
        'Hibaloi ang petsa ug oras aron malikayan ang taas nga pila.',
      ),
      tone: 'primary' as const,
    },
    {
      Icon: QrCode,
      title: t('Show your QR claim pass', 'Ipakita ang QR claim pass'),
      body: t(
        'A secure pass issued for your assigned distribution.',
        'Luwas nga pass alang sa imong gi-assign nga distribution.',
      ),
      tone: 'accent' as const,
    },
    {
      Icon: ShieldCheck,
      title: t('Claim safely', 'Luwas nga pag-claim'),
      body: t(
        'Verify your identity for a secure process.',
        'Iverify ang imong pagkatawo alang sa luwas nga proseso.',
      ),
      tone: 'green' as const,
    },
  ];
  return (
    <Page
      header={false}
      footer={
        <>
          <Button icon={ArrowRight} onPress={() => flow('valid-id')}>
            {t('Create Account', 'Paghimo og Account')}
          </Button>
          <View style={[styles.row, { justifyContent: 'center', gap: 2 }]}>
            <Txt variant="small">{t('Already have an account?', 'Naa na kay account?')}</Txt>
            <TextLink onPress={() => flow('login')}>{t('Log in', 'Log in')}</TextLink>
          </View>
        </>
      }
    >
      <View style={[styles.row, { justifyContent: 'space-between', gap: 8 }]}>
        <View style={[styles.row, { gap: 8 }]}>
          <Logo size={30} />
          <Txt variant="label" style={{ color: c.navy }}>GarantiyAid</Txt>
        </View>
        <LanguageToggle />
      </View>
      <GradientCard style={{ paddingBottom: 0, gap: 0 }}>
        <View style={s.welcomeHero}>
          <View style={s.welcomeEyebrow}>
            <ShieldCheck size={14} color="#D9E6FF" />
            <Txt variant="caption" style={{ color: '#D9E6FF', letterSpacing: 1.2 }}>
              {t('YOUR ASSISTANCE COMPANION', 'KAUBAN SA IMONG AYUDA')}
            </Txt>
          </View>
          <Txt accessibilityRole="header" variant="display" style={{ color: c.onPrimary, fontSize: 34, lineHeight: 41 }}>
            {t('Your assistance.\nA little easier.', 'Imong ayuda.\nMas sayon na.')}
          </Txt>
          <Txt style={{ color: '#DFEAFF', maxWidth: 290, lineHeight: 23 }}>
            {t('Your schedule, claim pass, and updates. Together in one place.', 'Imong iskedyul, claim pass, ug mga update. Anaa sa usa ka lugar.')}
          </Txt>
        </View>
        <WelcomeIllustration height={72} />
      </GradientCard>
      <View style={{ gap: 4, paddingTop: 4 }}>
        <Txt variant="heading">{t('Here for every step', 'Kauban sa matag lakang')}</Txt>
        <Txt variant="small">{t('A simpler way to stay ready for claiming day.', 'Mas sayon nga pagpangandam sa adlaw sa pag-claim.')}</Txt>
      </View>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {features.map(({ Icon, title, body, tone }, index) => (
          <View key={title} style={[styles.row, s.featureRow, index < features.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.outline }]}>
            <IconCircle icon={Icon} tone={tone} size={44} square />
            <View style={{ flex: 1, gap: 3 }}>
              <Txt variant="label">{title}</Txt>
              <Txt variant="small">{body}</Txt>
            </View>
          </View>
        ))}
      </Card>
    </Page>
  );
}

function Progress({ step }: { step: number }) {
  const { t } = useDemo();
  return <StepProgress step={step} total={REGISTRATION_STEPS} label={registrationStepLabel(step, t)} />;
}

/** Reminds people to double-check details that were filled in from their ID photo. */
function FromIdNotice({ count }: { count: number }) {
  const { t } = useDemo();
  if (!count) return null;
  return (
    <View style={s.fromId}>
      <IdCard size={18} color={c.primary} />
      <Txt variant="small" style={{ flex: 1, color: c.navy }}>
        {t(`${count} ${count === 1 ? 'detail was' : 'details were'} filled in from your ID. Check each one before continuing.`,
          `${count} ka detalye ang napuno gikan sa imong ID. Susiha ang matag usa sa dili pa mopadayon.`)}
      </Txt>
    </View>
  );
}

const isValidBirthDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  return (
    year >= 1900 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= today
  );
};

const letterCount = (value: string) => value.match(/\p{L}/gu)?.length ?? 0;
const plausibleName = (value: string) => {
  const clean = value.trim();
  return (
    clean.length <= 60 &&
    letterCount(clean) >= 2 &&
    /^[\p{L}\p{M}](?:[\p{L}\p{M} .'-]*[\p{L}\p{M}.])?$/u.test(clean)
  );
};
const plausibleAddress = (value: string) => {
  const clean = value.trim();
  return (
    clean.length >= 5 &&
    clean.length <= 120 &&
    letterCount(clean) >= 2 &&
    /^[\p{L}\p{M}\d](?:[\p{L}\p{M}\d .,'#/-]*[\p{L}\p{M}\d.])?$/u.test(clean)
  );
};

export function AccountSetup() {
  const { registration, setRegistration, setName, t } = useDemo();
  const [firstName, setFirstName] = useState(registration.firstName);
  const [middleName, setMiddleName] = useState(registration.middleName);
  const [lastName, setLastName] = useState(registration.lastName);
  const [birthDate, setBirthDate] = useState(registration.birthDate);
  const [sex, setSex] = useState(registration.sex);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const fromId = registration.fromId;
  const readFromId = (field: keyof typeof fromId) =>
    fromId[field] ? t('From your ID · check it is correct', 'Gikan sa imong ID · susiha kon sakto') : undefined;
  const continueToAddress = () => {
    const nextErrors: Record<string, boolean> = {};
    if (!plausibleName(firstName)) nextErrors.firstName = true;
    if (middleName.trim() && !plausibleName(middleName)) nextErrors.middleName = true;
    if (!plausibleName(lastName)) nextErrors.lastName = true;
    if (!isValidBirthDate(birthDate)) nextErrors.birthDate = true;
    if (!sex) nextErrors.sex = true;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const cleanFirst = firstName.trim();
    const cleanMiddle = middleName.trim();
    const cleanLast = lastName.trim();
    setRegistration({
      firstName: cleanFirst,
      middleName: cleanMiddle,
      lastName: cleanLast,
      birthDate,
      sex,
    });
    setName([cleanFirst, cleanMiddle, cleanLast].filter(Boolean).join(' '));
    flow('account-address');
  };
  const choices = [
    { value: 'Female', en: 'Female', bs: 'Babaye' },
    { value: 'Male', en: 'Male', bs: 'Lalaki' },
    { value: 'Prefer not to say', en: 'Prefer not to say', bs: 'Dili isulti' },
  ];
  return (
    <Page
      title={t('Create account', 'Paghimo og account')}
      footer={<Button onPress={continueToAddress}>{t('Continue', 'Padayon')}</Button>}
    >
      <Progress step={2} />
      <View style={{ gap: 7 }}>
        <Txt accessibilityRole="header" variant="title">{t('Your personal details', 'Imong personal nga detalye')}</Txt>
        <Txt style={{ color: c.muted }}>
          {t(
            'Use the same information shown on your ID and official records.',
            'Gamita ang parehas nga detalye sa imong ID ug opisyal nga rekord.',
          )}
        </Txt>
      </View>
      <FromIdNotice count={(['firstName', 'middleName', 'lastName', 'birthDate'] as const).filter((key) => fromId[key]).length} />
      <Card style={{ gap: 14 }}>
        <View style={styles.row}>
          <IconCircle icon={ContactRound} size={40} square />
          <View style={{ flex: 1 }}>
            <Txt variant="label">
              {t('Personal information', 'Personal nga impormasyon')}
            </Txt>
            <Txt variant="small">
              {t(
                'All fields are required unless marked optional.',
                'Kinahanglan ang tanan gawas sa opsyonal.',
              )}
            </Txt>
          </View>
        </View>
        <Field
          label={t('First name', 'Ngalan')}
          value={firstName}
          onChangeText={(value) => {
            setFirstName(value);
            setErrors((previous) => ({ ...previous, firstName: false }));
          }}
          placeholder={t('Enter first name', 'Isulod ang ngalan')}
          error={
            errors.firstName
              ? t(
                  'Use letters and normal name punctuation only.',
                  'Gamita lamang ang mga letra ug hustong punctuation sa ngalan.',
                )
              : undefined
          }
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={60}
          helper={readFromId('firstName')}
        />
        <Field
          label={t('Middle name (optional)', 'Tunga nga ngalan (opsyonal)')}
          value={middleName}
          onChangeText={(value) => {
            setMiddleName(value);
            setErrors((previous) => ({ ...previous, middleName: false }));
          }}
          placeholder={t('Enter middle name', 'Isulod ang tunga nga ngalan')}
          error={
            errors.middleName
              ? t(
                  'Use letters and normal name punctuation only, or leave this blank.',
                  'Gamita lamang ang mga letra ug hustong punctuation, o biyai kini nga blangko.',
                )
              : undefined
          }
          autoCapitalize="words"
          autoComplete="additional-name"
          textContentType="middleName"
          maxLength={60}
          helper={readFromId('middleName')}
        />
        <Field
          label={t('Last name', 'Apelyido')}
          value={lastName}
          onChangeText={(value) => {
            setLastName(value);
            setErrors((previous) => ({ ...previous, lastName: false }));
          }}
          placeholder={t('Enter last name', 'Isulod ang apelyido')}
          error={
            errors.lastName
              ? t(
                  'Use letters and normal name punctuation only.',
                  'Gamita lamang ang mga letra ug hustong punctuation sa ngalan.',
                )
              : undefined
          }
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          maxLength={60}
          helper={readFromId('lastName')}
        />
        <BirthDatePicker
          value={birthDate}
          onChange={(date) => {
            setBirthDate(date);
            setErrors((previous) => ({ ...previous, birthDate: false }));
          }}
          error={
            errors.birthDate
              ? t('Choose your birth date to continue.', 'Pilia ang imong petsa sa pagkatawo aron makapadayon.')
              : undefined
          }
        />
        {fromId.birthDate && !errors.birthDate && <Txt variant="small" style={{ marginTop: -6 }}>{readFromId('birthDate')}</Txt>}
        <View style={{ gap: 8 }}>
          <Txt variant="label">{t('Sex', 'Sekso')}</Txt>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={
              errors.sex
                ? t('Sex. Error: Choose one option.', 'Sekso. Sayop: Pagpili og usa.')
                : t('Sex', 'Sekso')
            }
            accessibilityHint={
              errors.sex ? t('Choose one option.', 'Pagpili og usa.') : undefined
            }
            style={s.choiceRow}
          >
            {choices.map((choice) => {
              const selected = sex === choice.value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={choice.value}
                  onPress={() => {
                    setSex(choice.value);
                    setErrors((previous) => ({ ...previous, sex: false }));
                  }}
                  style={[s.choice, selected && s.choiceSelected]}
                >
                  <View style={[s.radio, selected && s.radioSelected]}>
                    {selected && <View style={s.radioDot} />}
                  </View>
                  <Txt variant="small" style={{ color: selected ? c.primary : c.text }}>
                    {t(choice.en, choice.bs)}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
          {errors.sex && (
            <Txt
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              variant="small"
              style={{ color: c.error }}
            >
              {t('Choose one option.', 'Pagpili og usa.')}
            </Txt>
          )}
        </View>
      </Card>
      <Notice>
        {t(
          'Your registration details will be sent to GarantiyAid and saved when you create your account.',
          'Ipadala ug tipigan sa GarantiyAid ang imong detalye sa pagparehistro sa paghimo sa imong account.',
        )}
      </Notice>
    </Page>
  );
}

function AccountAddress() {
  const { registration, setRegistration, t } = useDemo();
  const [address, setAddress] = useState(registration.address);
  const [barangayId, setBarangayId] = useState(registration.barangayId);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [barangays, setBarangays] = useState<Barangay[] | null>(null);
  const [serviceAreaError, setServiceAreaError] = useState(false);
  const [areaAttempt, setAreaAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setServiceAreaError(false);
    getBarangays()
      .then((items) => { if (active) setBarangays(items); })
      .catch(() => { if (active) setServiceAreaError(true); });
    return () => { active = false; };
  }, [areaAttempt]);
  const selectedBarangay = barangays?.find((item) => item.id === barangayId);
  const continueToPhone = () => {
    const validAddress = plausibleAddress(address);
    setErrors({ address: !validAddress, barangay: !selectedBarangay });
    if (!validAddress || !selectedBarangay) return;
    setRegistration({ address: address.trim(), barangayId: selectedBarangay.id });
    flow('program');
  };
  return (
    <Page
      title={t('Create account', 'Paghimo og account')}
      footer={<Button disabled={!barangays?.length} onPress={continueToPhone}>{t('Continue', 'Padayon')}</Button>}
    >
      <Progress step={3} />
      <FromIdNotice count={registration.fromId.address ? 1 : 0} />
      <View style={{ gap: 7 }}>
        <Txt accessibilityRole="header" variant="title">{t('Where do you live?', 'Asa ka nagpuyo?')}</Txt>
        <Txt style={{ color: c.muted }}>
          {t(
            'Your address helps identify the barangay handling your assistance.',
            'Ang imong adres makatabang pagtino sa barangay nga nagdumala sa imong ayuda.',
          )}
        </Txt>
      </View>
      <Card style={{ gap: 14 }}>
        <View style={styles.row}>
          <IconCircle icon={MapPin} size={40} square />
          <Txt variant="label">{t('Home address', 'Adres sa balay')}</Txt>
        </View>
        <Field
          label={t('House no. and street', 'Numero sa balay ug dalan')}
          value={address}
          onChangeText={(value) => {
            setAddress(value);
            setErrors((previous) => ({ ...previous, address: false }));
          }}
          placeholder={t('Example: 24 Mabini Street', 'Pananglitan: 24 Mabini Street')}
          error={
            errors.address
              ? t(
                  'Enter a complete address using letters, numbers, and normal address punctuation.',
                  'Isulod ang kompleto nga adres gamit ang letra, numero, ug hustong punctuation.',
                )
              : undefined
          }
          autoCapitalize="words"
          autoComplete="street-address"
          textContentType="streetAddressLine1"
          maxLength={120}
          helper={registration.fromId.address ? t('From your ID · keep only the house number and street if you choose the barangay below', 'Gikan sa ID · ibilin lang ang numero sa balay ug dalan kon pilion nimo ang barangay sa ubos') : undefined}
        />
        <BarangayPicker
          label={t('Province, city and barangay', 'Probinsya, siyudad ug barangay')}
          areas={barangays ?? []}
          value={barangayId}
          onChange={(id) => {
            setBarangayId(id);
            setErrors((previous) => ({ ...previous, barangay: false }));
          }}
          error={
            errors.barangay
              ? t(
                  'Choose your barangay to continue.',
                  'Pilia ang imong barangay aron makapadayon.',
                )
              : undefined
          }
        />
      </Card>
      {serviceAreaError ? (
        <>
          <Notice tone="error">{t('Could not load barangays. Check your connection and try again.', 'Wala makuha ang mga barangay. Susihon ang koneksyon ug sulayi pag-usab.')}</Notice>
          <Button variant="outline" onPress={() => setAreaAttempt((attempt) => attempt + 1)}>{t('Try again', 'Sulayi pag-usab')}</Button>
        </>
      ) : barangays === null ? (
        <Notice>{t('Loading barangays…', 'Gikuha ang mga barangay…')}</Notice>
      ) : barangays.length === 0 ? (
        <Notice>{t('No barangays are available yet.', 'Walay barangay nga magamit karon.')}</Notice>
      ) : null}
    </Page>
  );
}

export function EntryFlow() {
  const { step } = useLocalSearchParams<{ step: string }>();
  // Log in is number + password (or face login); sign-up codes still verify a new number.
  if (step === 'login') return <LoginScreen />;
  if (step === 'mobile-number') return <PhoneEntry key={step} login={false} />;
  if (step === 'valid-id') return <ValidIdStep />;
  if (step === 'id-camera') return <IdCameraScreen />;
  if (step === 'account-info') return <AccountSetup />;
  if (step === 'program') return <ProgramStep />;
  if (step === 'account-address') return <AccountAddress />;
  if (step === 'otp') return <OTP />;
  if (step === 'consent') return <Consent />;
  if (step === 'capture') return <Capture />;
  if (step === 'face-success') return <FaceSuccess />;
  return (
    <Page title="GarantiyAid">
      <Txt variant="title">This step is unavailable</Txt>
      <Button onPress={() => router.replace('/')}>Back to welcome</Button>
    </Page>
  );
}

function PhoneEntry({ login }: { login: boolean }) {
  const { phone, setPhone, registration, setRegistration, t } = useDemo();
  const [value, setValue] = useState(phone);
  const [password, setPassword] = useState(registration.password ?? '');
  const [confirm, setConfirm] = useState(registration.password ?? '');
  const [passwordErrors, setPasswordErrors] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sendingCode = useRef(false);
  const send = async () => {
    if (sendingCode.current) return;
    if (!/^9\d{9}$/.test(value)) {
      setError(
        t(
          'Enter a valid 10-digit number starting with 9.',
          'Isulod ang 10 ka numero nga nagsugod sa 9.',
        ),
      );
      return;
    }
    if (!login) {
      const nextErrors = { password: !meetsPasswordRules(password), confirm: password !== confirm };
      setPasswordErrors(nextErrors);
      if (nextErrors.password || nextErrors.confirm) return;
      setRegistration({ password });
    }
    sendingCode.current = true;
    setLoading(true);
    setError('');
    try {
      let developmentOtp: string | undefined;
      let purpose: 'login' | 'register' = login ? 'login' : 'register';
      if (login) {
        developmentOtp = (await requestOtp(value, 'login')).developmentOtp;
      } else {
        if (!registration.barangayId) {
          setError(
            t(
              'Go back and choose an available barangay before continuing.',
              'Balik ug pagpili og available nga barangay sa dili pa mopadayon.',
            ),
          );
          return;
        }
        try {
          developmentOtp = (
            await registerBeneficiary({
              firstName: registration.firstName,
              middleName: registration.middleName,
              lastName: registration.lastName,
              birthDate: registration.birthDate,
              sex: registration.sex,
              address: registration.address,
              barangayId: registration.barangayId,
              contactNumber: value,
              // The shared staff backend receives the ID through the uploaded document instead.
              ...(!IS_SHARED_BACKEND && registration.idType
                ? { validIdType: registration.idType, validIdNumber: registration.idNumber || undefined }
                : {}),
            })
          ).developmentOtp;
        } catch (requestError) {
          if (requestError instanceof ApiRequestError && requestError.code === 'PHONE_ALREADY_REGISTERED') {
            try {
              developmentOtp = (await requestOtp(value, 'register')).developmentOtp;
            } catch (verificationError) {
              if (!(verificationError instanceof ApiRequestError) || verificationError.code !== 'ACCOUNT_ALREADY_VERIFIED') throw verificationError;
              purpose = 'login';
              developmentOtp = (await requestOtp(value, purpose)).developmentOtp;
            }
          } else {
            throw requestError;
          }
        }
      }
      setPhone(value);
      flow('otp', {
        intent: purpose,
        ...(developmentOtp ? { developmentOtp } : {}),
      });
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : t('Could not send a code. Try again.', 'Wala maipadala ang code. Sulayi pag-usab.'),
      );
    } finally {
      sendingCode.current = false;
      setLoading(false);
    }
  };
  return (
    <Page
      footer={
        <>
          <Button onPress={send} loading={loading}>
            {login
              ? t('Send Login Code', 'Ipadala ang Login Code')
              : t('Send Code', 'Ipadala ang Code')}
          </Button>
          {login ? (
            <TextLink onPress={() => router.push('/reset-password')}>
              {t('Trouble signing in? Recover account', 'Dili maka-log in? Irecover ang account')}
            </TextLink>
          ) : (
            <Txt variant="small" style={{ textAlign: 'center' }}>
              {t(
                'By continuing, you agree to receive account verification messages when this app is connected.',
                'Sa pagpadayon, mouyon ka sa pagdawat sa verification messages kon konektado na ang app.',
              )}
            </Txt>
          )}
        </>
      }
    >
      {!login && <Progress step={5} />}
      <View style={{ alignItems: 'center', gap: 14, paddingTop: login ? 8 : 0 }}>
        <Logo size={login ? 64 : 52} halo={login} />
        <Txt accessibilityRole="header" variant="title" style={{ textAlign: 'center' }}>
          {login
            ? t('Welcome back!', 'Maayong pagbalik!')
            : t('Your number and password', 'Imong numero ug password')}
        </Txt>
        <Txt style={{ color: c.muted, textAlign: 'center', maxWidth: 320 }}>
          {login
            ? t(
                'Log in to view your schedule or claim your assistance.',
                'Log in aron makita ang iskedyul o ma-claim ang ayuda.',
              )
            : t(
                'You will log in with this number and password. We send a code to confirm the number is yours.',
                'Kini nga numero ug password ang imong gamiton sa pag-log in. Magpadala mi og code aron makumpirma nga imo ang numero.',
              )}
        </Txt>
      </View>
      <Card style={{ gap: 14 }}>
      <PhoneField
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setError('');
        }}
        error={error}
      />
      {!login && (
        <>
          <PasswordInput
            label={t('Create password', 'Paghimo og password')}
            value={password}
            onChangeText={(text) => { setPassword(text); setPasswordErrors((previous) => ({ ...previous, password: false })); }}
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={128}
            error={passwordErrors.password ? t('Use 8 to 128 characters with at least one letter and one number.', 'Gamita ang 8 hangtod 128 ka karakter nga adunay letra ug numero.') : undefined}
          />
          <StrengthMeter value={password} t={t} />
          <PasswordInput
            label={t('Confirm password', 'Kumpirmaha ang password')}
            value={confirm}
            onChangeText={(text) => { setConfirm(text); setPasswordErrors((previous) => ({ ...previous, confirm: false })); }}
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={128}
            error={passwordErrors.confirm ? t('Passwords do not match.', 'Dili parehas ang mga password.') : undefined}
          />
        </>
      )}
      <Notice>
        {t(
          'Your verification code expires after five minutes. Keep it private.',
          'Ma-expire ang imong verification code human sa lima ka minuto. Ayaw kini ipaambit.',
        )}
      </Notice>
      </Card>
      {login && (
        <>
          <TextLink onPress={() => router.push('/account/password-login')}>
            {t('Log in with password instead', 'Log in gamit ang password')}
          </TextLink>
          <View style={[styles.row, { gap: 12 }]}>
            <View style={s.rule} />
            <Txt variant="small">{t('OTHER OPTIONS', 'UBANG PAAGI')}</Txt>
            <View style={s.rule} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t('Explains why face login is not available yet.', 'Nagpasabot nganong dili pa magamit ang face login.')}
            onPress={() => router.push('/face-login')}
            style={({ pressed }) => [s.faceLogin, pressed && { backgroundColor: c.primarySoft }]}
          >
            <IconCircle icon={ScanFace} size={44} square tone="neutral" />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="label">{t('Login with Face', 'Log in pinaagi sa Nawong')}</Txt>
              <Badge tone="neutral">{t('Not available yet', 'Dili pa magamit')}</Badge>
            </View>
          </Pressable>
          <View style={[styles.row, { justifyContent: 'center', gap: 2 }]}>
            <Txt variant="small">{t("Don't have an account?", 'Wala pay account?')}</Txt>
            <TextLink onPress={() => flow('valid-id')}>{t('Register', 'Magparehistro')}</TextLink>
          </View>
        </>
      )}
    </Page>
  );
}

function OTP() {
  const { phone, startSession, registration, setRegistration, t } = useDemo();
  const { intent, developmentOtp: initialDevelopmentOtp } = useLocalSearchParams<{
    intent: string;
    developmentOtp?: string;
  }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(60);
  const [loading, setLoading] = useState(false);
  const [developmentOtp, setDevelopmentOtp] = useState(initialDevelopmentOtp);
  const [shake, setShake] = useState(0);
  const purpose = intent === 'login' ? 'login' : 'register';
  useEffect(() => {
    const interval = setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, []);
  return (
    <Page
      footer={
        <Button
          disabled={code.length !== 6}
          loading={loading}
          onPress={async () => {
            setLoading(true);
            setError('');
            try {
              const result = await verifyOtp(phone, purpose, code);
              if (intent === 'login') {
                await startSession(result.accessToken, result.beneficiary);
                // An existing account keeps its own password; never apply a sign-up draft to it.
                if (registration.password) setRegistration({ password: '' });
                router.replace('/(tabs)/home');
              } else {
                // Save the sign-up details first, so Home opens with the chosen program already shown.
                let passwordSaved = true;
                if (registration.password) {
                  try { await changePassword(result.accessToken, { newPassword: registration.password }); }
                  catch { passwordSaved = false; }
                  setRegistration({ password: '' });
                }
                const idSaved = await saveRegistrationId(result.accessToken, registration);
                const programSaved = await saveRegistrationProgram(result.accessToken, registration);
                await startSession(result.accessToken, result.beneficiary);
                flow('consent', {
                  ...(idSaved ? {} : { idUpload: 'failed' }),
                  ...(programSaved ? {} : { program: 'failed' }),
                  ...(passwordSaved ? {} : { password: 'failed' }),
                });
              }
            } catch (requestError) {
              setShake((value) => value + 1);
              setError(
                requestError instanceof ApiRequestError
                  ? requestError.message
                  : t('Could not verify the code. Try again.', 'Wala ma-verify ang code. Sulayi pag-usab.'),
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          {t('Verify code', 'Iverify ang code')}
        </Button>
      }
    >
      {intent === 'login' ? (
        <Badge tone="info">{t('Login verification', 'Verification sa login')}</Badge>
      ) : (
        <Progress step={6} />
      )}
      <ScreenIntro
        icon={MessageSquareText}
        title={t('Enter your code', 'Isulod imong code')}
        subtitle={
          <>
            {t(
              'Enter the 6-digit verification code for',
              'Isulod ang 6 ka numero nga verification code alang sa',
            )}{' '}
            <Txt variant="label">+63 {phone || '9175550147'}</Txt>
          </>
        }
      />
      <Shake trigger={shake}>
      <View style={s.otpWrap}>
        <TextInput
          accessibilityLabel={t(
            'Six-digit verification code',
            'Unom ka numero nga verification code',
          )}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChangeText={(value) => {
            setCode(value.replace(/\D/g, '').slice(0, 6));
            setError('');
          }}
          caretHidden
          style={s.otpInput}
        />
        <View
          style={s.otpBoxes}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <View
              key={index}
              style={[
                s.otpBox,
                !!code[index] && s.otpBoxFilled,
                code.length === index && s.otpBoxActive,
                !!error && { borderColor: c.error, backgroundColor: c.errorSoft },
              ]}
            >
              <Txt variant="heading" style={{ fontSize: 24, color: c.navy }}>{code[index] || ''}</Txt>
            </View>
          ))}
        </View>
      </View>
      </Shake>
      {error ? (
        <Txt accessibilityRole="alert" accessibilityLiveRegion="assertive" variant="small" style={{ color: c.error, textAlign: 'center' }}>
          {error}
        </Txt>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={seconds > 0}
        style={s.textLink}
        onPress={async () => {
          setLoading(true);
          setError('');
          try {
            const result = await requestOtp(phone, purpose);
            setDevelopmentOtp(result.developmentOtp);
            setSeconds(60);
            setCode('');
          } catch (requestError) {
            setError(
              requestError instanceof ApiRequestError
                ? requestError.message
                : t('Could not resend the code. Try again.', 'Wala maipadala pag-usab ang code.'),
            );
          } finally {
            setLoading(false);
          }
        }}
      >
        <Txt
          variant="small"
          style={{ textAlign: 'center', color: seconds ? c.muted : c.primary, fontFamily: fonts.semibold }}
        >
          {seconds
            ? t(
                `Resend in 0:${String(seconds).padStart(2, '0')}`,
                `Ipadala pag-usab sa 0:${String(seconds).padStart(2, '0')}`,
              )
            : t('Resend code', 'Ipadala pag-usab ang code')}
        </Txt>
      </Pressable>
      <Notice tone={developmentOtp ? 'warning' : 'info'}>
        {developmentOtp
          ? t(
              `Development code: ${developmentOtp}. No SMS was sent.`,
              `Development code: ${developmentOtp}. Walay SMS nga gipadala.`,
            )
          : t(
              'Check your messages for the verification code.',
              'Tan-awa ang imong messages alang sa verification code.',
            )}
      </Notice>
    </Page>
  );
}

function Consent() { return <BiometricConsentScreen />; }

function Capture() { return <BiometricEnrollmentScreen />; }
function FaceSuccess() { return <BiometricEnrollmentScreen />; }
const s = StyleSheet.create({
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.outline,
    backgroundColor: c.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  choiceSelected: { borderColor: c.primary, backgroundColor: c.primarySoft },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: c.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary },
  welcomeHero: { alignItems: 'flex-start', gap: 12, paddingTop: 6 },
  welcomeEyebrow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  featureRow: { alignItems: 'center', gap: 14, paddingVertical: 14 },
  textLink: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  faceLogin: {
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: 18,
    backgroundColor: c.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rule: { height: 1, backgroundColor: c.outline, flex: 1 },
  fromId: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: c.primarySoft,
    borderWidth: 1,
    borderColor: c.primaryTint,
  },
  otpWrap: { height: 62, position: 'relative' },
  // Keep the digit row opaque so native input text can't show through it.
  otpBoxes: { flexDirection: 'row', gap: 8, height: 62, backgroundColor: c.surface, zIndex: 1 },
  otpBox: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: c.outline,
    borderRadius: 14,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: { borderColor: c.primaryTint, backgroundColor: c.primarySoft },
  otpBoxActive: { borderColor: c.primary, borderWidth: 2 },
  otpInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 24,
  },
});
