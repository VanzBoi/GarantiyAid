import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Vibration, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, ScanFace, ShieldCheck, Volume2, VolumeX } from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  Checklist,
  Notice,
  Page,
  ScreenIntro,
  Txt,
  useReducedMotion,
} from '../components';
import { ApiRequestError, type FaceVerificationResult } from '../api';
import { useDemo } from '../state';
import { colors as c } from '../theme';
import { faceHints, useAutomaticFace } from '../automatic-face';
import Svg, { Defs, Ellipse, Mask, Rect } from 'react-native-svg';
import { speakFaceHint, stopFaceVoice } from '../face-voice';

/** Picks a small capture size so each frame stays well under the server's per-photo limit. */
function smallestUsefulSize(sizes: string[]) {
  if (sizes.includes('640x480')) return '640x480';
  const parsed = sizes
    .map((size) => ({ size, match: /^(\d+)x(\d+)$/.exec(size) }))
    .filter((item): item is { size: string; match: RegExpExecArray } => !!item.match)
    .map(({ size, match }) => ({ size, w: Number(match[1]), h: Number(match[2]) }))
    .filter(({ w, h }) => Math.min(w, h) >= 480)
    .sort((a, b) => a.w * a.h - b.w * b.h);
  return parsed[0]?.size ?? (sizes.includes('Medium') ? 'Medium' : undefined);
}

