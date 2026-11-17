import React, { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Badge,
  Button,
  Card,
  Checklist,
  ConfirmationModal,
  DetailRow,
  FaceGuide,
  flow,
  NamedIcon,
  Notice,
  Page,
  Row,
  ScreenIntro,
  SectionHeader,
  Stack,
  Timeline,
  Txt,
  type TimelineStep,
} from '../components';
import { ApiRequestError, type BiometricOverview } from '../api';
import { useDemo } from '../state';
import { formatDateTime } from '../format';

type Translate = (en: string, bs: string) => string;

function enrollmentLabel(data: BiometricOverview, t: Translate) {
  if (!data.profile) return data.selfCapture ? t('Not captured yet', 'Wala pa makuha') : t('Awaiting staff capture', 'Nagpaabot sa pagkuha sa staff');
  const labels: Record<string, string> = {
    enrolled: data.profile.simulated ? t('Enrolled · simulation', 'Naenroll · simulation') : t('Enrolled', 'Naenroll'),
    revoked: t('Consent withdrawn', 'Nabawi ang pagtugot'),
    expired: t('Enrollment expired', 'Na-expire ang enrollment'),
    consent_required: t('Consent required', 'Kinahanglan og pagtugot'),
    pending_duplicate_review: t('Staff review pending', 'Nagpaabot sa pagsusi sa staff'),
    duplicate_blocked: t('Enrollment blocked · contact staff', 'Gibabagan ang enrollment · kontaka ang staff'),
  };
  return labels[data.profile.status] ?? t('Contact staff', 'Kontaka ang staff');
}

/** Real enrollment requires active consent and a compatible, non-simulated enrollment saved by staff. */
function isVerified(data: BiometricOverview | null) {
  return !!data && data.consent?.status === 'active' && data.profile?.status === 'enrolled'
    && !data.profile.simulated && data.profile.processorCompatible;
}

/** Steps derived only from the saved consent and the enrollment record staff saved. */
function enrollmentSteps(data: BiometricOverview | null, t: Translate): TimelineStep[] {
  const consent = data?.consent?.status === 'active';
  const profile = data?.profile;
  const captured = consent && profile?.status === 'enrolled';
  const blocked = profile && ['duplicate_blocked', 'revoked', 'expired'].includes(profile.status);
  return [
    {
      label: t('Consent saved', 'Natipig ang pagtugot'),
      caption: consent ? t('Saved on your account', 'Natipig sa imong account')
        : t('Review and agree in this app', 'Basaha ug uyoni dinhi sa app'),
      state: consent ? 'done' : 'current',
    },
    {
      label: data?.selfCapture ? t('Automatic face capture', 'Automatic nga pagkuha sa nawong') : t('Face captured by facilitator', 'Gikuha sa facilitator ang nawong'),
      caption: captured ? formatDateTime(profile!.enrolledAt)
        : blocked ? enrollmentLabel(data!, t)
          : data?.selfCapture ? t('Capture your face in this app', 'Kuhaa ang imong nawong niini nga app')
            : t('Visit your barangay facilitator in person', 'Bisitaha ang barangay facilitator sa personal'),
      state: captured ? 'done' : blocked ? 'blocked' : consent ? 'current' : 'todo',
    },
    {
      label: t('Ready for identity verification', 'Andam alang sa identity verification'),
      caption: isVerified(data) ? t('Staff can verify you at claiming', 'Ma-verify ka sa staff sa pag-claim')
        : captured ? t('Simulation or incompatible model · not real verification', 'Simulation o lahi nga model · dili tinuod nga verification')
          : t('After a real enrollment is saved', 'Human matipig ang tinuod nga enrollment'),
      state: isVerified(data) ? 'done' : captured ? 'blocked' : 'todo',
    },
  ];
}

