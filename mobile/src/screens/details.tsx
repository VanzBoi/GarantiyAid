import { NotificationSettings } from './notification-settings';
import { SupportContent } from './support';
import { DocumentChecklist } from './document-checklist';
import { DocumentPreview } from './document-preview';
import { BiometricPrivacy } from './biometrics';
import { BarangayPicker } from '../barangay-picker';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import QRCode from 'react-native-qrcode-svg';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  FileText,
  Info,
  KeyRound,
  ListChecks,
  MapPin,
  QrCode,
  Receipt as ReceiptIcon,
  ScanFace,
  Search,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react-native';
import {
  Badge,
  BottomLinks,
  Button,
  Card,
  Checklist,
  Chip,
  DetailRow,
  Divider,
  EmptyState,
  Field,
  flow,
  go,
  GradientCard,
  IconCircle,
  KeyValue,
  LoadingSkeleton,
  Notice,
  NotificationCard,
  Page,
  PhoneField,
  ScreenIntro,
  SectionHeader,
  styles,
  Timeline,
  TransactionCard,
  Txt,
} from '../components';
import { appointment as a, peso, signedPeso, useDemo } from '../state';
import { colors as c, fonts } from '../theme';
import { ApiRequestError, getBarangays, issueClaimPass, requestOtp, MAX_DOCUMENT_BYTES, IS_SHARED_BACKEND, type Barangay, type Beneficiary, type ProfileUpdate, type BeneficiaryDocument, type DocumentType, type ClaimPass as ClaimPassData } from '../api';
import {
  formatDate,
  formatDateTime,
  formatQueueNumber,
  formatStatus,
  formatDocumentType,
  formatTimeSlot,
  formatTransactionType,
  formatClaimStatus,
  transactionSource,
} from '../format';
import { claimProgress, ReceiptBody } from './main';

export function DetailScreen() {
  const { page: screen } = useLocalSearchParams<{ page: string }>();
  const { t } = useDemo();
  const definitions: Record<
    string,
    { title: string; content: React.ReactNode; active?: string }
  > = {
    schedule: {
      title: t('Claiming schedule', 'Iskedyul sa pag-claim'),
      content: <Schedule />,
    },
    'qr-pass': {
      title: t('My QR claim pass', 'Akong QR claim pass'),
      content: <ClaimPass />,
    },
    programs: {
      title: t('My programs', 'Akong mga programa'),
      content: <Programs />,
    },
    'claim-status': {
      title: t('Claim status', 'Kahimtang sa claim'),
      content: <ClaimStatus />,
      active: 'wallet',
    },
    transactions: {
      title: t('Transaction history', 'Kasaysayan sa transaksyon'),
      content: <Transactions />,
      active: 'wallet',
    },
    receipt: { title: t('Receipt', 'Resibo'), content: <Receipt />, active: 'wallet' },
    notifications: {
      title: t('Notifications', 'Mga pahibalo'),
      content: <Notifications />,
    },
    'notification-details': {
      title: t('Notification details', 'Detalye sa pahibalo'),
      content: <NotificationDetails />,
    },
    'reset-password': {
      title: t('Recover account', 'Irecover ang account'),
      content: <Recovery />,
      active: 'profile',
    },
    'edit-profile': {
      title: t('Edit profile', 'Usba ang profile'),
      content: <EditProfile />,
      active: 'profile',
    },
    'change-password': {
      title: t('Change password', 'Usba ang password'),
      content: <Password />,
      active: 'profile',
    },
    'notification-settings': {
      title: t('Notification settings', 'Mga setting sa pahibalo'),
      content: <NotificationSettings />,
      active: 'profile',
    },
    'enrollment-status': {
      title: t('Enrollment status', 'Kahimtang sa enrollment'),
      content: <EnrollmentStatus />,
    },
    'enrollment-documents': {
      title: t('Enrollment documents', 'Mga dokumento sa enrollment'),
      content: <EnrollmentDocuments />,
    },
    'security-privacy': {
      title: t('Security & Privacy', 'Seguridad ug Privacy'),
      content: <Privacy />,
      active: 'profile',
    },
    'schedule-update': {
      title: t('Schedule update', 'Nausab nga iskedyul'),
      content: <Exception kind="schedule" />,
    },
    'qr-expired': {
      title: t('QR verification', 'QR verification'),
      content: <Exception kind="expired" />,
    },
    support: {
      title: t('Talk to staff', 'Pakigsulti sa staff'),
      content: <Support />,
      active: 'help',
    },
    'face-login': {
      title: t('Login with Face', 'Log in pinaagi sa Nawong'),
      content: <FaceLogin />,
    },
  };
  const entry = definitions[screen];
  if (!entry)
    return (
      <Page title="GarantiyAid">
        <Txt variant="title">{t('Screen unavailable', 'Dili magamit nga screen')}</Txt>
        <Button onPress={() => router.replace('/(tabs)/home')}>
          {t('Return to Home', 'Balik sa Home')}
        </Button>
      </Page>
    );
  return (
    <View style={{ flex: 1 }}>
      <Page tabs={screen !== 'reset-password'} title={entry.title}>
        {entry.content}
      </Page>
      {screen !== 'reset-password' && <BottomLinks active={entry.active} />}
    </View>
  );
}

function Schedule() {
  const { overview, overviewLoading, overviewError, refreshOverview, t } = useDemo();
  if (overviewLoading) {
    return <LoadingSkeleton label={t('Loading your schedule…', 'Nag-load sa imong iskedyul…')} />;
  }
  if (overviewError) {
    return (
      <>
        <Notice tone="error">
          {t('Your schedule could not be loaded.', 'Wala ma-load ang imong iskedyul.')}
        </Notice>
        <Button onPress={() => void refreshOverview()}>{t('Try again', 'Sulayi pag-usab')}</Button>
      </>
    );
  }
  const schedule = overview?.nextSchedule;
  if (!schedule) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={t('No schedule yet', 'Wala pay iskedyul')}
        body={t(
          'No claiming schedule has been assigned to your account yet.',
          'Wala pay iskedyul sa claim nga gi-assign sa imong account.',
        )}
      >
        <Button variant="outline" onPress={() => void refreshOverview()}>
          {t('Refresh schedule', 'I-refresh ang iskedyul')}
        </Button>
      </EmptyState>
    );
  }
  return (
    <>
      <ScreenIntro
        icon={CalendarDays}
        size={60}
        title={t('Upcoming claim', 'Umaabot nga claim')}
        subtitle={schedule.program.name}
      />
      <GradientCard style={{ gap: 14 }}>
        <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
          <Txt variant="caption" style={{ color: '#D2E5FC' }}>
            {t('CLAIMING DATE', 'PETSA SA PAG-CLAIM')}
          </Txt>
          <Badge tone="light">{formatStatus(schedule.status)}</Badge>
        </View>
        <Txt variant="heading" style={{ color: c.onPrimary, fontSize: 22, lineHeight: 28 }}>
          {formatDate(schedule.date)}
        </Txt>
        <View style={[styles.row, { gap: 8 }]}>
          <Clock3 size={18} color="#D2E5FC" />
          <Txt style={{ color: c.onPrimary }}>{formatTimeSlot(schedule.slotStart, schedule.slotEnd)}</Txt>
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, padding: 14, gap: 2 }}>
          <Txt variant="caption" style={{ color: '#D2E5FC' }}>
            {t('QUEUE NUMBER', 'NUMERO SA PILA')}
          </Txt>
          <Txt variant="number" style={{ color: c.onPrimary }}>
            {formatQueueNumber(schedule.queueNumber)}
          </Txt>
        </View>
      </GradientCard>
      <Card>
        <DetailRow icon={ShieldCheck} label={t('Program', 'Programa')} value={schedule.program.name} />
        <DetailRow icon={MapPin} label={t('Venue', 'Lugar')} value={schedule.location} />
        <DetailRow icon={Users} label={t('Queue number', 'Numero sa pila')} value={formatQueueNumber(schedule.queueNumber)} />
      </Card>
      <SectionHeader title={t('Claiming instructions', 'Instruksyon sa pag-claim')} />
      <Card>
        <Checklist
          items={[
            { icon: 'check', text: t('Arrive only during your time slot.', 'Abot lamang sa imong oras.') },
            { icon: 'check', text: t('Bring your phone with your QR claim pass.', 'Dad-a ang cellphone nga adunay QR claim pass.') },
            { icon: 'check', text: t('Follow the instructions of your barangay facilitator.', 'Sunda ang instruksyon sa barangay facilitator.') },
          ]}
        />
      </Card>
      <Notice>
        {t(
          'This schedule is assigned to your saved beneficiary account. Arrive only during your time slot.',
          'Kini nga iskedyul gi-assign sa imong beneficiary account. Abot lamang sa imong oras.',
        )}
      </Notice>
      <Button icon={QrCode} onPress={() => go('qr-pass')}>
        {t('Open my QR claim pass', 'Ablihi akong QR claim pass')}
      </Button>
      <Button variant="outline" onPress={() => void refreshOverview()}>
        {t('Refresh schedule', 'I-refresh ang iskedyul')}
      </Button>
    </>
  );
}

