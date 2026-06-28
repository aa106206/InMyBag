import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { isSupabaseConfigured } from '@/services/supabase';

type AuthCredentials = {
  email: string;
  password: string;
};

type LoginScreenProps = {
  onSignIn: (credentials: AuthCredentials) => Promise<void>;
  onSignUp: (credentials: AuthCredentials) => Promise<void>;
};

type AuthMode = 'sign-in' | 'sign-up';

const SIGNUP_COOLDOWN_SECONDS = 60;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('invalid login credentials')) {
    return '로그인할 수 없습니다. 이메일 인증을 완료했는지, 이메일과 비밀번호가 맞는지 확인해 주세요.';
  }

  if (lowerMessage.includes('email not confirmed') || lowerMessage.includes('not confirmed')) {
    return '이메일 인증이 아직 완료되지 않았습니다. 메일함에서 인증 링크를 눌러 주세요.';
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
    return '인증 메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
  }

  return message || '로그인 처리 중 문제가 발생했습니다.';
}

export function LoginScreen({ onSignIn, onSignUp }: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupCooldownUntil, setSignupCooldownUntil] = useState(0);

  const isSignUp = mode === 'sign-up';
  const signupCooldownRemaining = Math.max(
    0,
    Math.ceil((signupCooldownUntil - Date.now()) / 1000),
  );
  const isSignupCoolingDown = isSignUp && signupCooldownRemaining > 0;
  const canSubmit =
    isSupabaseConfigured && isValidEmail(email) && password.length >= 6 && !isSignupCoolingDown;

  const submit = async () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    setMessage('');
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const credentials = { email: email.trim(), password };

      if (isSignUp) {
        await onSignUp(credentials);
        setSignupCooldownUntil(Date.now() + SIGNUP_COOLDOWN_SECONDS * 1000);
        setMessage('인증 메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.');
        setMode('sign-in');
      } else {
        await onSignIn(credentials);
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMessage('');
    setErrorMessage('');
    setMode((value) => (value === 'sign-in' ? 'sign-up' : 'sign-in'));
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.select({ ios: 'padding', default: undefined })}
    >
      <LinearGradient
        colors={[Brand.secondary, Brand.primarySoft, Brand.lavender, Brand.text]}
        locations={[0, 0.38, 0.72, 1]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.content,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 18,
          },
        ]}
      >
        <View style={styles.brandArea}>
          <Image source={require('@/assets/images/SnapBag.png')} style={styles.logo} />
          <Text style={styles.brandName}>SnapBag</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="이메일"
            placeholderTextColor={Brand.muted}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호"
            placeholderTextColor={Brand.muted}
            secureTextEntry
            textContentType={isSignUp ? 'newPassword' : 'password'}
            style={styles.input}
          />
          {!isSupabaseConfigured ? (
            <Text style={styles.errorText}>Supabase 환경변수를 먼저 설정해 주세요.</Text>
          ) : null}
          {message ? <Text style={styles.noticeText}>{message}</Text> : null}
          {isSignupCoolingDown ? (
            <Text style={styles.noticeText}>
              인증 메일은 {signupCooldownRemaining}초 후 다시 요청할 수 있습니다.
            </Text>
          ) : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              !canSubmit || isSubmitting ? styles.disabled : undefined,
              pressed ? styles.pressed : undefined,
            ]}
            onPress={submit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={Brand.secondary} />
            ) : (
              <Text style={styles.loginText}>{isSignUp ? '회원가입' : '로그인'}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isSignUp ? '이미 계정이 있나요?' : '계정이 없나요?'}
          </Text>
          <Pressable onPress={toggleMode}>
            <Text style={styles.signupText}>{isSignUp ? '로그인' : '가입하기'}</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 34,
  },
  brandArea: {
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    width: 86,
    height: 86,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  brandName: {
    color: Brand.text,
    fontSize: 40,
    fontWeight: '900',
  },
  form: {
    gap: 12,
  },
  input: {
    height: 52,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    color: Brand.text,
    fontSize: 16,
    fontWeight: '700',
  },
  loginButton: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.text,
    backgroundColor: Brand.text,
  },
  loginText: {
    color: Brand.secondary,
    fontSize: 16,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.52,
  },
  noticeText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  errorText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  footerText: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '700',
  },
  signupText: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '900',
  },
});