export function BiometricSummary() {
  const { biometrics: data, biometricsLoading, biometricsError, refreshBiometrics, t } = useDemo();
  const verified = isVerified(data);
  return <Card>
    <Row gap={14}>
      <NamedIcon name="scan-face" tone={verified ? 'green' : 'amber'} size={46} square />
      <Stack>
        <Txt variant="label">{t('Face verification', 'Pag-verify sa nawong')}</Txt>
        {biometricsError ? null : biometricsLoading ? <Txt variant="small">{t('Loading saved status…', 'Gikuha ang natipig nga kahimtang…')}</Txt>
          : data ? <Badge tone={verified ? 'success' : 'warning'}>{enrollmentLabel(data, t)}</Badge> : <Txt variant="small">{t('Status unavailable', 'Dili makuha ang kahimtang')}</Txt>}
      </Stack>
    </Row>
    {biometricsError ? <>
      <Notice tone="error">{t('Face verification status could not be loaded.', 'Wala makuha ang kahimtang sa face verification.')}</Notice>
      <Button variant="outline" onPress={() => void refreshBiometrics()}>{t('Try again', 'Sulayi pag-usab')}</Button>
    </> : null}
    <Txt variant="small">{data?.selfCapture ? t('Review consent, then follow the automatic camera guidance.', 'Basaha ang pagtugot, dayon sunda ang automatic nga giya sa camera.') : t('Review consent here. Your barangay facilitator captures your face in person.', 'Basaha dinhi ang pagtugot. Ang barangay facilitator mokuha sa imong nawong sa personal.')}</Txt>
    <Button variant="ghost" onPress={() => flow('capture')}>{t('View face verification', 'Tan-awa ang face verification')}</Button>
  </Card>;
}

function SavedStatus() {
  const { biometrics: data, biometricsLoading, biometricsError, biometricsSaving, refreshBiometrics, t } = useDemo();
  return <>
    {biometricsError ? <Notice tone="error">{t('Saved status is unavailable. Refresh before making changes.', 'Dili makuha ang natipig nga kahimtang. I-refresh sa dili pa mag-usab.')}</Notice>
      : biometricsLoading ? <Notice>{t('Loading saved status…', 'Gikuha ang natipig nga kahimtang…')}</Notice>
      : !data ? <Notice>{t('Connect to the shared server to view your saved consent and enrollment.', 'Konektaha sa shared server aron makita ang natipig nga pagtugot ug enrollment.')}</Notice> : <>
        <Card>
          <Row gap={8} spread>
            <Txt variant="label">{t('Saved record', 'Natipig nga rekord')}</Txt>
            <Badge tone={isVerified(data) ? 'success' : data.profile?.status === 'duplicate_blocked' ? 'error' : 'warning'}>{enrollmentLabel(data, t)}</Badge>
          </Row>
          <DetailRow label={t('Consent', 'Pagtugot')} value={data.consent?.status === 'active' ? t('Given', 'Gihatag')
            : data.consent?.status === 'revoked' ? t('Withdrawn', 'Nabawi') : data.consent?.status === 'expired' ? t('Expired', 'Na-expire') : t('Not given', 'Wala gihatag')} />
          {data.consent && <>
            <DetailRow label={t('Notice version', 'Bersyon sa pahibalo')} value={data.consent.version} />
            <DetailRow label={t('Retention until', 'Tipigan hangtod')} value={formatDateTime(data.consent.retentionUntil)} />
          </>}
          {data.profile && <>
            <DetailRow label={t('Staff enrollment recorded', 'Narekord nga enrollment sa staff')} value={formatDateTime(data.profile.enrolledAt)} />
            {data.profile.lastVerifiedAt && <DetailRow label={t('Last verified', 'Kataposang pag-verify')} value={formatDateTime(data.profile.lastVerifiedAt)} />}
          </>}
        </Card>
        {(data.processorMode === 'simulated' || data.profile?.simulated) && <Notice tone="warning">{t('Simulation only. Saved consent and enrollment records can be tested; real face matching is not active.', 'Simulation lamang. Masulayan ang natipig nga pagtugot ug enrollment; dili pa aktibo ang tinuod nga face matching.')}</Notice>}
        {data.profile && !data.profile.processorCompatible && <Notice tone="warning">{t('This enrollment uses a different face model. Ask your facilitator about enrollment with the current model.', 'Lahi ang face model niini nga enrollment. Pangutan-a ang facilitator bahin sa enrollment gamit ang kasamtangang model.')}</Notice>}
      </>}
    <Button variant="ghost" loading={biometricsLoading} disabled={biometricsSaving} onPress={() => void refreshBiometrics()}>{t('Refresh status', 'I-refresh ang kahimtang')}</Button>
  </>;
}

