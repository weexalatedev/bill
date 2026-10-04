import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ClerkProvider } from '@clerk/clerk-expo';
import {
  Bot,
  Building2,
  CreditCard,
  FileSearch,
  LayoutDashboard,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

import { AppProvider } from './src/store';
import AuthGate from './src/AuthGate';
import DataGate from './src/components/DataGate';
import { ToastHost } from './src/components/Layout';
import { api, API_URL, type ApiConfig } from './src/lib/api';
import { clerkTokenCache, ClerkAuthProvider } from './src/lib/auth';
import { colors, font, fontWeight, shadow } from './src/theme';

import DashboardScreen from './src/screens/DashboardScreen';
import BillsScreen from './src/screens/BillsScreen';
import OptimiserScreen from './src/screens/OptimiserScreen';
import SitesScreen from './src/screens/SitesScreen';
import CopilotScreen from './src/screens/CopilotScreen';
import PlansScreen from './src/screens/PlansScreen';

export type TabParamList = {
  Dashboard: undefined;
  Bills: undefined;
  Optimiser: undefined;
  Sites: undefined;
  Copilot: undefined;
  Plans: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

type TabDef = { name: keyof TabParamList; label: string; Icon: LucideIcon };

const TABS: TabDef[] = [
  { name: 'Dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { name: 'Bills', label: 'Bills', Icon: FileSearch },
  { name: 'Optimiser', label: 'Optimiser', Icon: Sparkles },
  { name: 'Sites', label: 'Sites', Icon: Building2 },
  { name: 'Copilot', label: 'Copilot', Icon: Bot },
  { name: 'Plans', label: 'Plans', Icon: CreditCard },
];

const SCREENS: Record<keyof TabParamList, React.ComponentType> = {
  Dashboard: DashboardScreen,
  Bills: BillsScreen,
  Optimiser: OptimiserScreen,
  Sites: SitesScreen,
  Copilot: CopilotScreen,
  Plans: PlansScreen,
};

/** Navigation theme aligned with the EnerOS palette. */
const navTheme: NavTheme = {
  dark: false,
  colors: {
    primary: colors.emerald600,
    background: colors.slate100,
    card: colors.white,
    text: colors.slate800,
    border: colors.slate200,
    notification: colors.emerald500,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '800' },
  },
};

function NavigationShell() {
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        initialRouteName="Dashboard"
        screenOptions={({ route }) => {
          const tab = TABS.find((t) => t.name === route.name)!;
          const Icon = tab.Icon;
          return {
            headerShown: false,
            tabBarActiveTintColor: colors.emerald600,
            tabBarInactiveTintColor: colors.slate400,
            tabBarStyle: {
              backgroundColor: colors.white,
              borderTopColor: colors.slate200,
              height: 60,
              paddingBottom: 6,
              paddingTop: 6,
              ...shadow.float,
            },
            tabBarLabelStyle: {
              fontSize: font.xs,
              fontWeight: fontWeight.medium as '500',
            },
            tabBarIcon: ({ color, size }) => (
              <Icon size={size > 22 ? 20 : size} color={color} strokeWidth={2} />
            ),
          };
        }}
      >
        {TABS.map(({ name, label }) => (
          <Tab.Screen key={name} name={name} component={SCREENS[name]} options={{ title: label }} />
        ))}
      </Tab.Navigator>
      <ToastHost />
    </NavigationContainer>
  );
}

function BootScreen({ error }: { error?: string | null }) {
  return (
    <View style={s.boot}>
      <View style={s.logo}>
        <Zap size={22} color={colors.ink900} strokeWidth={2.6} />
      </View>
      {error ? (
        <>
          <Text style={s.bootTitle}>Cannot reach the EnerOS API</Text>
          <Text style={s.bootText}>{error}</Text>
          <Text style={s.bootHint}>
            Start the backend with `cd server &amp;&amp; npm run dev` and set EXPO_PUBLIC_API_URL
            (currently {API_URL}).
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.emerald600} />
          <Text style={s.bootText}>Connecting to EnerOS…</Text>
        </>
      )}
    </View>
  );
}

/** Wraps the app in the Clerk auth provider. */
function AppProviders({ config }: { config: ApiConfig }) {
  const shell = (
    <AuthGate>
      <AppProvider>
        <DataGate>
          <NavigationShell />
        </DataGate>
      </AppProvider>
    </AuthGate>
  );

  if (!config.clerkPublishableKey) {
    return <BootScreen error="Clerk is not configured on the API." />;
  }

  return (
    <ClerkProvider publishableKey={config.clerkPublishableKey} tokenCache={clerkTokenCache}>
      <ClerkAuthProvider>{shell}</ClerkAuthProvider>
    </ClerkProvider>
  );
}

export default function App() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unknown error'));
  }, []);

  return (
    <SafeAreaProvider>
      {error ? (
        <BootScreen error={error} />
      ) : config ? (
        <AppProviders config={config} />
      ) : (
        <BootScreen />
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate100,
    padding: 32,
    gap: 12,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.emerald500,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  bootTitle: { fontSize: font.lg, fontWeight: fontWeight.bold, color: colors.slate800 },
  bootText: { fontSize: font.base, color: colors.slate500, textAlign: 'center' },
  bootHint: { fontSize: font.sm, color: colors.slate400, textAlign: 'center', lineHeight: 18 },
});

