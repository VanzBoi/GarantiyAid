import React, { useRef, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { ArrowUpRight, CirclePlus, QrCode, ScanLine, Send, Share2, Wallet } from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Field,
  GradientCard,
  KeyValue,
  LoadingSkeleton,
  Notice,
  Page,
  ScreenIntro,
  styles,
  Txt,
} from '../components';
import {
  addSimulatedCredit,
  ApiRequestError,
  createWallet,
  isUnavailableOnServer,
  lookupRecipient,
  newRequestId,
  sendSimulatedTransfer,
  type WalletTransaction,
} from '../api';
import { peso, signedPeso, useDemo } from '../state';
import { formatDateTime } from '../format';
import { colors as c } from '../theme';

type Translate = (en: string, bs: string) => string;
export const WALLET_QR_PREFIX = 'GARANTIYAID-WALLET:';
const CREDIT_LIMIT = 5000;
const TRANSFER_LIMIT = 5000;

function failure(error: unknown, t: Translate, fallback: string) {
  if (isUnavailableOnServer(error)) {
    return t('The connected server does not support the simulated wallet yet.', 'Wala pay simulated wallet ang konektado nga server.');
  }
  return error instanceof ApiRequestError ? error.message : fallback;
}

/** Parses "₱1,234.50" style input into a number with at most two decimals, or null. */
export function parseAmountInput(text: string) {
  const clean = text.replace(/[₱,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

function SimulationBanner({ t }: { t: Translate }) {
  return (
    <Notice tone="warning">
      {t('Simulation only. No real money is created, held, or sent.', 'Simulation lamang. Walay tinuod nga kuwarta nga mahimo, matipig, o mapadala.')}
    </Notice>
  );
}

function useSignedIn() {
  const state = useDemo();
  const handle401 = async (error: unknown) => {
    if (error instanceof ApiRequestError && error.status === 401) {
      await state.reset();
      router.replace('/');
      return true;
    }
    return false;
  };
  return { ...state, handle401 };
}

export function WalletActionScreen() {
  const { action } = useLocalSearchParams<{ action: string }>();
  const { accessToken, wallet, walletLoading, walletError, refreshWallet, t } = useDemo();
  const titles: Record<string, string> = {
    create: t('Create wallet', 'Paghimo og wallet'),
    credit: t('Add credit (simulated)', 'Dugang credit (simulated)'),
    transfer: t('Transfer (simulated)', 'Pagbalhin (simulated)'),
    qr: t('My wallet QR', 'Akong wallet QR'),
  };
  if (!accessToken) {
    return (
      <Page title={titles[action] ?? 'GarantiyAid'}>
        <Notice>{t('Sign in to use your wallet.', 'Pag-sign in aron magamit ang wallet.')}</Notice>
        <Button onPress={() => router.replace('/flow/login')}>{t('Sign in', 'Pag-sign in')}</Button>
      </Page>
    );
  }
  if (walletLoading && !wallet) {
    return <Page title={titles[action]}><LoadingSkeleton label={t('Loading wallet…', 'Nag-load sa wallet…')} /></Page>;
  }
  if (walletError && !wallet) {
    return (
      <Page title={titles[action]}>
        <Notice tone="error">{t('Your wallet could not be loaded.', 'Wala ma-load ang imong wallet.')}</Notice>
        <Button onPress={() => void refreshWallet()}>{t('Try again', 'Sulayi pag-usab')}</Button>
      </Page>
    );
  }
  if (action === 'create' || !wallet?.wallet) return <CreateWallet title={titles.create} />;
  if (action === 'credit') return <AddCredit title={titles.credit} />;
  if (action === 'transfer') return <Transfer title={titles.transfer} />;
  if (action === 'qr') return <WalletQr title={titles.qr} />;
  return (
    <Page title="GarantiyAid">
      <Notice>{t('This wallet action is unavailable.', 'Dili magamit kini nga aksyon sa wallet.')}</Notice>
    </Page>
  );
}

function CreateWallet({ title }: { title: string }) {
  const { accessToken, beneficiary, wallet, refreshWallet, t, handle401 } = useSignedIn();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');
  const pending = useRef(false);
  const existing = wallet?.wallet?.walletNumber;
  const create = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await createWallet(accessToken);
      setCreated(result.wallet.walletNumber ?? '');
      await refreshWallet();
    } catch (cause) {
      if (!(await handle401(cause))) setError(failure(cause, t, t('Your wallet could not be created. Try again.', 'Wala mahimo ang wallet. Sulayi pag-usab.')));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (created || existing) {
    return (
      <Page title={title}>
        <ScreenIntro iconName="check" tone="green" title={created ? t('Wallet created', 'Nahimo ang wallet') : t('Your wallet is ready', 'Andam na ang imong wallet')}
          subtitle={t('Use your wallet number to receive simulated transfers.', 'Gamita ang wallet number aron makadawat og simulated transfer.')} />
        <GradientCard style={{ alignItems: 'center', gap: 6 }}>
          <Txt variant="caption" style={{ color: '#D2E5FC' }}>{t('WALLET NUMBER', 'WALLET NUMBER')}</Txt>
          <Txt selectable variant="heading" style={{ color: c.onPrimary, fontSize: 26, lineHeight: 32, letterSpacing: 1 }}>{created || existing}</Txt>
          <Badge tone="light">{t('Simulation only', 'Simulation lamang')}</Badge>
        </GradientCard>
        <Button onPress={() => router.replace('/(tabs)/wallet')}>{t('Go to my wallet', 'Adto sa akong wallet')}</Button>
      </Page>
    );
  }
  return (
    <Page title={title} footer={<Button icon={Wallet} loading={busy} disabled={!beneficiary?.isVerified} onPress={() => void create()}>{t('Create wallet', 'Paghimo og wallet')}</Button>}>
      <ScreenIntro icon={Wallet} title={t('Create your GarantiyAid wallet', 'Paghimo sa imong GarantiyAid wallet')}
        subtitle={t('Set up a demonstration wallet to view simulated credits and transfers.', 'Paghimo og demonstration wallet aron makita ang simulated nga credit ug pagbalhin.')} />
      <Card>
        {[
          t('A wallet number is created for your account.', 'Mahimo ang wallet number alang sa imong account.'),
          t('Credits and transfers here are simulated for the capstone demonstration.', 'Ang credit ug pagbalhin dinhi kay simulated alang sa capstone demonstration.'),
          t('Released government assistance still appears in your claim history.', 'Ang nadawat nga ayuda makita gihapon sa kasaysayan sa claim.'),
        ].map((text) => (
          <View key={text} style={[styles.row, { alignItems: 'flex-start' }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 7 }} />
            <Txt style={{ flex: 1 }}>{text}</Txt>
          </View>
        ))}
      </Card>
      <SimulationBanner t={t} />
      {!beneficiary?.isVerified && <Notice tone="error">{t('Verify your account before creating a wallet.', 'I-verify ang account sa dili pa maghimo og wallet.')}</Notice>}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Page>
  );
}

function ResultCard({ entry, balance, t }: { entry: WalletTransaction; balance: number; t: Translate }) {
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Txt variant="display" style={{ color: entry.amount < 0 ? c.error : c.greenInk }}>{signedPeso(entry.amount)}</Txt>
        <Badge tone="warning" center>{t('Simulated', 'Simulated')}</Badge>
      </View>
      <Divider dashed />
      <KeyValue label={t('Reference No.', 'Numero sa reperensya')} value={entry.reference} strong />
      {entry.counterpartyWalletNumber ? <KeyValue label={t('Recipient wallet', 'Wallet sa makadawat')} value={entry.counterpartyWalletNumber} /> : null}
      <KeyValue label={t('Date', 'Petsa')} value={formatDateTime(entry.createdAt)} />
      <KeyValue label={t('New balance', 'Bag-ong balanse')} value={peso(balance)} strong />
    </Card>
  );
}

function AddCredit({ title }: { title: string }) {
  const { accessToken, beneficiary, wallet, refreshWallet, t, handle401 } = useSignedIn();
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ entry: WalletTransaction; balance: number } | null>(null);
  const pending = useRef(false);
  const attempt = useRef<{ amount: number; id: string } | null>(null);
  const amount = parseAmountInput(amountText);
  const verified = !!beneficiary?.isVerified;
  const submit = async () => {
    if (pending.current) return;
    if (amount === null || amount < 1 || amount > CREDIT_LIMIT) {
      setError(t(`Enter an amount from ₱1 to ₱${CREDIT_LIMIT.toLocaleString('en-PH')}.`, `Isulod ang kantidad gikan ₱1 hangtod ₱${CREDIT_LIMIT.toLocaleString('en-PH')}.`));
      return;
    }
    // Reuse the request ID when retrying the same amount so it is credited once.
    if (attempt.current?.amount !== amount) attempt.current = { amount, id: newRequestId() };
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await addSimulatedCredit(accessToken, { amount, requestId: attempt.current.id });
      attempt.current = null;
      setResult({ entry: saved.transaction, balance: saved.wallet.balance });
      void refreshWallet();
    } catch (cause) {
      if (!(await handle401(cause))) setError(failure(cause, t, t('The credit could not be confirmed. Try again.', 'Wala makumpirma ang credit. Sulayi pag-usab.')));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (result) {
    return (
      <Page title={title}>
        <ScreenIntro iconName="check" tone="green" title={t('Simulated credit added', 'Nadugang ang simulated credit')} />
        <ResultCard entry={result.entry} balance={result.balance} t={t} />
        <SimulationBanner t={t} />
        <Button onPress={() => router.replace('/(tabs)/wallet')}>{t('Back to wallet', 'Balik sa wallet')}</Button>
      </Page>
    );
  }
  return (
    <Page title={title} footer={<Button icon={CirclePlus} loading={busy} disabled={!verified || amount === null} onPress={() => void submit()}>{t('Add credit', 'Idugang ang credit')}</Button>}>
      <ScreenIntro icon={CirclePlus} title={t('Add credit (simulated)', 'Dugang credit (simulated)')}
        subtitle={t('Credit a simulated amount to your wallet for demonstration only.', 'I-credit ang simulated nga kantidad sa wallet alang sa demonstration lamang.')} />
      <Card style={{ gap: 14 }}>
        <KeyValue label={t('Current balance', 'Kasamtangang balanse')} value={peso(wallet?.wallet?.balance ?? 0)} strong />
        <Field label={t('Amount', 'Kantidad')} value={amountText} keyboardType="decimal-pad" editable={!busy && verified}
          onChangeText={(text) => { setAmountText(text); setError(''); }} placeholder="₱ 500.00"
          helper={t(`Up to ₱${CREDIT_LIMIT.toLocaleString('en-PH')} per credit.`, `Hangtod ₱${CREDIT_LIMIT.toLocaleString('en-PH')} kada credit.`)} />
        <View style={[styles.row, { gap: 8, flexWrap: 'wrap' }]}>
          {[100, 500, 1000].map((value) => (
            <Chip key={value} label={peso(value)} selected={amount === value} onPress={() => { setAmountText(String(value)); setError(''); }} />
          ))}
        </View>
      </Card>
      <SimulationBanner t={t} />
      {!verified && <Notice tone="error">{t('Simulated credit is available after your account is verified.', 'Magamit ang simulated credit human ma-verify ang imong account.')}</Notice>}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Page>
  );
}

function Transfer({ title }: { title: string }) {
  const params = useLocalSearchParams<{ to?: string }>();
  const { accessToken, wallet, refreshWallet, t, handle401 } = useSignedIn();
  const [recipientText, setRecipientText] = useState((params.to ?? '').toUpperCase());
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<{ walletNumber: string; displayName: string; amount: number } | null>(null);
  const [result, setResult] = useState<{ entry: WalletTransaction; balance: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const balance = wallet?.wallet?.balance ?? 0;
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (cause) {
      if (!(await handle401(cause))) setError(failure(cause, t, t('The transfer could not be confirmed. Check your history before trying again.', 'Wala makumpirma ang pagbalhin. Susiha ang kasaysayan sa dili pa mosulay pag-usab.')));
    } finally { pending.current = false; setBusy(false); }
  };
  const review = () => {
    const walletNumber = recipientText.trim().toUpperCase();
    const amount = parseAmountInput(amountText);
    if (!/^GA-[0-9A-F]{8}$/.test(walletNumber)) return setError(t('Enter a wallet number like GA-1A2B3C4D, or scan it.', 'Isulod ang wallet number sama sa GA-1A2B3C4D, o i-scan kini.'));
    if (walletNumber === wallet?.wallet?.walletNumber) return setError(t('Choose another person’s wallet.', 'Pagpili og wallet sa laing tawo.'));
    if (amount === null || amount < 1 || amount > TRANSFER_LIMIT) return setError(t(`Enter an amount from ₱1 to ₱${TRANSFER_LIMIT.toLocaleString('en-PH')}.`, `Isulod ang kantidad gikan ₱1 hangtod ₱${TRANSFER_LIMIT.toLocaleString('en-PH')}.`));
    if (amount > balance) return setError(t('Your simulated balance is not enough for this transfer.', 'Kulang ang imong simulated nga balanse alang niini.'));
    void run(async () => {
      const recipient = await lookupRecipient(accessToken, walletNumber);
      setConfirming({ ...recipient, amount });
    });
  };
  const confirm = () => {
    if (!confirming) return;
    const key = `${confirming.walletNumber}:${confirming.amount}:${note.trim()}`;
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() };
    const requestId = attempt.current.id;
    void run(async () => {
      const saved = await sendSimulatedTransfer(accessToken, {
        recipientWalletNumber: confirming.walletNumber, amount: confirming.amount, requestId, ...(note.trim() ? { note: note.trim() } : {}),
      });
      attempt.current = null;
      setResult({ entry: saved.transaction, balance: saved.wallet.balance });
      void refreshWallet();
    });
  };
  if (result) {
    return (
      <Page title={title}>
        <ScreenIntro iconName="check" tone="green" title={t('Transfer successful', 'Malampuson ang pagbalhin')}
          subtitle={t('The simulated amount was moved between demo wallets.', 'Ang simulated nga kantidad gibalhin tali sa demo wallets.')} />
        <ResultCard entry={result.entry} balance={result.balance} t={t} />
        <SimulationBanner t={t} />
        <Button onPress={() => router.replace('/(tabs)/wallet')}>{t('Back to wallet', 'Balik sa wallet')}</Button>
      </Page>
    );
  }
  if (confirming) {
    return (
      <Page title={title}
        footer={<>
          <Button icon={Send} loading={busy} onPress={confirm}>{t('Confirm transfer', 'Kumpirmaha ang pagbalhin')}</Button>
          <Button variant="outline" disabled={busy} onPress={() => { setConfirming(null); setError(''); }}>{t('Edit details', 'Usba ang detalye')}</Button>
        </>}>
        <ScreenIntro icon={ArrowUpRight} title={t('Confirm transfer', 'Kumpirmaha ang pagbalhin')}
          subtitle={t('Check the details before sending.', 'Susiha ang detalye sa dili pa ipadala.')} />
        <Card style={{ gap: 12 }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Txt variant="small">{t('You are sending', 'Imong ipadala')}</Txt>
            <Txt variant="display" style={{ color: c.navy }}>{peso(confirming.amount)}</Txt>
          </View>
          <Divider dashed />
          <KeyValue label={t('Recipient', 'Makadawat')} value={confirming.displayName} strong />
          <KeyValue label={t('Wallet number', 'Wallet number')} value={confirming.walletNumber} />
          {note.trim() ? <KeyValue label={t('Note', 'Nota')} value={note.trim()} /> : null}
          <KeyValue label={t('Balance after', 'Balanse human')} value={peso(balance - confirming.amount)} />
        </Card>
        <SimulationBanner t={t} />
        {error ? <Notice tone="error">{error}</Notice> : null}
      </Page>
    );
  }
  return (
    <Page title={title} footer={<Button loading={busy} onPress={review}>{t('Continue', 'Padayon')}</Button>}>
      <ScreenIntro icon={Send} title={t('Transfer (simulated)', 'Pagbalhin (simulated)')}
        subtitle={t('Send a simulated amount to another GarantiyAid wallet.', 'Ipadala ang simulated nga kantidad sa laing GarantiyAid wallet.')} />
      <Card style={{ gap: 14 }}>
        <KeyValue label={t('Available (simulated)', 'Magamit (simulated)')} value={peso(balance)} strong />
        <Field label={t('Recipient wallet number', 'Wallet number sa makadawat')} value={recipientText} editable={!busy}
          onChangeText={(text) => { setRecipientText(text.toUpperCase()); setError(''); }} autoCapitalize="characters" placeholder="GA-1A2B3C4D" maxLength={11} />
        <Button variant="ghost" icon={ScanLine} disabled={busy} onPress={() => router.push('/scan')}>{t('Scan wallet QR', 'I-scan ang wallet QR')}</Button>
        <Field label={t('Amount', 'Kantidad')} value={amountText} keyboardType="decimal-pad" editable={!busy}
          onChangeText={(text) => { setAmountText(text); setError(''); }} placeholder="₱ 200.00" />
        <Field label={t('Note (optional)', 'Nota (opsyonal)')} value={note} editable={!busy} onChangeText={setNote} maxLength={120} />
      </Card>
      <SimulationBanner t={t} />
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Page>
  );
}

function WalletQr({ title }: { title: string }) {
  const { wallet, t } = useDemo();
  const walletNumber = wallet?.wallet?.walletNumber;
  const [shareError, setShareError] = useState(false);
  if (!walletNumber) {
    return (
      <Page title={title}>
        <Notice>{t('The connected server does not provide wallet numbers yet.', 'Wala pay wallet number ang konektado nga server.')}</Notice>
      </Page>
    );
  }
  return (
    <Page title={title}>
      <Txt style={{ textAlign: 'center', color: c.muted }}>
        {t('Let another GarantiyAid user scan this to send you a simulated transfer.', 'Paa-scan kini sa laing GarantiyAid user aron makapadala og simulated transfer.')}
      </Txt>
      <Card style={{ alignItems: 'center', gap: 14 }}>
        <View accessibilityLabel={t(`Wallet QR code for ${walletNumber}`, `Wallet QR code alang sa ${walletNumber}`)} style={{ padding: 14, borderRadius: 20, borderWidth: 1, borderColor: c.outline }}>
          <QRCode value={`${WALLET_QR_PREFIX}${walletNumber}`} size={200} color={c.navy} backgroundColor={c.card} />
        </View>
        <Txt variant="caption">{t('WALLET NUMBER', 'WALLET NUMBER')}</Txt>
        <Txt selectable variant="heading" style={{ letterSpacing: 1 }}>{walletNumber}</Txt>
        <Badge tone="warning" center>{t('Simulation only', 'Simulation lamang')}</Badge>
      </Card>
      {shareError && <Notice tone="error">{t('Sharing is not available on this device.', 'Dili magamit ang pag-share niini nga device.')}</Notice>}
      <Button variant="outline" icon={Share2} onPress={() => {
        setShareError(false);
        Share.share({ message: t(`My GarantiyAid demo wallet number: ${walletNumber}`, `Akong GarantiyAid demo wallet number: ${walletNumber}`) }).catch(() => setShareError(true));
      }}>{t('Share wallet number', 'I-share ang wallet number')}</Button>
      <Pressable accessibilityRole="button" onPress={() => router.push('/scan')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <QrCode size={22} color={c.primary} />
          <Txt variant="label" style={{ flex: 1 }}>{t('Scan someone else’s wallet QR', 'I-scan ang wallet QR sa uban')}</Txt>
        </Card>
      </Pressable>
    </Page>
  );
}