function ClaimPass() {
  const { accessToken, reset, t } = useDemo();
  const [pass, setPass] = useState<ClaimPassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [expired, setExpired] = useState(false);
  const request = useRef(0);
  const busyToken = useRef('');
  const loadedToken = useRef('');
  const currentToken = useRef(accessToken);
  currentToken.current = accessToken;
  const load = async () => {
    if (!accessToken || busyToken.current === accessToken) return;
    busyToken.current = accessToken;
    loadedToken.current = accessToken;
    const version = ++request.current;
    const current = () => version === request.current && currentToken.current === accessToken;
    setLoading(true);
    setError(null);
    setPass(null);
    try {
      const nextPass = await issueClaimPass(accessToken);
      if (current()) setPass(nextPass);
    } catch (caught) {
      if (!current()) return;
      if (caught instanceof ApiRequestError && caught.status === 401) {
        await reset();
        router.replace('/');
        return;
      }
      setError(
        caught instanceof ApiRequestError
          ? caught
          : new ApiRequestError('REQUEST_FAILED', 'The claim pass could not be issued.'),
      );
    } finally {
      if (current()) {
        busyToken.current = '';
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    void load();
    return () => { request.current++; busyToken.current = ''; };
  }, [accessToken]);
  useEffect(() => {
    if (!pass) return;
    const deadline = Date.parse(pass.expiresAt);
    const check = () => setExpired(!Number.isFinite(deadline) || deadline <= Date.now());
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [pass]);
  const actions = <>
    <Button variant="outline" onPress={() => void load()}>{t('Refresh pass', 'I-refresh ang pass')}</Button>
    <Button variant="outline" onPress={() => go('schedule')}>
      {t('Back to schedule', 'Balik sa iskedyul')}
    </Button>
  </>;
  if (loading || loadedToken.current !== accessToken) {
    return <LoadingSkeleton label={t('Issuing your secure QR pass…', 'Gina-issue ang imong secure QR pass…')} lines={4} />;
  }
  if (error) {
    const unavailable = error.code === 'CLAIM_PASS_UNAVAILABLE';
    const messages: Record<string, string> = {
      CLAIM_PASS_UNAVAILABLE: t('A QR pass is not available because you have no eligible published schedule.', 'Walay QR pass kay wala pay angay nga gipatik nga iskedyul.'),
      CLAIM_PASS_REVOKED: t('Staff revoked this pass. Contact your facilitator before claiming.', 'Gibawi sa staff kini nga pass. Kontaka ang facilitator sa dili pa mag-claim.'),
      CLAIM_PASS_PROCESSED: t('This pass was used or staff have started processing your claim. Ask staff for its status.', 'Nagamit na kini nga pass o gisugdan na sa staff ang imong claim. Pangutan-a ang staff sa kahimtang niini.'),
      CLAIM_PASS_EXPIRED: t('This pass has expired. Contact staff to check your schedule.', 'Na-expire na kini nga pass. Kontaka ang staff aron masusi ang imong iskedyul.'),
      CLAIM_PASS_STAFF_ISSUED: t('Staff issued your pass separately. Ask them for it; this app cannot replace it.', 'Gilain og hatag sa staff ang imong pass. Pangayoa kini sa staff; dili kini mapulihan sa app.'),
      QR_NOT_REQUIRED: t('Your distribution uses another verification method. Follow staff instructions.', 'Lain nga paagi sa verification ang gigamit sa imong distribution. Sunda ang instruksyon sa staff.'),
      QR_CLAIM_CONCURRENT_CHANGE: t('Your QR or claim record changed. Refresh the pass to check again.', 'Nausab ang imong QR o claim record. I-refresh ang pass aron masusi pag-usab.'),
    };
    return (
      <>
        <ScreenIntro
          icon={QrCode}
          tone={unavailable ? 'amber' : 'error'}
          size={60}
          title={unavailable ? t('No QR pass yet', 'Wala pay QR pass') : t('QR pass unavailable', 'Dili magamit ang QR pass')}
        />
        <Notice tone={unavailable ? 'warning' : 'error'}>
          {messages[error.code] ?? (error.status === 429
            ? t('Too many requests. Wait and refresh the pass later.', 'Daghan ra nga hangyo. Paghulat ug i-refresh ang pass unya.')
            : t('Your QR pass could not be loaded. Check your connection and refresh the pass.', 'Wala ma-load ang QR pass. Susihon ang koneksyon ug i-refresh ang pass.'))}
        </Notice>
        {actions}
      </>
    );
  }
  if (!pass) return null;
  if (expired || Date.parse(pass.expiresAt) <= Date.now()) return <>
    <ScreenIntro icon={Clock3} tone="amber" size={60} title={t('Pass expired', 'Na-expire ang pass')} />
    <Notice tone="warning">{t('This pass has expired. Refresh to check availability, or contact staff about your schedule.', 'Na-expire na kini nga pass. I-refresh aron masusi kon magamit pa, o kontaka ang staff bahin sa imong iskedyul.')}</Notice>
    {actions}
  </>;
  return (
    <>
      <Txt style={{ textAlign: 'center', color: c.muted }}>
        {t(
          'Present this QR code to authorized staff during your scheduled claiming.',
          'Ipakita kini nga QR code sa awtorisadong staff sa imong iskedyul sa pag-claim.',
        )}
      </Txt>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        <GradientCard style={{ borderRadius: 0, gap: 6, boxShadow: 'none' }}>
          <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
            <Txt variant="caption" style={{ color: '#D2E5FC' }}>{t('CLAIM PASS', 'CLAIM PASS')}</Txt>
            <Badge tone="light">{t('Active pass', 'Aktibong pass')}</Badge>
          </View>
          <Txt variant="label" style={{ color: c.onPrimary, fontSize: 17 }}>
            {pass.schedule.program.name}
          </Txt>
          <Txt variant="small" style={{ color: '#D9E6FF' }}>{formatDate(pass.schedule.date)}</Txt>
        </GradientCard>
        <View style={{ alignItems: 'center', padding: 20, gap: 14 }}>
          <View
            style={{ padding: 14, backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.outline }}
            accessibilityLabel={t('Active QR claim pass', 'Aktibong QR claim pass')}
          >
            <QRCode value={pass.claimCode} size={210} color={c.navy} backgroundColor={c.card} />
          </View>
          <Divider dashed />
          <View style={[styles.row, { alignSelf: 'stretch', justifyContent: 'space-between' }]}>
            <View style={{ gap: 2 }}>
              <Txt variant="caption">{t('QUEUE', 'PILA')}</Txt>
              <Txt variant="number" style={{ color: c.navy, fontSize: 30, lineHeight: 36 }}>
                {formatQueueNumber(pass.schedule.queueNumber)}
              </Txt>
            </View>
            <View style={{ gap: 2, alignItems: 'flex-end', flexShrink: 1 }}>
              <Txt variant="caption">{t('TIME', 'ORAS')}</Txt>
              <Txt variant="label">{formatTimeSlot(pass.schedule.slotStart, pass.schedule.slotEnd)}</Txt>
            </View>
          </View>
          <View style={[styles.row, { alignSelf: 'stretch', gap: 8 }]}>
            <MapPin size={18} color={c.primary} />
            <Txt variant="label" style={{ flex: 1 }}>{pass.schedule.location}</Txt>
          </View>
        </View>
      </Card>
      <Notice>
        {t(
          `Show this pass only to authorized staff. It expires ${formatDateTime(pass.expiresAt)}. Staff must complete the required verification before releasing assistance.`,
          `Ipakita lamang kini sa awtorisadong staff. Ma-expire kini ${formatDateTime(pass.expiresAt)}. Kinahanglang makompleto sa staff ang gikinahanglang verification sa dili pa ihatag ang ayuda.`,
        )}
      </Notice>
      {actions}
    </>
  );
}

function Transactions() {
  const { wallet, walletLoading, walletError, refreshWallet, t } = useDemo();
  const [filter, setFilter] = useState<'all' | 'credit' | 'reversal'>('all');
  const entries = wallet?.transactions ?? [];
  const visible = entries.filter((entry) =>
    filter === 'all' ? true : filter === 'credit' ? entry.amount >= 0 : entry.amount < 0,
  );
  return (
    <>
      <Notice>
        {t(
          'This wallet records assistance issued to you. It cannot send or transfer money.',
          'Kini nga wallet nagrekord sa ayuda nga imong nadawat. Dili kini makapadala o makabalhin og kuwarta.',
        )}
      </Notice>
      {walletLoading && !wallet ? (
        <LoadingSkeleton label={t('Loading wallet records…', 'Nag-load sa wallet records…')} />
      ) : walletError ? (
        <>
          <Notice tone="error">
            {t('Your wallet history could not be loaded.', 'Wala ma-load ang imong wallet history.')}
          </Notice>
          <Button variant="outline" onPress={() => void refreshWallet()}>
            {t('Try again', 'Sulayi pag-usab')}
          </Button>
        </>
      ) : (
        <>
          <GradientCard style={{ gap: 6 }}>
            <Txt variant="caption" style={{ color: '#D2E5FC' }}>
              {t('RECORDED BALANCE', 'NAREKORD NGA BALANSE')}
            </Txt>
            <Txt variant="heading" style={{ fontSize: 28, lineHeight: 34, color: c.onPrimary }}>
              {wallet?.wallet ? peso(wallet.wallet.balance) : t('No wallet account yet', 'Wala pay wallet account')}
            </Txt>
          </GradientCard>
          <View accessibilityRole="tablist" style={[styles.row, { gap: 8, flexWrap: 'wrap' }]}>
            <Chip label={t('All', 'Tanan')} selected={filter === 'all'} count={entries.length} onPress={() => setFilter('all')} />
            <Chip label={t('Credits', 'Credits')} selected={filter === 'credit'} onPress={() => setFilter('credit')} />
            <Chip label={t('Reversals', 'Pagbalik')} selected={filter === 'reversal'} onPress={() => setFilter('reversal')} />
          </View>
          {visible.length ? (
            <Card style={{ gap: 0, paddingVertical: 2 }}>
              {visible.map((entry, index) => (
                <TransactionCard
                  key={entry.id}
                  first={index === 0}
                  icon={entry.amount < 0 ? ArrowUpRight : ArrowDownLeft}
                  negative={entry.amount < 0}
                  title={formatTransactionType(entry.type, t)}
                  subtitle={`${transactionSource(entry, t)} · ${formatDateTime(entry.createdAt)}`}
                  meta={`${entry.reference} · ${formatStatus(entry.status)}`}
                  amount={signedPeso(entry.amount)}
                  accessibilityLabel={`${t('Open receipt', 'Ablihi ang resibo')}: ${formatTransactionType(entry.type, t)}, ${signedPeso(entry.amount)}, ${formatDateTime(entry.createdAt)}`}
                  onPress={() => go('receipt', { id: entry.id })}
                />
              ))}
            </Card>
          ) : (
            <EmptyState
              icon={ReceiptIcon}
              title={entries.length ? t('No matching records', 'Walay katugbang nga rekord') : t('No wallet history yet', 'Wala pay wallet history')}
              body={t(
                'Wallet credits appear here when staff record a ledger entry. Physical assistance appears in claim history.',
                'Makita dinhi ang wallet credits kon morekord ang staff. Ang pisikal nga ayuda makita sa kasaysayan sa claim.',
              )}
            />
          )}
        </>
      )}
      {!walletError && (
        <Button variant="ghost" loading={walletLoading} onPress={() => void refreshWallet()}>
          {t('Refresh records', 'I-refresh ang records')}
        </Button>
      )}
    </>
  );
}
function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wallet, walletLoading, walletError, refreshWallet, t } = useDemo();
  const entry = wallet?.transactions.find((item) => item.id === id);
  if (walletLoading && !wallet)
    return <LoadingSkeleton label={t('Loading receipt…', 'Nag-load sa resibo…')} />;
  if (walletError)
    return (
      <>
        <Notice tone="error">
          {t('This receipt could not be loaded.', 'Wala ma-load kini nga resibo.')}
        </Notice>
        <Button variant="outline" onPress={() => void refreshWallet()}>
          {t('Try again', 'Sulayi pag-usab')}
        </Button>
      </>
    );
  if (!entry)
    return (
      <Notice tone="warning">
        {t(
          'Receipt unavailable. Select a transaction in your history.',
          'Dili magamit ang resibo. Pagpili og transaksyon sa kasaysayan.',
        )}
      </Notice>
    );
  return (
    <>
      <Card style={{ gap: 18 }}>
        <ReceiptBody entry={entry} t={t} />
      </Card>
      <Button onPress={() => router.back()}>{t('Close', 'Sirad-i')}</Button>
    </>
  );
}

