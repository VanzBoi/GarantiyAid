import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ColorValue,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock3,
  Eye,
  EyeOff,
  Glasses,
  Home,
  Info,
  Lightbulb,
  Lock,
  ScanFace,
  ShieldCheck,
  Smile,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors as c, elevation, fonts, radius } from './theme';
import { useDemo } from './state';

const NATIVE_DRIVER = Platform.OS !== 'web';
type Tone = 'primary' | 'green' | 'amber' | 'error' | 'accent' | 'neutral' | 'navy';
const tones: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: c.primarySoft, fg: c.primary },
  green: { bg: c.greenSoft, fg: c.greenInk },
  amber: { bg: c.amberSoft, fg: c.amber },
  error: { bg: c.errorSoft, fg: c.error },
  accent: { bg: c.accentSoft, fg: '#0B6F93' },
  neutral: { bg: '#F1F5F9', fg: c.muted },
  navy: { bg: '#E7ECF5', fg: c.navy },
};

// ───────────────────────────── Motion ─────────────────────────────
// One shared subscription to the system "reduce motion" setting.
let reduceMotion = false;
let motionSubscribed = false;
const motionListeners = new Set<(value: boolean) => void>();
function setReduceMotion(value: boolean) {
  reduceMotion = value;
  motionListeners.forEach((listener) => listener(value));
}
function subscribeMotion() {
  if (motionSubscribed) return;
  motionSubscribed = true;
  AccessibilityInfo.isReduceMotionEnabled?.()
    .then(setReduceMotion)
    .catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(reduceMotion);
  useEffect(() => {
    subscribeMotion();
    motionListeners.add(setReduced);
    setReduced(reduceMotion);
    return () => {
      motionListeners.delete(setReduced);
    };
  }, []);
  return reduced;
}

/** Subtle entrance: fade and rise. Renders immediately when reduce motion is on. */
export function FadeIn({
  children,
  delay = 0,
  distance = 10,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    });
    animation.start();
    // Never leave content hidden: if frames are throttled (background tab, slow device), show it anyway.
    const fallback = setTimeout(() => progress.setValue(1), delay + 700);
    return () => {
      clearTimeout(fallback);
      animation.stop();
    };
  }, [reduced]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Horizontal shake used for rejected codes. Changing `trigger` replays it. */
export function Shake({ trigger, children }: { trigger: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!trigger || reduced) return;
    const step = (toValue: number) =>
      Animated.timing(offset, { toValue, duration: 55, useNativeDriver: NATIVE_DRIVER });
    const animation = Animated.sequence([step(8), step(-8), step(6), step(-6), step(0)]);
    animation.start();
    return () => animation.stop();
  }, [trigger, reduced]);
  return <Animated.View style={{ transform: [{ translateX: offset }] }}>{children}</Animated.View>;
}

function usePressScale(scaleTo = 0.97) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number) => {
    if (reduced) return;
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: 0,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  };
  return { scale, onPressIn: () => to(scaleTo), onPressOut: () => to(1) };
}

// Layout keys belong on the animated wrapper so flex rows keep working.
const layoutKeys = [
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'width',
  'minWidth',
  'maxWidth',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
] as const;
function splitLayout(style?: ViewStyle) {
  const outer: ViewStyle = {};
  const inner: ViewStyle = { ...(style ?? {}) };
  for (const key of layoutKeys) {
    if (key in inner) {
      (outer as Record<string, unknown>)[key] = inner[key];
      delete (inner as Record<string, unknown>)[key];
    }
  }
  if ('flex' in outer || 'width' in outer) inner.flexGrow = 1;
  return { outer, inner };
}

