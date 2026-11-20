import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Logo, Txt, useReducedMotion } from './components';
import { colors as c, fonts } from './theme';

// Keep the native splash (blue + white shield) until the first frame of the branded screen is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

const MIN_VISIBLE_MS = 1100;
const FADE_MS = 320;
// If fonts take this long (slow phone or network on web), show the splash with the system font instead.
const FONT_WAIT_MS = 4000;
// Logo size that matches the native splash icon (240 dp image, shield about 43% of it).
const LOGO_SIZE = 136;

/**
 * Branded loading screen shown when the app opens: the shield sits exactly where the native splash put it,
 * then the GarantiyAid name and a spinner appear below. It fades away once the app is ready.
 */
export function BrandSplash({ fontsReady, appReady, onHidden }: { fontsReady: boolean; appReady: boolean; onHidden: () => void }) {
  const reducedMotion = useReducedMotion();
  const [minimumShown, setMinimumShown] = useState(false);
  // Start hidden; with reduced motion the name and spinner are shown without animating
  // (the setting can arrive after the first render, so it is read at draw time below).
  const nameIn = useRef(new Animated.Value(0)).current;
  const spinnerIn = useRef(new Animated.Value(0)).current;
  const screen = useRef(new Animated.Value(1)).current;
  const started = useRef(false);
  const [fontWaitOver, setFontWaitOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const canShow = fontsReady || fontWaitOver;

  // Swap the native splash for this screen once text can render in the brand font.
  useEffect(() => {
    if (!canShow) return;
    if (!started.current) {
      started.current = true;
      SplashScreen.hide();
      if (!reducedMotion) {
        Animated.sequence([
          Animated.timing(nameIn, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(spinnerIn, { toValue: 1, duration: 260, useNativeDriver: true }),
        ]).start();
      }
    }
    // Re-armed on every run, so a remount in development cannot leave the splash waiting forever.
    const timer = setTimeout(() => setMinimumShown(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [canShow]);

  useEffect(() => {
    if (!appReady || !minimumShown) return;
    let done = false;
    const finish = () => { if (!done) { done = true; onHidden(); } };
    if (reducedMotion) { finish(); return; }
    // Remove the splash even if the fade is interrupted or animation frames are paused,
    // so it can never stay on top of the app.
    const safety = setTimeout(finish, FADE_MS + 600);
    Animated.timing(screen, { toValue: 0, duration: FADE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(finish);
    return () => clearTimeout(safety);
  }, [appReady, minimumShown]);

  return (
    <Animated.View
      accessibilityLabel="Loading GarantiyAid"
      accessibilityRole="progressbar"
      pointerEvents={appReady && minimumShown ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, s.screen, { opacity: screen }]}
    >
      <StatusBar style="light" />
      <View style={s.center}>
        <Logo size={LOGO_SIZE} light />
        <View style={s.below}>
          <Animated.View style={[{ alignSelf: 'stretch' }, !reducedMotion && { opacity: nameIn, transform: [{ translateY: nameIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
            <Txt numberOfLines={1} style={s.name}>GarantiyAid</Txt>
          </Animated.View>
          <Animated.View style={{ opacity: reducedMotion ? 1 : spinnerIn, marginTop: 36 }}>
            <ActivityIndicator size="large" color={c.onPrimary} />
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  screen: { backgroundColor: c.primary, zIndex: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Positioned under the logo without moving it off the screen's center.
  // Full width so Android never measures the name narrower than the bold font draws it.
  below: { position: 'absolute', left: 0, right: 0, top: '50%', marginTop: LOGO_SIZE / 2 + 18, alignItems: 'center' },
  name: { color: c.onPrimary, fontFamily: fonts.bold, fontSize: 34, lineHeight: 42, letterSpacing: -0.5, textAlign: 'center', alignSelf: 'stretch', paddingHorizontal: 24 },
});
