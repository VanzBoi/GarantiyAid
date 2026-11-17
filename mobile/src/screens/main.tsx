import { BiometricSummary } from './biometrics';
import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Clock3,
  FileText,
  History,
  Info,
  Languages,
  KeyRound,
  ListChecks,
  LogOut,
  Mail,
  ScanLine,
  MapPin,
  Plus,
  QrCode,
  Receipt as ReceiptIcon,
  ScanFace,
  Send,
  Share2,
  ShieldCheck,
  UserRound,
  Wallet as WalletIcon,
} from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  ConfirmationModal,
  DetailRow,
  Divider,
  EmptyState,
  flow,
  go,
  GradientCard,
  IconCircle,
  KeyValue,
  LanguageToggle,
  LoadingSkeleton,
  MenuRow,
  Notice,
  NotificationCard,
  Page,
  ProfileAvatar,
  QuickAction,
  SectionHeader,
  SheetModal,
  styles,
  Timeline,
  TransactionCard,
  Txt,
  type TimelineStep,
} from '../components';
import { peso, signedPeso, useDemo } from '../state';
import {
  ApiRequestError,
  logout,
  type Beneficiary,
  type BeneficiaryOverview,
  type ClaimRecord,
  type CurrentClaim,
  type WalletOverview,
  type WalletTransaction,
} from '../api';
import {
  formatDate,
  formatDateTime,
  formatQueueNumber,
  formatStatus,
  formatTimeSlot,
  formatClaimStatus,
  formatTransactionType,
  transactionSource,
} from '../format';
import { colors as c, fonts } from '../theme';

type Translate = (en: string, bs: string) => string;

/**
 * Claim progress derived only from saved records: the account, enrollment decisions,
 * the published schedule, and staff-recorded claims. Nothing is marked complete without a record.
 */
export function claimProgress(
  t: Translate,
  beneficiary: Beneficiary | null | undefined,
  overview: BeneficiaryOverview | null | undefined,
  wallet: WalletOverview | null | undefined,
): TimelineStep[] {
  const enrollments = overview?.enrollments ?? [];
  const approved = enrollments.find((item) => item.status === 'approved' || item.status === 'active');
  const blocked = enrollments.find((item) => ['rejected', 'suspended', 'withdrawn'].includes(item.status));
  const pending = enrollments.find((item) => !approved && !blocked && item.status);
  const schedule = overview?.nextSchedule;
  const current = wallet?.currentClaim;
  // The current claim defines this cycle; history only applies when no claim is in progress.
  // 'claimed' (shared backend) and 'completed' (standalone backend) both mean assistance was received.
  const isDone = (status: string) => status === 'claimed' || status === 'completed';
  const claimed = current
    ? isDone(current.status) ? current : undefined
    : schedule ? undefined : wallet?.claims?.find((claim) => isDone(claim.status));
  const inProgress = current && ['pending', 'verified'].includes(current.status);
  const registered = !!beneficiary || !!overview;
  return [
    {
      label: t('Registered', 'Narehistro'),
      caption: registered ? t('Beneficiary account created', 'Nahimo ang beneficiary account') : t('Account not loaded', 'Wala ma-load ang account'),
      state: registered ? 'done' : 'current',
    },
    {
      label: t('Enrollment approved', 'Naaprobahan ang enrollment'),
      caption: approved
        ? approved.program.name
        : blocked
          ? `${blocked.program.name} · ${formatStatus(blocked.status)}`
          : pending
            ? `${pending.program.name} · ${formatStatus(pending.status)}`
            : t('No enrollment recorded yet', 'Wala pay enrollment nga narekord'),
      state: approved || claimed ? 'done' : blocked ? 'blocked' : pending ? 'current' : 'todo',
    },
    {
      label: t('Scheduled', 'Naka-iskedyul'),
      caption: schedule
        ? `${formatDate(schedule.date)} · ${formatTimeSlot(schedule.slotStart, schedule.slotEnd)}`
        : current
          ? formatDate(current.date)
          : t('Waiting for a published schedule', 'Naghulat sa gipatik nga iskedyul'),
      state: schedule || current || claimed ? 'done' : approved ? 'current' : 'todo',
    },
    {
      label: t('Claimed', 'Na-claim'),
      caption: claimed
        ? claimed.claimedAt
          ? formatDateTime(claimed.claimedAt)
          : formatClaimStatus(claimed.status, t, claimed.deliveryMode)
        : inProgress
          ? formatClaimStatus(current!.status, t, current!.deliveryMode)
          : t('Recorded by staff at the distribution', 'Irekord sa staff sa distribution'),
      state: claimed ? 'done' : inProgress || schedule ? 'current' : 'todo',
    },
  ];
}

