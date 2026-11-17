import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, CircleAlert, CircleCheck, Keyboard, ShieldAlert, Wallet } from 'lucide-react-native';
import { Button, IconCircle, Notice, Page, ScreenIntro, Txt, useReducedMotion } from '../components';
import { useDemo } from '../state';
import { colors as c } from '../theme';
import { WALLET_QR_PREFIX } from './wallet-actions';

export type ScanResult =
  | { kind: 'wallet'; walletNumber: string }
  | { kind: 'claim-pass' }
  | { kind: 'unknown' };

/** Classifies scanned text. Claim-pass contents are never sent anywhere from this screen. */
export function classifyScan(data: string): ScanResult {
  const text = data.trim();
  if (text.startsWith(WALLET_QR_PREFIX)) {
    const walletNumber = text.slice(WALLET_QR_PREFIX.length).toUpperCase();
    if (/^GA-[0-9A-F]{8}$/.test(walletNumber)) return { kind: 'wallet', walletNumber };
  }
  if (/^GAI1\.[A-Za-z0-9_-]{20,}$/.test(text)) return { kind: 'claim-pass' };
  return { kind: 'unknown' };
}

function ScanLine() {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(progress, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.scanLine, { opacity: reduced ? 0 : 1, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 236] }) }] }]}
    />
  );
}

export function ScanQrScreen() {
  const { accessToken, t } = useDemo();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  const handled = useRef(false);
  if (!accessToken) {
    return (
      <Page title={t('Scan QR code', 'I-scan ang QR code')}>
        <Notice>{t('Sign in to use the scanner.', 'Pag-sign in aron magamit ang scanner.')}</Notice>
      </Page>
    );
  }
  if (result) {
    const reset = () => { handled.current = false; setResult(null); };
    return (
      <Page title={t('Scan result', 'Resulta sa scan')}>
        {result.kind === 'wallet' ? (
          <>
            <ScreenIntro icon={CircleCheck} tone="green" title={t('Valid wallet QR', 'Balido nga wallet QR')} subtitle={result.walletNumber} />
            <Button icon={Wallet} onPress={() => router.replace({ pathname: '/wallet-action/[action]', params: { action: 'transfer', to: result.walletNumber } })}>
              {t('Send a simulated transfer', 'Padala og simulated transfer')}
            </Button>
          </>
        ) : result.kind === 'claim-pass' ? (
          <>
            <ScreenIntro icon={ShieldAlert} tone="amber" title={t('Claim pass detected', 'Claim pass ang na-scan')}
              subtitle={t('Only authorized facilitators can verify claim passes. Beneficiary accounts cannot check them, and this code was not sent anywhere.', 'Ang awtorisadong facilitator lamang ang maka-verify sa claim pass. Dili kini masusi sa beneficiary account, ug wala kini ipadala bisan asa.')} />
            <Notice>{t('Facilitators verify claim passes on the GarantiyAid staff system at the distribution site.', 'Gi-verify sa facilitator ang claim pass sa GarantiyAid staff system sa distribution site.')}</Notice>
          </>
        ) : (
          <ScreenIntro icon={CircleAlert} tone="error" title={t('Invalid QR code', 'Dili balido nga QR code')}
            subtitle={t('This is not a GarantiyAid wallet code. Scan a code from the GarantiyAid app.', 'Dili kini GarantiyAid wallet code. I-scan ang code gikan sa GarantiyAid app.')} />
        )}
        <Button variant="outline" onPress={reset}>{t('Scan again', 'I-scan pag-usab')}</Button>
      </Page>
    );
  }
  if (!permission) {
    return <Page title={t('Scan QR code', 'I-scan ang QR code')}><Notice>{t('Checking camera access…', 'Gisusi ang access sa camera…')}</Notice></Page>;
  }
  if (!permission.granted) {
    return (
      <Page title={t('Scan QR code', 'I-scan ang QR code')}>
        <ScreenIntro icon={Camera} title={t('Allow camera access', 'Tugoti ang camera')}
          subtitle={t('The camera is used only while this scanner is open. Nothing is recorded.', 'Gamiton lamang ang camera samtang abli ang scanner. Walay girekord.')} />
        {permission.canAskAgain ? (
          <Button icon={Camera} onPress={() => void requestPermission()}>{t('Allow camera', 'Tugoti ang camera')}</Button>
        ) : (
          <Button onPress={() => void Linking.openSettings()}>{t('Open settings', 'Ablihi ang settings')}</Button>
        )}
        <Button variant="outline" icon={Keyboard} onPress={() => router.replace({ pathname: '/wallet-action/[action]', params: { action: 'transfer' } })}>
          {t('Enter wallet number instead', 'Isulod hinuon ang wallet number')}
        </Button>
      </Page>
    );
  }
  return (
    <View style={s.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (handled.current) return;
          handled.current = true;
          setResult(classifyScan(data));
        }}
      />
      <SafeAreaView style={s.overlay} edges={['top', 'bottom', 'left', 'right']}>
        <View style={s.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Go back', 'Balik')} onPress={() => router.back()} style={s.back}>
            <ArrowLeft size={22} color={c.onPrimary} />
          </Pressable>
          <Txt accessibilityRole="header" variant="heading" style={{ color: c.onPrimary, flex: 1 }}>{t('Scan QR code', 'I-scan ang QR code')}</Txt>
        </View>
        <View style={s.middle}>
          <View style={s.frame}>
            <View style={[s.corner, { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 18 }]} />
            <View style={[s.corner, { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 18 }]} />
            <View style={[s.corner, { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 18 }]} />
            <View style={[s.corner, { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 18 }]} />
            <ScanLine />
          </View>
          <Txt style={{ color: c.onPrimary, textAlign: 'center', maxWidth: 280 }}>
            {t('Point the camera at a GarantiyAid wallet QR code.', 'Itutok ang camera sa GarantiyAid wallet QR code.')}
          </Txt>
        </View>
        <View style={s.bottom}>
          <IconCircle icon={ShieldAlert} tone="amber" size={36} />
          <Txt variant="small" style={{ color: '#E2E8F0', flex: 1 }}>
            {t('Claim passes are verified only by authorized facilitators.', 'Ang claim pass gi-verify lamang sa awtorisadong facilitator.')}
          </Txt>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between', backgroundColor: 'rgba(16,42,86,0.35)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  back: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  middle: { alignItems: 'center', gap: 20 },
  frame: { width: 250, height: 250, overflow: 'hidden' },
  corner: { position: 'absolute', width: 48, height: 48, borderColor: c.accent },
  scanLine: { position: 'absolute', left: 14, right: 14, top: 6, height: 3, borderRadius: 2, backgroundColor: c.accent },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, padding: 14, borderRadius: 16, backgroundColor: 'rgba(16,42,86,0.8)' },
});