/** Pressable surface with gentle press feedback. */
export function Tap({
  children,
  onPress,
  style,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  scaleTo,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'radio' | 'tab' | 'checkbox';
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean };
  scaleTo?: number;
}) {
  const press = usePressScale(scaleTo);
  const { outer, inner } = splitLayout(style);
  return (
    <Animated.View style={[outer, { transform: [{ scale: press.scale }] }]}>
      <Pressable
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [inner, pressed && { opacity: 0.92 }]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────────── Text & brand ─────────────────────────────
export function Txt({
  variant = 'body',
  style,
  ...props
}: TextProps & {
  variant?: 'body' | 'small' | 'label' | 'title' | 'heading' | 'number' | 'display' | 'caption';
}) {
  return <RNText {...props} style={[styles.text, styles[variant], style]} />;
}
export function Logo({
  size = 36,
  halo = false,
  light = false,
}: {
  size?: number;
  halo?: boolean;
  light?: boolean;
}) {
  const shield = light ? '#FFFFFF' : c.navy;
  const figure = light ? c.primary : '#1BBD91';
  const mark = (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="GarantiyAid shield">
      <Path fill={shield} d="M32 3 56 12v18c0 15-11 25-24 31C19 55 8 45 8 30V12Z" />
      <Circle cx="32" cy="22" r="7" fill={figure} />
      <Path fill={figure} d="M22 37v-4c0-5 4-8 10-8s10 3 10 8v4Z" />
      <Path
        fill={figure}
        d="m17 43 8-5h13c4 0 4 5 0 5h-7v3h12l7-4c4-2 6 2 3 5l-13 7H28l-11-5Z"
      />
    </Svg>
  );
  return halo ? (
    <View
      style={[
        styles.logoHalo,
        light && { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.28)' },
      ]}
    >
      {mark}
    </View>
  ) : (
    mark
  );
}
export function LanguageToggle({ full = false, light = false }: { full?: boolean; light?: boolean }) {
  const { language, setLanguage } = useDemo();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Language / Pinulongan"
      style={[styles.language, light && { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.3)' }]}
    >
      {(['en', 'bs'] as const).map((value) => {
        const selected = language === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={value === 'en' ? 'English' : 'Bisaya'}
            accessibilityState={{ checked: selected }}
            hitSlop={4}
            onPress={() => setLanguage(value)}
            style={[
              styles.languageOption,
              selected && (light ? { backgroundColor: c.card } : styles.languageSelected),
            ]}
          >
            <Txt
              variant="small"
              style={{
                color: selected ? (light ? c.primary : c.onPrimary) : light ? c.onPrimary : c.muted,
                fontFamily: fonts.semibold,
              }}
            >
              {full ? (value === 'en' ? 'English' : 'Bisaya') : value.toUpperCase()}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────────────────────────── Buttons ─────────────────────────────
export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon: Icon,
  style,
  accessibilityHint,
}: {
  children: React.ReactNode;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'green' | 'white' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  style?: ViewStyle;
  accessibilityHint?: string;
}) {
  const press = usePressScale();
  const filled = variant === 'primary' || variant === 'green' || variant === 'danger';
  const color = filled ? c.onPrimary : c.primary;
  const inactive = disabled || loading;
  const { outer, inner } = splitLayout(style);
  return (
    <Animated.View style={[outer, { transform: [{ scale: press.scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.button,
          variant === 'primary' && styles.primaryButton,
          variant === 'primary' && pressed && { backgroundColor: c.primaryPressed },
          variant === 'outline' && styles.outlineButton,
          variant === 'green' && { backgroundColor: c.greenInk },
          variant === 'white' && { backgroundColor: c.card },
          variant === 'ghost' && { backgroundColor: c.primarySoft },
          variant === 'danger' && { backgroundColor: c.error },
          inactive && styles.buttonDisabled,
          pressed && variant !== 'primary' && { opacity: 0.85 },
          inner,
        ]}
      >
        {loading ? <ActivityIndicator color={color} /> : Icon ? <Icon size={19} color={color} /> : null}
        <Txt variant="label" style={{ color, textAlign: 'center', flexShrink: 1 }}>
          {children}
        </Txt>
      </Pressable>
    </Animated.View>
  );
}
/** Inline text action that still meets the 48 dp touch target. */
export function TextLink({
  children,
  onPress,
  disabled,
  muted,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.textLink, pressed && { opacity: 0.7 }]}
    >
      <Txt
        variant="small"
        style={{ color: muted || disabled ? c.muted : c.primary, fontFamily: fonts.semibold, textAlign: 'center' }}
      >
        {children}
      </Txt>
    </Pressable>
  );
}

// ───────────────────────────── Layout ─────────────────────────────
export function Header({
  title,
  back = true,
  right,
  language = true,
}: {
  title?: string;
  back?: boolean;
  right?: React.ReactNode;
  language?: boolean;
}) {
  const { t } = useDemo();
  return (
    <View style={styles.header}>
      {back && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Go back', 'Balik')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
          style={({ pressed }) => [styles.iconButton, styles.backButton, pressed && { backgroundColor: c.primarySoft }]}
        >
          <ArrowLeft size={20} color={c.text} />
        </Pressable>
      )}
      {title ? (
        <Txt accessibilityRole="header" variant="heading" numberOfLines={2} style={{ flex: 1, fontSize: 18 }}>
          {title}
        </Txt>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right}
      {language && <LanguageToggle />}
    </View>
  );
}
export function Page({
  children,
  title,
  back,
  header = true,
  footer,
  tabs = false,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  title?: string;
  back?: boolean;
  header?: boolean;
  footer?: React.ReactNode;
  tabs?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}) {
  return (
    <SafeAreaView
      edges={tabs ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
      style={[styles.page, style]}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header && <Header title={title} back={back} />}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
          style={{ flex: 1 }}
        >
          <FadeIn style={[styles.pageContent, contentStyle]}>{children}</FadeIn>
        </ScrollView>
        {footer && <View style={styles.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({
  children,
  style,
  flat = false,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  flat?: boolean;
}) {
  return <View style={[styles.card, flat && { boxShadow: 'none' }, style]}>{children}</View>;
}
/** Blue gradient surface used for the hero, schedule, wallet and claim-pass cards. */
export function GradientCard({
  children,
  style,
  from = c.primary,
  to = c.navy,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  from?: string;
  to?: string;
}) {
  const id = useRef(`ga-gradient-${Math.random().toString(36).slice(2, 9)}`).current;
  return (
    <View style={[styles.gradient, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
        </Svg>
        <View style={[styles.orb, { width: 180, height: 180, top: -70, right: -50 }]} />
        <View style={[styles.orb, { width: 120, height: 120, bottom: -60, left: -30, opacity: 0.6 }]} />
      </View>
      {children}
    </View>
  );
}
export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between', marginTop: 8, gap: 8 }]}>
      <Txt accessibilityRole="header" variant="heading" style={{ fontSize: 18, flexShrink: 1 }}>
        {title}
      </Txt>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={styles.sectionAction}>
          <Txt variant="small" style={{ color: c.primary, fontFamily: fonts.semibold }}>
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
/** Layout helpers for screens that only import from this module. */
export function Row({ children, gap = 12, spread = false }: { children: React.ReactNode; gap?: number; spread?: boolean }) {
  return (
    <View style={[styles.row, { gap }, spread && { justifyContent: 'space-between', flexWrap: 'wrap' }]}>{children}</View>
  );
}
export function Stack({ children, gap = 4 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ flex: 1, gap }}>{children}</View>;
}
export function Divider({ dashed = false }: { dashed?: boolean }) {
  return (
    <View
      style={{
        height: 0,
        borderTopWidth: 1,
        borderColor: c.outline,
        borderStyle: dashed ? 'dashed' : 'solid',
      }}
    />
  );
}

// ───────────────────────────── Icons & status ─────────────────────────────
export function IconCircle({
  icon: Icon,
  tone = 'primary',
  size = 40,
  square = false,
  filled = false,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
  square?: boolean;
  filled?: boolean;
}) {
  const palette = tones[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: square ? size * 0.32 : size / 2,
        backgroundColor: filled ? palette.fg : palette.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {Icon ? <Icon size={Math.round(size * 0.5)} color={filled ? c.onPrimary : palette.fg} /> : null}
    </View>
  );
}
// Named icons for screens that should not import the icon library directly.
const namedIcons = {
  'scan-face': ScanFace,
  shield: ShieldCheck,
  check: CircleCheck,
  alert: CircleAlert,
  clock: Clock3,
  lock: Lock,
  info: Info,
  bell: Bell,
  calendar: CalendarDays,
  user: UserRound,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof namedIcons;

/** Icon circle chosen by name, for screens that should not import the icon library. */
export function NamedIcon({ name, tone = 'primary', size = 40, square = false }: { name: IconName; tone?: Tone; size?: number; square?: boolean }) {
  return <IconCircle icon={namedIcons[name]} tone={tone} size={size} square={square} />;
}
/** Centered icon, title and supporting copy used at the top of task screens. */
export function ScreenIntro({
  icon,
  iconName,
  title,
  subtitle,
  tone = 'primary',
  size = 72,
}: {
  icon?: LucideIcon;
  iconName?: IconName;
  title: string;
  subtitle?: React.ReactNode;
  tone?: Tone;
  size?: number;
}) {
  const Icon = icon ?? (iconName ? namedIcons[iconName] : ShieldCheck);
  return (
    <View style={styles.intro}>
      <View style={[styles.introRing, { width: size + 20, height: size + 20, borderRadius: (size + 20) / 2, borderColor: tones[tone].bg }]}>
        <IconCircle icon={Icon} tone={tone} size={size} />
      </View>
      <Txt accessibilityRole="header" variant="title" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {subtitle ? (
        <Txt style={{ textAlign: 'center', color: c.muted, maxWidth: 320 }}>{subtitle}</Txt>
      ) : null}
    </View>
  );
}
export function Notice({
  children,
  tone = 'info',
  icon: Icon,
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warning' | 'success' | 'error';
  icon?: LucideIcon;
}) {
  const palette = {
    info: [c.primarySoft, c.primary, Info],
    warning: [c.amberSoft, c.amber, CircleAlert],
    success: [c.greenSoft, c.greenInk, CircleCheck],
    error: [c.errorSoft, c.error, CircleAlert],
  }[tone] as [string, string, LucideIcon];
  const Glyph = Icon ?? palette[2];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[styles.notice, { backgroundColor: palette[0] }]}
    >
      <Glyph size={18} color={palette[1]} style={{ marginTop: 1 }} />
      <Txt variant="small" style={{ flex: 1, color: palette[1], lineHeight: 19 }}>
        {children}
      </Txt>
    </View>
  );
}
export function Badge({
  children,
  tone = 'warning',
  center = false,
}: {
  children: React.ReactNode;
  tone?: 'warning' | 'success' | 'error' | 'info' | 'neutral' | 'light';
  center?: boolean;
}) {
  const palette = {
    warning: [c.amberSoft, c.amber],
    success: [c.greenSoft, c.greenInk],
    error: [c.errorSoft, c.error],
    info: [c.primarySoft, c.primary],
    neutral: ['#F1F5F9', c.muted],
    light: ['rgba(255,255,255,0.18)', c.onPrimary],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette[0] }, center && { alignSelf: 'center' }]}>
      <View style={[styles.badgeDot, { backgroundColor: palette[1] }]} />
      <Txt variant="small" style={{ color: palette[1], fontFamily: fonts.semibold, fontSize: 12, flexShrink: 1 }}>
        {children}
      </Txt>
    </View>
  );
}
export const StatusBadge = Badge;

// ───────────────────────────── Inputs ─────────────────────────────
function useFocusRing() {
  const [focused, setFocused] = useState(false);
  const focus = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    const animation = Animated.timing(focus, {
      toValue: focused ? 1 : 0,
      duration: reduced ? 0 : 160,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [focused, reduced]);
  return {
    focused,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    borderColor: focus.interpolate({ inputRange: [0, 1], outputRange: [c.outline, c.primary] }),
  };
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secure = false,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
  maxLength,
  editable = true,
  icon: Icon,
  helper,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  error?: string;
  secure?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  maxLength?: number;
  editable?: boolean;
  icon?: LucideIcon;
  helper?: string;
}) {
  const { t } = useDemo();
  const ring = useFocusRing();
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="label">{label}</Txt>
      <Animated.View
        style={[
          styles.inputBox,
          { borderColor: error ? c.error : ring.borderColor },
          ring.focused && !error && styles.inputFocused,
          !editable && styles.inputDisabled,
        ]}
      >
        {Icon ? <Icon size={19} color={ring.focused ? c.primary : c.subtle} /> : null}
        <TextInput
          accessibilityLabel={error ? `${label}. ${t('Error', 'Sayop')}: ${error}` : label}
          accessibilityHint={
            error ? t('Correct this field before continuing.', 'Tarunga kini nga field sa dili pa mopadayon.') : undefined
          }
          value={value}
          onChangeText={onChangeText}
          onFocus={ring.onFocus}
          onBlur={ring.onBlur}
          placeholder={placeholder}
          placeholderTextColor={c.subtle}
          secureTextEntry={secure && hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          maxLength={maxLength}
          editable={editable}
          style={styles.inputText}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('Show password', 'Ipakita ang password') : t('Hide password', 'Itago ang password')}
            onPress={() => setHidden(!hidden)}
            style={styles.inputAction}
          >
            {hidden ? <Eye size={20} color={c.muted} /> : <EyeOff size={20} color={c.muted} />}
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? (
        <Txt accessibilityRole="alert" accessibilityLiveRegion="assertive" variant="small" style={{ color: c.error }}>
          {error}
        </Txt>
      ) : helper ? (
        <Txt variant="small">{helper}</Txt>
      ) : null}
    </View>
  );
}
export const AppInput = Field;
export function PasswordInput(props: Omit<React.ComponentProps<typeof Field>, 'secure'>) {
  return <Field {...props} secure icon={props.icon ?? Lock} />;
}
export function PhoneField({
  value,
  onChangeText,
  error,
  editable = true,
}: {
  value: string;
  onChangeText: (s: string) => void;
  error?: string;
  editable?: boolean;
}) {
  const { t } = useDemo();
  const ring = useFocusRing();
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="label">{t('Mobile number', 'Numero sa cellphone')}</Txt>
      <Animated.View
        style={[
          styles.inputBox,
          { borderColor: error ? c.error : ring.borderColor, paddingLeft: 6 },
          ring.focused && !error && styles.inputFocused,
          !editable && styles.inputDisabled,
        ]}
      >
        <View style={styles.countryCode}>
          <Txt variant="label" style={{ color: c.primary }}>
            +63
          </Txt>
        </View>
        <TextInput
          accessibilityLabel={error ? `${t('Mobile number', 'Numero sa cellphone')}. ${error}` : t('Mobile number', 'Numero sa cellphone')}
          autoComplete="tel-national"
          editable={editable}
          textContentType="telephoneNumber"
          keyboardType="phone-pad"
          value={value}
          onFocus={ring.onFocus}
          onBlur={ring.onBlur}
          onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 10))}
          maxLength={10}
          placeholder="9XX XXX XXXX"
          placeholderTextColor={c.subtle}
          style={[styles.inputText, { letterSpacing: 0.5 }]}
        />
      </Animated.View>
      {error ? (
        <Txt accessibilityRole="alert" accessibilityLiveRegion="assertive" variant="small" style={{ color: c.error }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
  count,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.85 }]}
    >
      <Txt variant="small" style={{ color: selected ? c.onPrimary : c.text, fontFamily: fonts.semibold }}>
        {label}
      </Txt>
      {count !== undefined && (
        <View style={[styles.chipCount, selected && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
          <Txt variant="small" style={{ fontSize: 11, color: selected ? c.onPrimary : c.primary, fontFamily: fonts.bold }}>
            {count}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

// ───────────────────────────── Rows ─────────────────────────────
export function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
}) {
  return (
    <View style={[styles.row, { alignItems: Icon ? 'center' : 'flex-start' }]}>
      {Icon && <IconCircle icon={Icon} size={38} square />}
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="small">{label}</Txt>
        <Txt variant="label">{value}</Txt>
      </View>
    </View>
  );
}
/** Receipt-style row: label on the left, value on the right. */
export function KeyValue({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
      <Txt variant="small" style={{ flexShrink: 0 }}>
        {label}
      </Txt>
      <Txt
        selectable
        variant={strong ? 'label' : 'small'}
        style={{ color: c.text, flex: 1, textAlign: 'right', fontFamily: strong ? fonts.bold : fonts.medium }}
      >
        {value}
      </Txt>
    </View>
  );
}
export function MenuRow({
  title,
  icon: Icon,
  onPress,
  subtitle,
  tone = 'primary',
  last = false,
}: {
  title: string;
  icon: LucideIcon;
  onPress: () => void;
  subtitle?: string;
  tone?: Tone;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, !last && styles.menuDivider, pressed && { backgroundColor: c.surface }]}
    >
      <IconCircle icon={Icon} tone={tone} size={40} square />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label">{title}</Txt>
        {subtitle ? <Txt variant="small">{subtitle}</Txt> : null}
      </View>
      <ChevronRight size={18} color={c.subtle} />
    </Pressable>
  );
}
export function QuickAction({
  label,
  icon,
  onPress,
  tone = 'primary',
  caption,
  disabled = false,
  style,
}: {
  label: string;
  icon: LucideIcon;
  onPress?: () => void;
  tone?: Tone;
  caption?: string;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={caption ? `${label}. ${caption}` : label}
      style={{ ...styles.quickAction, ...(disabled ? { opacity: 0.6 } : {}), ...style }}
    >
      <IconCircle icon={disabled ? Lock : icon} tone={disabled ? 'neutral' : tone} size={42} square />
      <Txt variant="small" numberOfLines={2} style={{ textAlign: 'center', color: c.text, fontFamily: fonts.semibold }}>
        {label}
      </Txt>
      {caption ? (
        <Txt variant="small" numberOfLines={2} style={{ textAlign: 'center', fontSize: 11, lineHeight: 14 }}>
          {caption}
        </Txt>
      ) : null}
    </Tap>
  );
}
export function TransactionCard({
  title,
  subtitle,
  meta,
  amount,
  negative,
  icon,
  onPress,
  accessibilityLabel,
  first,
}: {
  title: string;
  subtitle: string;
  meta?: string;
  amount: string;
  negative?: boolean;
  icon: LucideIcon;
  onPress?: () => void;
  accessibilityLabel?: string;
  first?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.transaction, !first && styles.menuDivider, pressed && { backgroundColor: c.surface }]}
    >
      <IconCircle icon={icon} tone={negative ? 'error' : 'green'} size={42} />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="label" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="small" numberOfLines={2}>
          {subtitle}
        </Txt>
        {meta ? (
          <Txt variant="small" style={{ fontSize: 11, color: c.subtle }} numberOfLines={1}>
            {meta}
          </Txt>
        ) : null}
      </View>
      <Txt variant="label" style={{ color: negative ? c.error : c.greenInk, flexShrink: 1, textAlign: 'right', maxWidth: '40%', fontVariant: ['tabular-nums'] }}>
        {amount}
      </Txt>
      <ChevronRight size={16} color={c.subtle} />
    </Pressable>
  );
}
export function NotificationCard({
  icon,
  tone = 'primary',
  title,
  message,
  time,
  unread,
  onPress,
  accessibilityLabel,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Tap onPress={onPress} accessibilityLabel={accessibilityLabel} scaleTo={0.98}>
      <View style={[styles.card, styles.notification, unread && styles.notificationUnread]}>
        <IconCircle icon={icon} tone={tone} size={42} square />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={[styles.row, { gap: 8 }]}>
            <Txt variant="label" style={{ flex: 1 }} numberOfLines={2}>
              {title}
            </Txt>
            {unread && <View style={styles.unreadDot} />}
          </View>
          <Txt variant="small" numberOfLines={3} style={{ color: c.text }}>
            {message}
          </Txt>
          <Txt variant="small" style={{ fontSize: 12, color: c.subtle }}>
            {time}
          </Txt>
        </View>
      </View>
    </Tap>
  );
}

// ───────────────────────────── Feedback ─────────────────────────────
export function LoadingSkeleton({ label, lines = 3, block = true }: { label: string; lines?: number; block?: boolean }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0.55, duration: 650, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={[block && styles.card, { gap: 12 }]}>
      <Animated.View style={{ gap: 10, opacity: pulse }}>
        {block && <View style={[styles.skeleton, { width: 44, height: 44, borderRadius: 14 }]} />}
        {Array.from({ length: lines }, (_, index) => (
          <View key={index} style={[styles.skeleton, { width: `${index === 0 ? 70 : 100 - index * 15}%` as `${number}%` }]} />
        ))}
      </Animated.View>
      <Txt variant="small" accessibilityLiveRegion="polite">
        {label}
      </Txt>
    </View>
  );
}
export function EmptyState({
  icon = Info,
  title,
  body,
  children,
  tone = 'primary',
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  children?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <View style={[styles.card, styles.empty]}>
      <IconCircle icon={icon} tone={tone} size={60} />
      <Txt variant="heading" style={{ textAlign: 'center', fontSize: 17 }}>
        {title}
      </Txt>
      {body ? <Txt variant="small" style={{ textAlign: 'center' }}>{body}</Txt> : null}
      {children ? <View style={{ alignSelf: 'stretch', gap: 10 }}>{children}</View> : null}
    </View>
  );
}
export function ConfirmationModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  loading = false,
  danger = false,
  icon,
  children,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
  icon?: LucideIcon;
  children?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={() => !loading && onCancel()}
    >
      <View style={styles.modalShade}>
        <FadeIn distance={24} style={{ width: '100%', alignItems: 'center' }}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <IconCircle icon={icon ?? (danger ? CircleAlert : Info)} tone={danger ? 'error' : 'primary'} size={56} />
            <Txt accessibilityRole="header" variant="heading" style={{ textAlign: 'center' }}>
              {title}
            </Txt>
            <Txt style={{ textAlign: 'center', color: c.muted }}>{message}</Txt>
            {children}
            <View style={[styles.row, { alignSelf: 'stretch', gap: 10 }]}>
              <Button variant="outline" disabled={loading} onPress={onCancel} style={{ flex: 1 }}>
                {cancelLabel}
              </Button>
              <Button variant={danger ? 'danger' : 'primary'} loading={loading} onPress={onConfirm} style={{ flex: 1 }}>
                {confirmLabel}
              </Button>
            </View>
          </View>
        </FadeIn>
      </View>
    </Modal>
  );
}
/** Full-screen sheet for detailed records such as receipts. */
export function SheetModal({
  visible,
  title,
  onClose,
  closeLabel,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose}>
      <View style={styles.modalShade}>
        <FadeIn distance={24} style={{ width: '100%', alignItems: 'center', maxHeight: '92%' }}>
          <View accessibilityViewIsModal style={[styles.modalCard, { alignItems: 'stretch', padding: 0 }]}>
            <View style={[styles.row, { justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 }]}>
              <Txt accessibilityRole="header" variant="heading">
                {title}
              </Txt>
              <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.iconButton}>
                <X size={20} color={c.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 16 }}>{children}</ScrollView>
          </View>
        </FadeIn>
      </View>
    </Modal>
  );
}
export function ProfileAvatar({
  name,
  size = 64,
  verified = false,
  light = false,
}: {
  name: string;
  size?: number;
  verified?: boolean;
  light?: boolean;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .filter((_, index, all) => index === 0 || index === all.length - 1)
    .join('')
    .toUpperCase();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2 },
          light && { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.5)' },
        ]}
      >
        <Txt variant="heading" style={{ color: light ? c.onPrimary : c.primary, fontSize: size * 0.34, lineHeight: size * 0.42 }}>
          {initials || '?'}
        </Txt>
      </View>
      {verified && (
        <View style={[styles.avatarBadge, { right: -2, bottom: -2 }]}>
          <Check size={12} color={c.onPrimary} strokeWidth={3} />
        </View>
      )}
    </View>
  );
}
export function StepProgress({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: step }}
      accessibilityLabel={label}
      style={{ gap: 8 }}
    >
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Txt variant="small" style={{ color: c.primary, fontFamily: fonts.semibold }}>
          {label}
        </Txt>
        <Txt variant="small">{Math.round((step / total) * 100)}%</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[styles.stepBar, index < step && { backgroundColor: index === step - 1 ? c.primary : c.accent }]}
          />
        ))}
      </View>
    </View>
  );
}
export const ProgressIndicator = StepProgress;
export type TimelineStep = { label: string; caption?: string; state: 'done' | 'current' | 'todo' | 'blocked' };
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View accessibilityRole="list">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const color =
          step.state === 'done' ? c.green : step.state === 'current' ? c.primary : step.state === 'blocked' ? c.error : c.outline;
        return (
          <View
            key={step.label}
            accessible
            accessibilityLabel={`${step.label}. ${step.caption ?? ''}`}
            style={{ flexDirection: 'row', gap: 14 }}
          >
            <View style={{ alignItems: 'center', width: 30 }}>
              <View
                style={[
                  styles.timelineDot,
                  { borderColor: color },
                  (step.state === 'done' || step.state === 'blocked') && { backgroundColor: color },
                ]}
              >
                {step.state === 'done' ? (
                  <Check size={15} color={c.onPrimary} strokeWidth={3} />
                ) : step.state === 'blocked' ? (
                  <X size={15} color={c.onPrimary} strokeWidth={3} />
                ) : step.state === 'current' ? (
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary }} />
                ) : null}
              </View>
              {!last && <View style={[styles.timelineLine, step.state === 'done' && { backgroundColor: c.green }]} />}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 20, gap: 2, paddingTop: 4 }}>
              <Txt variant="label" style={{ color: step.state === 'todo' ? c.muted : c.text }}>
                {step.label}
              </Txt>
              {step.caption ? <Txt variant="small">{step.caption}</Txt> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
export function Checklist({ items }: { items: { icon: 'light' | 'glasses' | 'face' | 'check'; text: string }[] }) {
  const icons = { light: Lightbulb, glasses: Glasses, face: Smile, check: CircleCheck };
  return (
    <View style={{ gap: 12 }}>
      {items.map((item) => (
        <View key={item.text} style={[styles.row, { gap: 12 }]}>
          <IconCircle icon={icons[item.icon]} tone="green" size={34} />
          <Txt style={{ flex: 1 }}>{item.text}</Txt>
        </View>
      ))}
    </View>
  );
}
/** Illustration of the in-person face capture frame. It is not a camera and verifies nothing. */
export function FaceGuide({ tone = 'primary' }: { tone?: 'primary' | 'green' | 'amber' }) {
  const color = tone === 'green' ? c.green : tone === 'amber' ? '#D39B22' : c.primary;
  const corner = { position: 'absolute' as const, width: 34, height: 34, borderColor: color };
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.faceGuide}>
      <View style={[styles.faceOval, { borderColor: color }]}>
        <ScanFace size={72} color={color} strokeWidth={1.4} />
      </View>
      <View style={[corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 }]} />
      <View style={[corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 }]} />
      <View style={[corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 }]} />
      <View style={[corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 }]} />
    </View>
  );
}
/** Decorative welcome scene: rolling hills and barangay homes. */
export function WelcomeIllustration({ height = 150 }: { height?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height, alignSelf: 'stretch' }}>
      <Svg width="100%" height="100%" viewBox="0 0 360 150" preserveAspectRatio="xMidYMax slice">
        <Circle cx="292" cy="40" r="20" fill="#FFFFFF" fillOpacity={0.18} />
        <Path d="M0 110 C60 80 120 90 180 104 C240 118 300 92 360 98 V150 H0Z" fill="#FFFFFF" fillOpacity={0.12} />
        <Path d="M0 126 C80 108 150 116 220 124 C280 131 320 118 360 120 V150 H0Z" fill="#FFFFFF" fillOpacity={0.2} />
        <Rect x="228" y="84" width="56" height="40" rx="4" fill="#FFFFFF" fillOpacity={0.9} />
        <Path d="M222 88 L256 62 L290 88Z" fill={c.accent} />
        <Rect x="250" y="102" width="12" height="22" rx="2" fill={c.primary} />
        <Rect x="234" y="94" width="10" height="10" rx="2" fill={c.primaryTint} />
        <Rect x="268" y="94" width="10" height="10" rx="2" fill={c.primaryTint} />
        <Rect x="296" y="98" width="34" height="26" rx="3" fill="#FFFFFF" fillOpacity={0.75} />
        <Path d="M292 101 L313 84 L334 101Z" fill="#FFFFFF" />
        <Circle cx="70" cy="98" r="7" fill="#FFFFFF" fillOpacity={0.9} />
        <Rect x="63" y="106" width="14" height="20" rx="6" fill="#FFFFFF" fillOpacity={0.9} />
        <Circle cx="96" cy="102" r="6" fill="#FFFFFF" fillOpacity={0.75} />
        <Rect x="90" y="109" width="12" height="17" rx="5" fill="#FFFFFF" fillOpacity={0.75} />
        <Circle cx="118" cy="105" r="5" fill="#FFFFFF" fillOpacity={0.6} />
        <Rect x="113" y="111" width="10" height="15" rx="4" fill="#FFFFFF" fillOpacity={0.6} />
      </Svg>
    </View>
  );
}

