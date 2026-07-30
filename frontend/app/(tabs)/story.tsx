import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/hooks/use-auth';
import { loadCurrentBagItems, type SavedBagItem } from '@/services/bag-items';
import {
  DEFAULT_EMOTION,
  generateStoryWithGemini,
  loadStories,
  saveStory,
  STORY_EMOTIONS,
  type GeneratedStory,
  type StoryEmotion,
} from '@/services/stories';

function getCreativityCopy(value: number) {
  if (value <= 3) return '오늘 있었던 일에 가까운 그림일기';
  if (value <= 6) return '현실에 기반해 기발한 상상을 더한 이야기';
  return '물건들이 말하고 모험하는 자유로운 판타지';
}

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    .format(new Date(isoDate));
}

function getObjectName(item: SavedBagItem) {
  return item.objectLabel?.trim() || '이름 미등록';
}

function isItemFromToday(item: SavedBagItem) {
  const itemDate = new Date(item.createdAt);
  if (Number.isNaN(itemDate.getTime())) return false;

  const now = new Date();
  return (
    itemDate.getFullYear() === now.getFullYear() &&
    itemDate.getMonth() === now.getMonth() &&
    itemDate.getDate() === now.getDate()
  );
}

function ObjectRail({ items }: { items: SavedBagItem[] }) {
  if (items.length === 0) {
    return (
      <View style={styles.emptyObjects}>
        <Text style={styles.emptyObjectsEmoji}>📷</Text>
        <View style={styles.emptyObjectsCopy}>
          <Text style={styles.emptyObjectsTitle}>오늘 모은 물건이 아직 없어요</Text>
          <Text style={styles.emptyObjectsText}>‘내 가방’에서 물건을 찍으면 이야기의 주인공이 됩니다.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.objectRail}>
      {items.map((item) => (
        <View key={item.id} style={styles.objectChip}>
          <View style={styles.objectImageWrap}>
            <Image source={{ uri: item.imageUrl }} style={styles.objectImage} resizeMode="contain" />
          </View>
          <Text style={styles.objectName} numberOfLines={1}>
            {getObjectName(item)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const generationSteps = [
  { emoji: '🎒', title: '오늘의 물건을 담는 중', detail: '가방 속 물건들의 이름과 기억을 읽고 있어요.' },
  { emoji: '✍️', title: '당신의 하루를 이야기로 엮는 중', detail: '세 가지 답변을 바탕으로 줄거리를 만들고 있어요.' },
  { emoji: '🎨', title: '그림일기의 한 장면을 그리는 중', detail: '직접 학습한 아이 그림체 AI가 이야기의 한 장면을 그려요.' },
  { emoji: '✨', title: '마지막 장면을 다듬는 중', detail: '이야기의 여운과 그림의 색감을 맞추고 있어요.' },
];

function StoryGenerationModal({ visible, items }: { visible: boolean; items: SavedBagItem[] }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!visible) {
      setStep(0);
      return;
    }

    const intervalId = setInterval(() => {
      setStep((current) => Math.min(current + 1, generationSteps.length - 1));
    }, 6500);

    return () => clearInterval(intervalId);
  }, [visible]);

  const currentStep = generationSteps[step];

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen">
      <LinearGradient colors={['#FFF4E7', '#F6EAF8', '#E9E4FA']} style={styles.generationScreen}>
        <View style={styles.generationGlowOne} />
        <View style={styles.generationGlowTwo} />
        <View style={styles.generationContent}>
          <Text style={styles.generationEyebrow}>CREATING YOUR SNAP STORY</Text>
          <View style={styles.generationObjectStage}>
            {items.slice(0, 3).map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.generationObjectCard,
                  index === 0 && styles.generationObjectLeft,
                  index === 1 && styles.generationObjectCenter,
                  index === 2 && styles.generationObjectRight,
                ]}
              >
                <Image source={{ uri: item.imageUrl }} style={styles.generationObjectImage} resizeMode="contain" />
              </View>
            ))}
            <View style={styles.generationSparkle}><Text style={styles.generationSparkleText}>✦</Text></View>
          </View>

          <Text style={styles.generationEmoji}>{currentStep.emoji}</Text>
          <Text style={styles.generationTitle}>{currentStep.title}</Text>
          <Text style={styles.generationDetail}>{currentStep.detail}</Text>

          <View style={styles.generationProgress}>
            {generationSteps.map((item, index) => (
              <View key={item.title} style={[styles.generationProgressDot, index <= step && styles.generationProgressDotActive]} />
            ))}
          </View>
          <ActivityIndicator color="#725E98" size="small" />
          <Text style={styles.generationWaitText}>이야기와 그림을 함께 만드는 데 잠시 시간이 필요해요.{"\n"}앱을 닫지 말고 기다려 주세요.</Text>
        </View>
      </LinearGradient>
    </Modal>
  );
}