/** Register Face: optional consent, in-person capture tips, and progress from saved records. */
export function BiometricConsentScreen() {
  const { biometrics: data, biometricsLoading, biometricsError, biometricsSaving, refreshBiometrics, giveConsent, t } = useDemo();
  const [error, setError] = useState('');
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; void refreshBiometrics(); return () => { mounted.current = false; }; }, []);
  const active = data?.consent?.status === 'active';
  return <Page title={t('Face verification consent', 'Pagtugot sa face verification')}>
    <ScreenIntro iconName="scan-face" title={t('Register your face', 'Irehistro ang imong nawong')}
      subtitle={t('Your choice, saved securely. Face enrollment is optional.', 'Imong pagpili, luwas nga gitipigan. Opsyonal ang face enrollment.')} />
    <Txt>{t('Face enrollment is optional. You can still sign in with your phone number. Staff will explain the identity checks allowed at your claiming event.', 'Opsyonal ang face enrollment. Makasulod gihapon ka gamit ang imong numero. Ipasabot sa staff ang mga identity check nga gitugotan sa imong claiming event.')}</Txt>
    <SectionHeader title={t('Registration progress', 'Pag-uswag sa pagrehistro')} />
    <Card><Timeline steps={enrollmentSteps(data, t)} /></Card>
    <SectionHeader title={t('What you agree to', 'Ang imong gitugotan')} />
    <Card>
      {data?.selfCapture
        ? <Txt>{data.processorMode === 'simulated'
          ? t('The camera detects your face and captures selected photos automatically as you follow guidance. This demo saves a capture record only, discards the photos, and does not verify identity or spoof resistance.', 'Mo-detect sa nawong ang camera ug automatic nga mokuha og piniling mga litrato samtang nagsunod ka sa giya. Capture record lamang ang gitipigan sa demo, ilabay ang mga litrato, ug dili kini mo-verify sa identidad o spoof resistance.')
          : t('Selected camera photos are sent to the configured face processor for enrollment and identity checks. That service stores a biometric template under its retention policy. You can withdraw consent to stop use; ask authorized staff about deletion.', 'Ipadala ang piniling mga litrato sa configured face processor alang sa enrollment ug identity checks. Magtipig kana nga serbisyo og biometric template ubos sa retention policy niini. Mabawi nimo ang pagtugot aron ihunong ang paggamit; pangutan-a ang staff bahin sa pagtangtang.')}</Txt>
        : <Txt>{t('Your barangay facilitator captures your face and checks that you are present. The service creates an encrypted face template for identity checks and duplicate enrollment review. This app does not capture your face.', 'Ang barangay facilitator mokuha sa imong nawong ug mosusi nga anaa ka. Ang serbisyo mohimo og encrypted face template alang sa identity check ug pagsusi sa dobleng enrollment. Kini nga app dili mokuha sa imong nawong.')}</Txt>}
      <Txt>{t('You can withdraw consent in Security & Privacy. This stops use of the linked face enrollment. Contact authorized staff about permanent deletion and any retained audit records.', 'Mabawi nimo ang pagtugot sa Seguridad ug Privacy. Mohunong ang paggamit sa nalambigit nga face enrollment. Kontaka ang awtorisadong staff bahin sa permanenteng pagtangtang ug mga audit record.')}</Txt>
      {data && <>
        <DetailRow label={t('Notice version', 'Bersyon sa pahibalo')} value={data.policy.version} />
        <DetailRow label={t('Retention until', 'Tipigan hangtod')} value={formatDateTime(active ? data.consent!.retentionUntil : data.policy.retentionUntil)} />
        <Txt variant="small">{t('A new consent lasts up to one year. Staff must renew enrollment after consent expires.', 'Ang bag-ong pagtugot molungtad hangtod usa ka tuig. Kinahanglan i-renew sa staff ang enrollment human ma-expire ang pagtugot.')}</Txt>
      </>}
    </Card>
    <SectionHeader title={t('Tips for your in-person capture', 'Tambag alang sa personal nga pagkuha')} />
    <Card>
      <Checklist items={[
        { icon: 'light', text: t('Stand in a well-lit area', 'Barog sa hayag nga lugar') },
        { icon: 'glasses', text: t('Remove eyeglasses, hat or mask', 'Tanggala ang antipara, kalo o mask') },
        { icon: 'face', text: t('Look straight at the camera', 'Tan-aw diretso sa camera') },
      ]} />
    </Card>
    {biometricsError || !data ? <Notice tone="error">{t('The consent notice could not be loaded. Refresh to try again.', 'Wala makuha ang pahibalo sa pagtugot. I-refresh aron sulayan pag-usab.')}</Notice> : null}
    {data?.processorMode === 'simulated' && <Notice tone="warning">{t('The current service is a simulation. Real face matching is not active.', 'Simulation ang kasamtangang serbisyo. Dili pa aktibo ang tinuod nga face matching.')}</Notice>}
    {active && <Notice tone="success">{t('Your consent is already saved. Continue to see your staff enrollment status.', 'Natipig na ang imong pagtugot. Padayon aron makita ang kahimtang sa enrollment sa staff.')}</Notice>}
    {!!error && <Notice tone="error">{error}</Notice>}
    <Button loading={biometricsSaving || biometricsLoading} disabled={!data || biometricsError} onPress={async () => {
      if (!data || pending.current) return;
      if (active) { flow('capture'); return; }
      pending.current = true; setError('');
      try {
        const saved = await giveConsent({ consentVersion: data.policy.version, retentionUntil: data.policy.retentionUntil, expectedConsentId: data.consent?.id ?? null });
        if (saved && mounted.current) flow('capture');
      } catch (cause) {
        if (mounted.current) setError(cause instanceof ApiRequestError && cause.status === 409
          ? t('Consent changed. Refresh and review the notice again.', 'Nausab ang pagtugot. I-refresh ug basaha pag-usab ang pahibalo.')
          : t('Consent could not be saved. Try again.', 'Wala matipig ang pagtugot. Sulayi pag-usab.'));
      } finally { pending.current = false; }
    }}>{active ? t('View enrollment status', 'Tan-awa ang enrollment') : t('Agree and save consent', 'Motugot ug tipigi ang pagtugot')}</Button>
    <Button variant="outline" loading={biometricsLoading} disabled={biometricsSaving} onPress={() => void refreshBiometrics()}>{t('Refresh notice', 'I-refresh ang pahibalo')}</Button>
    <Button variant="ghost" disabled={biometricsSaving} onPress={() => router.replace('/(tabs)/home')}>{t('Not now', 'Dili karon')}</Button>
  </Page>;
}

