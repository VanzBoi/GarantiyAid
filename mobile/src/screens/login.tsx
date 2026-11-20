import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useCameraPermissions, type CameraView } from 'expo-camera';
import { Camera, ChevronRight, LogIn, ScanFace, ShieldCheck } from 'lucide-react-native';
import {
  Badge, Button, Card, Checklist, flow, IconCircle, Logo, Notice, Page, PasswordInput, PhoneField, ScreenIntro, styles, TextLink, Txt,
} from '../components';
import { ApiRequestError, disableFaceLogin, enableFaceLogin, isUnavailableOnServer, passwordLogin, type FaceLoginResult } from '../api';
import { useAutomaticFace } from '../automatic-face';
import { clearFaceLoginDevice, getFaceLoginDevice, storeFaceLoginDevice, type FaceLoginDevice } from '../session-storage';
import { useDemo } from '../state';
import { colors as c, fonts } from '../theme';
import { FaceCamera } from './face';

/** Reads this phone's face login key once; `undefined` while loading. */
function useFaceLoginDevice() {
  const [device, setDevice] = useState<FaceLoginDevice | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void getFaceLoginDevice().then((value) => { if (active) setDevice(value); });
    return () => { active = false; };
  }, []);
  return [device, setDevice] as const;
}

/** Log in with mobile number and password. Face login is offered on phones where it was turned on. */
export function LoginScreen() {
  const { phone, setPhone, startSession, t } = useDemo();
  const [value, setValue] = useState(phone);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [device] = useFaceLoginDevice();

  const submit = async () => {
    if (pending.current) return;
    const next = {
      phone: /^9\d{9}$/.test(value) ? undefined : t('Enter a valid 10-digit number starting with 9.', 'Isulod ang 10 ka numero nga nagsugod sa 9.'),
      password: password ? undefined : t('Enter your password.', 'Isulod ang imong password.'),
    };
    setErrors(next);
    if (next.phone || next.password) return;
    pending.current = true;
    setBusy(true);
    try {
      const session = await passwordLogin(value, password);
      // A face login key saved for a different account must not stay on this phone.
      if (device && device.beneficiaryId !== session.beneficiary.id) await clearFaceLoginDevice();
      setPhone(value);
      await startSession(session.accessToken, session.beneficiary);
      router.replace('/(tabs)/home');
    } catch (cause) {
      setErrors({
        form: cause instanceof ApiRequestError && cause.code === 'INVALID_CREDENTIALS'
          ? t('The mobile number or password is incorrect.', 'Sayop ang numero o password.')
          : cause instanceof ApiRequestError && cause.code === 'TOO_MANY_ATTEMPTS'
            ? t('Too many incorrect tries. Wait 15 minutes or reset your password.', 'Daghan na kaayong sayop. Paghulat og 15 minutos o i-reset ang password.')
            : cause instanceof ApiRequestError ? cause.message
              : t('Could not log in. Check your internet and try again.', 'Wala makalog in. Susiha ang internet ug sulayi pag-usab.'),
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const faceReady = !!device;
  return (
    <Page
      footer={
        <>
          <Button icon={LogIn} loading={busy} onPress={() => void submit()}>{t('Log in', 'Log in')}</Button>
          <View style={[styles.row, { justifyContent: 'center', gap: 2 }]}>
            <Txt variant="small">{t("Don't have an account?", 'Wala pay account?')}</Txt>
            <TextLink onPress={() => flow('valid-id')}>{t('Register', 'Magparehistro')}</TextLink>
          </View>
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <Logo size={64} halo />
        <Txt accessibilityRole="header" variant="title" style={{ textAlign: 'center' }}>{t('Welcome back!', 'Maayong pagbalik!')}</Txt>
        <Txt style={{ color: c.muted, textAlign: 'center', maxWidth: 320 }}>
          {t('Log in with your mobile number and password.', 'Log in gamit ang imong numero ug password.')}
        </Txt>
      </View>
      <Card style={{ gap: 14 }}>
        <PhoneField value={value} editable={!busy} error={errors.phone}
          onChangeText={(text) => { setValue(text); setErrors({}); }} />
        <PasswordInput label={t('Password', 'Password')} value={password} editable={!busy} error={errors.password}
          onChangeText={(text) => { setPassword(text); setErrors({}); }} autoComplete="current-password" textContentType="password" />
        <View style={{ alignItems: 'flex-end', marginTop: -4 }}>
          <TextLink onPress={() => router.push('/account/forgot-password')}>{t('Forgot password?', 'Nakalimot sa password?')}</TextLink>
        </View>
        {errors.form ? <Notice tone="error">{errors.form}</Notice> : null}
      </Card>

      <View style={[styles.row, { gap: 12 }]}>
        <View style={s.rule} />
        <Txt variant="small">{t('OTHER OPTION', 'UBANG PAAGI')}</Txt>
        <View style={s.rule} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={faceReady
          ? t('Opens the camera to log in with your face.', 'Ablihan ang camera aron mo-log in gamit ang nawong.')
          : t('Explains how to turn on face login.', 'Ipasabot unsaon pag-on sa face login.')}
        onPress={() => router.push('/face-login')}
        style={({ pressed }) => [s.faceRow, pressed && { backgroundColor: c.primarySoft }]}
      >
        <IconCircle icon={ScanFace} size={44} square tone={faceReady ? 'primary' : 'neutral'} />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt variant="label">{t('Log in with Face', 'Log in gamit ang Nawong')}</Txt>
          {faceReady
            ? <Txt variant="small">{device.firstName ? t(`As ${device.firstName}`, `Isip ${device.firstName}`) : t('On for this phone', 'Naka-on niini nga phone')}</Txt>
            : <Badge tone="neutral">{t('Turn on in Profile after you log in', 'I-on sa Profile human mo-log in')}</Badge>}
        </View>
        <ChevronRight size={20} color={c.subtle} />
      </Pressable>
      <Notice>
        {t('No password yet? Tap Forgot password. We will send a code to your number so you can create one.',
          'Wala pay password? I-tap ang Nakalimot sa password. Magpadala mi og code sa imong numero aron makahimo ka.')}
      </Notice>
    </Page>
  );
}

/** Face login on a phone where it was turned on. Needs this phone's key plus a face capture. */
export function FaceLoginScreen() {
  const { startSession, t } = useDemo();
  const [device, setDevice] = useFaceLoginDevice();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<'intro' | 'camera' | 'sending' | 'failed'>('intro');
  const [ready, setReady] = useState(false);
  const [voice, setVoice] = useState(false);
  const [error, setError] = useState('');
  const camera = useRef<CameraView>(null);
  const title = t('Log in with Face', 'Log in gamit ang Nawong');

  const automatic = useAutomaticFace({
    camera, active: !!device && (stage === 'camera' || stage === 'sending'), ready, accessToken: '', verify: true,
    login: device ?? undefined,
    onSending: () => setStage('sending'),
    onPause: () => { setReady(false); setStage('intro'); },
    onResult: () => {},
    onLogin: async (session: FaceLoginResult) => {
      await startSession(session.accessToken, session.beneficiary);
      router.replace('/(tabs)/home');
    },
    onError: async (cause) => {
      setReady(false);
      if (cause instanceof ApiRequestError && cause.code === 'FACE_LOGIN_OFF') {
        await clearFaceLoginDevice();
        setDevice(null);
        setError(t('Face login was turned off for this phone, for example after a password change. Log in with your password.', 'Na-off ang face login niini nga phone, pananglitan human usba ang password. Log in gamit ang password.'));
      } else if (cause instanceof ApiRequestError && cause.code === 'FACE_NOT_MATCHED') {
        setError(t('Your face did not match. Try again in good light, or log in with your password.', 'Wala motakdo ang nawong. Sulayi pag-usab sa hayag nga lugar, o log in gamit ang password.'));
      } else if (cause instanceof ApiRequestError && cause.code === 'FACE_ENROLLMENT_REQUIRED') {
        setError(t('Register your face again after logging in with your password, then turn face login back on.', 'Irehistro pag-usab ang nawong human mo-log in gamit ang password, dayon i-on balik ang face login.'));
      } else if (cause instanceof Error && cause.message === 'FACE_DETECTOR_BUILD_REQUIRED') {
        setError(t('Install the updated app to use face login.', 'I-install ang updated nga app aron magamit ang face login.'));
      } else if (cause instanceof Error && cause.message === 'FACE_TIMEOUT') {
        setError(t('The scan timed out. Try again when ready.', 'Nahutdan og oras ang scan. Sulayi pag-usab kon andam na.'));
      } else {
        setError(cause instanceof ApiRequestError ? cause.message : t('Face login could not finish. Check your internet and try again.', 'Wala mahuman ang face login. Susiha ang internet ug sulayi pag-usab.'));
      }
      setStage('failed');
    },
  });

  if (Platform.OS === 'web') {
    return (
      <Page title={title}>
        <ScreenIntro icon={ScanFace} tone="neutral" title={t('Face login works in the Android app', 'Ang face login anaa sa Android app')}
          subtitle={t('In this browser, log in with your mobile number and password.', 'Niini nga browser, log in gamit ang numero ug password.')} />
        <Button onPress={() => router.replace('/flow/login')}>{t('Log in with password', 'Log in gamit ang password')}</Button>
      </Page>
    );
  }
  if (device === undefined) return <Page title={title}><Notice>{t('Checking this phone…', 'Gisusi kini nga phone…')}</Notice></Page>;
  if (!device) {
    return (
      <Page title={title} footer={<Button onPress={() => router.replace('/flow/login')}>{t('Log in with password', 'Log in gamit ang password')}</Button>}>
        <ScreenIntro icon={ScanFace} tone="neutral" title={t('Face login is off on this phone', 'Naka-off ang face login niini nga phone')}
          subtitle={t('Turn it on once, then you can log in with your face next time.', 'I-on kausa, dayon makalog in ka gamit ang nawong sa sunod.')} />
        {error ? <Notice tone="warning">{error}</Notice> : null}
        <Card style={{ gap: 12 }}>
          {[
            t('Log in with your mobile number and password.', 'Log in gamit ang numero ug password.'),
            t('Register your face (Home › To do, or Profile › Security & Privacy).', 'Irehistro ang nawong (Home › Buhaton, o Profile › Seguridad ug Privacy).'),
            t('Open Profile › Face login and turn it on.', 'Ablihi ang Profile › Face login ug i-on.'),
          ].map((step, index) => (
            <View key={step} style={[styles.row, { gap: 10, alignItems: 'flex-start' }]}>
              <View style={s.stepDot}><Txt variant="small" style={{ color: c.onPrimary, fontFamily: fonts.bold }}>{index + 1}</Txt></View>
              <Txt style={{ flex: 1 }}>{step}</Txt>
            </View>
          ))}
        </Card>
      </Page>
    );
  }
  if (stage === 'intro' || stage === 'failed' || !permission?.granted) {
    const blocked = permission && !permission.granted && !permission.canAskAgain;
    return (
      <Page title={title} footer={
        <>
          {blocked
            ? <Button onPress={() => void Linking.openSettings()}>{t('Open settings', 'Ablihi ang settings')}</Button>
            : <Button icon={Camera} onPress={async () => {
                const granted = permission?.granted || (await requestPermission()).granted;
                if (granted) { setError(''); setReady(false); setStage('camera'); }
              }}>{stage === 'failed' ? t('Try again', 'Sulayi pag-usab') : t('Start face scan', 'Sugdi ang face scan')}</Button>}
          <TextLink onPress={() => router.replace('/flow/login')}>{t('Use password instead', 'Gamita hinuon ang password')}</TextLink>
        </>
      }>
        <ScreenIntro icon={ScanFace}
          title={device.firstName ? t(`Log in as ${device.firstName}`, `Log in isip ${device.firstName}`) : title}
          subtitle={t('Look at the camera and follow the guidance. It captures automatically.', 'Tan-aw sa camera ug sunda ang giya. Automatic kini mokuha.')} />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Card>
          <Checklist items={[
            { icon: 'light', text: t('Use a well-lit area', 'Gamita ang hayag nga lugar') },
            { icon: 'glasses', text: t('Keep your face visible and avoid glare', 'Ipakita ang nawong ug likayi ang silaw') },
            { icon: 'face', text: t('Look straight at the camera, then blink when asked', 'Tan-aw diretso sa camera, dayon pamilok kon sugoon') },
          ]} />
        </Card>
        {blocked && <Notice tone="error">{t('Camera access is blocked. Allow it in your phone settings.', 'Gibabagan ang camera. Tugoti kini sa settings sa cellphone.')}</Notice>}
      </Page>
    );
  }
  return (
    <FaceCamera
      cameraRef={camera}
      automatic={automatic}
      title={title}
      sending={stage === 'sending'}
      simulated={false}
      ready={ready}
      error={error}
      voice={voice}
      onToggleVoice={() => setVoice((on) => !on)}
      onReady={() => setReady(true)}
      onMountError={() => { setReady(false); setError(t('The camera could not start.', 'Wala nagsugod ang camera.')); setStage('failed'); }}
    />
  );
}

/** Turn face login on or off for this phone (signed-in). */
export function FaceLoginSettingsScreen() {
  const { accessToken, beneficiary, biometrics, refreshBiometrics, t } = useDemo();
  const [device, setDevice] = useFaceLoginDevice();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [simulated, setSimulated] = useState(false);
  useEffect(() => { if (accessToken) void refreshBiometrics(); }, [accessToken]);
  const title = t('Face login', 'Face login');
  const onHere = !!device && !!beneficiary && device.beneficiaryId === beneficiary.id;
  const faceRegistered = biometrics?.consent?.status === 'active' && biometrics.profile?.status === 'enrolled';

  if (!accessToken || !beneficiary) {
    return <Page title={title}><Notice>{t('Log in to manage face login.', 'Log in aron madumala ang face login.')}</Notice></Page>;
  }
  if (Platform.OS === 'web') {
    return <Page title={title}><Notice>{t('Face login can be turned on in the Android app.', 'Ma-on ang face login sa Android app.')}</Notice></Page>;
  }

  const turnOn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const created = await enableFaceLogin(accessToken);
      const saved = { deviceId: created.deviceId, deviceSecret: created.deviceSecret, beneficiaryId: beneficiary.id, firstName: beneficiary.firstName };
      await storeFaceLoginDevice(saved);
      setDevice(saved);
      setSimulated(created.simulated);
      setMessage({ tone: 'success', text: t('Face login is on. Next time, tap "Log in with Face" on the login screen.', 'Naka-on na ang face login. Sa sunod, i-tap ang "Log in gamit ang Nawong" sa login screen.') });
    } catch (cause) {
      setMessage({
        tone: 'error',
        text: cause instanceof ApiRequestError && cause.code === 'FACE_ENROLLMENT_REQUIRED'
          ? t('Register your face first, then turn on face login.', 'Irehistro una ang nawong, dayon i-on ang face login.')
          : isUnavailableOnServer(cause) ? t('Face login is not available on the connected server yet.', 'Wala pa ang face login sa konektado nga server.')
            : t('Face login could not be turned on. Try again.', 'Wala ma-on ang face login. Sulayi pag-usab.'),
      });
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    if (!device) return;
    setBusy(true);
    setMessage(null);
    try { await disableFaceLogin(accessToken, device.deviceId); } catch { /* The phone key is removed below either way. */ }
    await clearFaceLoginDevice();
    setDevice(null);
    setBusy(false);
    setMessage({ tone: 'success', text: t('Face login is off for this phone.', 'Naka-off na ang face login niini nga phone.') });
  };

  return (
    <Page title={title}>
      <ScreenIntro icon={ScanFace} tone={onHere ? 'green' : 'primary'}
        title={onHere ? t('Face login is on', 'Naka-on ang face login') : t('Log in with your face', 'Log in gamit ang imong nawong')}
        subtitle={t('Works only on this phone. Anyone else needs your password.', 'Niini ra nga phone mogana. Ang uban kinahanglan sa imong password.')} />
      {device === undefined ? <Notice>{t('Checking this phone…', 'Gisusi kini nga phone…')}</Notice>
        : onHere ? <Button variant="danger" loading={busy} onPress={() => void turnOff()}>{t('Turn off face login', 'I-off ang face login')}</Button>
          : faceRegistered ? <Button icon={ScanFace} loading={busy} onPress={() => void turnOn()}>{t('Turn on face login', 'I-on ang face login')}</Button>
            : <>
                <Notice tone="warning">{t('Register your face first.', 'Irehistro una ang imong nawong.')}</Notice>
                <Button icon={ScanFace} onPress={() => flow('consent')}>{t('Register my face', 'Irehistro akong nawong')}</Button>
              </>}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {(simulated || (faceRegistered && biometrics?.profile?.simulated)) && (
        <Notice tone="warning">
          {t('Demo server: faces are not compared yet. Face login on this phone is protected by a secure key saved only on this phone.',
            'Demo nga server: wala pa gikumpara ang mga nawong. Ang face login niini nga phone gipanalipdan sa luwas nga key nga natipig ra niini nga phone.')}
        </Notice>
      )}
      <Card style={{ gap: 10 }}>
        <View style={[styles.row, { gap: 10 }]}>
          <ShieldCheck size={18} color={c.green} />
          <Txt variant="label" style={{ flex: 1 }}>{t('Lost your phone?', 'Nawala ang imong phone?')}</Txt>
        </View>
        <Txt variant="small">
          {t('Reset your password from another phone. That turns off face login everywhere.', 'I-reset ang password gamit ang laing phone. Ma-off niana ang face login bisan asa.')}
        </Txt>
      </Card>
    </Page>
  );
}

const s = StyleSheet.create({
  rule: { height: 1, backgroundColor: c.outline, flex: 1 },
  faceRow: {
    borderWidth: 1, borderColor: c.outline, borderRadius: 18, backgroundColor: c.card, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
