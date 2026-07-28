import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import {
  getProfileVisibilityErrorMessage,
  loadCurrentProfile,
  updateProfileVisibility,
} from '@/services/profile';

type VisibilityOption = {
  isPrivate: boolean;
  icon: Parameters<typeof IconSymbol>[0]['name'];
  title: string;
  description: string;
};

const visibilityOptions: VisibilityOption[] = [
  {
    isPrivate: false,
    icon: 'eye.fill',
    title: '공개',
    description: '모든 SnapBag 사용자가 둘러보기에서 내 가방을 구경할 수 있어요.',
  },
  {
    isPrivate: true,
    icon: 'lock.fill',
    title: '비공개',
    description:
      '서로 친구인 사람에게만 피드에서 가방이 공개돼요. 다른 사람의 둘러보기에는 내 가방이 뜨지 않아요.',
  },
];

export default function PrivacySettingsScreen() {
  const { user } = useAuth();
  // null이면 아직 현재 설정을 불러오는 중이다.
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!user) {
      setIsPrivate(null);
      return () => {
        isMounted = false;
      };
    }

    loadCurrentProfile(user)
      .then((profile) => {
        if (isMounted) {
          setIsPrivate(profile.isPrivate);
        }
      })
      .catch((error) => {
        console.warn('Profile visibility load failed.', error);
        if (isMounted) {
          setLoadFailed(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const selectVisibility = async (nextPrivate: boolean) => {
    if (!user || isSaving || isPrivate === null || nextPrivate === isPrivate) {
      return;
    }

    const previous = isPrivate;
    setIsPrivate(nextPrivate);
    setIsSaving(true);

    try {
      await updateProfileVisibility(user, nextPrivate);
    } catch (error) {
      console.warn('Profile visibility update failed.', error);
      setIsPrivate(previous);
      Alert.alert('변경 실패', getProfileVisibilityErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: '공개 범위' }} />
      <View style={styles.screen}>
        <Text style={styles.lead}>
          내 가방을 누구에게 보여줄지 선택해 주세요. 언제든지 다시 바꿀 수 있어요.
        </Text>

        {isPrivate === null && !loadFailed ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Brand.primary} size="large" />
          </View>
        ) : loadFailed ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.errorText}>
              현재 공개 범위를 불러오지 못했어요. 잠시 후 다시 들어와 주세요.
            </Text>
          </View>
        ) : (
          <View style={styles.optionList}>
            {visibilityOptions.map((option) => {
              const selected = isPrivate === option.isPrivate;

              return (
                <Pressable
                  key={option.title}
                  style={({ pressed }) => [
                    styles.optionCard,
                    selected ? styles.optionCardSelected : undefined,
                    pressed ? styles.optionCardPressed : undefined,
                  ]}
                  onPress={() => selectVisibility(option.isPrivate)}
                  disabled={isSaving}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: isSaving }}
                  accessibilityLabel={`${option.title}. ${option.description}`}
                >
                  <View style={[styles.optionIconBox, selected ? styles.optionIconBoxSelected : undefined]}>
                    <IconSymbol
                      name={option.icon}
                      size={20}
                      color={selected ? Brand.surface : Brand.lavenderDeep}
                    />
                  </View>
                  <View style={styles.optionTextBlock}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionDescription}>{option.description}</Text>
                  </View>
                  <View style={[styles.radioOuter, selected ? styles.radioOuterSelected : undefined]}>
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              );
            })}
            {isSaving ? (
              <View style={styles.savingRow}>
                <ActivityIndicator color={Brand.primary} size="small" />
                <Text style={styles.savingText}>저장 중...</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.surfaceWarm,
    paddingHorizontal: 18,
    paddingTop: 22,
    gap: 18,
  },
  lead: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
  },
  loadingWrap: {
    paddingTop: 48,
    alignItems: 'center',
  },
  errorText: {
    color: Brand.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  optionList: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Brand.borderSoft,
    backgroundColor: Brand.surfaceElevated,
  },
  optionCardSelected: {
    borderColor: Brand.lavenderDeep,
  },
  optionCardPressed: {
    backgroundColor: Brand.surfaceWarm,
  },
  optionIconBox: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F5EEFF',
  },
  optionIconBoxSelected: {
    backgroundColor: Brand.lavenderDeep,
  },
  optionTextBlock: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    color: Brand.text,
    fontSize: 16,
    fontWeight: '900',
  },
  optionDescription: {
    color: Brand.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  radioOuter: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Brand.borderSoft,
  },
  radioOuterSelected: {
    borderColor: Brand.lavenderDeep,
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: Brand.lavenderDeep,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 6,
  },
  savingText: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '800',
  },
});
