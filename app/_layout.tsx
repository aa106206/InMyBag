import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { LoginScreen } from '@/components/login-screen';
import { Brand } from '@/constants/theme';
import { AppThemeProvider, useAppTheme } from '@/hooks/use-app-theme';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { warmBackground } = useAppTheme();
  const { initializing, session, signIn, signUp } = useAuth();
  const navigationTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const brandedTheme = {
    ...navigationTheme,
    colors: {
      ...navigationTheme.colors,
      primary: Brand.primary,
      background: colorScheme === 'dark' ? Brand.text : warmBackground,
      card: colorScheme === 'dark' ? Brand.text : Brand.surface,
      text: colorScheme === 'dark' ? warmBackground : Brand.text,
      border: colorScheme === 'dark' ? Brand.muted : Brand.border,
    },
  };

  if (initializing) {
    return <StatusBar style="auto" />;
  }

  if (!session) {
    return (
      <>
        <LoginScreen onSignIn={signIn} onSignUp={signUp} />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <ThemeProvider value={brandedTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </AppThemeProvider>
  );
}
