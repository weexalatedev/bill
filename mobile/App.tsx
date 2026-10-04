import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Bot,
  Building2,
  CreditCard,
  FileSearch,
  LayoutDashboard,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';

import { AppProvider } from './src/store';
import { ToastHost } from './src/components/Layout';
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

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
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
      </AppProvider>
    </SafeAreaProvider>
  );
}

const SCREENS: Record<keyof TabParamList, React.ComponentType> = {
  Dashboard: DashboardScreen,
  Bills: BillsScreen,
  Optimiser: OptimiserScreen,
  Sites: SitesScreen,
  Copilot: CopilotScreen,
  Plans: PlansScreen,
};
