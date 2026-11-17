import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { KeyRound, LogIn, Mail, MailCheck, ShieldCheck } from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  Field,
  Notice,
  Page,
  PasswordInput,
  PhoneField,
  ScreenIntro,
  styles,
  TextLink,
  Txt,
} from '../components';
import {
  ApiRequestError,
  changePassword,
  isUnavailableOnServer,
  passwordLogin,
  requestEmailCode,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '../api';
import { useDemo } from '../state';
import { colors as c, fonts } from '../theme';

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

function StrengthMeter({ value, t }: { value: string; t: Translate }) {
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

function message(error: unknown, t: Translate, fallback: string) {
  if (isUnavailableOnServer(error)) {
    return t('This feature is not available on the connected server yet.', 'Wala pa kini nga feature sa konektado nga server.');
  }
  return error instanceof ApiRequestError ? error.message : fallback;
}

/** Login Account with mobile number and password. */
export function PasswordLoginScreen() {
  const { phone, setPhone, startSession, t } = useDemo();
  const [value, setValue] = useState(phone);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const submit = async () => {
    if (pending.current) return;
    if (!/^9\d{9}$/.test(value)) return setError(t('Enter a valid 10-digit number starting with 9.', 'Isulod ang 10 ka numero nga nagsugod sa 9.'));
    if (!password) return setError(t('Enter your password.', 'Isulod ang imong password.'));
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const session = await passwordLogin(value, password);
      setPhone(value);
      await startSession(session.accessToken, session.beneficiary);
      router.replace('/(tabs)/home');
    } catch (cause) {
      setError(message(cause, t, t('Could not sign in. Try again.', 'Wala makasulod. Sulayi pag-usab.')));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Page
      footer={
        <>
          <Button icon={LogIn} loading={busy} onPress={() => void submit()}>{t('Log in', 'Log in')}</Button>
          <TextLink onPress={() => router.push('/account/forgot-password')}>{t('Forgot password?', 'Nakalimot sa password?')}</TextLink>
        </>
      }
    >
      <ScreenIntro icon={KeyRound} title={t('Welcome back!', 'Maayong pagbalik!')}
        subtitle={t('Sign in with your mobile number and password.', 'Sulod gamit ang imong numero ug password.')} />
      <Card style={{ gap: 14 }}>
        <PhoneField value={value} onChangeText={(text) => { setValue(text); setError(''); }} editable={!busy} />
        <PasswordInput label={t('Password', 'Password')} value={password} editable={!busy}
          onChangeText={(text) => { setPassword(text); setError(''); }} autoComplete="current-password" textContentType="password" />
        {error ? <Notice tone="error">{error}</Notice> : null}
      </Card>
      <Notice>{t('No password yet? Sign in with a code, then set one in Profile › Change password.', 'Wala pay password? Sulod gamit ang code, dayon paghimo sa Profile › Usba ang password.')}</Notice>
      <TextLink onPress={() => router.replace('/flow/login')}>{t('Use a login code instead', 'Gamita hinuon ang login code')}</TextLink>
    </Page>
  );
}

/** Change Password, or set a first password for accounts that only used login codes. */
export function ChangePasswordScreen() {
  const { accessToken, beneficiary, saveBeneficiary, reset, t } = useDemo();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const pending = useRef(false);
  const hasPassword = !!beneficiary?.hasPassword;
  if (!accessToken) {
    return (
      <Page title={t('Change password', 'Usba ang password')}>
        <Notice>{t('Sign in to manage your password.', 'Pag-sign in aron madumala ang password.')}</Notice>
        <Button onPress={() => router.replace('/flow/login')}>{t('Sign in', 'Pag-sign in')}</Button>
      </Page>
    );
  }
  const submit = async () => {
    if (pending.current) return;
    const nextErrors: Record<string, string> = {};
    if (hasPassword && !current) nextErrors.current = t('Enter your current password.', 'Isulod ang kasamtangang password.');
    if (!meetsPasswordRules(next)) nextErrors.next = t('Use 8 to 128 characters with at least one letter and one number.', 'Gamita ang 8 hangtod 128 ka karakter nga adunay letra ug numero.');
    if (next !== confirm) nextErrors.confirm = t('Passwords do not match.', 'Dili parehas ang mga password.');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    pending.current = true;
    setBusy(true);
    try {
      const updated = await changePassword(accessToken, { ...(hasPassword ? { currentPassword: current } : {}), newPassword: next });
      saveBeneficiary(updated);
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) { await reset(); router.replace('/'); return; }
      if (cause instanceof ApiRequestError && cause.code === 'CURRENT_PASSWORD_INCORRECT') setErrors({ current: cause.message });
      else setErrors({ form: message(cause, t, t('Your password could not be saved. Try again.', 'Wala matipig ang password. Sulayi pag-usab.')) });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (done) {
    return (
      <Page title={t('Change password', 'Usba ang password')}>
        <ScreenIntro iconName="check" tone="green" title={t('Password saved', 'Natipig ang password')}
          subtitle={t('Use it next time you sign in. Other devices were signed out.', 'Gamita kini sunod nga pagsulod. Na-sign out ang ubang device.')} />
        <Button onPress={() => router.back()}>{t('Done', 'Human na')}</Button>
      </Page>
    );
  }
  return (
    <Page title={t('Change password', 'Usba ang password')}
      footer={<Button loading={busy} onPress={() => void submit()}>{hasPassword ? t('Update password', 'I-update ang password') : t('Set password', 'Paghimo og password')}</Button>}>
      <ScreenIntro icon={ShieldCheck} title={hasPassword ? t('Change your password', 'Usba ang imong password') : t('Set a password', 'Paghimo og password')}
        subtitle={hasPassword
          ? t('Update your account password.', 'I-update ang password sa imong account.')
          : t('Add a password so you can sign in without waiting for a code.', 'Pagdugang og password aron makasulod nga dili maghulat og code.')} />
      <Card style={{ gap: 14 }}>
        {hasPassword && <PasswordInput label={t('Current password', 'Kasamtangang password')} value={current} editable={!busy}
          onChangeText={(text) => { setCurrent(text); setErrors({}); }} error={errors.current} autoComplete="current-password" textContentType="password" />}
        <PasswordInput label={t('New password', 'Bag-ong password')} value={next} editable={!busy}
          onChangeText={(text) => { setNext(text); setErrors({}); }} error={errors.next} autoComplete="new-password" textContentType="newPassword" />
        <StrengthMeter value={next} t={t} />
        <PasswordInput label={t('Confirm new password', 'Kumpirmaha ang bag-ong password')} value={confirm} editable={!busy}
          onChangeText={(text) => { setConfirm(text); setErrors({}); }} error={errors.confirm} autoComplete="new-password" textContentType="newPassword" />
      </Card>
      {errors.form ? <Notice tone="error">{errors.form}</Notice> : null}
      <Notice>{t('Changing your password signs out your other devices.', 'Ang pag-usab sa password mo-sign out sa imong ubang device.')}</Notice>
      <TextLink onPress={() => router.push('/account/forgot-password')}>{t('Forgot your current password?', 'Nakalimot sa kasamtangang password?')}</TextLink>
    </Page>
  );
}

/** Forgot / Reset Password: request a code, set a new password, then confirm success. */
export function ForgotPasswordScreen() {
  const { phone, setPhone, t } = useDemo();
  const [step, setStep] = useState<'phone' | 'reset' | 'done'>('phone');
  const [value, setValue] = useState(phone);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (cause) { setError(message(cause, t, t('Something went wrong. Try again.', 'Adunay sayop. Sulayi pag-usab.'))); }
    finally { pending.current = false; setBusy(false); }
  };
  const sendCode = () => {
    if (!/^9\d{9}$/.test(value)) return setError(t('Enter a valid 10-digit number starting with 9.', 'Isulod ang 10 ka numero nga nagsugod sa 9.'));
    void run(async () => {
      const result = await requestPasswordReset(value);
      setPhone(value);
      setDevCode(result.developmentOtp);
      setStep('reset');
    });
  };
  const submit = () => {
    if (!/^\d{6}$/.test(code)) return setError(t('Enter the six-digit code.', 'Isulod ang unom ka numero nga code.'));
    if (!meetsPasswordRules(next)) return setError(t('Use 8 to 128 characters with at least one letter and one number.', 'Gamita ang 8 hangtod 128 ka karakter nga adunay letra ug numero.'));
    if (next !== confirm) return setError(t('Passwords do not match.', 'Dili parehas ang mga password.'));
    void run(async () => {
      await resetPassword({ contactNumber: value, code, newPassword: next });
      setStep('done');
    });
  };
  if (step === 'done') {
    return (
      <Page title={t('Reset password', 'I-reset ang password')}>
        <ScreenIntro iconName="check" tone="green" title={t('Password reset', 'Na-reset ang password')}
          subtitle={t('You can now sign in with your new password. All devices were signed out.', 'Makasulod na ka gamit ang bag-ong password. Na-sign out ang tanang device.')} />
        <Button icon={LogIn} onPress={() => router.replace('/account/password-login')}>{t('Log in', 'Log in')}</Button>
      </Page>
    );
  }
  return (
    <Page title={t('Reset password', 'I-reset ang password')}
      footer={step === 'phone'
        ? <Button loading={busy} onPress={sendCode}>{t('Send reset code', 'Ipadala ang reset code')}</Button>
        : <Button loading={busy} onPress={submit}>{t('Save new password', 'Tipigi ang bag-ong password')}</Button>}>
      <ScreenIntro icon={KeyRound}
        title={step === 'phone' ? t('Forgot password?', 'Nakalimot sa password?') : t('Create a new password', 'Paghimo og bag-ong password')}
        subtitle={step === 'phone'
          ? t('Enter your registered mobile number and we will send you a reset code.', 'Isulod ang rehistradong numero ug magpadala mi og reset code.')
          : t(`Enter the code sent to +63 ${value}.`, `Isulod ang code nga gipadala sa +63 ${value}.`)} />
      <Card style={{ gap: 14 }}>
        {step === 'phone' ? (
          <PhoneField value={value} onChangeText={(text) => { setValue(text); setError(''); }} editable={!busy} />
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <Txt variant="label">{t('Reset code', 'Reset code')}</Txt>
              <TextInput
                accessibilityLabel={t('Six-digit reset code', 'Unom ka numero nga reset code')}
                value={code}
                onChangeText={(text) => { setCode(text.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                placeholderTextColor={c.subtle}
                style={[styles.input, { fontSize: 22, letterSpacing: 8, textAlign: 'center', fontFamily: fonts.semibold }]}
              />
            </View>
            <PasswordInput label={t('New password', 'Bag-ong password')} value={next} editable={!busy}
              onChangeText={(text) => { setNext(text); setError(''); }} autoComplete="new-password" textContentType="newPassword" />
            <StrengthMeter value={next} t={t} />
            <PasswordInput label={t('Confirm new password', 'Kumpirmaha ang bag-ong password')} value={confirm} editable={!busy}
              onChangeText={(text) => { setConfirm(text); setError(''); }} autoComplete="new-password" textContentType="newPassword" />
          </>
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </Card>
      {step === 'reset' && (
        <Notice tone={devCode ? 'warning' : 'info'}>
          {devCode
            ? t(`Development code: ${devCode}. No SMS was sent.`, `Development code: ${devCode}. Walay SMS nga gipadala.`)
            : t('Check your messages for the reset code.', 'Tan-awa ang imong messages alang sa reset code.')}
        </Notice>
      )}
    </Page>
  );
}

/** Email / OTP verification for an optional email address on the account. */
export function EmailScreen() {
  const { accessToken, beneficiary, saveBeneficiary, reset, t } = useDemo();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    if (!seconds) return;
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds > 0]);
  if (!accessToken) {
    return (
      <Page title={t('Email address', 'Email address')}>
        <Notice>{t('Sign in to add an email address.', 'Pag-sign in aron makadugang og email.')}</Notice>
      </Page>
    );
  }
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) { await reset(); router.replace('/'); return; }
      setError(message(cause, t, t('Something went wrong. Try again.', 'Adunay sayop. Sulayi pag-usab.')));
    } finally { pending.current = false; setBusy(false); }
  };
  const send = (address: string) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address.trim())) return setError(t('Enter a valid email address.', 'Isulod ang hustong email address.'));
    void run(async () => {
      const result = await requestEmailCode(accessToken, address.trim());
      setSentTo(result.email);
      setDevCode(result.developmentOtp);
      setSeconds(60);
      setCode('');
    });
  };
  const confirm = () => {
    if (!/^\d{6}$/.test(code)) return setError(t('Enter the six-digit code.', 'Isulod ang unom ka numero nga code.'));
    void run(async () => {
      saveBeneficiary(await verifyEmail(accessToken, sentTo, code));
      setVerified(true);
    });
  };
  if (verified) {
    return (
      <Page title={t('Email address', 'Email address')}>
        <ScreenIntro icon={MailCheck} tone="green" title={t('Email verified', 'Na-verify ang email')} subtitle={sentTo} />
        <Button onPress={() => router.back()}>{t('Done', 'Human na')}</Button>
      </Page>
    );
  }
  return (
    <Page title={t('Email address', 'Email address')}
      footer={sentTo
        ? <Button loading={busy} onPress={confirm}>{t('Verify', 'I-verify')}</Button>
        : <Button loading={busy} onPress={() => send(email)}>{t('Send verification code', 'Ipadala ang verification code')}</Button>}>
      <ScreenIntro icon={Mail}
        title={sentTo ? t('Verify your email', 'I-verify ang imong email') : t('Add your email', 'Idugang ang imong email')}
        subtitle={sentTo ? t(`Enter the 6-digit code sent to ${sentTo}.`, `Isulod ang 6 ka numero nga code nga gipadala sa ${sentTo}.`)
          : t('Optional. Used for account notices and recovery.', 'Opsyonal. Gamiton alang sa pahibalo ug pag-recover sa account.')} />
      {beneficiary?.email ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt style={{ flex: 1 }}>{beneficiary.email}</Txt>
          <Badge tone="success">{t('Verified', 'Na-verify')}</Badge>
        </Card>
      ) : null}
      <Card style={{ gap: 14 }}>
        {sentTo ? (
          <View style={{ gap: 8 }}>
            <Txt variant="label">{t('Verification code', 'Verification code')}</Txt>
            <TextInput
              accessibilityLabel={t('Six-digit email code', 'Unom ka numero nga email code')}
              value={code}
              onChangeText={(text) => { setCode(text.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor={c.subtle}
              style={[styles.input, { fontSize: 22, letterSpacing: 8, textAlign: 'center', fontFamily: fonts.semibold }]}
            />
          </View>
        ) : (
          <Field label={beneficiary?.email ? t('New email address', 'Bag-ong email address') : t('Email address', 'Email address')} value={email}
            onChangeText={(text) => { setEmail(text); setError(''); }} icon={Mail} keyboardType="email-address" autoCapitalize="none"
            autoComplete="email" textContentType="emailAddress" maxLength={254} editable={!busy} placeholder="name@example.com" />
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </Card>
      {sentTo ? (
        <>
          <TextLink disabled={seconds > 0 || busy} onPress={() => send(sentTo)}>
            {seconds ? t(`Resend code in 0:${String(seconds).padStart(2, '0')}`, `Ipadala pag-usab sa 0:${String(seconds).padStart(2, '0')}`) : t('Resend code', 'Ipadala pag-usab ang code')}
          </TextLink>
          <Notice tone={devCode ? 'warning' : 'info'}>
            {devCode
              ? t(`Development code: ${devCode}. No email was sent because email delivery is not connected.`, `Development code: ${devCode}. Walay email nga gipadala kay wala pa konektado ang email delivery.`)
              : t('Check your inbox for the verification code.', 'Tan-awa ang inbox alang sa verification code.')}
          </Notice>
          <TextLink muted onPress={() => { setSentTo(''); setCode(''); setError(''); }}>{t('Use a different email', 'Laing email')}</TextLink>
        </>
      ) : null}
    </Page>
  );
}
