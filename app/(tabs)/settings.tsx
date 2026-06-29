import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

type SettingsAction = {
  id: string;
  label: string;
};

const accountActions: SettingsAction[] = [
  { id: 'password', label: '비밀번호 변경' },
  { id: 'email', label: '이메일 변경' },
];

const friendActions: SettingsAction[] = [
  { id: 'invite', label: '친구 초대' },
  { id: 'friends', label: '친구 관리' },
];

const supportActions: SettingsAction[] = [
  { id: 'guide', label: '이용 안내' },
  { id: 'contact', label: '문의하기' },
  { id: 'logout', label: '로그아웃' },
];

const defaultProfileImage =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400';

function SettingsGroup({
  actions,
  onActionPress,
}: {
  actions: SettingsAction[];
  onActionPress?: (action: SettingsAction) => void;
}) {
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
          onPress={() => onActionPress?.(action)}
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
  const { signOut, user } = useAuth();
  const displayName = user?.email ?? 'SnapBag User';
  const [profileImageUri, setProfileImageUri] = useState(defaultProfileImage);

  const handleSupportAction = async (action: SettingsAction) => {
    if (action.id === 'logout') {
      await signOut();
    }
  };

  const updateProfileImage = (uri?: string) => {
    if (uri) {
      setProfileImageUri(uri);
    }
  };

  const takeProfilePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('카메라 권한 필요', '프로필 사진을 촬영하려면 카메라 접근 권한이 필요해요.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled) {
      updateProfileImage(result.assets[0]?.uri);
    }
  };

  const pickProfilePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('갤러리 권한 필요', '프로필 사진을 선택하려면 갤러리 접근 권한이 필요해요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled) {
      updateProfileImage(result.assets[0]?.uri);
    }
  };

  const showProfileImageOptions = () => {
    Alert.alert('프로필 사진 변경', undefined, [
      { text: '사진 촬영', onPress: takeProfilePhoto },
      { text: '갤러리에서 선택', onPress: pickProfilePhoto },
      { text: '취소', style: 'cancel' },
    ]);
  };

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
        <View style={styles.profileImageWrap}>
          <Image
            source={{ uri: profileImageUri }}
            style={styles.profileImage}
            contentFit="cover"
          />
          <Pressable
            style={({ pressed }) => [
              styles.profileAddButton,
              pressed ? styles.profileAddButtonPressed : undefined,
            ]}
            onPress={showProfileImageOptions}
          >
            <Text style={styles.profileAddText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.profileName}>{displayName}</Text>
      </View>

      <SettingsGroup actions={accountActions} />
      <SettingsGroup actions={friendActions} />
      <SettingsGroup actions={supportActions} onActionPress={handleSupportAction} />
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
  profileImageWrap: {
    position: 'relative',
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Brand.surface,
    borderWidth: 3,
    borderColor: Brand.surface,
  },
  profileAddButton: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: Brand.surface,
    borderWidth: 2,
    borderColor: Brand.border,
  },
  profileAddButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  profileAddText: {
    color: Brand.text,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '900',
  },
  profileName: {
    color: Brand.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
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
    backgroundColor: Brand.surfaceWarm,
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
