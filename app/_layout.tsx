import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { LoginScreen } from '@/components/login-screen';
import { Brand } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { initializing, session, signIn, signUp } = useAuth();
  const navigationTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const brandedTheme = {
    ...navigationTheme,
    colors: {
      ...navigationTheme.colors,
      primary: Brand.primary,
      background: colorScheme === 'dark' ? '#081329' : Brand.secondary,
      card: colorScheme === 'dark' ? '#081329' : Brand.surface,
      text: colorScheme === 'dark' ? '#ECEDEE' : Brand.text,
      border: colorScheme === 'dark' ? '#24324A' : Brand.border,
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
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