function greeting(t: Translate) {
  const hour = new Date().getHours();
  if (hour < 12) return t('Good morning,', 'Maayong buntag,');
  if (hour < 18) return t('Good afternoon,', 'Maayong hapon,');
  return t('Good evening,', 'Maayong gabii,');
}

export function HomeScreen() {
  const {
    name,
    beneficiary,
    faceEnrolled,
    overview,
    overviewLoading,
    overviewError,
    refreshOverview,
    wallet,
    notifications,
    t,
  } = useDemo();
  const schedule = overview?.nextSchedule;
  const unread = notifications.some((notice) => !notice.readAt);
  const recent = notifications.slice(0, 2);
  const steps = claimProgress(t, beneficiary, overview, wallet);
  return (
    <Page tabs header={false}>
      <GradientCard style={{ gap: 14 }}>
        <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }]}>
          <Txt variant="caption" style={{ color: '#D9E6FF', letterSpacing: 1.5 }}>GARANTIYAID</Txt>
          <LanguageToggle light />
        </View>
        <View style={[styles.row, { gap: 12 }]}>
          <ProfileAvatar name={name} size={52} light verified={!!beneficiary?.isVerified} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="small" style={{ color: '#D9E6FF' }}>
              {greeting(t)}
            </Txt>
            <Txt variant="heading" numberOfLines={2} style={{ color: c.onPrimary }}>
              {name}
            </Txt>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unread
                ? t('Open notifications, unread messages', 'Ablihi ang pahibalo, adunay wala pa mabasa')
                : t('Open notifications', 'Ablihi ang pahibalo')
            }
            onPress={() => go('notifications')}
            style={({ pressed }) => [s.bell, pressed && { opacity: 0.8 }]}
          >
            <Bell size={22} color={c.onPrimary} />
            {unread && <View style={s.unreadDot} />}
          </Pressable>
        </View>
        <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }]}>
          {beneficiary ? (
            <Badge tone="light">
              {beneficiary.isVerified
                ? t('Verified beneficiary', 'Naverify nga benepisyaryo')
                : t('Verification pending', 'Naghulat sa verification')}
            </Badge>
          ) : (
            <View />
          )}
        </View>
      </GradientCard>

      <SectionHeader
        title={t('Upcoming claim', 'Umaabot nga claim')}
        action={schedule ? t('Details', 'Detalye') : undefined}
        onAction={() => go('schedule')}
      />
      {overviewLoading ? (
        <LoadingSkeleton label={t('Loading your schedule…', 'Nag-load sa imong iskedyul…')} />
      ) : overviewError ? (
        <>
          <Notice tone="error">
            {t('Your enrollment and schedule could not be loaded.', 'Wala ma-load ang imong enrollment ug iskedyul.')}
          </Notice>
          <Button variant="outline" onPress={() => void refreshOverview()}>
            {t('Try again', 'Sulayi pag-usab')}
          </Button>
        </>
      ) : schedule ? (
        <Card style={{ gap: 18, borderColor: c.primaryTint }}>
          <View style={[styles.row, { alignItems: 'flex-start' }]}>
            <View style={s.dateBlock}>
              <Txt variant="small" style={{ color: c.primary, fontFamily: fonts.semibold, fontSize: 12 }}>
                {new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' })
                  .format(new Date(`${schedule.date}T00:00:00Z`))
                  .toUpperCase()}
              </Txt>
              <Txt variant="heading" style={{ color: c.primary, fontSize: 24, lineHeight: 28 }}>
                {schedule.date.slice(8, 10)}
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="label" numberOfLines={2}>
                {schedule.program.name}
              </Txt>
              <Txt variant="small">{formatDate(schedule.date)}</Txt>
              <Badge tone="info">{formatStatus(schedule.status)}</Badge>
            </View>
          </View>
          <View style={s.scheduleFacts}>
            <View style={[styles.row, { gap: 10 }]}>
              <Clock3 size={18} color={c.primary} />
              <Txt variant="small" style={{ color: c.text, flex: 1 }}>
                {formatTimeSlot(schedule.slotStart, schedule.slotEnd)}
              </Txt>
            </View>
            <View style={[styles.row, { gap: 10 }]}>
              <MapPin size={18} color={c.primary} />
              <Txt variant="small" style={{ color: c.text, flex: 1 }}>
                {schedule.location}
              </Txt>
            </View>
          </View>
          <View style={s.queuePanel}>
            <View style={{ gap: 2 }}>
              <Txt variant="caption" style={{ color: c.primary }}>
                {t('QUEUE NUMBER', 'NUMERO SA PILA')}
              </Txt>
              <Txt variant="number" style={{ color: c.navy }}>
                {formatQueueNumber(schedule.queueNumber)}
              </Txt>
            </View>
            <View style={s.queueIcon}><QrCode size={30} color={c.primary} /></View>
          </View>
          <Button icon={QrCode} onPress={() => go('qr-pass')}>
            {t('View my QR pass', 'Tan-awa akong QR pass')}
          </Button>
        </Card>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title={t('No claiming schedule yet', 'Wala pay iskedyul sa claim')}
          body={t(
            'Your assigned schedule will appear here after your enrollment is approved.',
            'Makita dinhi ang imong iskedyul human maaprubahan ang enrollment.',
          )}
        />
      )}
      {!overviewError && (
        <Button variant="ghost" loading={overviewLoading} onPress={() => void refreshOverview()}>
          {t('Refresh schedule', 'I-refresh ang iskedyul')}
        </Button>
      )}

      <SectionHeader title={t('Quick actions', 'Dali nga mga aksyon')} />
      <View style={s.grid}>
        <QuickAction style={s.gridItem} label={t('QR claim pass', 'QR claim pass')} icon={QrCode} onPress={() => go('qr-pass')} />
        <QuickAction style={s.gridItem} label={t('Schedule', 'Iskedyul')} icon={CalendarDays} tone="accent" onPress={() => go('schedule')} />
        <QuickAction style={s.gridItem} label={t('My programs', 'Akong programa')} icon={BookOpen} tone="navy" onPress={() => go('programs')} />
        <QuickAction style={s.gridItem} label={t('Claim status', 'Kahimtang sa claim')} icon={ListChecks} tone="green" onPress={() => go('claim-status')} />
        <QuickAction style={s.gridItem} label={t('Scan QR', 'I-scan ang QR')} icon={ScanLine} tone="primary" onPress={() => router.push('/scan')} />
        <QuickAction style={s.gridItem} label={t('Ask for help', 'Mangayo og tabang')} icon={Bot} tone="amber" onPress={() => router.navigate('/(tabs)/help')} />
      </View>

      {wallet ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Open wallet records', 'Ablihi ang wallet records')}
          onPress={() => router.navigate('/(tabs)/wallet')}
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconCircle icon={WalletIcon} size={46} square />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="small">{t('Recorded wallet balance', 'Narekord nga balanse sa wallet')}</Txt>
              <Txt variant="heading" style={{ color: c.navy }}>
                {wallet.wallet ? peso(wallet.wallet.balance) : t('No wallet account yet', 'Wala pay wallet account')}
              </Txt>
              <Txt variant="small" style={{ fontSize: 12 }}>
                {t('Simulation only · records assistance, no transfers', 'Simulation lamang · rekord sa ayuda, walay pagbalhin')}
              </Txt>
            </View>
            <ChevronRight size={20} color={c.subtle} />
          </Card>
        </Pressable>
      ) : null}

      <SectionHeader
        title={t('Claim progress', 'Pag-uswag sa claim')}
        action={t('View status', 'Tan-awa')}
        onAction={() => go('claim-status')}
      />
      <Card>
        <Timeline steps={steps} />
      </Card>

      {!faceEnrolled && (
        <Pressable accessibilityRole="button" onPress={() => flow('consent')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderColor: '#F3E3B5' }}>
            <IconCircle icon={ScanFace} tone="amber" size={46} square />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="label">{t('Optional face verification', 'Opsyonal nga face verification')}</Txt>
              <Txt variant="small">
                {t(
                  'Review consent and arrange enrollment with your facilitator.',
                  'Basaha ang pagtugot ug pakigsabot sa facilitator alang sa enrollment.',
                )}
              </Txt>
            </View>
            <ChevronRight size={20} color={c.subtle} />
          </Card>
        </Pressable>
      )}

      {recent.length > 0 && (
        <>
          <SectionHeader
            title={t('Recent notifications', 'Bag-ong mga pahibalo')}
            action={t('See all', 'Tan-awa tanan')}
            onAction={() => go('notifications')}
          />
          {recent.map((notice) => (
            <NotificationCard
              key={notice.id}
              icon={notice.notificationType === 'claim' ? CircleCheck : notice.notificationType === 'schedule' ? CalendarDays : Bell}
              tone={notice.notificationType === 'claim' ? 'green' : notice.notificationType === 'reminder' ? 'amber' : 'primary'}
              title={t(notice.title, notice.titleBs ?? notice.title)}
              message={t(notice.message, notice.messageBs ?? notice.message)}
              time={notice.sentAt ? formatDateTime(notice.sentAt) : ''}
              unread={!notice.readAt}
              accessibilityLabel={`${t(notice.title, notice.titleBs ?? notice.title)}. ${notice.readAt ? t('Read', 'Nabasa na') : t('Unread', 'Wala pa mabasa')}`}
              onPress={() => go('notification-details', { id: notice.id })}
            />
          ))}
        </>
      )}

      <Pressable accessibilityRole="button" onPress={() => router.navigate('/(tabs)/help')}>
        <GradientCard from={c.primary} to={c.navy} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
          <View style={s.botBubble}>
            <Bot size={26} color={c.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label" style={{ color: c.onPrimary }}>
              {t('Need help?', 'Kinahanglan og tabang?')}
            </Txt>
            <Txt variant="small" style={{ color: '#E6F1FF' }}>
              {t('Ask the GarantiyAid assistant or talk to staff.', 'Pangutana sa GarantiyAid assistant o pakigsulti sa staff.')}
            </Txt>
          </View>
          <ChevronRight size={20} color={c.onPrimary} />
        </GradientCard>
      </Pressable>

      <Notice>
        {t(
          'Enrollment, schedule, QR passes, claim status, and wallet history come from your saved account.',
          'Ang enrollment, iskedyul, QR pass, kahimtang sa claim, ug wallet history gikan sa imong account.',
        )}
      </Notice>
    </Page>
  );
}

