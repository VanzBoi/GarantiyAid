import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import {
  ArrowLeft, Camera, CircleCheck, Flashlight, FlashlightOff, ImageUp, RotateCcw, ScanText, Sun,
} from 'lucide-react-native';
import {
  Badge, Button, Card, Field, flow, IconCircle, Notice, Page, StepProgress, styles, TextLink, Txt,
} from '../components';
import { IdTypePicker } from '../id-type-picker';
import { idTypeByCode, documentTypeForId } from '../id-types';
import { idReaderAvailable, readIdPhoto } from '../id-reader';
import type { ScannedId } from '../id-scan';
import { IS_SHARED_BACKEND, MAX_DOCUMENT_BYTES, uploadDocument } from '../api';
import { useDemo, type RegistrationInfo } from '../state';
import { colors as c, fonts, radius } from '../theme';

export const REGISTRATION_STEPS = 6;
type Translate = (en: string, bs: string) => string;
/** "Step 2 of 6 · Personal details", shared by every registration screen. */
export function registrationStepLabel(step: number, t: Translate) {
  const names = [
    t('Valid ID', 'Valid ID'),
    t('Personal details', 'Personal nga detalye'),
    t('Address', 'Adres'),
    t('Program', 'Programa'),
    t('Number & password', 'Numero ug password'),
    t('Verify code', 'I-verify ang code'),
  ];
  return t(`Step ${step} of ${REGISTRATION_STEPS} · ${names[step - 1]}`, `Lakang ${step} sa ${REGISTRATION_STEPS} · ${names[step - 1]}`);
}
const CARD_RATIO = 1.586; // ISO/IEC 7810 ID-1, the size of most Philippine IDs.
type Photo = NonNullable<RegistrationInfo['idPhoto']>;
type Reading = 'idle' | 'reading' | 'done' | 'unavailable' | 'failed';