/** Capture / liveness / verify-identity status. The app never captures a face; it shows the saved staff result. */
export function BiometricEnrollmentScreen() {
  const { biometrics: data, biometricsLoading, biometricsError, refreshBiometrics, t } = useDemo();
  useEffect(() => { void refreshBiometrics(); }, []);
  const verified = isVerified(data);
  const captured = data?.profile?.status === 'enrolled';
  const blocked = data?.profile && ['duplicate_blocked', 'revoked', 'expired'].includes(data.profile.status);
  return <Page title={t('Face verification', 'Pag-verify sa nawong')}>
    <FaceGuide tone={verified ? 'green' : captured ? 'amber' : 'primary'} />
    <Txt variant="small" style={{ textAlign: 'center' }}>
      {data?.selfCapture
        ? t('Illustration only. Tap “Capture my face” to open the camera.', 'Ilustrasyon lamang. I-tap ang “Kuhaa akong nawong” aron maablihan ang camera.')
        : t('Illustration only. Capture and liveness checks happen on your facilitator’s device.', 'Ilustrasyon lamang. Ang pagkuha ug liveness check mahitabo sa device sa facilitator.')}
    </Txt>
    {biometricsLoading || biometricsError || !data ? null : verified ? (
      <ScreenIntro iconName="check" tone="green" size={56} title={t('Identity enrollment confirmed', 'Nakumpirma ang identity enrollment')}
        subtitle={t('Your saved face enrollment can be used by staff to verify you at claiming.', 'Magamit sa staff ang imong natipig nga face enrollment aron ma-verify ka sa pag-claim.')} />
    ) : blocked ? (
      <ScreenIntro iconName="alert" tone="error" size={56} title={enrollmentLabel(data, t)}
        subtitle={t('Contact your facilitator to review or renew your enrollment.', 'Kontaka ang facilitator aron masusi o ma-renew ang enrollment.')} />
    ) : captured ? (
      <ScreenIntro iconName="alert" tone="amber" size={56} title={t('Not verified yet', 'Wala pa ma-verify')}
        subtitle={t('This enrollment is a simulation or uses another face model, so it does not verify your identity.', 'Simulation kini o lahi ang face model, busa dili kini mo-verify sa imong pagkatawo.')} />
    ) : (
      data.selfCapture ? (
        <ScreenIntro iconName="scan-face" size={56} title={t('Register your face in this app', 'Irehistro ang nawong niini nga app')}
          subtitle={data.consent?.status === 'active'
            ? t('Tap “Capture my face” and follow the prompts. This page shows the saved record.', 'I-tap ang “Kuhaa akong nawong” ug sunda ang prompts. Kini nga pahina nagpakita sa natipig nga rekord.')
            : t('Save consent first, then capture your face with the camera.', 'Tipigi una ang pagtugot, dayon kuhaa ang nawong gamit ang camera.')} />
      ) : (
        <ScreenIntro iconName="clock" size={56} title={t('Enrollment with your facilitator', 'Enrollment uban sa facilitator')}
          subtitle={t('After saving consent, visit your barangay facilitator for face capture. This page shows the record saved by staff.', 'Human matipig ang pagtugot, bisitaha ang barangay facilitator aron kuhaan sa nawong. Kini nga pahina nagpakita sa rekord nga gitipigan sa staff.')} />
      )
    )}
    <Card><Timeline steps={enrollmentSteps(data, t)} /></Card>
    {data?.selfCapture && data.consent?.status === 'active' && <>
      <Button onPress={() => router.push('/face/enroll')}>{captured ? t('Capture my face again', 'Kuhaa pag-usab akong nawong') : t('Capture my face', 'Kuhaa akong nawong')}</Button>
      {captured && <Button variant="outline" onPress={() => router.push('/face/verify')}>{t('Verify my identity', 'I-verify ang akong pagkatawo')}</Button>}
    </>}
    <SavedStatus />
    <Button variant={data?.selfCapture && data.consent?.status === 'active' ? 'ghost' : 'primary'} onPress={() => flow('consent')}>{t('Review consent', 'Basaha ang pagtugot')}</Button>
    <Button variant="outline" onPress={() => router.replace('/(tabs)/home')}>{t('Back to home', 'Balik sa home')}</Button>
  </Page>;
}