function ClaimReleaseDetails({ claim }: { claim: ClaimRecord | CurrentClaim }) {
  const { t } = useDemo();
  return <>
    {claim.deliveryMode === 'physical_goods' && <DetailRow label={t('Delivery', 'Paghatag')} value={t('Physical assistance', 'Pisikal nga ayuda')} />}
    {claim.verifiedAt && <DetailRow label={t('Verified', 'Napamatud-an')} value={formatDateTime(claim.verifiedAt)} />}
    {claim.package && <DetailRow label={t('Package received', 'Nadawat nga pakete')} value={`${claim.package.name} · ${claim.package.quantity} ${claim.package.unit}`} />}
    {claim.releasedAt && <DetailRow label={t('Released', 'Gihatag')} value={formatDateTime(claim.releasedAt)} />}
    {claim.receipt && <DetailRow label={t('Receipt number', 'Numero sa resibo')} value={claim.receipt.number} />}
    {claim.receipt && <DetailRow label={t('Receipt issued', 'Gihatag ang resibo')} value={formatDateTime(claim.receipt.issuedAt)} />}
    {claim.needsReview && <Notice tone="warning">{t('Staff are reviewing this claim. Contact staff for its current status.', 'Gisusi pa sa staff kini nga claim. Kontaka ang staff alang sa kahimtang niini.')}</Notice>}
  </>;
}