const ageOn = (birthDate: string) => {
  const [y, m, d] = birthDate.split('-').map(Number);
  const now = new Date();
  return now.getFullYear() - y - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? 1 : 0);
};
const formatBirth = (date: string, language: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(language === 'bs' ? 'en-PH' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export function ValidIdStep() {
  const { registration, setRegistration, language, t } = useDemo();
  const [idType, setIdType] = useState(registration.idType);
  const [idNumber, setIdNumber] = useState(registration.idNumber);
  const [numberTouched, setNumberTouched] = useState(!!registration.idNumber && !registration.fromId.idNumber);
  const [reading, setReading] = useState<Reading>('idle');
  const [scanned, setScanned] = useState<ScannedId | null>(null);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [pickError, setPickError] = useState('');
  const photo = registration.idPhoto;
  const type = idTypeByCode(idType);
  const canUseCamera = Platform.OS !== 'web';

  useEffect(() => {
    if (!photo || !idType) { setReading('idle'); setScanned(null); return; }
    if (!idReaderAvailable()) { setReading('unavailable'); setScanned(null); return; }
    let active = true;
    setReading('reading');
    readIdPhoto(photo.uri, idType)
      .then((result) => {
        if (!active) return;
        setScanned(result);
        setReading('done');
        if (result.idNumber && !numberTouched) setIdNumber(result.idNumber);
      })
      .catch(() => { if (active) { setScanned(null); setReading('failed'); } });
    return () => { active = false; };
  }, [photo?.uri, idType]);

  const pickFromGallery = async () => {
    setPickError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png'], multiple: false, copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > MAX_DOCUMENT_BYTES) { setPickError(t('Choose a photo up to 5 MB.', 'Pagpili og litrato nga dili molapas sa 5 MB.')); return; }
      const mimeType = asset.mimeType === 'image/png' || /\.png$/i.test(asset.name) ? 'image/png' : 'image/jpeg';
      setRegistration({ idPhoto: { uri: asset.uri, name: `${idType || 'valid-id'}-front.${mimeType === 'image/png' ? 'png' : 'jpg'}`, mimeType, size: asset.size } });
      setErrors((previous) => ({ ...previous, photo: false }));
    } catch {
      setPickError(t('The photo could not be opened. Try another one.', 'Wala maablihi ang litrato. Sulayi ang lain.'));
    }
  };

  const numberRequired = !!type && !type.numberOptional;
  const numberValid = /^[A-Z0-9][A-Z0-9 -]{2,39}$/i.test(idNumber.trim());
  const continueToDetails = () => {
    const next = {
      idType: !type,
      photo: !photo,
      idNumber: idNumber.trim() ? !numberValid : numberRequired,
    };
    setErrors(next);
    if (next.idType || next.photo || next.idNumber) return;
    const found = scanned ?? {};
    const fromId: RegistrationInfo['fromId'] = {};
    const fill: Partial<RegistrationInfo> = {};
    for (const key of ['firstName', 'middleName', 'lastName', 'birthDate', 'address'] as const) {
      if (found[key]) { fill[key] = found[key]; fromId[key] = true; }
    }
    fromId.idNumber = !!found.idNumber && found.idNumber === idNumber.trim().toUpperCase();
    setRegistration({ ...fill, idType, idNumber: idNumber.trim().toUpperCase(), fromId });
    flow('account-info');
  };

  const foundRows = scanned ? ([
    ['lastName', t('Last name', 'Apelyido')],
    ['firstName', t('First name', 'Ngalan')],
    ['middleName', t('Middle name', 'Tunga nga ngalan')],
    ['birthDate', t('Birth date', 'Petsa sa pagkatawo')],
    ['address', t('Address', 'Adres')],
  ] as const) : [];
  const foundCount = foundRows.filter(([key]) => scanned?.[key]).length;
  const notSenior = idType === 'senior_citizen' && scanned?.birthDate && ageOn(scanned.birthDate) < 60;

  return (
    <Page
      title={t('Create account', 'Paghimo og account')}
      footer={
        <>
          <Button disabled={reading === 'reading'} onPress={continueToDetails}>{t('Continue', 'Padayon')}</Button>
          <View style={[styles.row, { justifyContent: 'center', gap: 2 }]}>
            <Txt variant="small">{t('Already have an account?', 'Naa na kay account?')}</Txt>
            <TextLink onPress={() => flow('login')}>{t('Log in', 'Log in')}</TextLink>
          </View>
        </>
      }
    >
      <StepProgress step={1} total={REGISTRATION_STEPS} label={registrationStepLabel(1, t)} />
      <View style={{ gap: 7 }}>
        <Txt accessibilityRole="header" variant="title">{t('Submit a valid ID', 'Isumite ang imong valid ID')}</Txt>
        <Txt style={{ color: c.muted }}>
          {t('We read your name and birth date from the ID so you type less. You can check and correct everything.',
            'Basahon namo ang imong ngalan ug petsa sa pagkatawo gikan sa ID aron dili ka na daghan i-type. Masusi ug matul-id nimo ang tanan.')}
        </Txt>
      </View>

      <Card style={{ gap: 14 }}>
        <SectionTitle number={1} title={t('Choose your ID', 'Pilia ang imong ID')} />
        <IdTypePicker
          value={idType}
          onChange={(code) => { setIdType(code); setRegistration({ idType: code }); setErrors((previous) => ({ ...previous, idType: false, idNumber: false })); }}
          error={errors.idType ? t('Choose the ID you will use.', 'Pilia ang ID nga imong gamiton.') : undefined}
        />
      </Card>

      <Card style={{ gap: 14 }}>
        <SectionTitle number={2} title={t('Photo of the front', 'Litrato sa atubangan')} />
        {photo ? (
          <View style={{ gap: 12 }}>
            <View style={s.previewFrame}>
              <Image source={{ uri: photo.uri }} style={s.previewImage} resizeMode="cover" accessibilityLabel={t('Photo of your ID', 'Litrato sa imong ID')} />
              {reading === 'reading' && (
                <View style={s.previewShade}>
                  <ActivityIndicator color={c.onPrimary} />
                  <Txt variant="label" style={{ color: c.onPrimary }}>{t('Reading your ID…', 'Gibasa ang imong ID…')}</Txt>
                </View>
              )}
            </View>
            <View style={[styles.row, { gap: 8 }]}>
              {canUseCamera && <View style={{ flex: 1 }}><Button variant="outline" icon={RotateCcw} disabled={!idType} onPress={() => flow('id-camera')}>{t('Retake', 'Kuhai pag-usab')}</Button></View>}
              <View style={{ flex: 1 }}><Button variant="outline" icon={ImageUp} onPress={pickFromGallery}>{t('Change photo', 'Ilisi ang litrato')}</Button></View>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={canUseCamera ? t('Take a photo of your ID', 'Kuhai og litrato ang imong ID') : t('Upload a photo of your ID', 'I-upload ang litrato sa imong ID')}
              accessibilityState={{ disabled: !idType }}
              disabled={!idType}
              onPress={() => (canUseCamera ? flow('id-camera') : void pickFromGallery())}
              style={({ pressed }) => [s.dropZone, errors.photo && { borderColor: c.error, backgroundColor: c.errorSoft }, pressed && { backgroundColor: c.primarySoft }, !idType && { opacity: 0.55 }]}
            >
              <IdCardArt />
              <Txt variant="label" style={{ color: c.primary }}>
                {canUseCamera ? t('Scan the front of your ID', 'I-scan ang atubangan sa imong ID') : t('Upload a photo of your ID', 'I-upload ang litrato sa imong ID')}
              </Txt>
              <Txt variant="small" style={{ textAlign: 'center' }}>
                {!idType ? t('Choose your ID type first.', 'Pilia una ang klase sa ID.') : t('JPEG or PNG, up to 5 MB', 'JPEG o PNG, hangtod 5 MB')}
              </Txt>
            </Pressable>
            {canUseCamera && <Button variant="ghost" icon={ImageUp} disabled={!idType} onPress={pickFromGallery}>{t('Upload from gallery instead', 'I-upload gikan sa gallery')}</Button>}
            {errors.photo && <Txt variant="small" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: c.error }}>{t('Add a photo of the front of your ID.', 'Idugang ang litrato sa atubangan sa imong ID.')}</Txt>}
          </View>
        )}
        {!!pickError && <Notice tone="error">{pickError}</Notice>}
        <View style={s.tips}>
          {[
            [Sun, t('Good light, no glare', 'Hayag, walay silaw')],
            [ScanText, t('All four corners visible', 'Makita ang upat ka kanto')],
            [Camera, t('Hold steady, text sharp', 'Ayaw lihoka, klaro ang sulat')],
          ].map(([Icon, text]) => {
            const TipIcon = Icon as typeof Sun;
            return (
              <View key={text as string} style={s.tip}>
                <TipIcon size={16} color={c.primary} />
                <Txt variant="small" style={{ flex: 1 }}>{text as string}</Txt>
              </View>
            );
          })}
        </View>
      </Card>

      {reading === 'done' && scanned && (
        <Card style={{ gap: 10 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Txt variant="label">{t('Details found on your ID', 'Mga detalye nga nakit-an sa ID')}</Txt>
            <Badge tone={foundCount >= 3 ? 'success' : 'warning'}>{`${foundCount}/${foundRows.length}`}</Badge>
          </View>
          {foundRows.map(([key, label]) => {
            const value = scanned[key];
            return (
              <View key={key} style={s.foundRow}>
                {value ? <CircleCheck size={18} color={c.green} /> : <View style={s.missingDot} />}
                <Txt variant="small" style={{ width: 104 }}>{label}</Txt>
                <Txt variant={value ? 'label' : 'small'} style={{ flex: 1, color: value ? c.text : c.subtle }}>
                  {value ? (key === 'birthDate' ? formatBirth(value, language) : value) : t('Type it on the next step', 'I-type sa sunod nga lakang')}
                </Txt>
              </View>
            );
          })}
          {foundCount === 0 && <Notice tone="warning">{t('We could not read the text. Retake the photo closer and in better light, or type your details next.', 'Wala mabasa ang sulat. Kuhai pag-usab nga mas duol ug mas hayag, o i-type ang imong detalye sa sunod.')}</Notice>}
        </Card>
      )}
      {reading === 'unavailable' && (
        <Notice>{Platform.OS === 'web'
          ? t('Automatic ID reading works in the Android app. Your photo is still saved; type your details on the next step.', 'Ang automatic nga pagbasa sa ID anaa sa Android app. Matipig gihapon ang litrato; i-type ang detalye sa sunod nga lakang.')
          : t('Install the updated app build to read IDs automatically. Your photo is still saved; type your details next.', 'I-install ang updated nga app aron automatic mabasa ang ID. Matipig gihapon ang litrato; i-type ang detalye sa sunod.')}</Notice>
      )}
      {reading === 'failed' && <Notice tone="warning">{t('The ID could not be read. Retake the photo or type your details on the next step.', 'Wala mabasa ang ID. Kuhai pag-usab o i-type ang detalye sa sunod nga lakang.')}</Notice>}
      {notSenior && <Notice tone="warning">{t('The birth date read from this senior citizen ID is under 60 years. Check the photo or the date on the next step.', 'Ang petsa sa pagkatawo nga nabasa ubos sa 60 anyos. Susiha ang litrato o ang petsa sa sunod nga lakang.')}</Notice>}

      <Card style={{ gap: 14 }}>
        <SectionTitle number={3} title={t('ID number', 'Numero sa ID')} />
        <Field
          label={numberRequired || !type ? t('Number printed on the ID', 'Numero nga nakasulat sa ID') : t('Number printed on the ID (optional)', 'Numero nga nakasulat sa ID (opsyonal)')}
          value={idNumber}
          onChangeText={(value) => { setIdNumber(value); setNumberTouched(true); setErrors((previous) => ({ ...previous, idNumber: false })); }}
          placeholder={t('As printed on the ID', 'Sama sa nakasulat sa ID')}
          autoCapitalize="characters"
          maxLength={40}
          helper={reading === 'done' && scanned?.idNumber && !numberTouched ? t('Read from your ID. Check that it matches.', 'Nabasa gikan sa ID. Susiha kon pareho.') : undefined}
          error={errors.idNumber ? t('Enter the ID number using letters, numbers, spaces or dashes.', 'Isulod ang numero gamit ang letra, numero, space o dash.') : undefined}
        />
      </Card>
      <Notice>
        {t('Your ID photo stays on this phone until your number is verified, then it is saved to your enrollment documents for staff review.',
          'Ang litrato sa ID magpabilin niini nga cellphone hangtod ma-verify ang imong numero, dayon tipigan sa imong enrollment documents para susihon sa staff.')}
      </Notice>
    </Page>
  );
}

function SectionTitle({ number, title }: { number: number; title: string }) {
  return (
    <View style={[styles.row, { gap: 10 }]}>
      <View style={s.stepDot}><Txt variant="small" style={{ color: c.onPrimary, fontFamily: fonts.bold }}>{number}</Txt></View>
      <Txt variant="label" style={{ flex: 1 }}>{title}</Txt>
    </View>
  );
}

/** Small drawing of an ID card used as the empty photo placeholder. */
function IdCardArt() {
  return (
    <View style={s.cardArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.cardArtPhoto} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[s.cardArtLine, { width: '80%' }]} />
        <View style={[s.cardArtLine, { width: '60%' }]} />
        <View style={[s.cardArtLine, { width: '70%', backgroundColor: c.primaryTint }]} />
      </View>
    </View>
  );
}

