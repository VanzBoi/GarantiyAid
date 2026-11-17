// GarantiyAid design tokens. Screens import `colors` and `fonts`; shared components also use the
// radius, spacing, and elevation scales so that every screen keeps the same rhythm.
export const colors = {
  primary: '#1652C5',
  primaryPressed: '#0F44A8',
  onPrimary: '#FFFFFF',
  primarySoft: '#EAF2FF',
  primaryTint: '#D6E5FF',
  navy: '#102A56',
  accent: '#27B8E8',
  accentSoft: '#E3F6FD',
  green: '#16A57A',
  // Darker green for text and filled buttons; #16A57A is used for icons and fills only.
  greenInk: '#0E7C5B',
  greenSoft: '#E3F7EF',
  surface: '#F7F9FC',
  card: '#FFFFFF',
  text: '#172B4D',
  muted: '#64748B',
  subtle: '#94A3B8',
  outline: '#E2E8F0',
  amber: '#8C6414',
  amberSoft: '#FFF6D9',
  error: '#B3313D',
  errorSoft: '#FFF0F1',
  shade: 'rgba(16,42,86,0.55)',
};
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
// boxShadow is supported by React Native's New Architecture and by react-native-web.
export const elevation = {
  card: '0px 2px 10px rgba(16, 42, 86, 0.06)',
  raised: '0px 8px 24px rgba(16, 42, 86, 0.10)',
  button: '0px 6px 14px rgba(22, 82, 197, 0.24)',
};