const claimTone = (claim: { status: string; needsReview?: boolean }) =>
  claim.needsReview || ['rejected', 'voided'].includes(claim.status) ? 'error' : ['claimed', 'completed'].includes(claim.status) ? 'success' : 'warning';

/** Digital receipt for a saved ledger entry. Shares plain text only through the system share sheet. */
export function ReceiptBody({ entry, t }: { entry: WalletTransaction; t: Translate }) {
  const [shareError, setShareError] = useState(false);
  const negative = entry.amount < 0;
  const share = async () => {
    setShareError(false);
    try {
      await Share.share({
        message: [
          'GarantiyAid assistance record',
          `${formatTransactionType(entry.type, (en) => en)}: ${signedPeso(entry.amount)}`,
          `Program: ${transactionSource(entry, (en) => en)}`,
          `Reference No.: ${entry.reference}`,
          `Recorded: ${formatDateTime(entry.createdAt)}`,
          `Status: ${formatStatus(entry.status)}`,
          'This record does not represent a transfer of funds.',
        ].join('\n'),
      });
    } catch {
      setShareError(true);
    }
  };
  return (
    <>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <IconCircle icon={negative ? ArrowUpRight : CircleCheck} tone={negative ? 'error' : 'green'} size={64} />
        <Txt variant="label">{formatTransactionType(entry.type, t)}</Txt>
        <Txt variant="display" style={{ color: negative ? c.error : c.greenInk }}>
          {signedPeso(entry.amount)}
        </Txt>
        <Badge center tone={entry.status === 'completed' ? 'success' : 'warning'}>{formatStatus(entry.status)}</Badge>
      </View>
      <Divider dashed />
      <View style={{ gap: 12 }}>
        <KeyValue label={t('Reference No.', 'Numero sa reperensya')} value={entry.reference} strong />
        <KeyValue label={entry.program ? t('Program', 'Programa') : t('Source', 'Gikan')} value={transactionSource(entry, t)} />
        <KeyValue label={t('Recorded', 'Girekord')} value={formatDateTime(entry.createdAt)} />
        <KeyValue label={t('Status', 'Kahimtang')} value={formatStatus(entry.status)} />
        {entry.claimStatus ? <KeyValue label={t('Claim status', 'Kahimtang sa claim')} value={formatStatus(entry.claimStatus)} /> : null}
      </View>
      <Divider dashed />
      <Notice>
        {t(
          'This receipt is a recorded assistance entry. This app does not transfer funds.',
          'Kini nga resibo usa ka rekord sa ayuda. Kini nga app dili magbalhin og kuwarta.',
        )}
      </Notice>
      {shareError && <Notice tone="error">{t('Sharing is not available on this device.', 'Dili magamit ang pag-share niini nga device.')}</Notice>}
      <Button variant="outline" icon={Share2} onPress={() => void share()}>
        {t('Share receipt details', 'I-share ang detalye sa resibo')}
      </Button>
    </>
  );
}