/** Chooses a sharp but small photo size so text is readable and the file stays under 5 MB. */
function idPictureSize(sizes: string[]) {
  const parsed = sizes
    .map((size) => ({ size, match: /^(\d+)x(\d+)$/.exec(size) }))
    .filter((item): item is { size: string; match: RegExpExecArray } => !!item.match)
    .map(({ size, match }) => ({ size, long: Math.max(+match[1], +match[2]) }))
    .filter(({ long }) => long >= 1600 && long <= 2600)
    .sort((a, b) => Math.abs(a.long - 2048) - Math.abs(b.long - 2048));
  return parsed[0]?.size;
}

export function IdCameraScreen() {
  const { registration, setRegistration, t } = useDemo();
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>();
  const [error, setError] = useState('');
  const camera = useRef<CameraView>(null);
  const { width, height } = useWindowDimensions();
  const frameWidth = Math.min(width - 40, 380);
  const frameHeight = frameWidth / CARD_RATIO;
  const type = idTypeByCode(registration.idType);

  if (!permission?.granted) {
    return (
      <Page title={t('Scan your ID', 'I-scan ang imong ID')} footer={
        permission && !permission.canAskAgain
          ? <Button onPress={() => void Linking.openSettings()}>{t('Open settings', 'Ablihi ang settings')}</Button>
          : <Button icon={Camera} onPress={() => void requestPermission()}>{t('Allow camera', 'Tugoti ang camera')}</Button>
      }>
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 24 }}>
          <IconCircle icon={ScanText} size={64} />
          <Txt variant="title" style={{ textAlign: 'center' }}>{t('Camera access needed', 'Kinahanglan ang camera')}</Txt>
          <Txt style={{ color: c.muted, textAlign: 'center' }}>
            {t('GarantiyAid uses the camera only to take a photo of your ID.', 'Gamiton lamang sa GarantiyAid ang camera aron makuhaan og litrato ang imong ID.')}
          </Txt>
        </View>
        {permission && !permission.canAskAgain && <Notice tone="error">{t('Camera access is blocked. Allow it in your phone settings.', 'Gibabagan ang camera. Tugoti kini sa settings sa cellphone.')}</Notice>}
      </Page>
    );
  }

  const capture = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      const picture = await camera.current?.takePictureAsync({ quality: 0.8, exif: false, shutterSound: false });
      if (!picture) throw new Error('CAMERA_EMPTY');
      let size: number | undefined;
      try { size = new (await import('expo-file-system')).File(picture.uri).size; } catch { size = undefined; }
      if (size && size > MAX_DOCUMENT_BYTES) {
        setError(t('The photo is too large. Move a little farther and try again.', 'Dako kaayo ang litrato. Layo gamay ug sulayi pag-usab.'));
        return;
      }
      setRegistration({ idPhoto: { uri: picture.uri, name: `${registration.idType || 'valid-id'}-front.jpg`, mimeType: 'image/jpeg', size } });
      setTorch(false);
      router.back();
    } catch {
      setError(t('The photo could not be taken. Try again.', 'Wala makuha ang litrato. Sulayi pag-usab.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.cameraScreen}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        animateShutter
        pictureSize={pictureSize}
        onCameraReady={() => {
          camera.current?.getAvailablePictureSizesAsync()
            .then((sizes) => setPictureSize(idPictureSize(sizes)))
            .catch(() => {}).finally(() => setReady(true));
        }}
        onMountError={() => setError(t('The camera could not start.', 'Wala nagsugod ang camera.'))}
      />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <Mask id="id-window">
            <Rect width="100%" height="100%" fill="white" />
            <Rect x={(width - frameWidth) / 2} y={(height - frameHeight) / 2} width={frameWidth} height={frameHeight} rx={16} fill="black" />
          </Mask>
        </Defs>
        <Rect width="100%" height="100%" fill="rgba(4,15,35,0.68)" mask="url(#id-window)" />
      </Svg>
      <View pointerEvents="none" style={[s.frame, { width: frameWidth, height: frameHeight, left: (width - frameWidth) / 2, top: (height - frameHeight) / 2 }]}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => <View key={corner} style={[s.corner, s[corner]]} />)}
      </View>
      <SafeAreaView style={{ flex: 1, justifyContent: 'space-between' }} edges={['top', 'bottom', 'left', 'right']} pointerEvents="box-none">
        <View style={s.cameraTop}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Cancel scan', 'Kanselaha ang scan')} onPress={() => router.back()} style={s.roundButton}>
            <ArrowLeft size={22} color={c.onPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Txt accessibilityRole="header" variant="heading" style={{ color: c.onPrimary }}>{t('Scan the front of your ID', 'I-scan ang atubangan sa ID')}</Txt>
            {type && <Txt variant="small" numberOfLines={1} style={{ color: '#C9D8F2' }}>{t(type.en, type.bs)}</Txt>}
          </View>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: torch }} accessibilityLabel={t('Flashlight', 'Flashlight')} onPress={() => setTorch((on) => !on)} style={[s.roundButton, torch && { backgroundColor: c.accent }]}>
            {torch ? <Flashlight size={22} color={c.onPrimary} /> : <FlashlightOff size={22} color={c.onPrimary} />}
          </Pressable>
        </View>
        <View style={s.cameraBottom}>
          <Txt variant="label" style={{ color: c.onPrimary, textAlign: 'center' }}>
            {t('Fit the whole ID inside the frame', 'Isulod ang tibuok ID sulod sa frame')}
          </Txt>
          <Txt variant="small" style={{ color: '#C9D8F2', textAlign: 'center' }}>
            {t('Lay it flat on a dark surface. Avoid glare on the photo and text.', 'Ibutang sa patag ug ngitngit nga lugar. Likayi ang silaw sa litrato ug sulat.')}
          </Txt>
          {!!error && <Notice tone="error">{error}</Notice>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Take photo', 'Kuhai og litrato')}
            accessibilityState={{ disabled: !ready || busy, busy }}
            disabled={!ready || busy}
            onPress={capture}
            style={({ pressed }) => [s.shutter, pressed && { transform: [{ scale: 0.94 }] }, (!ready || busy) && { opacity: 0.6 }]}
          >
            {busy || !ready ? <ActivityIndicator color={c.primary} /> : <View style={s.shutterInner} />}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Saves the ID photo to the new account's documents. Returns false when it must be uploaded later. */
export async function saveRegistrationId(accessToken: string, registration: RegistrationInfo) {
  const photo: Photo | null = registration.idPhoto;
  if (!photo) return true;
  try {
    await uploadDocument(accessToken, { ...photo, lastModified: Date.now() }, documentTypeForId(registration.idType, IS_SHARED_BACKEND));
    return true;
  } catch {
    return false;
  }
}

const s = StyleSheet.create({
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  dropZone: {
    alignItems: 'center', gap: 8, paddingVertical: 22, paddingHorizontal: 16, borderRadius: radius.lg,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.primaryTint, backgroundColor: c.surface,
  },
  cardArt: {
    width: 150, height: 150 / CARD_RATIO, borderRadius: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.primaryTint,
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 4, boxShadow: '0px 6px 16px rgba(22, 82, 197, 0.12)',
  },
  cardArtPhoto: { width: 38, height: 48, borderRadius: 6, backgroundColor: c.primarySoft },
  cardArtLine: { height: 7, borderRadius: 4, backgroundColor: c.outline },
  previewFrame: { width: '100%', aspectRatio: CARD_RATIO, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.navy },
  previewImage: { width: '100%', height: '100%' },
  previewShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(16,42,86,0.6)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  tips: { gap: 8, paddingTop: 2 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  missingDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.outline },
  cameraScreen: { flex: 1, backgroundColor: '#000' },
  cameraTop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  roundButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  cameraBottom: { gap: 10, padding: 20, alignItems: 'stretch' },
  frame: { position: 'absolute' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: '#FFFFFF' },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 },
  shutter: { alignSelf: 'center', width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },
});
