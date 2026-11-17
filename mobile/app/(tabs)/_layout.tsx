import { Tabs } from 'expo-router';
import { CircleHelp, Home, UserRound, Wallet } from 'lucide-react-native';
import { colors, fonts } from '../../src/theme';
import { useDemo } from '../../src/state';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabIcon } from '../../src/components';

export default function TabLayout() {
  const { t } = useDemo();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.outline,
          minHeight: 72,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          boxShadow: '0px -4px 16px rgba(16, 42, 86, 0.05)',
        },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12, paddingBottom: 2 },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('Home', 'Home'),
          tabBarIcon: ({ color, focused }) => <TabIcon icon={Home} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: t('Wallet', 'Wallet'),
          tabBarIcon: ({ color, focused }) => <TabIcon icon={Wallet} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: t('Help', 'Tabang'),
          tabBarIcon: ({ color, focused }) => <TabIcon icon={CircleHelp} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Profile', 'Profile'),
          tabBarIcon: ({ color, focused }) => <TabIcon icon={UserRound} color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
