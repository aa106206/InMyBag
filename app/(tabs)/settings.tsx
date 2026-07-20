import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import {
  getProfileAvatarErrorMessage,
  loadCurrentProfile,
  updateProfileAvatar,
} from '@/services/profile';

type SettingsAction = {
  id: string;
  label: string;
};

type AccountEditMode = 'email' | 'password';

const accountActions: SettingsAction[] = [
  { id: 'password', label: '비밀번호 변경' },
  { id: 'email', label: '이메일 변경' },
];

const friendActions: SettingsAction[] = [
  { id: 'friends', label: '친구 관리' },
];

const supportActions: SettingsAction[] = [
  { id: 'guide', label: '이용 안내' },
  { id: 'contact', label: '문의하기' },
  { id: 'logout', label: '로그아웃' },
];

const defaultProfileImage =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getAccountErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
    return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  }

  if (lowerMessage.includes('different from the old email') || lowerMessage.includes('same email')) {
    return '현재 이메일과 다른 이메일을 입력해 주세요.';
  }

  if (lowerMessage.includes('password') && lowerMessage.includes('characters')) {
    return '비밀번호는 최소 6자 이상이어야 해요.';
  }

  if (lowerMessage.includes('jwt') || lowerMessage.includes('session')) {
    return '로그인 세션이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.';
  }

  return message || '계정 정보를 변경하는 중 문제가 발생했어요.';
}

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
  const { signOut, updateEmail, updatePassword, user } = useAuth();
  const displayName = user?.email ?? 'SnapBag User';
  const [profileImageUri, setProfileImageUri] = useState(defaultProfileImage);
  const [isProfileImageSaving, setIsProfileImageSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [accountEditMode, setAccountEditMode] = useState<AccountEditMode | null>(null);
  const [accountEmail, setAccountEmail] = useState(user?.email ?? '');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!user) {
      setProfileImageUri(defaultProfileImage);
      return () => {
        isMounted = false;
      };
    }

    loadCurrentProfile(user)
      .then((profile) => {
        if (isMounted) {
          setProfileImageUri(profile.avatarUrl || defaultProfileImage);
        }
      })
      .catch((error) => {
        console.warn('Profile load failed.', error);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const closeAccountModal = () => {
    if (isAccountSubmitting) {
      return;
    }

    setAccountEditMode(null);
    setAccountEmail(user?.email ?? '');
    setAccountPassword('');
    setAccountPasswordConfirm('');
    setAccountMessage('');
    setAccountError('');
  };

  const openAccountModal = (mode: AccountEditMode) => {
    setAccountEditMode(mode);
    setAccountEmail(user?.email ?? '');
    setAccountPassword('');
    setAccountPasswordConfirm('');
    setAccountMessage('');
    setAccountError('');
  };

  const handleAccountAction = (action: SettingsAction) => {
    if (action.id === 'email' || action.id === 'password') {
      openAccountModal(action.id);
    }
  };

  const submitAccountUpdate = async () => {
    if (!accountEditMode || isAccountSubmitting) {
      return;
    }

    setAccountMessage('');
    setAccountError('');

    if (accountEditMode === 'email') {
      const nextEmail = accountEmail.trim();

      if (!isValidEmail(nextEmail)) {
        setAccountError('올바른 이메일 주소를 입력해 주세요.');
        return;
      }

      if (nextEmail === user?.email) {
        setAccountError('현재 이메일과 다른 이메일을 입력해 주세요.');
        return;
      }
    }

    if (accountEditMode === 'password') {
      if (accountPassword.length < 6) {
        setAccountError('비밀번호는 최소 6자 이상이어야 해요.');
        return;
      }

      if (accountPassword !== accountPasswordConfirm) {
        setAccountError('비밀번호 확인이 일치하지 않아요.');
        return;
      }
    }

    setIsAccountSubmitting(true);

    try {
      if (accountEditMode === 'email') {
        await updateEmail(accountEmail);
        setAccountMessage('확인 메일을 보냈어요. 새 이메일의 메일함에서 변경을 완료해 주세요.');
      } else {
        await updatePassword(accountPassword);
        setAccountMessage('비밀번호가 변경됐어요.');
        setAccountPassword('');
        setAccountPasswordConfirm('');
      }
    } catch (error) {
      setAccountError(getAccountErrorMessage(error));
    } finally {
      setIsAccountSubmitting(false);
    }
  };

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

  const updateProfileImage = async (uri?: string) => {
    if (!uri || isProfileImageSaving) {
      return;
    }

    if (!user) {
      Alert.alert('로그인 필요', '프로필 사진을 바꾸려면 먼저 로그인해 주세요.');
      return;
    }

    const previousProfileImageUri = profileImageUri;
    setProfileImageUri(uri);
    setIsProfileImageSaving(true);

    try {
      const avatarUrl = await updateProfileAvatar(user, uri);
      setProfileImageUri(avatarUrl);
      Alert.alert('프로필 사진 변경', '프로필 사진이 저장됐어요.');
    } catch (error) {
      setProfileImageUri(previousProfileImageUri);
      Alert.alert('변경 실패', getProfileAvatarErrorMessage(error));
    } finally {
      setIsProfileImageSaving(false);
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
      await updateProfileImage(result.assets[0]?.uri);
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
      await updateProfileImage(result.assets[0]?.uri);
    }
  };

  const showProfileImageOptions = () => {
    if (isProfileImageSaving) {
      return;
    }

    Alert.alert('프로필 사진 변경', undefined, [
      { text: '사진 촬영', onPress: takeProfilePhoto },
      { text: '갤러리에서 선택', onPress: pickProfilePhoto },
      { text: '취소', style: 'cancel' },
    ]);
  };

  return (
    <>
      <Modal
        visible={Boolean(accountEditMode)}
        transparent
        animationType="fade"
        onRequestClose={closeAccountModal}
      >
        <KeyboardAvoidingView
          style={styles.accountOverlay}
          behavior={Platform.select({ ios: 'padding', default: undefined })}
        >
          <View style={styles.accountCard}>
            <View style={styles.accountHeader}>
              <Text style={styles.accountTitle}>
                {accountEditMode === 'email' ? '이메일 변경' : '비밀번호 변경'}
              </Text>
              <Pressable
                style={styles.accountCloseButton}
                onPress={closeAccountModal}
                disabled={isAccountSubmitting}
                hitSlop={10}
              >
                <Text style={styles.accountCloseText}>×</Text>
              </Pressable>
            </View>
            {accountEditMode === 'email' ? (
              <>
                <Text style={styles.accountDescription}>
                  새 이메일로 확인 메일이 전송돼요. 메일함에서 인증을 완료하면 이메일이 변경됩니다.
                </Text>
                <TextInput
                  value={accountEmail}
                  onChangeText={setAccountEmail}
                  placeholder="새 이메일"
                  placeholderTextColor={Brand.muted}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isAccountSubmitting}
                  style={styles.accountInput}
                />
              </>
            ) : (
              <>
                <Text style={styles.accountDescription}>
                  새 비밀번호는 6자 이상으로 입력해 주세요.
                </Text>
                <TextInput
                  value={accountPassword}
                  onChangeText={setAccountPassword}
                  placeholder="새 비밀번호"
                  placeholderTextColor={Brand.muted}
                  secureTextEntry
                  textContentType="newPassword"
                  editable={!isAccountSubmitting}
                  style={styles.accountInput}
                />
                <TextInput
                  value={accountPasswordConfirm}
                  onChangeText={setAccountPasswordConfirm}
                  placeholder="새 비밀번호 확인"
                  placeholderTextColor={Brand.muted}
                  secureTextEntry
                  textContentType="newPassword"
                  editable={!isAccountSubmitting}
                  style={styles.accountInput}
                />
              </>
            )}
            {accountMessage ? <Text style={styles.accountNotice}>{accountMessage}</Text> : null}
            {accountError ? <Text style={styles.accountError}>{accountError}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                styles.accountSubmitButton,
                pressed ? styles.accountSubmitButtonPressed : undefined,
                isAccountSubmitting ? styles.accountSubmitButtonDisabled : undefined,
              ]}
              onPress={submitAccountUpdate}
              disabled={isAccountSubmitting}
            >
              {isAccountSubmitting ? (
                <ActivityIndicator color={Brand.surface} />
              ) : (
                <Text style={styles.accountSubmitText}>변경하기</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
                <Text style={styles.guideSectionTitle}>오늘의 이야기</Text>
                <Text style={styles.guideText}>
                  오늘 수집한 모든 물건을 주인공으로 삼아 그림일기를 만들어요. 분위기와 길이, 상상력을 고른 뒤 만든 이야기를 저장하거나 친구에게 공유할 수 있어요.
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
                isProfileImageSaving ? styles.profileAddButtonDisabled : undefined,
              ]}
              onPress={showProfileImageOptions}
              disabled={isProfileImageSaving}
            >
              <Text style={styles.profileAddText}>+</Text>
            </Pressable>
            {isProfileImageSaving ? (
              <View style={styles.profileImageSaving}>
                <ActivityIndicator color={Brand.surface} />
              </View>
            ) : null}
          </View>
          <Text style={styles.profileName}>{displayName}</Text>
        </View>

        <SettingsGroup actions={accountActions} onActionPress={handleAccountAction} />
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
  accountOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(17, 24, 39, 0.42)',
  },
  accountCard: {
    width: '100%',
    maxWidth: 360,
    gap: 12,
    padding: 18,
    borderRadius: 8,
    backgroundColor: Brand.surfaceElevated,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 14,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  accountTitle: {
    flex: 1,
    color: Brand.text,
    fontSize: 22,
    fontWeight: '900',
  },
  accountCloseButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: Brand.surfaceWarm,
  },
  accountCloseText: {
    color: Brand.text,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '900',
  },
  accountDescription: {
    color: Brand.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  accountInput: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: Brand.surfaceWarm,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    color: Brand.text,
    fontSize: 15,
    fontWeight: '800',
  },
  accountNotice: {
    color: Brand.success,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  accountError: {
    color: Brand.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  accountSubmitButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: Brand.text,
  },
  accountSubmitButtonPressed: {
    opacity: 0.78,
  },
  accountSubmitButtonDisabled: {
    opacity: 0.58,
  },
  accountSubmitText: {
    color: Brand.surface,
    fontSize: 15,
    fontWeight: '900',
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
    backgroundColor: Brand.surfaceElevated,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 14,
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
    paddingVertical: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    backgroundColor: Brand.surfaceElevated,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
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
    borderColor: Brand.primary,
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
    borderColor: Brand.borderSoft,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 5,
  },
  profileAddButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  profileAddButtonDisabled: {
    opacity: 0.58,
  },
  profileAddText: {
    color: Brand.text,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '900',
  },
  profileImageSaving: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 52,
    backgroundColor: 'rgba(17, 24, 39, 0.36)',
  },
  profileName: {
    color: Brand.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  group: {
    overflow: 'hidden',
    backgroundColor: Brand.surfaceElevated,
    borderColor: Brand.borderSoft,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
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
    borderBottomColor: Brand.borderSoft,
  },
  actionText: {
    color: Brand.text,
    fontSize: 16,
    fontWeight: '800',
  },
  logoutText: {
    color: Brand.danger,
  },
  chevron: {
    color: Brand.muted,
    fontSize: 24,
    fontWeight: '700',
  },
});
