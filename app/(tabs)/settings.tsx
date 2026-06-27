import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';

type SettingsAction = {
  id: string;
  label: string;
};

const accountActions: SettingsAction[] = [
  { id: 'username', label: '아이디 변경' },
  { id: 'password', label: '비밀번호 변경' },
  { id: 'email', label: '이메일 변경' },
];

const friendActions: SettingsAction[] = [
  { id: 'invite', label: '친구 초대' },
  { id: 'friends', label: '친구 관리' },
];

const supportActions: SettingsAction[] = [
  { id: 'guide', label: '이용안내' },
  { id: 'contact', label: '문의하기' },
  { id: 'logout', label: '로그아웃' },
];

function SettingsGroup({ actions }: { actions: SettingsAction[] }) {
  return (
    <View style={styles.group}>
      {actions.map((action, index) => (
        <Pressable
          key={action.id}
          style={({ pressed }) => [
            styles.action,
            index < actions.length - 1 ? styles.actionDivider : undefined,
            pressed ? styles.actionPressed : undefined,
          ]}
        >
          <Text style={[styles.actionText, action.id === 'logout' ? styles.logoutText : undefined]}>
            {action.label}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 28,
          paddingBottom: insets.bottom + 28,
        },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profile}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' }}
          style={styles.profileImage}
          contentFit="cover"
        />
        <Text style={styles.profileName}>James</Text>
      </View>

      <SettingsGroup actions={accountActions} />
      <SettingsGroup actions={friendActions} />
      <SettingsGroup actions={supportActions} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  content: {
    paddingHorizontal: 18,
    gap: 18,
  },
  profile: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
  },
  profileImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Brand.surface,
    borderWidth: 3,
    borderColor: Brand.surface,
  },
  profileName: {
    color: Brand.text,
    fontSize: 24,
    fontWeight: '900',
  },
  group: {
    overflow: 'hidden',
    backgroundColor: Brand.surface,
    borderColor: Brand.border,
    borderRadius: 8,
    borderWidth: 1,
  },
  action: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  actionPressed: {
    backgroundColor: '#F7F9FC',
  },
  actionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  actionText: {
    color: Brand.text,
    fontSize: 16,
    fontWeight: '800',
  },
  logoutText: {
    color: '#D92D20',
  },
  chevron: {
    color: Brand.muted,
    fontSize: 24,
    fontWeight: '700',
  },
});