export function BiometricPrivacy() {
  const { biometrics: data, biometricsLoading, biometricsError, biometricsSaving, refreshBiometrics, withdrawConsent, t } = useDemo();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; void refreshBiometrics(); return () => { mounted.current = false; }; }, []);
  return <>
    <ScreenIntro iconName="lock" tone="green" size={60} title={t('Security & Privacy', 'Seguridad ug Privacy')}
      subtitle={t('Manage your face verification consent.', 'Dumalaha ang pagtugot sa face verification.')} />
    <SavedStatus />
    <Notice>{t('Withdrawing consent stops use of the linked face enrollment. Your phone sign-in remains available. Contact authorized staff about permanent deletion.', 'Ang pagbawi sa pagtugot mopahunong sa paggamit sa nalambigit nga face enrollment. Magamit gihapon ang pagsulod pinaagi sa numero. Kontaka ang awtorisadong staff bahin sa permanenteng pagtangtang.')}</Notice>
    {!!error && <Notice tone="error">{error}</Notice>}
    <Button variant="outline" disabled={data?.consent?.status !== 'active' || biometricsLoading || biometricsError || biometricsSaving} onPress={() => { setError(''); setConfirmId(data!.consent!.id); }}>{t('Withdraw face consent', 'Bawion ang pagtugot')}</Button>
    <Button onPress={() => flow('consent')}>{t('Review consent notice', 'Basaha ang pahibalo sa pagtugot')}</Button>
    <ConfirmationModal
      visible={!!confirmId}
      danger
      title={t('Withdraw face consent?', 'Bawion ang pagtugot sa nawong?')}
      message={t('Staff will need new consent and enrollment before using face verification again.', 'Kinahanglan sa staff ang bag-ong pagtugot ug enrollment sa dili pa magamit pag-usab ang face verification.')}
      cancelLabel={t('Keep consent', 'Ipadayon ang pagtugot')}
      confirmLabel={t('Confirm withdrawal', 'Kumpirmaha ang pagbawi')}
      loading={biometricsSaving}
      onCancel={() => setConfirmId(null)}
      onConfirm={async () => {
        if (pending.current || !confirmId || biometricsLoading || biometricsError || data?.consent?.id !== confirmId) return;
        pending.current = true; setError('');
        try { if (await withdrawConsent(confirmId) && mounted.current) setConfirmId(null); }
        catch { if (mounted.current) { setConfirmId(null); setError(t('Withdrawal could not be confirmed. Refresh status before trying again.', 'Wala makumpirma ang pagbawi. I-refresh ang kahimtang sa dili pa sulayan pag-usab.')); } }
        finally { pending.current = false; }
      }}
    />
  </>;
}