function Notifications() {
  const { accessToken, notifications, notificationsLoading, notificationsError, refreshNotifications, t } = useDemo();
  const [unreadOnly, setUnreadOnly] = useState(false);
  useEffect(() => { void refreshNotifications(); }, [accessToken]);
  const icons: Record<string, typeof Bell> = {
    schedule: CalendarDays,
    claim: CircleCheck,
    reminder: Bell,
    account: Info,
  };
  const tones: Record<string, 'primary' | 'green' | 'amber' | 'navy'> = {
    schedule: 'primary',
    claim: 'green',
    reminder: 'amber',
    account: 'navy',
  };
  if (!accessToken) return <Notice>{t('Sign in to view your notifications.', 'Pag-sign in para makita ang imong pahibalo.')}</Notice>;
  const unreadCount = notifications.filter((notice) => !notice.readAt).length;
  const visible = unreadOnly ? notifications.filter((notice) => !notice.readAt) : notifications;
  return (
    <>
      <View accessibilityRole="tablist" style={[styles.row, { gap: 8 }]}>
        <Chip label={t('All', 'Tanan')} selected={!unreadOnly} count={notifications.length} onPress={() => setUnreadOnly(false)} />
        <Chip label={t('Unread', 'Wala pa mabasa')} selected={unreadOnly} count={unreadCount} onPress={() => setUnreadOnly(true)} />
      </View>
      {notificationsLoading && <LoadingSkeleton label={t('Loading notifications…', 'Nag-load sa mga pahibalo…')} lines={2} />}
      {notificationsError && (
        <Notice tone="error">
          {t('Your notifications could not be loaded. Try again.', 'Wala ma-load ang imong mga pahibalo. Sulayi pag-usab.')}
        </Notice>
      )}
      {!notificationsLoading && !notificationsError && notifications.length === 0 && (
        <EmptyState
          icon={Bell}
          title={t('You are all caught up', 'Wala kay bag-ong pahibalo')}
          body={t('No notifications yet. Schedule and claim updates will appear here.', 'Wala pay pahibalo. Dinhi makita ang mga update sa iskedyul ug claim.')}
        />
      )}
      {!notificationsLoading && !notificationsError && notifications.length > 0 && visible.length === 0 && (
        <EmptyState icon={CircleCheck} tone="green" title={t('No unread notifications', 'Walay wala pa mabasa nga pahibalo')} />
      )}
      {visible.map((notice) => (
        <NotificationCard
          key={notice.id}
          icon={icons[notice.notificationType] ?? Bell}
          tone={tones[notice.notificationType] ?? 'primary'}
          title={t(notice.title, notice.titleBs ?? notice.title)}
          message={t(notice.message, notice.messageBs ?? notice.message)}
          time={formatDateTime(notice.sentAt)}
          unread={!notice.readAt}
          accessibilityLabel={`${t(notice.title, notice.titleBs ?? notice.title)}. ${notice.readAt ? t('Read', 'Nabasa na') : t('Unread', 'Wala pa mabasa')}`}
          onPress={() => go('notification-details', { id: notice.id })}
        />
      ))}
      <Button variant="ghost" loading={notificationsLoading} onPress={() => void refreshNotifications()}>
        {notificationsError ? t('Try again', 'Sulayi pag-usab') : t('Refresh notifications', 'I-refresh ang mga pahibalo')}
      </Button>
    </>
  );
}
function NotificationDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, notifications, notificationsLoading, notificationsError, refreshNotifications, markRead, t } = useDemo();
  const notice = notifications.find((item) => item.id === id);
  const [saving, setSaving] = useState(false);
  const [readError, setReadError] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [lookingUp, setLookingUp] = useState(false);
  const lookedUp = useRef('');
  // A phone alert can open before the inbox has its notice; load it once through the current account.
  useEffect(() => {
    const key = `${accessToken}:${id}`;
    if (!accessToken || !id || notice || lookedUp.current === key) return;
    lookedUp.current = key;
    let active = true;
    setLookingUp(true);
    void refreshNotifications().finally(() => { if (active) setLookingUp(false); });
    return () => { active = false; };
  }, [id, accessToken, !!notice]);
  useEffect(() => {
    let active = true;
    setReadError(false);
    setSaving(false);
    if (notice && !notice.readAt) {
      setSaving(true);
      void markRead(notice.id).catch(() => false).then((saved) => {
        if (active) {
          setSaving(false);
          setReadError(!saved);
        }
      });
    }
    return () => { active = false; };
  }, [notice?.id, accessToken, readAttempt]);
  if (!accessToken) return <Notice>{t('Sign in to view your notifications.', 'Pag-sign in para makita ang imong pahibalo.')}</Notice>;
  if (!notice && (notificationsLoading || lookingUp)) return <LoadingSkeleton label={t('Loading notifications…', 'Nag-load sa mga pahibalo…')} lines={2} />;
  if (!notice && notificationsError) return (
    <>
      <Notice tone="error">{t('Your notifications could not be loaded.', 'Wala ma-load ang imong mga pahibalo.')}</Notice>
      <Button onPress={() => void refreshNotifications()}>{t('Try again', 'Sulayi pag-usab')}</Button>
    </>
  );
  if (!notice)
    return (
      <EmptyState icon={Bell} title={t('Notification unavailable.', 'Dili magamit nga pahibalo.')} />
    );
  const DetailIcon = notice.notificationType === 'claim' ? CircleCheck : notice.notificationType === 'schedule' ? CalendarDays : Bell;
  return (
    <>
      <Card style={{ gap: 14 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <IconCircle icon={DetailIcon} size={52} square tone={notice.notificationType === 'claim' ? 'green' : notice.notificationType === 'reminder' ? 'amber' : 'primary'} />
          <Badge tone={notice.readAt ? 'success' : 'warning'}>
            {notice.readAt ? t('Read', 'Nabasa na') : t('Unread', 'Wala pa mabasa')}
          </Badge>
        </View>
        <Txt accessibilityRole="header" variant="title" style={{ fontSize: 22, lineHeight: 28 }}>{t(notice.title, notice.titleBs ?? notice.title)}</Txt>
        <View style={[styles.row, { gap: 6 }]}>
          <Clock3 size={15} color={c.muted} />
          <Txt variant="small">{formatDateTime(notice.sentAt)}</Txt>
        </View>
        <Divider />
        <Txt selectable>{t(notice.message, notice.messageBs ?? notice.message)}</Txt>
      </Card>
      {saving && <Txt variant="small">{t('Saving read status…', 'Gitipigan ang kahimtang sa pagbasa…')}</Txt>}
      {readError && (
        <>
          <Notice tone="error">{t('Read status was not saved. Try again.', 'Wala matipig ang kahimtang sa pagbasa. Sulayi pag-usab.')}</Notice>
          <Button onPress={() => setReadAttempt((value) => value + 1)}>{t('Retry saving', 'Sulayi pagtipig pag-usab')}</Button>
        </>
      )}
      {notice.notificationType === 'claim' && (
        <Button onPress={() => router.replace('/(tabs)/wallet')}>{t('View my wallet', 'Tan-awa akong wallet')}</Button>
      )}
      {(notice.notificationType === 'schedule' || notice.notificationType === 'reminder') && (
        <Button onPress={() => go('schedule')}>{t('View current schedule', 'Tan-awa ang kasamtangang iskedyul')}</Button>
      )}
    </>
  );
}

function Recovery() {
  const { phone, setPhone, t } = useDemo();
  const [value, setValue] = useState(phone);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return (
    <>
      <ScreenIntro
        icon={KeyRound}
        title={t('Recover your account', 'Irecover ang imong account')}
        subtitle={t(
          'Enter the mobile number linked to your beneficiary account.',
          'Isulod ang numero nga nalambigit sa imong beneficiary account.',
        )}
      />
      <PhoneField
        value={value}
        onChangeText={(s) => {
          setValue(s);
          setError('');
        }}
        error={error}
        editable={!sending}
      />
      <Notice>
        {t(
          'Verify access to your registered number with a six-digit code. If you no longer have that number, contact your barangay facilitator.',
          'I-verify ang imong rehistradong numero gamit ang unom ka numero nga code. Kon wala na nimo ang numero, kontaka ang imong barangay facilitator.',
        )}
      </Notice>
      <Button
        loading={sending}
        onPress={async () => {
          if (busy.current) return;
          if (!/^9\d{9}$/.test(value)) {
            setError(
              t(
                'Enter a 10-digit number starting with 9.',
                'Isulod ang 10 ka numero nga nagsugod sa 9.',
              ),
            );
            return;
          }
          busy.current = true;
          setSending(true);
          setError('');
          try {
            const result = await requestOtp(value, 'login');
            if (!active.current) return;
            setPhone(value);
            flow('otp', { intent: 'login', ...(result.developmentOtp ? { developmentOtp: result.developmentOtp } : {}) });
          } catch (caught) {
            if (active.current) setError(caught instanceof ApiRequestError ? caught.message
              : t('Could not request a code. Try again.', 'Wala makahangyo og code. Sulayi pag-usab.'));
          } finally {
            busy.current = false;
            if (active.current) setSending(false);
          }
        }}
      >
        {t('Send verification code', 'Ipadala ang verification code')}
      </Button>
      <Button variant="outline" icon={KeyRound} disabled={sending} onPress={() => router.push('/account/forgot-password')}>
        {t('Reset my password instead', 'I-reset hinuon ang password')}
      </Button>
      <Button variant="outline" onPress={() => router.replace('/flow/login')}>
        {t('Back to login', 'Balik sa login')}
      </Button>
    </>
  );
}
function EditProfile() {
  const { beneficiary, t } = useDemo();
  if (!beneficiary) {
    return (
      <>
        <Notice>{t('Sign in to edit your profile.', 'Pag-sign in para mausab ang imong profile.')}</Notice>
        <Button onPress={() => router.replace('/')}>{t('Go to sign in', 'Adto sa sign in')}</Button>
      </>
    );
  }
  return <ProfileForm key={beneficiary.id} beneficiary={beneficiary} />;
}

function profileFields(beneficiary: Beneficiary): ProfileUpdate {
  const { firstName, middleName, lastName, address, barangayId } = beneficiary;
  return { firstName, middleName, lastName, address, barangayId };
}

function ProfileForm({ beneficiary }: { beneficiary: Beneficiary }) {
  const { saveProfile, t } = useDemo();
  const [draft, setDraft] = useState(profileFields(beneficiary));
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [areaLoading, setAreaLoading] = useState(true);
  const [areaError, setAreaError] = useState(false);
  const [areaAttempt, setAreaAttempt] = useState(0);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => {
    let active = true;
    setAreaLoading(true);
    setAreaError(false);
    getBarangays().then((items) => { if (active) setBarangays(items); })
      .catch(() => { if (active) setAreaError(true); })
      .finally(() => { if (active) setAreaLoading(false); });
    return () => { active = false; };
  }, [areaAttempt]);
  const change = (field: keyof ProfileUpdate, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: false }));
    setSaved(false);
    setSaveError(false);
  };
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    setErrors({});
    try {
      const updated = await saveProfile(draft);
      if (updated) {
        setDraft(profileFields(updated));
        setSaved(true);
      }
    } catch (error) {
      setSaveError(true);
      if (error instanceof ApiRequestError && error.fields) {
        setErrors(Object.fromEntries(Object.keys(error.fields).map((field) => [field, true])));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const changed = (Object.keys(draft) as (keyof ProfileUpdate)[])
    .some((field) => (draft[field] ?? '') !== (beneficiary[field] ?? ''));
  const birthDate = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${beneficiary.birthDate}T00:00:00Z`));
  const sex = {
    female: t('Female', 'Babaye'),
    male: t('Male', 'Lalaki'),
    prefer_not_to_say: t('Prefer not to say', 'Dili isulti'),
  }[beneficiary.sex] ?? beneficiary.sex;
  return (
    <>
      <Badge tone={beneficiary.isVerified ? 'success' : 'warning'}>
        {beneficiary.isVerified
          ? t('Verified account', 'Naverify nga account')
          : t('Verification pending', 'Naghulat sa verification')}
      </Badge>
      <Card>
        {([
          { field: 'firstName', label: t('First name', 'Ngalan') },
          { field: 'middleName', label: t('Middle name (optional)', 'Tungang ngalan (opsyonal)') },
          { field: 'lastName', label: t('Last name', 'Apelyido') },
        ] as const).map(({ field, label }) => (
          <Field key={field} label={label} value={draft[field] ?? ''}
            onChangeText={(value) => change(field, value)} editable={!saving}
            autoCapitalize="words" maxLength={100}
            error={errors[field] ? t('Use letters and normal name punctuation, up to 100 characters.', 'Gamita ang mga letra ug hustong punctuation, hangtod 100 ka karakter.') : undefined}
          />
        ))}
        <Field label={t('House no. and street', 'Numero sa balay ug dalan')}
          value={draft.address} onChangeText={(value) => change('address', value)}
          editable={!saving} autoCapitalize="words" autoComplete="street-address" maxLength={500}
          error={errors.address ? t('Enter a complete address, 5–500 characters.', 'Isulod ang kompleto nga adres, 5–500 ka karakter.') : undefined}
        />
        {areaLoading ? <Txt variant="small">{t('Loading service areas…', 'Nag-load sa mga service area…')}</Txt> : areaError ? (
          <>
            <Notice tone="error">{t('Service areas could not be loaded. Your saved barangay will be kept.', 'Wala ma-load ang mga service area. Magpabilin ang imong natipig nga barangay.')}</Notice>
            <Button variant="outline" disabled={saving} onPress={() => setAreaAttempt((value) => value + 1)}>{t('Retry service areas', 'Sulayi pag-usab ang mga service area')}</Button>
          </>
        ) : (
          <>
            <BarangayPicker label={t('Barangay and city', 'Barangay ug siyudad')} areas={barangays}
              value={draft.barangayId} onChange={(id) => change('barangayId', id)} disabled={saving} showCity
              error={errors.barangayId ? t('Choose an active service area.', 'Pagpili og aktibong service area.') : undefined}
            />
            {!barangays.some((item) => item.id === draft.barangayId) && (
              <Notice>{t('Your saved barangay is not currently listed. It will be kept unless you choose another service area.', 'Wala sa listahan karon ang imong natipig nga barangay. Magpabilin kini gawas kon mopili ka og laing service area.')}</Notice>
            )}
          </>
        )}
      </Card>
      {saveError && <Notice tone="error">{Object.values(errors).some(Boolean)
        ? t('Check the highlighted fields and try saving again.', 'Susihon ang mga field ug sulayi pagtipig pag-usab.')
        : t('We could not confirm your changes. Check your connection and try again.', 'Wala namo makumpirma ang imong mga kausaban. Susihon ang koneksyon ug sulayi pag-usab.')}</Notice>}
      {saved && <Notice tone="success">{t('Your profile was saved.', 'Natipig na ang imong profile.')}</Notice>}
      <Button loading={saving} disabled={!changed} onPress={() => void save()}>{t('Save changes', 'Tipigi ang mga kausaban')}</Button>
      <Button variant="outline" disabled={saving} onPress={() => router.replace('/(tabs)/profile')}>{t('Back to Profile', 'Balik sa Profile')}</Button>
      <Card>
        <DetailRow label={t('Birth date', 'Petsa sa pagkatawo')} value={birthDate} />
        <DetailRow label={t('Sex', 'Sekso')} value={sex} />
        <DetailRow label={t('Mobile number', 'Numero sa cellphone')} value={beneficiary.contactNumber} />
        <DetailRow
          label={t('Account status', 'Kahimtang sa account')}
          value={beneficiary.status.charAt(0).toUpperCase() + beneficiary.status.slice(1)}
        />
      </Card>
      <Notice>
        {t(
          'Mobile-number changes need separate verification. For birth date or sex corrections, contact your facilitator.',
          'Ang pag-usab sa numero kinahanglan og laing verification. Para sa koreksyon sa petsa sa pagkatawo o sekso, kontaka ang facilitator.',
        )}
      </Notice>
    </>
  );
}
function Password() {
  const { beneficiary, t } = useDemo();
  return (
    <>
      <ScreenIntro
        icon={ShieldCheck}
        title={t('Secure your account', 'Siguroha ang imong account')}
        subtitle={t(
          'GarantiyAid signs you in with a one-time code sent to your registered mobile number.',
          'Ang GarantiyAid mogamit og one-time code nga ipadala sa imong rehistradong numero aron makasulod.',
        )}
      />
      <Card>
        <DetailRow icon={Smartphone} label={t('Sign-in method', 'Paagi sa pagsulod')} value={t('Mobile number + 6-digit code', 'Numero + 6 ka numero nga code')} />
        <DetailRow icon={KeyRound} label={t('Password', 'Password')} value={beneficiary?.hasPassword ? t('Set', 'Naa na') : t('Not set yet', 'Wala pa')} />
      </Card>
      <Notice>
        {t(
          'You can always sign in with a code. A password is optional and lets you sign in without waiting for a code.',
          'Makasulod ka gihapon gamit ang code. Opsyonal ang password ug makasulod ka nga dili maghulat og code.',
        )}
      </Notice>
      <Button icon={KeyRound} onPress={() => router.push('/account/password')}>
        {t('Set or change password', 'Paghimo o usba ang password')}
      </Button>
      <Button variant="outline" onPress={() => router.push('/account/forgot-password')}>
        {t('Forgot password', 'Nakalimot sa password')}
      </Button>
    </>
  );
}
function EnrollmentStatus() {
  const { overview, overviewLoading, overviewError, refreshOverview, t } = useDemo();
  if (overviewLoading) {
    return <LoadingSkeleton label={t('Loading your enrollment…', 'Nag-load sa imong enrollment…')} />;
  }
  if (overviewError) {
    return (
      <>
        <Notice tone="error">
          {t('Your enrollment could not be loaded.', 'Wala ma-load ang imong enrollment.')}
        </Notice>
        <Button onPress={() => void refreshOverview()}>{t('Try again', 'Sulayi pag-usab')}</Button>
      </>
    );
  }
  const enrollments = overview?.enrollments ?? [];
  if (enrollments.length === 0) {
    return (
      <>
        <Notice>
          {t(
            'No program enrollment is recorded for your account yet.',
            'Wala pay program enrollment nga narehistro sa imong account.',
          )}
        </Notice>
        <Button variant="outline" onPress={() => go('support')}>
          {t('Contact facilitator', 'Kontaka ang facilitator')}
        </Button>
        <Button variant="outline" onPress={() => void refreshOverview()}>
          {t('Refresh status', 'I-refresh ang status')}
        </Button>
      </>
    );
  }
  return (
    <>
      {enrollments.map((enrollment) => {
        const approved = enrollment.status === 'approved' || enrollment.status === 'active';
        const rejected = enrollment.status === 'rejected';
        const statusLabels: Record<string, string> = {
          pending: t('Pending', 'Naghulat'),
          for_validation: t('For validation', 'Alang sa validation'),
          needs_correction: t('Needs correction', 'Kinahanglan og pagtul-id'),
          approved: t('Approved', 'Giaprobahan'), active: t('Active', 'Aktibo'),
          rejected: t('Rejected', 'Gisalikway'), suspended: t('Suspended', 'Gisuspenso'),
          withdrawn: t('Withdrawn', 'Gibawi'),
        };
        return (
          <Card key={enrollment.id}>
            <View
              style={[
                styles.row,
                { justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
              ]}
            >
              <View style={[styles.row, { flex: 1, minWidth: 160 }]}>
                <IconCircle icon={BookOpen} size={40} square tone={approved ? 'green' : rejected ? 'error' : 'amber'} />
                <Txt variant="label" style={{ flex: 1 }}>
                  {enrollment.program.name}
                </Txt>
              </View>
              <Badge tone={approved ? 'success' : rejected ? 'error' : 'warning'}>
                {statusLabels[enrollment.status] ?? formatStatus(enrollment.status)}
              </Badge>
            </View>
            <DetailRow
              label={t('Program code', 'Code sa programa')}
              value={enrollment.program.code}
            />
            <DetailRow
              label={t('Enrollment date', 'Petsa sa enrollment')}
              value={formatDate(enrollment.enrollmentDate)}
            />
            <DetailRow
              label={t('Grant amount', 'Kantidad sa ayuda')}
              value={enrollment.program.grantAmount == null
                ? t('Not specified', 'Wala gitakda') : peso(enrollment.program.grantAmount)}
            />
            {enrollment.program.description ? <Txt variant="small">{enrollment.program.description}</Txt> : null}
            {enrollment.reviewNotes ? (
              <View style={{ gap: 4 }}>
                <Txt variant="label">{t('Staff feedback', 'Feedback sa staff')}</Txt>
                <Txt>{enrollment.reviewNotes}</Txt>
              </View>
            ) : null}
            {enrollment.reviewedAt ? (
              <DetailRow label={t('Reviewed', 'Girepaso')} value={formatDateTime(enrollment.reviewedAt)} />
            ) : null}
          </Card>
        );
      })}
      <Notice>
        {t(
          'These statuses come from your saved program enrollment records.',
          'Kini nga mga status gikan sa imong natipig nga program enrollment records.',
        )}
      </Notice>
      <Button variant="outline" onPress={() => go('support')}>
        {t('Contact DSWD', 'Kontaka ang DSWD')}
      </Button>
      <Button variant="outline" onPress={() => void refreshOverview()}>
        {t('Refresh status', 'I-refresh ang status')}
      </Button>
    </>
  );
}
function EnrollmentDocuments() {
  const { beneficiary, t } = useDemo();
  if (!beneficiary) return (
    <>
      <Notice>{t('Sign in to view your documents.', 'Pag-sign in para makita ang imong mga dokumento.')}</Notice>
      <Button onPress={() => router.replace('/')}>{t('Go to sign in', 'Adto sa sign in')}</Button>
    </>
  );
  return <DocumentUploads key={beneficiary.id} />;
}

function DocumentUploads() {
  const { documents, documentsLoading, documentsError, refreshDocuments, submitDocument, t } = useDemo();
  const [viewing, setViewing] = useState<BeneficiaryDocument | null>(null);
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [docType, setDocType] = useState<DocumentType>('proof_of_residency');
  const [documentName, setDocumentName] = useState('');
  const [moreCategories, setMoreCategories] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<BeneficiaryDocument | null>(null);
  const [replacing, setReplacing] = useState<BeneficiaryDocument | null>(null);
  const busyRef = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    void refreshDocuments();
    return () => { active.current = false; };
  }, []);
  const commonTypes: DocumentType[] = ['proof_of_residency', 'valid_id', 'other'];
  const extraTypes: DocumentType[] = ['birth_certificate', 'barangay_certificate', 'medical_certificate', 'pwd_id', 'senior_citizen_id'];
  const types = !IS_SHARED_BACKEND ? commonTypes : moreCategories ? [...commonTypes, ...extraTypes]
    : [...commonTypes, ...(commonTypes.includes(docType) ? [] : [docType])];
  const categories = types.map(value => ({ value, label: formatDocumentType(value, t) }));
  const pick = async () => {
    if (busyRef.current) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        multiple: false,
        copyToCacheDirectory: true,
        base64: false,
      });
      if (active.current && !result.canceled) {
        const selected = result.assets[0];
        setUploaded(null);
        setFile(null);
        if ((selected.size ?? 0) > MAX_DOCUMENT_BYTES) {
          setErrorCode('DOCUMENT_TOO_LARGE');
          return;
        }
        setFile(selected);
        setErrorCode('');
      }
    } catch {
      if (active.current) setErrorCode('SELECTION_FAILED');
    }
  };
  const upload = async () => {
    if (!file || busyRef.current) return;
    if (IS_SHARED_BACKEND && docType === 'other' && !replacing && !documentName.trim()) { setErrorCode('DOCUMENT_NAME_REQUIRED'); return; }
    busyRef.current = true;
    setBusy(true);
    setErrorCode('');
    setUploaded(null);
    try {
      const saved = await submitDocument(file, docType, replacing?.id, docType === 'other' ? documentName.trim() || undefined : undefined);
      if (active.current && saved) {
        setUploaded(saved);
        setFile(null);
        setReplacing(null);
      }
    } catch (error) {
      if (active.current) setErrorCode(error instanceof ApiRequestError ? error.code : 'UPLOAD_FAILED');
    } finally {
      busyRef.current = false;
      if (active.current) setBusy(false);
    }
  };
  const errorMessage = errorCode === 'DOCUMENT_NAME_REQUIRED'
    ? t('Enter the document name requested by staff, or choose it from a program checklist.', 'Isulat ang ngalan sa dokumento nga gipangayo sa staff, o pilia gikan sa checklist.')
    : errorCode === 'DOCUMENT_NAME_TOO_LONG'
      ? t('Use a requested document name up to 150 characters.', 'Gamita ang ngalan nga hangtod 150 ka karakter.')
      : errorCode === 'DOCUMENT_NAME_MISMATCH'
        ? t('A correction must keep the original requested document name. Refresh your documents.', 'Kinahanglang pareho ang orihinal nga ngalan sa dokumento sa pagtul-id. I-refresh ang mga dokumento.')
        : errorCode === 'DOCUMENT_TOO_LARGE' || errorCode === 'PAYLOAD_TOO_LARGE'
    ? t('Choose a file up to 5 MB.', 'Pagpili og file nga hangtod 5 MB.')
    : errorCode === 'UNSUPPORTED_FILE_TYPE' || errorCode === 'FILE_TYPE_MISMATCH' || errorCode === 'INVALID_DOCUMENT_CONTENT'
      ? t('Choose a valid PDF, JPEG, or PNG file with the matching extension.', 'Pagpili og hustong PDF, JPEG, o PNG nga file nga sakto ang extension.')
      : errorCode === 'EMPTY_DOCUMENT'
        ? t('The file is empty. Choose another file.', 'Walay sulod ang file. Pagpili og lain.')
        : errorCode === 'SELECTION_FAILED' || errorCode === 'FILE_UNREADABLE'
          ? t('The file could not be read. Choose it again.', 'Dili mabasa ang file. Pilia kini pag-usab.')
          : errorCode === 'INVALID_FILE_NAME'
            ? t('Choose a file with a simple name, up to 255 characters.', 'Pagpili og file nga yano ang ngalan, hangtod 255 ka karakter.')
            : errorCode === 'DOCUMENT_STATUS_CHANGED' || errorCode === 'DOCUMENT_NOT_REPLACEABLE'
              ? t('The document status changed. Refresh your documents before uploading a correction.', 'Nausab ang kahimtang sa dokumento. I-refresh ang listahan sa dili pa mag-upload og pagtul-id.')
              : t('The upload could not be confirmed. Check your connection and try again.', 'Wala makumpirma ang upload. Susihon ang koneksyon ug sulayi pag-usab.');
  return (
    <>
      <Notice>
        {t(
          'Upload a document requested by your facilitator. PDF, JPEG, or PNG, up to 5 MB. Receiving a file does not approve your enrollment.',
          'I-upload ang dokumento nga gipangayo sa facilitator. PDF, JPEG, o PNG, hangtod 5 MB. Ang pagdawat sa file dili pag-apruba sa enrollment.',
        )}
      </Notice>
      {replacing ? <>
        <Notice>{t('Correcting: ', 'Gitul-id: ')}{replacing.originalName}{'\n'}{t('Choose the corrected file below. It will be sent for another staff review.', 'Pilia ang gitul-id nga file sa ubos. Ipadala kini alang sa laing review sa staff.')}</Notice>
        <Button variant="outline" disabled={busy} onPress={() => { setReplacing(null); setFile(null); setErrorCode(''); setDocType('proof_of_residency'); setDocumentName(''); }}>
          {t('Cancel correction', 'Kanselaha ang pagtul-id')}
        </Button>
      </> : <>
      <DocumentChecklist disabled={busy} onChoose={requirement => { setDocType(requirement.docType); setDocumentName(requirement.documentName ?? ''); setMoreCategories(false); setUploaded(null); setErrorCode(''); }} />
      <Txt variant="label">{t('Document category', 'Klase sa dokumento')}</Txt>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('Document category', 'Klase sa dokumento')} style={{ gap: 8 }}>
        {categories.map((category) => (
          <Pressable key={category.value} accessibilityRole="radio" disabled={busy}
            accessibilityState={{ checked: docType === category.value, disabled: busy }}
            onPress={() => { if (category.value !== docType) setDocumentName(''); setDocType(category.value); setMoreCategories(false); setUploaded(null); }}
            style={[styles.input, styles.row, { gap: 8 }, docType === category.value && { borderColor: c.primary, backgroundColor: c.primarySoft }]}
          >
            {docType === category.value && <Check size={18} color={c.primary} />}
            <Txt style={{ flex: 1 }}>{category.label}</Txt>
          </Pressable>
        ))}
      </View>
      {IS_SHARED_BACKEND && <Button variant="outline" disabled={busy} onPress={() => setMoreCategories(!moreCategories)}>
        {moreCategories ? t('Show fewer categories', 'Ipakita ang mas diyutay nga klase') : t('More document categories', 'Dugang nga klase sa dokumento')}
      </Button>}
      </>}
      {IS_SHARED_BACKEND && docType === 'other' && <Field label={t('Requested document name', 'Ngalan sa gipangayong dokumento')}
        value={documentName} onChangeText={value => { setDocumentName(value); setUploaded(null); }} maxLength={150} editable={!busy && !replacing}
        placeholder={t('Use the exact name provided by staff', 'Gamita ang eksaktong ngalan gikan sa staff')} />}
      {file && <Card>
        <Txt variant="label">{file.name}</Txt>
        <Txt variant="small">{file.size === undefined ? t('Size will be checked before upload.', 'Susihon ang gidak-on sa dili pa i-upload.') : `${(file.size / 1024).toFixed(1)} KB`}</Txt>
      </Card>}
      {errorCode ? <Notice tone="error">{errorMessage}</Notice> : null}
      {uploaded && (
        <Notice tone="success">
          {t('Upload confirmed: ', 'Nakumpirma ang upload: ')}{uploaded.originalName}
        </Notice>
      )}
      <Button variant="outline" icon={FileText} disabled={busy} onPress={() => void pick()}>
        {file ? t('Choose another file', 'Pagpili og laing file') : t('Choose document', 'Pagpili og dokumento')}
      </Button>
      <Button loading={busy} disabled={!file} onPress={() => void upload()}>
        {busy ? t('Uploading document…', 'Gi-upload ang dokumento…') : t('Upload document', 'I-upload ang dokumento')}
      </Button>
      <Txt variant="heading">{t('Uploaded documents', 'Mga na-upload nga dokumento')}</Txt>
      {(documentsLoading || (documents === null && !documentsError)) && <Notice>{t('Loading your documents…', 'Nag-load sa imong mga dokumento…')}</Notice>}
      {documentsError && <Notice tone="error">{t('Your document list could not be loaded. Try refreshing it.', 'Wala ma-load ang listahan sa dokumento. Sulayi ang refresh.')}</Notice>}
      {!documentsLoading && !documentsError && documents?.length === 0 && <Notice>{t('No documents uploaded yet.', 'Wala pay na-upload nga dokumento.')}</Notice>}
      {(documents ?? []).map((document) => (
        <Card key={document.id}>
          <Txt variant="label">{document.originalName}</Txt>
          <Txt variant="small">{document.documentName ?? formatDocumentType(document.docType, t)}</Txt>
          <Txt variant="small">{`${(document.sizeBytes / 1024).toFixed(1)} KB · ${formatDateTime(document.createdAt)}`}</Txt>
          <Badge tone={document.status === 'verified' || document.status === 'accepted' ? 'success' : document.status === 'rejected' ? 'error' : 'warning'}>
            {document.status === 'received' ? t('Received · awaiting staff review', 'Nadawat · naghulat sa review sa staff')
              : document.status === 'accepted' || document.status === 'verified' ? t('Accepted', 'Gidawat')
                : document.status === 'rejected' ? t('Rejected · correction needed', 'Gisalikway · kinahanglan tul-iron')
                  : document.status === 'superseded' ? t('Replaced by a corrected document', 'Napulihan sa gitul-id nga dokumento') : formatStatus(document.status)}
          </Badge>
          {document.reviewedAt && <Txt variant="small">{t('Reviewed: ', 'Gi-review: ')}{formatDateTime(document.reviewedAt)}</Txt>}
          {document.reviewNotes && <Notice tone={document.status === 'rejected' ? 'error' : 'info'}>{t('Staff feedback: ', 'Tubag sa staff: ')}{document.reviewNotes}</Notice>}
          <Button variant="outline" disabled={busy} onPress={() => setViewing(document)}>{t('View saved document', 'Tan-awa ang natipig nga dokumento')}</Button>
          {document.canReplace && <Button variant="outline" disabled={busy} onPress={() => {
            setReplacing(document); setDocType(document.docType); setDocumentName(document.documentName ?? ''); setFile(null); setUploaded(null); setErrorCode('');
          }}>{t('Upload corrected document', 'I-upload ang gitul-id nga dokumento')}</Button>}
        </Card>
      ))}
      <Button variant="outline" loading={documentsLoading} disabled={busy} onPress={() => void refreshDocuments()}>{t('Refresh documents', 'I-refresh ang mga dokumento')}</Button>
      {viewing && <DocumentPreview key={viewing.id} document={viewing} onClose={() => setViewing(null)} />}
      <Button variant="outline" onPress={() => go('enrollment-status')}>
        {t('View application status', 'Tan-awa ang kahimtang')}
      </Button>
    </>
  );
}
function Privacy() { return <BiometricPrivacy />; }

function Exception({ kind }: { kind: 'schedule' | 'expired' }) {
  const { t } = useDemo();
  const definitions = {
    schedule: {
      badge: t('Rescheduled', 'Nausab ang iskedyul'),
      title: t('Your claiming schedule changed', 'Nausab ang iskedyul sa pag-claim'),
      body: t(
        'This sample shows how a schedule update will appear. Your assigned time is displayed below.',
        'Kini nga sample nagpakita sa nausab nga iskedyul. Tan-awa ang oras sa ubos.',
      ),
      tone: 'warning' as const,
    },
    expired: {
      badge: t('EXPIRED', 'EXPIRED'),
      title: t('This QR pass has expired', 'Na-expire na ang QR pass'),
      body: t(
        'Request a new pass or ask staff for help. This is a preview of the expired state.',
        'Paghangyo og bag-ong pass o tabang sa staff. Preview kini sa expired nga pass.',
      ),
      tone: 'error' as const,
    },
  };
  const item = definitions[kind];
  return (
    <>
      <ScreenIntro icon={kind === 'schedule' ? CalendarDays : QrCode} tone={kind === 'schedule' ? 'amber' : 'error'} size={60} title={item.title} />
      <View style={{ alignItems: 'center' }}>
        <Badge tone={item.tone}>{item.badge}</Badge>
      </View>
      <Notice tone={item.tone}>{item.body}</Notice>
      {kind === 'schedule' && (
        <Card>
          <DetailRow icon={CalendarDays} label={t('Date', 'Petsa')} value={a.date} />
          <DetailRow icon={Clock3} label={t('Time', 'Oras')} value={a.time} />
          <DetailRow icon={MapPin} label={t('Venue', 'Lugar')} value={a.venue} />
        </Card>
      )}
      <Button onPress={() => (kind === 'schedule' ? go('schedule') : go('support'))}>
        {kind === 'schedule'
          ? t('View updated schedule', 'Tan-awa ang iskedyul')
          : t('Contact staff', 'Kontaka ang staff')}
      </Button>
      <Button variant="outline" onPress={() => go('qr-pass')}>
        {t('Back to QR pass', 'Balik sa QR pass')}
      </Button>
    </>
  );
}
function Support() { return <SupportContent />; }
function FaceLogin() {
  const { t } = useDemo();
  return (
    <>
      <ScreenIntro
        icon={ScanFace}
        tone="neutral"
        title={t('Login with Face', 'Log in pinaagi sa Nawong')}
        subtitle={t('Not available yet', 'Dili pa magamit')}
      />
      <Notice>
        {t(
          'Face login requires the biometric service and authentication API. Use the demo phone login to explore the app.',
          'Kinahanglan ang biometric service ug authentication API. Gamita ang demo phone login aron masulayan ang app.',
        )}
      </Notice>
      <Button icon={Smartphone} onPress={() => router.replace('/flow/login')}>
        {t('Use phone number', 'Gamita ang numero')}
      </Button>
    </>
  );
}

const enrollmentLabels = (t: (en: string, bs: string) => string): Record<string, string> => ({
  pending: t('Pending', 'Naghulat'),
  for_validation: t('For validation', 'Alang sa validation'),
  needs_correction: t('Needs correction', 'Kinahanglan og pagtul-id'),
  approved: t('Approved', 'Giaprobahan'),
  active: t('Active', 'Aktibo'),
  rejected: t('Rejected', 'Gisalikway'),
  suspended: t('Suspended', 'Gisuspenso'),
  withdrawn: t('Withdrawn', 'Gibawi'),
});

/** Programs this beneficiary is enrolled in. The backend does not publish a general program catalog yet. */
function Programs() {
  const { overview, overviewLoading, overviewError, refreshOverview, t } = useDemo();
  const [filter, setFilter] = useState<'all' | 'active' | 'review'>('all');
  const [query, setQuery] = useState('');
  if (overviewLoading && !overview) return <LoadingSkeleton label={t('Loading your programs…', 'Nag-load sa imong mga programa…')} />;
  if (overviewError)
    return (
      <>
        <Notice tone="error">{t('Your programs could not be loaded.', 'Wala ma-load ang imong mga programa.')}</Notice>
        <Button onPress={() => void refreshOverview()}>{t('Try again', 'Sulayi pag-usab')}</Button>
      </>
    );
  const labels = enrollmentLabels(t);
  const enrollments = overview?.enrollments ?? [];
  const isActive = (status: string) => status === 'approved' || status === 'active';
  const visible = enrollments.filter((item) => {
    if (filter === 'active' && !isActive(item.status)) return false;
    if (filter === 'review' && isActive(item.status)) return false;
    const text = `${item.program.name} ${item.program.code} ${item.program.description ?? ''}`.toLocaleLowerCase();
    return text.includes(query.trim().toLocaleLowerCase());
  });
  return (
    <>
      <Txt style={{ color: c.muted }}>
        {t(
          'Government assistance programs linked to your beneficiary account.',
          'Mga programa sa ayuda nga nalambigit sa imong beneficiary account.',
        )}
      </Txt>
      {enrollments.length > 3 && (
        <Field
          label={t('Search programs', 'Pangitaa ang programa')}
          value={query}
          onChangeText={setQuery}
          icon={Search}
          placeholder={t('Program name or code', 'Ngalan o code sa programa')}
        />
      )}
      <View accessibilityRole="tablist" style={[styles.row, { gap: 8, flexWrap: 'wrap' }]}>
        <Chip label={t('All', 'Tanan')} selected={filter === 'all'} count={enrollments.length} onPress={() => setFilter('all')} />
        <Chip label={t('Active', 'Aktibo')} selected={filter === 'active'} onPress={() => setFilter('active')} />
        <Chip label={t('In review', 'Gisusi')} selected={filter === 'review'} onPress={() => setFilter('review')} />
      </View>
      {visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={enrollments.length ? t('No matching programs', 'Walay katugbang nga programa') : t('No programs yet', 'Wala pay programa')}
          body={t(
            'Programs appear here after a facilitator enrolls you. Contact staff if you expected to see one.',
            'Makita dinhi ang programa human ka i-enroll sa facilitator. Kontaka ang staff kon naa kay gipaabot.',
          )}
        >
          <Button variant="outline" onPress={() => go('support')}>{t('Contact staff', 'Kontaka ang staff')}</Button>
        </EmptyState>
      ) : (
        visible.map((enrollment) => {
          const active = isActive(enrollment.status);
          const rejected = enrollment.status === 'rejected';
          return (
            <Pressable
              key={enrollment.id}
              accessibilityRole="button"
              accessibilityLabel={`${enrollment.program.name}. ${labels[enrollment.status] ?? formatStatus(enrollment.status)}`}
              onPress={() => go('enrollment-status')}
            >
              <Card style={{ gap: 12 }}>
                <View style={[styles.row, { alignItems: 'flex-start' }]}>
                  <IconCircle icon={BookOpen} size={46} square tone={active ? 'green' : rejected ? 'error' : 'amber'} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Txt variant="label">{enrollment.program.name}</Txt>
                    <Txt variant="small">{enrollment.program.code}</Txt>
                  </View>
                  <Badge tone={active ? 'success' : rejected ? 'error' : 'warning'}>
                    {labels[enrollment.status] ?? formatStatus(enrollment.status)}
                  </Badge>
                </View>
                {enrollment.program.description ? (
                  <Txt variant="small" numberOfLines={3}>{enrollment.program.description}</Txt>
                ) : null}
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Txt variant="small">{t('Grant amount', 'Kantidad sa ayuda')}</Txt>
                  <Txt variant="label">
                    {enrollment.program.grantAmount == null ? t('Not specified', 'Wala gitakda') : peso(enrollment.program.grantAmount)}
                  </Txt>
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
      <Notice>
        {t(
          'A public catalog of all programs is not available yet. This list shows only your saved enrollments.',
          'Wala pay publikong listahan sa tanang programa. Kini nga listahan nagpakita lamang sa imong natipig nga enrollment.',
        )}
      </Notice>
      <Button variant="ghost" loading={overviewLoading} onPress={() => void refreshOverview()}>
        {t('Refresh programs', 'I-refresh ang mga programa')}
      </Button>
    </>
  );
}

/** Registered → enrollment approved → scheduled → claimed, from saved records only. */
function ClaimStatus() {
  const { beneficiary, overview, overviewLoading, overviewError, refreshOverview, wallet, walletLoading, walletError, refreshWallet, t } = useDemo();
  const loading = (overviewLoading && !overview) || (walletLoading && !wallet);
  const steps = claimProgress(t, beneficiary, overview, wallet);
  const current = wallet?.currentClaim;
  return (
    <>
      <ScreenIntro
        icon={ListChecks}
        tone="green"
        size={60}
        title={t('Your claim progress', 'Pag-uswag sa imong claim')}
        subtitle={t('Each step updates when staff save a decision.', 'Ma-update ang matag lakang kon motipig ang staff og desisyon.')}
      />
      {loading ? (
        <LoadingSkeleton label={t('Loading your claim status…', 'Nag-load sa kahimtang sa claim…')} lines={4} />
      ) : (
        <Card>
          <Timeline steps={steps} />
        </Card>
      )}
      {(overviewError || walletError) && (
        <>
          <Notice tone="error">
            {t(
              'Some records could not be loaded, so later steps may be missing. Try again.',
              'Pipila ka rekord wala ma-load, busa basin kulang ang ubang lakang. Sulayi pag-usab.',
            )}
          </Notice>
        </>
      )}
      {current ? (
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }]}>
            <Txt variant="label" style={{ flexShrink: 1 }}>{current.program.name}</Txt>
            <Badge tone={['claimed', 'completed'].includes(current.status) ? 'success' : ['rejected', 'voided'].includes(current.status) ? 'error' : 'warning'}>
              {formatClaimStatus(current.status, t, current.deliveryMode)}
            </Badge>
          </View>
          <KeyValue label={t('Schedule', 'Iskedyul')} value={formatDate(current.date)} />
          <KeyValue label={t('Recorded value', 'Narekord nga kantidad')} value={peso(current.amount)} />
          {current.receipt ? <KeyValue label={t('Receipt number', 'Numero sa resibo')} value={current.receipt.number} /> : null}
        </Card>
      ) : null}
      <Button
        variant="outline"
        loading={overviewLoading || walletLoading}
        onPress={() => { void refreshOverview(); void refreshWallet(); }}
      >
        {t('Refresh status', 'I-refresh ang status')}
      </Button>
      <Button variant="ghost" icon={FileText} onPress={() => go('transactions')}>
        {t('View transaction history', 'Tan-awa ang kasaysayan')}
      </Button>
    </>
  );
}