export function FaceScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const verify = mode === 'verify';
  const { accessToken, biometrics, biometricsLoading, refreshBiometrics, reset, t } = useDemo();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<'intro' | 'camera' | 'sending' | 'done' | 'failed'>('intro');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [voice, setVoice] = useState(false);
  const camera = useRef<CameraView>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => { if (accessToken) void refreshBiometrics(); }, [accessToken]);
  const automatic = useAutomaticFace({
    camera, active: (stage === 'camera' || stage === 'sending') && !!biometrics?.selfCapture && biometrics.consent?.status === 'active', ready, accessToken, consentId: biometrics?.consent?.id, verify,
    onSending: () => setStage('sending'),
    onPause: () => { setReady(false); setStage('intro'); },
    onResult: result => {
      if (verify) {
        const checked = result as FaceVerificationResult;
        if (!checked.simulated && !(checked.result === 'matched' && checked.facesCompared && checked.livenessPassed)) {
          setError(t('Your face did not match. Try again or ask staff for help.', 'Wala motakdo ang nawong. Sulayi pag-usab o pangayo og tabang sa staff.'));
          setStage('failed'); return;
        }
      } else if (!result.simulated && !(result.result === 'enrolled' && 'liveness' in result && result.liveness.passed)) {
        setError(t('Enrollment was not confirmed.', 'Wala makumpirma ang enrollment.')); setStage('failed'); return;
      }
      setStage('done'); if (!reducedMotion) Vibration.vibrate(50); void refreshBiometrics();
    },
    onError: cause => {
      if (cause instanceof ApiRequestError && cause.status === 401) { void reset(); return; }
      setError(cause instanceof Error && cause.message === 'FACE_DETECTOR_BUILD_REQUIRED'
        ? t('Install the updated Android development build to use automatic detection.', 'I-install ang updated Android development build aron magamit ang automatic detection.')
        : cause instanceof Error && cause.message === 'FACE_TIMEOUT'
          ? t('Capture timed out. Try again when ready.', 'Nahutdan og oras ang capture. Sulayi pag-usab kon andam na.')
          : cause instanceof ApiRequestError ? cause.message
            : t('The face detector could not run. Check that the detector and model are installed, then retry.', 'Wala modagan ang face detector. Susihon nga na-install ang detector ug model, dayon sulayi pag-usab.'));
      setStage('failed');
    },
  });

  const title = verify ? t('Verify identity', 'I-verify ang pagkatawo') : t('Capture face', 'Kuhaa ang nawong');
  if (!accessToken) {
    return <Page title={title}><Notice>{t('Sign in to use face verification.', 'Pag-sign in aron magamit ang face verification.')}</Notice></Page>;
  }
  if (biometricsLoading && !biometrics) {
    return <Page title={title}><Notice>{t('Loading saved status…', 'Gikuha ang natipig nga kahimtang…')}</Notice></Page>;
  }
  if (!biometrics?.selfCapture) {
    return (
      <Page title={title}>
        <ScreenIntro icon={ScanFace} tone="neutral" title={t('In-app capture is not available', 'Dili magamit ang pagkuha sa app')}
          subtitle={t('The connected server records face enrollment through your barangay facilitator.', 'Ang konektado nga server nagrekord sa face enrollment pinaagi sa barangay facilitator.')} />
        <Button onPress={() => router.back()}>{t('Back', 'Balik')}</Button>
      </Page>
    );
  }
  const consentActive = biometrics.consent?.status === 'active';
  const enrolled = biometrics.profile?.status === 'enrolled';
  if (!consentActive || (verify && !enrolled)) {
    return (
      <Page title={title}>
        <ScreenIntro iconName="lock" tone="amber" title={!consentActive ? t('Consent required', 'Kinahanglan og pagtugot') : t('Register your face first', 'Irehistro una ang nawong')}
          subtitle={!consentActive
            ? t('Review and save face verification consent before capturing your face.', 'Basaha ug tipigi ang pagtugot sa dili pa kuhaan ang nawong.')
            : t('Identity verification needs a registered face.', 'Kinahanglan og narehistro nga nawong alang sa verification.')} />
        <Button onPress={() => router.replace(!consentActive ? '/flow/consent' : '/face/enroll')}>
          {!consentActive ? t('Review consent', 'Basaha ang pagtugot') : t('Register face', 'Irehistro ang nawong')}
        </Button>
      </Page>
    );
  }

  const restart = () => { setError(''); setReady(false); setStage('camera'); };
  const simulated = biometrics.processorMode === 'simulated';

  if (stage === 'done') {
    return (
      <Page title={title}>
        <ScreenIntro iconName={simulated ? 'info' : 'check'} tone={simulated ? 'amber' : 'green'}
          title={simulated ? t('Demo capture complete', 'Nahuman ang demo capture') : verify ? t('Identity verified', 'Napamatud-an ang identidad') : t('Face registered', 'Narehistro ang nawong')}
          subtitle={verify
            ? t('The automatic capture finished.', 'Nahuman ang automatic capture.')
            : t('Your enrollment record was saved.', 'Natipig ang imong enrollment record.')} />
        {simulated &&
        <Card style={{ gap: 10 }}>
          <Badge tone="warning">{t('Simulation · not a real identity check', 'Simulation · dili tinuod nga identity check')}</Badge>
          <Txt variant="small">
            {verify
              ? t('No faces were compared. Staff still confirm your identity at the distribution.', 'Walay nawong nga gikumpara. Kumpirmahon gihapon sa staff ang imong pagkatawo sa distribution.')
              : t('This demo saved a capture record only. No real biometric template or identity verification was created.', 'Capture record lamang ang gitipigan sa demo. Walay tinuod nga biometric template o identity verification nga nahimo.')}
          </Txt>
        </Card>}
        {!verify && <Button icon={ScanFace} onPress={() => router.replace('/face-login-settings')}>{t('Use my face to log in', 'Gamita akong nawong sa pag-log in')}</Button>}
        {!verify && <Button variant="outline" icon={ShieldCheck} onPress={() => router.replace('/face/verify')}>{t('Verify my identity', 'I-verify ang akong pagkatawo')}</Button>}
        <Button variant="outline" onPress={() => router.replace('/flow/capture')}>{t('View face verification status', 'Tan-awa ang kahimtang')}</Button>
      </Page>
    );
  }
  if (stage === 'failed') {
    return (
      <Page title={title}>
        <ScreenIntro iconName="alert" tone="error" title={verify ? t('Verification failed', 'Napakyas ang verification') : t('Registration failed', 'Napakyas ang pagrehistro')}
          subtitle={error || t('Capture could not be completed. Follow the guidance and try again.', 'Wala makompleto ang capture. Sunda ang giya ug sulayi pag-usab.')} />
        <Checklist items={[
          { icon: 'light', text: t('Stand in a well-lit area', 'Barog sa hayag nga lugar') },
          { icon: 'glasses', text: t('Keep your face visible and avoid glare on glasses', 'Ipakita ang nawong ug likayi ang silaw sa antipara') },
          { icon: 'face', text: t('Follow the guidance. No capture button needed.', 'Sunda ang giya. Dili na kinahanglan og capture button.') },
        ]} />
        <Button icon={Camera} onPress={restart}>{t('Try again', 'Sulayi pag-usab')}</Button>
      </Page>
    );
  }
  if (stage === 'intro' || !permission?.granted) {
    return (
      <Page title={title} footer={
        permission && !permission.granted && !permission.canAskAgain
          ? <Button onPress={() => void Linking.openSettings()}>{t('Open settings', 'Ablihi ang settings')}</Button>
          : <Button icon={Camera} onPress={async () => {
              const granted = permission?.granted || (await requestPermission()).granted;
              if (granted) restart();
            }}>{t('Start automatic scan', 'Sugdi ang automatic scan')}</Button>
      }>
        <ScreenIntro icon={ScanFace} title={verify ? t('Verify your identity', 'I-verify ang imong pagkatawo') : t('Register your face', 'Irehistro ang imong nawong')}
          subtitle={t('Follow the live guidance. Your photos are captured and submitted automatically.', 'Sunda ang live nga giya. Automatic nga kuhaon ug ipadala ang mga litrato.')} />
        <Card>
          <Checklist items={[
            { icon: 'light', text: t('Use a well-lit area', 'Gamita ang hayag nga lugar') },
            { icon: 'glasses', text: t('Keep your face visible and avoid glare', 'Ipakita ang nawong ug likayi ang silaw') },
            { icon: 'face', text: t('Look straight at the camera', 'Tan-aw diretso sa camera') },
          ]} />
        </Card>
        {simulated && <Notice tone="warning">
          {t('Demo mode: live guidance works, but the server does not check identity or spoof resistance.', 'Demo mode: nagamit ang live nga giya, apan dili mosusi sa identidad o spoof resistance ang server.')}
        </Notice>}
        {permission && !permission.granted && !permission.canAskAgain && (
          <Notice tone="error">{t('Camera access is blocked. Allow it in your phone settings.', 'Gibabagan ang camera. Tugoti kini sa settings sa cellphone.')}</Notice>
        )}
      </Page>
    );
  }

  return (
    <FaceCamera
      cameraRef={camera}
      automatic={automatic}
      title={title}
      sending={stage === 'sending'}
      simulated={simulated}
      ready={ready}
      error={error}
      voice={voice}
      onToggleVoice={() => setVoice((value) => !value)}
      onReady={() => setReady(true)}
      onMountError={() => { setReady(false); setError(t('The camera could not start.', 'Wala nagsugod ang camera.')); setStage('failed'); }}
    />
  );
}