export function WalletScreen() {
  const { wallet, walletLoading, walletError, refreshWallet, t } = useDemo();
  const [selected, setSelected] = useState<WalletTransaction | null>(null);
  const entries = wallet?.transactions ?? [];
  const currentClaim = wallet?.currentClaim;
  const claims = (wallet?.claims ?? []).filter(claim => claim.id !== currentClaim?.id);
  return (
    <Page tabs title={t('My Wallet', 'Akong Wallet')} back={false}>
      {walletLoading && !wallet ? (
        <LoadingSkeleton label={t('Loading wallet records…', 'Nag-load sa wallet records…')} />
      ) : walletError ? (
        <>
          <Notice tone="error">
            {t('Your claim and wallet records could not be loaded.', 'Wala ma-load ang imong claim ug wallet records.')}
          </Notice>
          <Button variant="outline" onPress={() => void refreshWallet()}>
            {t('Try again', 'Sulayi pag-usab')}
          </Button>
        </>
      ) : (
        <>
          <GradientCard>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Txt variant="caption" style={{ color: '#D2E5FC' }}>
                {t('RECORDED BALANCE', 'NAREKORD NGA BALANSE')}
              </Txt>
              <WalletIcon size={22} color="#D2E5FC" />
            </View>
            <Txt
              variant={wallet?.wallet ? 'number' : 'heading'}
              style={{ color: c.onPrimary, fontSize: wallet?.wallet ? 38 : 20 }}
            >
              {wallet?.wallet ? peso(wallet.wallet.balance) : t('No wallet account yet', 'Wala pay wallet account')}
            </Txt>
            {wallet?.wallet?.walletNumber ? (
              <Txt selectable variant="label" style={{ color: '#D9E6FF', letterSpacing: 0.5 }}>
                {t('Wallet no.', 'Wallet no.')} {wallet.wallet.walletNumber}
              </Txt>
            ) : null}
            <Badge tone="light">{t('Simulation only · no real funds', 'Simulation lamang · walay tinuod nga kuwarta')}</Badge>
            {wallet && !wallet.wallet ? (
              <Button variant="white" icon={Plus} onPress={() => router.push('/wallet-action/create')}>
                {t('Create wallet', 'Paghimo og wallet')}
              </Button>
            ) : null}
          </GradientCard>
          <View style={s.grid}>
            <QuickAction style={s.gridItem} label={t('Add credit', 'Dugang credit')} icon={Plus} tone="green"
              disabled={!wallet?.wallet?.walletNumber} caption={wallet?.wallet && !wallet.wallet.walletNumber ? t('Not on this server', 'Wala niini nga server') : undefined}
              onPress={() => router.push('/wallet-action/credit')} />
            <QuickAction style={s.gridItem} label={t('Transfer', 'Ibalhin')} icon={Send} tone="accent"
              disabled={!wallet?.wallet?.walletNumber} caption={wallet?.wallet && !wallet.wallet.walletNumber ? t('Not on this server', 'Wala niini nga server') : undefined}
              onPress={() => router.push('/wallet-action/transfer')} />
            <QuickAction style={s.gridItem} label={t('History', 'Kasaysayan')} icon={History} onPress={() => go('transactions')} />
            <QuickAction style={s.gridItem} label={t('My wallet QR', 'Akong wallet QR')} icon={QrCode} tone="navy"
              disabled={!wallet?.wallet?.walletNumber} onPress={() => router.push('/wallet-action/qr')} />
            <QuickAction style={s.gridItem} label={t('Scan QR', 'I-scan ang QR')} icon={ScanLine} tone="primary" onPress={() => router.push('/scan')} />
            <QuickAction style={s.gridItem} label={t('Claim status', 'Kahimtang sa claim')} icon={ListChecks} tone="green" onPress={() => go('claim-status')} />
          </View>
          <Notice>
            {wallet?.wallet?.walletNumber
              ? t(
                  'Credits and transfers here are simulated for demonstration. No real money is held or moved. Released assistance appears in your claim history.',
                  'Ang credit ug pagbalhin dinhi kay simulated alang sa demonstration. Walay tinuod nga kuwarta nga matipig o mabalhin. Ang nadawat nga ayuda makita sa kasaysayan sa claim.',
                )
              : t(
                  'This wallet records assistance issued to you. It cannot send or transfer money.',
                  'Kini nga wallet nagrekord sa ayuda nga imong nadawat. Dili kini makapadala o makabalhin og kuwarta.',
                )}
          </Notice>
          <SectionHeader title={t('Current claim', 'Kasamtangang claim')} />
          {currentClaim ? (
            <Card>
              <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }]}>
                <Txt variant="label" style={{ flexShrink: 1 }}>{currentClaim.program.name}</Txt>
                <Badge tone={claimTone(currentClaim)}>{formatClaimStatus(currentClaim.status, t, currentClaim.deliveryMode)}</Badge>
              </View>
              <DetailRow icon={CalendarDays} label={t('Schedule', 'Iskedyul')} value={formatDate(currentClaim.date)} />
              <DetailRow icon={WalletIcon} label={t('Recorded value', 'Narekord nga kantidad')} value={peso(currentClaim.amount)} />
              <ClaimReleaseDetails claim={currentClaim} />
              {currentClaim.status === 'not_claimed' && (
                <Txt variant="small">
                  {t(
                    'Authorized staff will record the result after checking your claim pass.',
                    'Ang awtorisadong staff maoy morekord sa resulta human susihon ang imong claim pass.',
                  )}
                </Txt>
              )}
            </Card>
          ) : (
            <Notice>
              {t('No upcoming claim is assigned to your account.', 'Walay umaabot nga claim nga gi-assign sa imong account.')}
            </Notice>
          )}
        </>
      )}
      {!walletError && (
        <Button variant="ghost" loading={walletLoading} onPress={() => void refreshWallet()}>
          {t('Refresh records', 'I-refresh ang records')}
        </Button>
      )}
      {!walletError && (!walletLoading || !!wallet) && (
        <>
          <SectionHeader title={t('Claim history', 'Kasaysayan sa claim')} />
          {claims.length ? claims.map(claim => <Card key={claim.id}>
            <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }]}>
              <Txt variant="label" style={{ flexShrink: 1 }}>{claim.program.name}</Txt>
              <Badge tone={claimTone(claim)}>{formatClaimStatus(claim.status, t, claim.deliveryMode)}</Badge>
            </View>
            <DetailRow label={t('Schedule', 'Iskedyul')} value={formatDate(claim.date)} />
            <DetailRow label={t('Recorded value', 'Narekord nga kantidad')} value={peso(claim.amount)} />
            <ClaimReleaseDetails claim={claim} />
          </Card>) : <Notice>{t('No earlier claim records yet.', 'Wala pay miaging claim records.')}</Notice>}
          <SectionHeader
            title={t('Recent transactions', 'Bag-ong mga transaksyon')}
            action={t('View all', 'Tan-awa tanan')}
            onAction={() => go('transactions')}
          />
          {entries.length ? (
            <Card style={{ gap: 0, paddingVertical: 2 }}>
              {entries.slice(0, 5).map((entry, index) => (
                <TransactionCard
                  key={entry.id}
                  first={index === 0}
                  icon={entry.amount < 0 ? ArrowUpRight : ArrowDownLeft}
                  negative={entry.amount < 0}
                  title={formatTransactionType(entry.type, t)}
                  subtitle={`${transactionSource(entry, t)} · ${formatDateTime(entry.createdAt)}`}
                  meta={`${entry.reference} · ${formatStatus(entry.status)}`}
                  amount={signedPeso(entry.amount)}
                  accessibilityLabel={`${t('Open receipt', 'Ablihi ang resibo')}: ${formatDateTime(entry.createdAt)}`}
                  onPress={() => setSelected(entry)}
                />
              ))}
            </Card>
          ) : (
            <EmptyState
              icon={ReceiptIcon}
              title={t('No wallet history yet', 'Wala pay wallet history')}
              body={t(
                'Wallet credits appear here when staff record a ledger entry. Physical assistance appears in claim history.',
                'Makita dinhi ang wallet credits kon morekord ang staff. Ang pisikal nga ayuda makita sa kasaysayan sa claim.',
              )}
            />
          )}
          <Button variant="outline" icon={FileText} onPress={() => go('transactions')}>
            {t('View transaction history', 'Tan-awa ang kasaysayan')}
          </Button>
        </>
      )}
      <SheetModal
        visible={!!selected}
        title={t('Receipt', 'Resibo')}
        closeLabel={t('Close receipt', 'Sirad-i ang resibo')}
        onClose={() => setSelected(null)}
      >
        {selected ? <ReceiptBody entry={selected} t={t} /> : null}
        <Button onPress={() => setSelected(null)}>{t('Close', 'Sirad-i')}</Button>
      </SheetModal>
    </Page>
  );
}