// ───────────────────────────── Navigation ─────────────────────────────
export function TabIcon({ icon: Icon, focused, color }: { icon: LucideIcon; focused: boolean; color: ColorValue }) {
  return (
    <View style={[styles.tabPill, focused && { backgroundColor: c.primarySoft }]}>
      <Icon size={22} color={color as string} strokeWidth={focused ? 2.4 : 2} />
    </View>
  );
}
export function BottomLinks({ active = 'home' }: { active?: string }) {
  const inset = useSafeAreaInsets();
  const { t } = useDemo();
  const links = [
    { id: 'home', path: '/(tabs)/home', label: t('Home', 'Home'), Icon: Home },
    { id: 'wallet', path: '/(tabs)/wallet', label: t('Wallet', 'Wallet'), Icon: Wallet },
    { id: 'help', path: '/(tabs)/help', label: t('Help', 'Tabang'), Icon: CircleHelp },
    { id: 'profile', path: '/(tabs)/profile', label: t('Profile', 'Profile'), Icon: UserRound },
  ];
  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(inset.bottom, 8) }]}>
      {links.map(({ id, path, label, Icon }) => {
        const selected = id === active;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            key={id}
            style={styles.bottomLink}
            onPress={() => router.replace(path as '/(tabs)/home')}
          >
            <TabIcon icon={Icon} focused={selected} color={selected ? c.primary : c.muted} />
            <Txt
              variant="small"
              style={{ fontSize: 12, color: selected ? c.primary : c.muted, fontFamily: selected ? fonts.semibold : fonts.medium }}
            >
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
export const BottomNavigation = BottomLinks;
export const openRoute = (path: string) => router.push(path as '/scan');
export const go = (screen: string, params: Record<string, string> = {}) =>
  router.push({ pathname: '/[page]', params: { page: screen, ...params } });
export const flow = (step: string, params: Record<string, string> = {}) =>
  router.push({ pathname: '/flow/[step]', params: { step, ...params } });

export const styles = StyleSheet.create({
  text: { color: c.text, fontFamily: fonts.regular },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 19, color: c.muted },
  label: { fontSize: 15, lineHeight: 21, fontFamily: fonts.semibold },
  title: { fontSize: 25, lineHeight: 32, fontFamily: fonts.bold, letterSpacing: -0.5 },
  heading: { fontSize: 19, lineHeight: 25, fontFamily: fonts.bold, letterSpacing: -0.2 },
  number: { fontSize: 36, lineHeight: 43, fontFamily: fonts.bold, letterSpacing: -1 },
  display: { fontSize: 32, lineHeight: 38, fontFamily: fonts.bold, letterSpacing: -0.8 },
  caption: { fontSize: 11, lineHeight: 15, fontFamily: fonts.semibold, letterSpacing: 1, color: c.muted },
  page: { flex: 1, backgroundColor: c.surface },
  pageContent: { padding: 20, paddingBottom: 28, gap: 18, flexGrow: 1 },
  footer: {
    padding: 20,
    paddingTop: 12,
    gap: 6,
    backgroundColor: c.card,
    borderTopWidth: 1,
    borderColor: c.outline,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.card,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: { backgroundColor: c.card, borderWidth: 1, borderColor: c.outline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: {
    backgroundColor: c.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: 18,
    gap: 16,
    boxShadow: elevation.card,
  },
  gradient: {
    borderRadius: radius.xl,
    padding: 20,
    gap: 16,
    overflow: 'hidden',
    backgroundColor: c.primary,
    boxShadow: elevation.raised,
  },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  button: {
    backgroundColor: c.primary,
    minHeight: 52,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: { boxShadow: elevation.button },
  buttonDisabled: { opacity: 0.45, boxShadow: 'none' },
  outlineButton: {
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.primaryTint,
  },
  textLink: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  sectionAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8, flexShrink: 0 },
  input: {
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: c.outline,
    borderRadius: radius.md,
    backgroundColor: c.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: c.text,
    fontFamily: fonts.regular,
  },
  inputBox: {
    minHeight: 54,
    borderWidth: 1.5,
    borderRadius: radius.md,
    backgroundColor: c.card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputFocused: { boxShadow: `0px 0px 0px 4px ${c.primarySoft}` },
  inputDisabled: { backgroundColor: c.surface, opacity: 0.7 },
  inputText: {
    flex: 1,
    minHeight: 50,
    fontSize: 16,
    color: c.text,
    fontFamily: fonts.regular,
    paddingVertical: 10,
  },
  inputAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  countryCode: {
    minHeight: 40,
    paddingHorizontal: 10,
    backgroundColor: c.primarySoft,
    borderRadius: radius.sm,
    justifyContent: 'center',
  },
  language: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: 28,
    padding: 3,
    backgroundColor: c.card,
  },
  languageOption: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageSelected: { backgroundColor: c.primary },
  logoHalo: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: c.primarySoft,
    borderWidth: 1,
    borderColor: c.primaryTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  intro: { alignItems: 'center', gap: 12, paddingTop: 4 },
  introRing: { borderWidth: 10, alignItems: 'center', justifyContent: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: radius.md,
    gap: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.outline,
    backgroundColor: c.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipSelected: { backgroundColor: c.primary, borderColor: c.primary },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 64,
  },
  menuDivider: { borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
  quickAction: {
    flex: 1,
    minWidth: 80,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 6,
    minHeight: 108,
    backgroundColor: c.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EDF1F6',
    boxShadow: 'none',
  },
  transaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    minHeight: 72,
  },
  notification: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  notificationUnread: { borderColor: c.primaryTint, backgroundColor: '#FBFCFF' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary },
  skeleton: { height: 12, borderRadius: 6, backgroundColor: '#E6ECF4' },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  modalShade: {
    flex: 1,
    backgroundColor: c.shade,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: c.card,
    borderRadius: radius.xl,
    padding: 24,
    gap: 14,
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
    boxShadow: elevation.raised,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primarySoft,
    borderWidth: 2,
    borderColor: c.card,
  },
  avatarBadge: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.green,
    borderWidth: 2,
    borderColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.outline },
  timelineDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: { width: 2, flex: 1, minHeight: 18, backgroundColor: c.outline, marginVertical: 2 },
  faceGuide: { width: 220, height: 220, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  faceOval: {
    width: 150,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.card,
  },
  tabPill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: c.card,
    borderTopWidth: 1,
    borderColor: c.outline,
    paddingTop: 8,
    boxShadow: '0px -4px 16px rgba(16, 42, 86, 0.05)',
  },
  bottomLink: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