function StoryIllustration({ story }: { story: GeneratedStory }) {
  if (story.illustrationUrl) {
    return (
      <View style={styles.illustration}>
        <Image source={{ uri: story.illustrationUrl }} style={styles.generatedIllustration} resizeMode="cover" />
      </View>
    );
  }

  return (
    <LinearGradient colors={['#DCD4F5', '#F8DDE8', '#FFF0D8']} style={styles.illustration}>
      <View style={styles.sun} />
      <View style={styles.cloudOne} />
      <View style={styles.cloudTwo} />
      {story.imageUrls.slice(0, 5).map((uri, index) => (
        <View
          key={`${story.id}-${index}`}
          style={[
            styles.storyObject,
            {
              left: `${10 + ((index * 19) % 70)}%`,
              bottom: 22 + (index % 2) * 42,
              transform: [{ rotate: `${(index - 2) * 5}deg` }],
            },
          ]}
        >
          <Image source={{ uri }} style={styles.storyObjectImage} resizeMode="contain" />
        </View>
      ))}
      <View style={styles.ground} />
    </LinearGradient>
  );
}

function StoryCard({ story, compact = false }: { story: GeneratedStory; compact?: boolean }) {
  return (
    <View style={[styles.storyCard, compact && styles.storyCardCompact]}>
      <StoryIllustration story={story} />
      <View style={styles.storyPaper}>
        <Text style={styles.storyDate}>{formatDate(story.createdAt)}</Text>
        <Text style={styles.storyTitle}>{story.title}</Text>
        <View style={styles.storyDivider} />
        <Text style={styles.storyBody} numberOfLines={compact ? 5 : undefined}>{story.body}</Text>
        <View style={styles.storyTags}>
          {story.itemLabels.slice(0, 4).map((label, index) => (
            <View key={`${label}-${index}`} style={styles.storyTag}><Text style={styles.storyTagText}>#{label}</Text></View>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function StoryScreen() {
  const insets = useSafeAreaInsets();
  const { warmBackground } = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);
  const { user } = useAuth();
  const [items, setItems] = useState<SavedBagItem[]>([]);
  const [savedStories, setSavedStories] = useState<GeneratedStory[]>([]);
  const [story, setStory] = useState<GeneratedStory | null>(null);
  const [concept, setConcept] = useState('');
  const [emotion, setEmotion] = useState<StoryEmotion>(DEFAULT_EMOTION);
  const [creativity, setCreativity] = useState(7);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [objectsExpanded, setObjectsExpanded] = useState(true);

  const todayItems = useMemo(() => items.filter(isItemFromToday), [items]);
  const todayObjectSummary = useMemo(() => {
    if (todayItems.length === 0) return '오늘 수집한 물건이 아직 없어요';
    const names = todayItems.map(getObjectName);
    const visibleNames = names.slice(0, 3).join(', ');
    const restCount = names.length - 3;
    return restCount > 0 ? `${visibleNames} 외 ${restCount}개` : visibleNames;
  }, [todayItems]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [bagItems, stories] = await Promise.all([
        loadCurrentBagItems(user),
        loadStories(user.id),
      ]);
      setItems(bagItems);
      setSavedStories(stories);
    } catch (error) {
      console.warn('Story materials load failed.', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 내 가방에서 물건을 담고 돌아와도 목록이 갱신되도록, 탭에 들어올 때마다 다시 불러온다.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const generate = async () => {
    // 물건이 없어도 감정·줄거리만으로 그림일기를 만들 수 있다.
    setGenerating(true);
    try {
      const generatedStory = await generateStoryWithGemini({
        items: todayItems,
        dailyMoment: concept,
        emotion,
        creativity,
      });
      setStory(generatedStory);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 350);
    } catch (error) {
      console.warn('Gemini story generation failed.', error);
      const message = error instanceof Error ? error.message : '';
      const userMessage = message.includes('API key')
        ? 'AI 서버에 Gemini API 키가 설정되지 않았어요.'
        : message.includes('429') || message.toLowerCase().includes('quota')
          ? 'Gemini 사용량이 잠시 초과됐어요. 잠시 후 다시 시도해 주세요.'
          : message.includes('404') || message.toLowerCase().includes('not found')
            ? '현재 Gemini API 키에서 이미지 생성 모델을 사용할 수 없어요. 모델 접근 권한을 확인해 주세요.'
            : '이야기를 만드는 중 문제가 생겼어요. AI 서버와 네트워크를 확인한 뒤 다시 시도해 주세요.';
      Alert.alert('그림일기 생성 실패', userMessage);
    } finally {
      setGenerating(false);
    }
  };

  const persistStory = async () => {
    if (!user || !story) return;
    try {
      const next = await saveStory(user.id, story);
      setSavedStories(next);
      Alert.alert('이야기를 저장했어요', '오늘의 물건과 이야기를 나중에 다시 볼 수 있어요.');
    } catch {
      Alert.alert('저장 실패', '이야기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const shareStory = async () => {
    if (!story) return;
    await Share.share({
      title: story.title,
      message: `${story.title}\n\n${story.body}\n\n${story.itemLabels.map((label) => `#${label}`).join(' ')}\n\nSnapBag에서 만든 오늘의 이야기`,
    });
  };

  if (loading && items.length === 0) {
    return <View style={[styles.loadingScreen, { backgroundColor: warmBackground }]}><ActivityIndicator color={Brand.text} /></View>;
  }

  return (
    <>
      <StoryGenerationModal visible={generating} items={todayItems} />
      <ScrollView
        ref={scrollRef}
        style={[styles.screen, { backgroundColor: warmBackground }]}
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={Brand.text} />}
      >
        <View style={styles.pagePadding}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.eyebrow}>SNAP STORY</Text>
              <Text style={styles.pageTitle}>이야기 생성</Text>
            </View>
            <Pressable style={styles.historyButton} onPress={() => setHistoryOpen(true)}>
              <Text style={styles.historyIcon}>☰</Text>
              {savedStories.length > 0 ? <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{savedStories.length}</Text></View> : null}
            </Pressable>
          </View>

          <View style={styles.objectsSection}>
            <Pressable
              style={({ pressed }) => [styles.objectsToggle, pressed && styles.objectsTogglePressed]}
              onPress={() => setObjectsExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: objectsExpanded }}
              accessibilityLabel={`오늘 담은 물건들 ${todayItems.length}개 ${objectsExpanded ? '접기' : '펼치기'}`}
            >
              <Text style={styles.stepLabel}>01</Text>
              <View style={styles.objectsTitleCopy}>
                <View style={styles.objectsTitleRow}>
                  <Text style={styles.sectionTitle}>오늘 담은 물건들</Text>
                  <View style={styles.objectCountBadge}>
                    <Text style={styles.objectCountText}>{todayItems.length}</Text>
                  </View>
                </View>
                <Text style={styles.sectionHint} numberOfLines={objectsExpanded ? 1 : 2}>
                  {objectsExpanded ? todayObjectSummary : todayObjectSummary}
                </Text>
              </View>
              <View style={[styles.chevronButton, objectsExpanded && styles.chevronButtonExpanded]}>
                <Text style={styles.chevronText}>{objectsExpanded ? '⌃' : '⌄'}</Text>
              </View>
            </Pressable>
            {objectsExpanded ? <ObjectRail items={todayItems} /> : null}
          </View>

          <View style={styles.formCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.stepLabel}>02</Text>
              <View style={styles.sectionTitleCopy}>
                <Text style={styles.sectionTitle}>이야기 생성</Text>
              </View>
            </View>

            <View style={styles.questionBlock}>
              <View style={styles.questionTitleRow}>
                <View style={styles.questionNumber}><Text style={styles.questionNumberText}>1</Text></View>
                <View style={styles.questionTitleCopy}>
                  <Text style={styles.questionTitle}>감정 선택</Text>
                  <Text style={styles.questionDescription}>오늘 자신이 느낀 감정을 골라주세요.</Text>
                </View>
              </View>
              <View style={styles.emotionGrid}>
                {STORY_EMOTIONS.map((option) => {
                  const selected = emotion === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setEmotion(option.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      style={[
                        styles.emotionChip,
                        selected && { borderColor: option.color, backgroundColor: `${option.color}1F` },
                      ]}
                    >
                      <View style={[styles.emotionSwatch, { backgroundColor: option.color }]} />
                      <Text style={styles.emotionEmoji}>{option.emoji}</Text>
                      <Text style={[styles.emotionLabel, selected && styles.emotionLabelSelected]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.questionDivider} />

            <View style={styles.questionBlock}>
              <View style={styles.questionTitleRow}>
                <View style={styles.questionNumber}><Text style={styles.questionNumberText}>2</Text></View>
                <View style={styles.questionTitleCopy}>
                  <Text style={styles.questionTitle}>줄거리 작성</Text>
                  <Text style={styles.questionDescription}>
                    적어 주신 줄거리를 바탕으로 이야기가 생성됩니다.
                  </Text>
                </View>
                <Text style={styles.optionalBadge}>선택</Text>
              </View>
              <View style={styles.momentInputWrap}>
                <TextInput
                  value={concept}
                  onChangeText={setConcept}
                  placeholder="ex) 카페에서 과제를 하다가 갑자기 비가 왔어요."
                  placeholderTextColor="#A29BA1"
                  style={styles.momentInput}
                  multiline
                  maxLength={160}
                  textAlignVertical="top"
                />
                <Text style={styles.characterCount}>{concept.length}/160</Text>
              </View>
            </View>

            <View style={styles.questionDivider} />

            <View style={styles.questionBlock}>
              <View style={styles.questionTitleRow}>
                <View style={styles.questionNumber}><Text style={styles.questionNumberText}>3</Text></View>
                <View style={styles.questionTitleCopy}>
                  <Text style={styles.questionTitle}>상상력 설정</Text>
                  <Text style={styles.questionDescription}>{getCreativityCopy(creativity)}</Text>
                </View>
                <View style={styles.creativityBadge}>
                  <Text style={styles.creativityBadgeValue}>{creativity}</Text>
                  <Text style={styles.creativityBadgeTotal}>/9</Text>
                </View>
              </View>

              <View style={styles.creativityControl}>
                <View style={styles.creativityTrackSegments}>
                  {Array.from({ length: 8 }, (_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.creativityTrackSegment,
                        index < creativity - 1 && styles.creativityTrackSegmentActive,
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.creativityStops}>
                  {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => {
                    const selected = value === creativity;
                    const active = value <= creativity;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setCreativity(value)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={`상상력 ${value}단계`}
                        hitSlop={4}
                        style={styles.creativityStopButton}
                      >
                        <View style={[
                          styles.creativityStop,
                          active && styles.creativityStopActive,
                          selected && styles.creativityStopSelected,
                        ]} />
                        <Text style={[styles.creativityStopNumber, selected && styles.creativityStopNumberSelected]}>{value}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.creativityLegend}>
                <View><Text style={styles.legendTitle}>오늘 그대로</Text><Text style={styles.legendText}>현실에 가깝게</Text></View>
                <Text style={styles.legendArrow}>→</Text>
                <View style={styles.legendRight}><Text style={styles.legendTitle}>상상 가득</Text><Text style={styles.legendText}>자유로운 판타지</Text></View>
              </View>
            </View>

            <Pressable onPress={generate} disabled={generating} style={[styles.generateButton, generating && styles.generateButtonDisabled]}>
              {generating ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.generateSpark}>✦</Text><Text style={styles.generateText}>이야기 생성</Text></>}
            </Pressable>
          </View>

          {story ? (
            <View style={styles.resultSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.stepLabel}>03</Text>
                <View><Text style={styles.sectionTitle}>완성된 이야기</Text><Text style={styles.sectionHint}>추억의 순간을 간직해 보세요</Text></View>
              </View>
              <StoryCard story={story} />
              <View style={styles.resultActions}>
                <Pressable style={styles.secondaryAction} onPress={shareStory}><Text style={styles.secondaryActionText}>↗  공유하기</Text></Pressable>
                <Pressable style={styles.primaryAction} onPress={persistStory}><Text style={styles.primaryActionText}>♡  저장하기</Text></Pressable>
              </View>
              <Pressable onPress={generate} style={styles.regenerateButton}><Text style={styles.regenerateText}>↻  같은 물건으로 다시 만들기</Text></Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={historyOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHistoryOpen(false)}>
        <View style={[styles.historyScreen, { paddingTop: insets.top + 12, backgroundColor: warmBackground }]}>
          <View style={styles.historyHeader}>
            <View><Text style={styles.historyTitle}>나의 이야기책</Text><Text style={styles.historySubtitle}>저장한 이야기 {savedStories.length}편</Text></View>
            <Pressable onPress={() => setHistoryOpen(false)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false}>
            {savedStories.length === 0 ? (
              <View style={styles.emptyHistory}><Text style={styles.emptyHistoryEmoji}>📖</Text><Text style={styles.emptyHistoryTitle}>아직 빈 이야기책이에요</Text><Text style={styles.emptyHistoryText}>첫 번째 그림일기를 만들고 저장해 보세요.</Text></View>
            ) : savedStories.map((saved) => (
              <Pressable key={saved.id} onPress={() => { setStory(saved); setHistoryOpen(false); }}>
                <StoryCard story={saved} compact />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.secondary },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.secondary },
  pagePadding: { paddingHorizontal: 18 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 0, color: Brand.lavenderDeep, marginBottom: 7 },
  pageTitle: { fontSize: 30, lineHeight: 38, fontWeight: '900', color: Brand.text, letterSpacing: 0 },
  pageSubtitle: { marginTop: 7, fontSize: 14, lineHeight: 20, color: Brand.muted },
  historyButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: Brand.surfaceElevated, borderWidth: 1, borderColor: Brand.borderSoft, alignItems: 'center', justifyContent: 'center', shadowColor: Brand.text, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  historyIcon: { fontSize: 20, color: Brand.text },
  historyBadge: { position: 'absolute', right: -5, top: -5, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: Brand.lavenderDeep, alignItems: 'center', justifyContent: 'center' },
  historyBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  sectionTitleCopy: { flex: 1 },
  objectsSection: { backgroundColor: Brand.surface, borderRadius: 28, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14, marginBottom: 16, borderWidth: 1, borderColor: Brand.border, shadowColor: '#67576B', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 7 } },
  objectsToggle: { flexDirection: 'row', alignItems: 'center', minHeight: 60, borderRadius: 20, paddingVertical: 8 },
  objectsTogglePressed: { opacity: 0.62 },
  objectsTitleCopy: { flex: 1, marginLeft: 12 },
  objectsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  objectCountBadge: { minWidth: 23, height: 23, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.primary },
  objectCountText: { color: Brand.text, fontSize: 11, fontWeight: '900' },
  chevronButton: { width: 34, height: 34, marginLeft: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.surfaceElevated, borderWidth: 1, borderColor: Brand.borderSoft },
  chevronButtonExpanded: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  chevronText: { color: '#725E98', fontSize: 20, lineHeight: 23, fontWeight: '900' },
  stepLabel: { width: 31, height: 31, paddingTop: 7, borderRadius: 10, overflow: 'hidden', textAlign: 'center', backgroundColor: Brand.lavender, color: Brand.text, fontSize: 12, fontWeight: '900' },
  sectionTitle: { fontSize: 19, fontWeight: '900', color: Brand.text, letterSpacing: 0 },
  sectionHint: { fontSize: 12, color: Brand.muted, marginTop: 4 },
  emptyObjects: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 8 },
  emptyObjectsEmoji: { fontSize: 30, marginRight: 13 },
  emptyObjectsCopy: { flex: 1 },
  emptyObjectsTitle: { color: Brand.text, fontSize: 14, fontWeight: '800' },
  emptyObjectsText: { color: Brand.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  objectRail: { gap: 12, paddingRight: 4, paddingTop: 4, paddingBottom: 6 },
  objectChip: { width: 86, alignItems: 'center' },
  objectImageWrap: { width: 78, height: 78, borderRadius: 24, backgroundColor: Brand.surfaceWarm, borderWidth: 1, borderColor: Brand.border, padding: 10 },
  objectImage: { width: '100%', height: '100%' },
  objectName: { maxWidth: 82, marginTop: 8, color: Brand.text, fontSize: 12, fontWeight: '700' },
  generationScreen: { flex: 1, overflow: 'hidden' },
  generationGlowOne: { position: 'absolute', width: 260, height: 260, borderRadius: 130, right: -90, top: -45, backgroundColor: 'rgba(255,255,255,0.48)' },
  generationGlowTwo: { position: 'absolute', width: 220, height: 220, borderRadius: 110, left: -100, bottom: 30, backgroundColor: 'rgba(255,206,224,0.28)' },
  generationContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  generationEyebrow: { color: '#806EA8', fontSize: 10, fontWeight: '900', letterSpacing: 2.1, marginBottom: 32 },
  generationObjectStage: { width: 265, height: 142, marginBottom: 20 },
  generationObjectCard: { position: 'absolute', width: 94, height: 94, borderRadius: 29, padding: 13, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#E6D9EA', shadowColor: '#685979', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } },
  generationObjectLeft: { left: 0, top: 29, transform: [{ rotate: '-8deg' }] },
  generationObjectCenter: { left: 85, top: 0, zIndex: 2 },
  generationObjectRight: { right: 0, top: 31, transform: [{ rotate: '8deg' }] },
  generationObjectImage: { width: '100%', height: '100%' },
  generationSparkle: { position: 'absolute', right: 29, top: 4, width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8E8', zIndex: 4 },
  generationSparkleText: { color: '#B483B8', fontSize: 19 },
  generationEmoji: { fontSize: 30, marginBottom: 12 },
  generationTitle: { color: Brand.text, fontSize: 22, lineHeight: 30, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  generationDetail: { maxWidth: 310, marginTop: 9, color: Brand.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  generationProgress: { flexDirection: 'row', gap: 7, marginTop: 27, marginBottom: 18 },
  generationProgressDot: { width: 23, height: 6, borderRadius: 3, backgroundColor: 'rgba(113,91,143,0.16)' },
  generationProgressDotActive: { backgroundColor: '#9279BD' },
  generationWaitText: { marginTop: 16, color: '#837987', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  formCard: { backgroundColor: Brand.surface, borderRadius: 28, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18, borderWidth: 1, borderColor: Brand.border, shadowColor: '#67576B', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 7 } },
  questionBlock: { paddingTop: 8 },
  questionTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  questionNumber: { width: 27, height: 27, borderRadius: 10, backgroundColor: '#EEE7FA', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  questionNumberText: { color: '#725E98', fontSize: 12, fontWeight: '900' },
  questionTitleCopy: { flex: 1, paddingTop: 1 },
  questionTitle: { color: Brand.text, fontSize: 16, lineHeight: 22, fontWeight: '900', letterSpacing: 0 },
  questionDescription: { color: Brand.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  optionalBadge: { marginLeft: 8, marginTop: 2, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, overflow: 'hidden', backgroundColor: '#F2EFED', color: '#8C8488', fontSize: 9, fontWeight: '800' },
  questionDivider: { height: 1, backgroundColor: '#EEE8E6', marginVertical: 22 },
  momentInputWrap: { minHeight: 112, marginTop: 14, borderRadius: 18, backgroundColor: Brand.surfaceElevated, borderWidth: 1, borderColor: Brand.borderSoft, overflow: 'hidden' },
  momentInput: { minHeight: 82, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 6, color: Brand.text, fontSize: 13, lineHeight: 20 },
  characterCount: { alignSelf: 'flex-end', paddingHorizontal: 12, paddingBottom: 9, color: '#AAA2A5', fontSize: 9, fontWeight: '600' },
  emotionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  emotionChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: Brand.surface, borderWidth: 1.5, borderColor: Brand.border },
  emotionSwatch: { width: 10, height: 10, borderRadius: 3 },
  emotionEmoji: { fontSize: 15 },
  emotionLabel: { fontSize: 13, fontWeight: '800', color: Brand.muted },
  emotionLabelSelected: { color: Brand.text },
  creativityBadge: { flexDirection: 'row', alignItems: 'baseline', marginLeft: 8, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 11, backgroundColor: '#EEE7FA' },
  creativityBadgeValue: { color: '#725E98', fontSize: 15, fontWeight: '900' },
  creativityBadgeTotal: { color: '#9B8DAF', fontSize: 9, fontWeight: '800' },
  creativityControl: { position: 'relative', height: 62, marginTop: 19, paddingHorizontal: 0 },
  creativityTrackSegments: { position: 'absolute', left: 16, right: 16, top: 16, height: 4, flexDirection: 'row' },
  creativityTrackSegment: { flex: 1, height: 4, backgroundColor: '#E8E1E3' },
  creativityTrackSegmentActive: { backgroundColor: '#9A82C8' },
  creativityStops: { flexDirection: 'row' },
  creativityStopButton: { flex: 1, minWidth: 0, height: 58, alignItems: 'center' },
  creativityStop: { width: 12, height: 12, marginTop: 12, borderRadius: 6, backgroundColor: '#DAD2D6', borderWidth: 1, borderColor: '#E8E1E3' },
  creativityStopActive: { backgroundColor: '#A992D2' },
  creativityStopSelected: { width: 22, height: 22, marginTop: 7, borderRadius: 11, backgroundColor: '#8166B4', borderWidth: 5, borderColor: '#E9E0F7', shadowColor: '#6C549A', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  creativityStopNumber: { marginTop: 7, color: '#AAA1A5', fontSize: 9, fontWeight: '700' },
  creativityStopNumberSelected: { marginTop: 2, color: '#725E98', fontWeight: '900' },
  creativityLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  legendTitle: { color: Brand.text, fontSize: 10, fontWeight: '800' },
  legendText: { marginTop: 2, color: Brand.muted, fontSize: 9 },
  legendArrow: { flex: 1, textAlign: 'center', color: '#B5A8BD', fontSize: 18 },
  legendRight: { alignItems: 'flex-end' },
  generateButton: { height: 56, borderRadius: 19, backgroundColor: Brand.text, marginTop: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  generateButtonDisabled: { opacity: 0.36 },
  generateSpark: { color: Brand.primarySoft, fontSize: 21 },
  generateText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  generateHint: { marginTop: 9, textAlign: 'center', color: Brand.muted, fontSize: 10 },
  resultSection: { marginTop: 34 },
  storyCard: { borderRadius: 26, overflow: 'hidden', backgroundColor: Brand.surfaceElevated, borderWidth: 1, borderColor: Brand.borderSoft, shadowColor: Brand.text, shadowOpacity: 0.10, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  storyCardCompact: { marginBottom: 20 },
  // 서버가 4:3(1024x768)으로 그려 주므로 컨테이너도 4:3으로 맞춰,
  // 고정 높이 + cover 조합이 그림 하단을 잘라내던 문제를 없앤다.
  illustration: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden' },
  generatedIllustration: { width: '100%', height: '100%' },
  ground: { position: 'absolute', left: -20, right: -20, bottom: -42, height: 105, borderRadius: 80, backgroundColor: '#B8CFAE' },
  sun: { position: 'absolute', width: 54, height: 54, borderRadius: 27, right: 27, top: 25, backgroundColor: '#FFE29A', opacity: 0.92 },
  cloudOne: { position: 'absolute', width: 78, height: 24, borderRadius: 18, left: 22, top: 34, backgroundColor: 'rgba(255,255,255,0.65)' },
  cloudTwo: { position: 'absolute', width: 55, height: 18, borderRadius: 15, right: 86, top: 77, backgroundColor: 'rgba(255,255,255,0.48)' },
  storyObject: { position: 'absolute', width: 88, height: 88, zIndex: 3 },
  storyObjectImage: { width: '100%', height: '100%' },
  storyPaper: { padding: 22, backgroundColor: '#FFFEFA' },
  storyDate: { color: '#9A8290', fontSize: 11, fontWeight: '700' },
  storyTitle: { marginTop: 7, color: Brand.text, fontSize: 22, lineHeight: 30, fontWeight: '900', letterSpacing: 0 },
  storyDivider: { width: 32, height: 3, borderRadius: 2, backgroundColor: Brand.primarySoft, marginVertical: 14 },
  storyBody: { color: '#413941', fontSize: 14, lineHeight: 24 },
  storyTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 17 },
  storyTag: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: '#F2ECF8' },
  storyTagText: { color: '#725E98', fontSize: 10, fontWeight: '700' },
  resultActions: { flexDirection: 'row', gap: 10, marginTop: 15 },
  secondaryAction: { flex: 1, height: 52, borderRadius: 17, borderWidth: 1.5, borderColor: Brand.text, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.surface },
  secondaryActionText: { color: Brand.text, fontSize: 14, fontWeight: '900' },
  primaryAction: { flex: 1, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.text },
  primaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  regenerateButton: { alignSelf: 'center', padding: 13 },
  regenerateText: { color: Brand.muted, fontSize: 12, fontWeight: '700' },
  historyScreen: { flex: 1, backgroundColor: Brand.secondary },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  historyTitle: { fontSize: 25, fontWeight: '900', color: Brand.text },
  historySubtitle: { color: Brand.muted, fontSize: 12, marginTop: 4 },
  closeButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: Brand.surface, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 27, lineHeight: 30, color: Brand.text },
  historyList: { paddingHorizontal: 18, paddingBottom: 45 },
  emptyHistory: { alignItems: 'center', paddingTop: 90 },
  emptyHistoryEmoji: { fontSize: 50 },
  emptyHistoryTitle: { marginTop: 17, color: Brand.text, fontSize: 18, fontWeight: '900' },
  emptyHistoryText: { marginTop: 8, color: Brand.muted, fontSize: 13 },
});
