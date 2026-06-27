import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';

type LoginScreenProps = {
  onLogin: () => void;
};

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <LinearGradient
        colors={[Brand.secondary, Brand.primarySoft, Brand.primary, Brand.lavender]}
        locations={[0, 0.42, 0.74, 1]}
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
          <Image source={require('@/assets/images/InMyBag.png')} style={styles.logo} />
          <Text style={styles.brandName}>InMyBag</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="아이디"
            placeholderTextColor={Brand.muted}
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
            style={styles.input}
          />
          <Pressable style={({ pressed }) => [styles.loginButton, pressed ? styles.pressed : undefined]} onPress={onLogin}>
            <Text style={styles.loginText}>로그인</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>계정이 없으신가요?</Text>
          <Pressable>
            <Text style={styles.signupText}>가입하기</Text>
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
