import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const extraConfig = Constants.expoConfig?.extra ?? {};
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
  (typeof extraConfig.supabaseUrl === 'string' ? extraConfig.supabaseUrl.trim() : '');
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  (typeof extraConfig.supabaseAnonKey === 'string' ? extraConfig.supabaseAnonKey.trim() : '');

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