/** Full-screen front camera with the oval guide and live hints, shared by face registration, verification and face login. */
export function FaceCamera({ cameraRef, automatic, title, sending, simulated, ready, error, voice, onToggleVoice, onReady, onMountError }: {
  cameraRef: React.RefObject<CameraView | null>;
  automatic: ReturnType<typeof useAutomaticFace>;
  title: string;
  sending: boolean;
  simulated: boolean;
  ready: boolean;
  error: string;
  voice: boolean;
  onToggleVoice: () => void;
  onReady: () => void;
  onMountError: () => void;
}) {
  const { t } = useDemo();
  const [pictureSize, setPictureSize] = useState<string | undefined>();
  const { width, height } = useWindowDimensions();
  const ringWidth = Math.min(width - 64, 250);
  const ringHeight = Math.min(height * .38, 310);
  useEffect(() => {
    if (voice && automatic.visible && !sending && !automatic.initializing) speakFaceHint(faceHints[automatic.guidance][0]);
    return stopFaceVoice;
  }, [voice, automatic.visible, automatic.guidance, automatic.initializing, sending]);
  return (
    <View style={s.screen}>
      {automatic.visible && <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        mirror
        animateShutter={false}
        pictureSize={pictureSize}
        onCameraReady={() => {
          cameraRef.current?.getAvailablePictureSizesAsync()
            .then((sizes) => setPictureSize(smallestUsefulSize(sizes)))
            .catch(() => {}).finally(onReady);
        }}
        onMountError={onMountError}
      />}
      <SafeAreaView style={s.overlay} edges={['top', 'bottom', 'left', 'right']}>
        <View style={s.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Cancel scan', 'Kanselaha ang scan')} onPress={() => router.back()} style={s.back}>
            <ArrowLeft size={22} color={c.onPrimary} />
          </Pressable>
          <Txt accessibilityRole="header" variant="heading" style={{ color: c.onPrimary, flex: 1 }}>
            {title}
          </Txt>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: voice }} accessibilityLabel={voice ? t('Turn off English voice guidance', 'I-off ang English voice guidance') : t('Turn on English voice guidance', 'I-on ang English voice guidance')} onPress={onToggleVoice} style={s.back}>
            {voice ? <Volume2 size={22} color={c.onPrimary} /> : <VolumeX size={22} color={c.onPrimary} />}
          </Pressable>
        </View>
        <View style={s.middle}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs><Mask id="face-window"><Rect width="100%" height="100%" fill="white" /><Ellipse cx="50%" cy="50%" rx={ringWidth / 2} ry={ringHeight / 2} fill="black" /></Mask></Defs>
            <Rect width="100%" height="100%" fill="rgba(4,15,35,0.65)" mask="url(#face-window)" />
          </Svg>
          <View style={[s.ring, { width: ringWidth, height: ringHeight, borderColor: sending ? c.accent : automatic.guidance === 'hold' ? c.green : '#FFFFFF' }]} />
        </View>
        <View style={s.bottom}>
          <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: 8 }}>
            {(sending || automatic.initializing || !ready) && <ActivityIndicator color={c.primary} />}
            <Txt variant="heading" style={{ textAlign: 'center', fontSize: 18 }}>{sending ? t('Checking your capture…', 'Gisusi ang imong capture…') : automatic.initializing || !ready ? t('Preparing camera…', 'Giandam ang camera…') : t(...faceHints[automatic.guidance])}</Txt>
            <Txt variant="small" style={{ textAlign: 'center' }}>{t('Follow the guidance. No tapping needed.', 'Sunda ang giya. Dili na kinahanglan mo-tap.')}</Txt>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: automatic.total, now: automatic.completed }} style={s.track}>
            <View style={{ width: `${Math.min(100, (automatic.completed + automatic.progress) / automatic.total * 100)}%`, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Txt variant="small">{t(`${automatic.completed} of ${automatic.total} checks`, `${automatic.completed} sa ${automatic.total} ka check`)}</Txt>
            <Badge tone={simulated ? 'warning' : 'info'}>{simulated ? t('Demo mode', 'Demo mode') : t('Secure check', 'Luwas nga check')}</Badge>
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1 },
  middle: { flex: 1, minHeight: 140, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: 'rgba(16,42,86,0.55)' },
  back: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  ring: { width: 250, height: 310, borderRadius: 155, borderWidth: 5 },
  bottom: { gap: 14, padding: 20, margin: 12, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'stretch' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: c.outline },
});