export function ProfileScreen() {
  const { name, phone, beneficiary, accessToken, t, reset } = useDemo();
  const [confirming, setConfirming] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const signOut = async () => {
    setLogoutLoading(true);
    setLogoutError('');
    try {
      if (accessToken) await logout(accessToken);
      setConfirming(false);
      await reset();
      router.replace('/');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        setConfirming(false);
        await reset();
        router.replace('/');
        return;
      }
      setConfirming(false);
      setLogoutError(
        error instanceof ApiRequestError
          ? error.message
          : t('Could not log out. Try again.', 'Wala maka-log out. Sulayi pag-usab.'),
      );
    } finally {
      setLogoutLoading(false);
    }
  };
  return (
    <Page tabs title={t('My Profile', 'Akong Profile')} back={false}>
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
        <ProfileAvatar name={name} size={88} verified={!!beneficiary?.isVerified} />
        <Txt variant="heading" style={{ textAlign: 'center' }}>{name}</Txt>
        <Txt variant="small">{t('Beneficiary', 'Benepisyaryo')} · {beneficiary?.contactNumber ?? `+63${phone}`}</Txt>
        <Badge center tone={beneficiary?.isVerified ? 'success' : 'warning'}>
          {beneficiary?.isVerified
            ? t('Verified account', 'Naverify nga account')
            : t('Verification pending', 'Naghulat sa verification')}
        </Badge>
        <Button variant="ghost" icon={UserRound} onPress={() => go('edit-profile')} style={{ alignSelf: 'stretch' }}>
          {t('Edit profile', 'Usba ang profile')}
        </Button>
      </Card>
      {beneficiary ? (
        <Card>
          <DetailRow icon={MapPin} label={t('Saved address', 'Natipig nga adres')} value={beneficiary.address} />
          <DetailRow
            icon={ShieldCheck}
            label={t('Account status', 'Kahimtang sa account')}
            value={beneficiary.status.charAt(0).toUpperCase() + beneficiary.status.slice(1)}
          />
        </Card>
      ) : null}
      <Card style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <IconCircle icon={Languages} size={40} square tone="accent" />
        <Txt variant="label" style={{ flex: 1 }}>{t('Language', 'Pinulongan')}</Txt>
        <LanguageToggle full />
      </Card>
      <SectionHeader title={t('Account', 'Account')} />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <MenuRow title={t('Personal information', 'Personal nga impormasyon')} subtitle={t('Names and address', 'Ngalan ug adres')} icon={UserRound} onPress={() => go('edit-profile')} />
        <MenuRow title={t('Email address', 'Email address')} subtitle={beneficiary?.email ?? t('Add and verify', 'Idugang ug i-verify')} icon={Mail} tone="accent" onPress={() => router.push('/account/email')} />
        <MenuRow title={t('Change password', 'Usba ang password')} subtitle={beneficiary?.hasPassword ? t('Sign-in security', 'Seguridad sa pagsulod') : t('Set a password', 'Paghimo og password')} icon={KeyRound} onPress={() => router.push('/account/password')} />
        <MenuRow title={t('Notification settings', 'Mga setting sa pahibalo')} icon={Bell} tone="amber" onPress={() => go('notification-settings')} />
        <MenuRow title={t('Security & Privacy', 'Seguridad ug Privacy')} icon={ShieldCheck} tone="green" onPress={() => go('security-privacy')} last />
      </Card>
      <SectionHeader title={t('Assistance', 'Ayuda')} />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <MenuRow title={t('My programs', 'Akong mga programa')} icon={BookOpen} tone="navy" onPress={() => go('programs')} />
        <MenuRow title={t('Enrollment status', 'Kahimtang sa enrollment')} icon={FileText} onPress={() => go('enrollment-status')} />
        <MenuRow title={t('Enrollment documents', 'Mga dokumento sa enrollment')} icon={FileText} tone="accent" onPress={() => go('enrollment-documents')} />
        <MenuRow title={t('Claim status', 'Kahimtang sa claim')} icon={ListChecks} tone="green" onPress={() => go('claim-status')} last />
      </Card>
      <BiometricSummary />
      {logoutError ? <Notice tone="error">{logoutError}</Notice> : null}
      <Button variant="outline" icon={LogOut} onPress={() => { setLogoutError(''); setConfirming(true); }}>
        {t('Log out', 'Log out')}
      </Button>
      <View style={[styles.row, { justifyContent: 'center', gap: 6 }]}>
        <Info size={14} color={c.subtle} />
        <Txt variant="small" style={{ color: c.subtle }}>GarantiyAid · {t('Capstone prototype', 'Capstone prototype')}</Txt>
      </View>
      <ConfirmationModal
        visible={confirming}
        icon={LogOut}
        title={t('Log out', 'Log out')}
        message={t('Are you sure you want to log out of your account?', 'Sigurado ka nga mo-log out sa imong account?')}
        cancelLabel={t('Cancel', 'Kanselahon')}
        confirmLabel={t('Log out', 'Log out')}
        loading={logoutLoading}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void signOut()}
      />
    </Page>
  );
}
export const s = StyleSheet.create({
  cardCaption: {
    color: '#D2E5FC',
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: fonts.semibold,
    lineHeight: 15,
  },
  bell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  unreadDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFB020',
    borderWidth: 2,
    borderColor: c.primary,
    right: 12,
    top: 11,
  },
  dateBlock: {
    width: 58,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: c.primarySoft,
    alignItems: 'center',
  },
  scheduleFacts: { gap: 12, paddingVertical: 4 },
  queuePanel: {
    backgroundColor: c.primarySoft,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { flexBasis: '30%', minWidth: 80 },
  gridItemWide: { flexBasis: '45%', minWidth: 120 },
  queueIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
  botBubble: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceCard: { backgroundColor: c.primary, borderRadius: 18, padding: 20, gap: 8 },
  transaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    minHeight: 72,
  },
});
