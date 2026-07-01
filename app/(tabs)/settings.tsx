import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const [showGuide, setShowGuide] = useState(false);

  const handleSupportAction = async (action: SettingsAction) => {
    if (action.id === 'guide') {
      setShowGuide(true);
      return;
    }

    if (action.id === 'logout') {
      await signOut();
    }
  };

  const handleFriendAction = (action: SettingsAction) => {
    if (action.id === 'friends') {
      router.push('/friend-management');
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
    <>
      <Modal visible={showGuide} transparent animationType="fade" onRequestClose={() => setShowGuide(false)}>
        <View style={styles.guideOverlay}>
          <View style={styles.guideCard}>
            <Pressable style={styles.guideCloseButton} onPress={() => setShowGuide(false)} hitSlop={10}>
              <Text style={styles.guideCloseText}>×</Text>
            </Pressable>
            <ScrollView
              style={styles.guideScroll}
              contentContainerStyle={styles.guideContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.guideTitle}>SnapBag 이용 안내</Text>
              <Text style={styles.guideLead}>
                SnapBag는 사진으로 내 가방 속 물건을 기록하고, 친구들의 가방도 둘러볼 수 있는 앱이에요.
              </Text>
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>내 가방</Text>
                <Text style={styles.guideText}>
                  셔터 버튼으로 사진을 찍으면 물건만 잘라 가방 공간에 떨어뜨릴 수 있어요. 휴대폰을 기울이면 물건들이 실제처럼 움직이고, 직접 드래그해서 옮길 수도 있어요.
                </Text>
              </View>
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>가방 기록</Text>
                <Text style={styles.guideText}>
                  상단 토글을 누르면 날짜별로 쌓인 가방 기록을 볼 수 있어요. 지금은 예시 데이터지만, 나중에는 실제 기록이 여기에 모이게 돼요.
                </Text>
              </View>
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>피드</Text>
                <Text style={styles.guideText}>
                  친구 프로필을 누르면 친구의 가방이 아래에 보여요. 물건을 길게 누르면 사진 정보, 좋아요, 촬영 위치를 카드로 확인할 수 있어요.
                </Text>
              </View>
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>랭킹</Text>
                <Text style={styles.guideText}>
                  매일 주어지는 미션을 이어가면 점수가 쌓이는 방식으로 준비 중이에요. 하루를 놓치면 streak가 초기화되는 방향으로 만들 예정이에요.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
        <SettingsGroup actions={friendActions} onActionPress={handleFriendAction} />
        <SettingsGroup actions={supportActions} onActionPress={handleSupportAction} />
      </ScrollView>
    </>
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
  guideOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(17, 24, 39, 0.42)',
  },
  guideCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '66%',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  guideCloseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 20,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
  },
  guideCloseText: {
    color: Brand.text,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '900',
  },
  guideScroll: {
    maxHeight: '100%',
  },
  guideContent: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
  },
  guideTitle: {
    paddingRight: 32,
    color: Brand.text,
    fontSize: 22,
    fontWeight: '900',
  },
  guideLead: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '800',
  },
  guideSection: {
    gap: 6,
    paddingTop: 2,
  },
  guideSectionTitle: {
    color: Brand.text,
    fontSize: 16,
    fontWeight: '900',
  },
  guideText: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
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
