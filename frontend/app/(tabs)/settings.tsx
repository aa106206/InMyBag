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

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import {
  getProfileAvatarErrorMessage,
  loadCurrentProfile,
  updateProfileAvatar,
} from '@/services/profile';
import {
  getSupportInquiryErrorMessage,
  sendSupportInquiry,
  SUPPORT_INQUIRY_MAX_LENGTH,
} from '@/services/support-inquiries';

type SettingsAction = {
  id: string;
  label: string;
  icon: Parameters<typeof IconSymbol>[0]['name'];
};

type AccountEditMode = 'email' | 'password';

const accountActions: SettingsAction[] = [
  { id: 'password', label: '비밀번호 변경', icon: 'lock.fill' },
  { id: 'email', label: '이메일 변경', icon: 'envelope.fill' },
];

const friendActions: SettingsAction[] = [
  { id: 'friends', label: '친구 관리', icon: 'person.2.fill' },
];

const supportActions: SettingsAction[] = [
  { id: 'guide', label: '이용 안내', icon: 'info.circle.fill' },
  { id: 'contact', label: '문의하기', icon: 'questionmark.circle.fill' },
];

const logoutActions: SettingsAction[] = [
  { id: 'logout', label: '로그아웃', icon: 'rectangle.portrait.and.arrow.right' },
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
  title,
  actions,
  onActionPress,
}: {
  title?: string;
  actions: SettingsAction[];
  onActionPress?: (action: SettingsAction) => void;
}) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.group}>
        {actions.map((action, index) => {
          const isLogout = action.id === 'logout';

          return (
            <Pressable
              key={action.id}
              style={({ pressed }) => [
                styles.action,
                index < actions.length - 1 ? styles.actionDivider : undefined,
                pressed ? styles.actionPressed : undefined,
              ]}
              onPress={() => onActionPress?.(action)}
            >
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconBox, isLogout ? styles.logoutIconBox : undefined]}>
                  <IconSymbol
                    name={action.icon}
                    size={18}
                    color={isLogout ? Brand.danger : Brand.lavenderDeep}
                  />
                </View>
                <Text style={[styles.actionText, isLogout ? styles.logoutText : undefined]}>
                  {action.label}
                </Text>
              </View>
              <IconSymbol
                name="chevron.right"
                size={24}
                color={isLogout ? Brand.danger : Brand.muted}
              />
            </Pressable>
          );
        })}
      </View>
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
  const [showContact, setShowContact] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [contactError, setContactError] = useState('');
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);
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

    if (action.id === 'contact') {
      setShowContact(true);
      setContactError('');
      return;
    }

    if (action.id === 'logout') {
      await signOut();
    }
  };

  const closeContactModal = () => {
    if (isContactSubmitting) {
      return;
    }

    setShowContact(false);
    setContactMessage('');
    setContactError('');
  };

  const submitContactInquiry = async () => {
    if (isContactSubmitting) {
      return;
    }

    setContactError('');

    if (!contactMessage.trim()) {
      setContactError('문의 내용을 입력해 주세요.');
      return;
    }

    setIsContactSubmitting(true);

    try {
      await sendSupportInquiry(user, contactMessage);
      Alert.alert('문의 전송', '문의 내용이 전송됐어요.');
      setShowContact(false);
      setContactMessage('');
      setContactError('');
    } catch (error) {
      setContactError(getSupportInquiryErrorMessage(error));
    } finally {
      setIsContactSubmitting(false);
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
      <Modal visible={showContact} transparent animationType="fade" onRequestClose={closeContactModal}>
        <KeyboardAvoidingView
          style={styles.contactOverlay}
          behavior={Platform.select({ ios: 'padding', default: undefined })}
        >
          <View style={styles.contactCard}>
            <View style={styles.accountHeader}>
              <Text style={styles.accountTitle}>문의하기</Text>
              <Pressable
                style={styles.accountCloseButton}
                onPress={closeContactModal}
                disabled={isContactSubmitting}
                hitSlop={10}
              >
                <Text style={styles.accountCloseText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.accountDescription}>
              불편한 점이나 제안하고 싶은 내용을 짧게 남겨 주세요. 확인 후 앱 개선에 참고할게요.
            </Text>
            <TextInput
              value={contactMessage}
              onChangeText={(text) => {
                setContactMessage(text);
                if (contactError) {
                  setContactError('');
                }
              }}
              placeholder="문의 내용을 입력해 주세요."
              placeholderTextColor={Brand.muted}
              multiline
              maxLength={SUPPORT_INQUIRY_MAX_LENGTH}
              textAlignVertical="top"
              editable={!isContactSubmitting}
              style={styles.contactInput}
            />
            <View style={styles.contactMetaRow}>
              {contactError ? <Text style={styles.accountError}>{contactError}</Text> : <View />}
              <Text style={styles.contactCount}>
                {contactMessage.length}/{SUPPORT_INQUIRY_MAX_LENGTH}
              </Text>
            </View>
            <View style={styles.contactFooter}>
              <Pressable
                style={({ pressed }) => [
                  styles.contactSubmitButton,
                  pressed ? styles.accountSubmitButtonPressed : undefined,
                  isContactSubmitting ? styles.accountSubmitButtonDisabled : undefined,
                ]}
                onPress={submitContactInquiry}
                disabled={isContactSubmitting}
              >
                {isContactSubmitting ? (
                  <ActivityIndicator color={Brand.surface} />
                ) : (
                  <Text style={styles.contactSubmitText}>전송</Text>
                )}
              </Pressable>
            </View>
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
                SnapBag는 사진으로 내 가방 속 물건을 기록하고, 친구와 다른 사용자들의 가방을 둘러볼 수 있는 앱이에요.
              </Text>
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>내 가방</Text>
                <Text style={styles.guideText}>
                  셔터 버튼으로 사진을 찍으면 물건만 잘라 가방 공간에 떨어뜨릴 수 있어요. 휴대폰을 기울이면 물건들이 실제처럼 움직이고, 직접 드래그해서 옮길 수도 있어요. 물건을 길게 누르면 이름, 기록, 촬영 위치를 확인하고 수정하거나 삭제할 수 있어요.
                </Text>
              </View>
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>피드</Text>
                <Text style={styles.guideText}>
                  친구로 추가한 사람들의 가방만 모아 보는 공간이에요. 상단 친구 프로필을 누르면 그 친구의 가방이 아래에 나타나고, 물건을 길게 누르면 사진 정보와 좋아요, 촬영 위치를 카드로 확인할 수 있어요.
                </Text>
              </View>
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>둘러보기</Text>
                <Text style={styles.guideText}>
                  친구 여부와 상관없이 SnapBag 사용자 중 랜덤하게 가방을 둘러볼 수 있어요. 새로운 사람의 가방을 구경하고, 마음에 드는 물건의 상세 정보도 확인할 수 있어요.
                </Text>
              </View>
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>오늘의 이야기</Text>
                <Text style={styles.guideText}>
                  오늘 수집한 모든 물건을 주인공으로 삼아 그림일기를 만들어요. 분위기와 길이, 상상력을 고른 뒤 만든 이야기를 저장하거나 친구에게 공유할 수 있어요.
                </Text>
              </View>
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>설정</Text>
                <Text style={styles.guideText}>
                  프로필 사진, 이메일, 비밀번호를 바꾸고 친구 관리로 친구 요청을 확인할 수 있어요. 친구 초대로 SnapBag 설치 링크를 공유할 수도 있어요.
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
            paddingBottom: 46,
          },
        ]}
        contentInsetAdjustmentBehavior="never"
        bounces={false}
        overScrollMode="never"
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
              <IconSymbol name="camera.fill" size={19} color={Brand.lavenderDeep} />
            </Pressable>
            {isProfileImageSaving ? (
              <View style={styles.profileImageSaving}>
                <ActivityIndicator color={Brand.surface} />
              </View>
            ) : null}
          </View>
          <Text style={styles.profileName}>{displayName}</Text>
        </View>

        <SettingsGroup title="계정 설정" actions={accountActions} onActionPress={handleAccountAction} />
        <SettingsGroup title="친구 관리" actions={friendActions} onActionPress={handleFriendAction} />
        <SettingsGroup title="도움말" actions={supportActions} onActionPress={handleSupportAction} />
        <SettingsGroup title="" actions={logoutActions} onActionPress={handleSupportAction} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.surfaceWarm,
  },
  content: {
    paddingHorizontal: 18,
    gap: 12,
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
  contactOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(17, 24, 39, 0.42)',
  },
  contactCard: {
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
  contactInput: {
    minHeight: 118,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Brand.surfaceWarm,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    color: Brand.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  contactMetaRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  contactCount: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  contactFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  contactSubmitButton: {
    minWidth: 88,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: Brand.text,
  },
  contactSubmitText: {
    color: Brand.surface,
    fontSize: 14,
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
    paddingTop: 22,
    paddingBottom: 24,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    backgroundColor: Brand.surfaceElevated,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 7,
  },
  profileImageWrap: {
    position: 'relative',
    width: 118,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: Brand.surface,
    borderWidth: 3,
    borderColor: Brand.primary,
  },
  profileAddButton: {
    position: 'absolute',
    right: 8,
    bottom: 2,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 7,
  },
  profileAddButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  profileAddButtonDisabled: {
    opacity: 0.58,
  },
  profileImageSaving: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 61,
    backgroundColor: 'rgba(17, 24, 39, 0.36)',
  },
  profileName: {
    color: Brand.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    paddingHorizontal: 26,
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  group: {
    overflow: 'hidden',
    backgroundColor: Brand.surfaceElevated,
    borderColor: Brand.borderSoft,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 4,
  },
  action: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  actionPressed: {
    backgroundColor: Brand.surfaceWarm,
  },
  actionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Brand.borderSoft,
  },
  actionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  actionIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#F5EEFF',
  },
  logoutIconBox: {
    backgroundColor: '#FFF0EE',
  },
  actionText: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '700',
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
