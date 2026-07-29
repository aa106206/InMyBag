import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const extraConfig = Constants.expoConfig?.extra ?? {};

// .env 에 잘못된 값(예: 자리표시자 '...')이 들어가면 앱이 시작부터 죽으므로,
// 올바른 http(s) URL 이 아니면 무시하고 app.json 의 기본값으로 넘어간다.
function validHttpUrl(value: unknown): string {
  const url = typeof value === 'string' ? value.trim() : '';
  return /^https?:\/\/.+\..+/i.test(url) ? url : '';
}

function validKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : '';
  return key.length >= 20 ? key : '';
}

const supabaseUrl =
  validHttpUrl(process.env.EXPO_PUBLIC_SUPABASE_URL) || validHttpUrl(extraConfig.supabaseUrl);
const supabaseAnonKey =
  validKey(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || validKey(extraConfig.supabaseAnonKey);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl || 'https://missing-supabase-url.supabase.co', supabaseAnonKey || 'missing-supabase-anon-key', {
  auth: {
    // 웹(SSR 포함)에서는 window가 없을 수 있으므로 Supabase 기본 스토리지를 쓰고,
    // 네이티브에서만 AsyncStorage를 사용한다.
    ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
