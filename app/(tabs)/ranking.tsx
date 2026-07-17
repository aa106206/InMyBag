import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '@/hooks/use-auth';
import { loadCurrentBagItems, type SavedBagItem } from '@/services/bag-items';
import {
  createStoryDraft,
  loadStories,
  saveStory,
  type GeneratedStory,
  type StoryLength,
  type StoryMood,
} from '@/services/stories';

const moods: { id: StoryMood; emoji: string; label: string; description: string }[] = [
  { id: 'warm', emoji: '☀️', label: '따뜻한 하루', description: '포근한 그림일기' },
  { id: 'adventure', emoji: '🎈', label: '작은 모험', description: '웃음과 반전이 있는 여행' },
  { id: 'mystery', emoji: '🌙', label: '신비한 사건', description: '상상력을 자극하는 비밀' },
];

const lengthOptions: { id: StoryLength; label: string; detail: string }[] = [
  { id: 'short', label: '짧게', detail: '30초' },
  { id: 'medium', label: '적당히', detail: '1분' },
  { id: 'long', label: '길게', detail: '2분' },
];

function isToday(isoDate: string) {
  const date = new Date(isoDate);
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    .format(new Date(isoDate));
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
      {items.map((item, index) => (
        <View key={item.id} style={styles.objectChip}>
          <View style={styles.objectImageWrap}>
            <Image source={{ uri: item.imageUrl }} style={styles.objectImage} resizeMode="contain" />
          </View>
          <Text style={styles.objectName} numberOfLines={1}>
            {item.objectLabel || `물건 ${index + 1}`}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function StoryIllustration({ story }: { story: GeneratedStory }) {
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
      <View style={styles.illustrationLabel}>
        <Text style={styles.illustrationLabelText}>{"TODAY'S SNAP STORY"}</Text>
      </View>
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
          {story.itemLabels.slice(0, 4).map((label) => (
            <View key={label} style={styles.storyTag}><Text style={styles.storyTagText}>#{label}</Text></View>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function StoryScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<SavedBagItem[]>([]);
  const [savedStories, setSavedStories] = useState<GeneratedStory[]>([]);
  const [story, setStory] = useState<GeneratedStory | null>(null);
  const [concept, setConcept] = useState('');
  const [mood, setMood] = useState<StoryMood>('warm');
  const [length, setLength] = useState<StoryLength>('medium');
  const [creativity, setCreativity] = useState(7);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const todayItems = useMemo(() => items.filter((item) => isToday(item.createdAt)), [items]);

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

  useEffect(() => { refresh(); }, [refresh]);

  const generate = async () => {
    if (todayItems.length === 0) {
      Alert.alert('이야기 재료가 필요해요', '먼저 내 가방에서 오늘의 물건을 하나 이상 담아 주세요.');
      return;
    }
    setGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setStory(createStoryDraft({ items: todayItems, concept, length, mood, creativity }));
    setGenerating(false);
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
    return <View style={styles.loadingScreen}><ActivityIndicator color={Brand.text} /></View>;
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={Brand.text} />}
      >
        <View style={styles.pagePadding}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.eyebrow}>SNAP STORY</Text>
              <Text style={styles.pageTitle}>오늘의 이야기</Text>
              <Text style={styles.pageSubtitle}>가방 속 물건들이 하나의 그림일기가 돼요.</Text>
            </View>
            <Pressable style={styles.historyButton} onPress={() => setHistoryOpen(true)}>
              <Text style={styles.historyIcon}>☰</Text>
              {savedStories.length > 0 ? <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{savedStories.length}</Text></View> : null}
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.stepLabel}>01</Text>
            <View><Text style={styles.sectionTitle}>오늘의 주인공</Text><Text style={styles.sectionHint}>오늘 수집한 물건을 모두 활용해요</Text></View>
          </View>
          <ObjectRail items={todayItems} />

          <View style={styles.formCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.stepLabel}>02</Text>
              <View><Text style={styles.sectionTitle}>이야기에 상상력 더하기</Text><Text style={styles.sectionHint}>원하는 느낌을 골라 주세요</Text></View>
            </View>

            <Text style={styles.fieldLabel}>오늘의 컨셉 <Text style={styles.optional}>· 선택</Text></Text>
            <TextInput
              value={concept}
              onChangeText={setConcept}
              placeholder="예: 평범한 물건들이 밤새 모험을 떠나요"
              placeholderTextColor="#9A949B"
              style={styles.conceptInput}
              multiline
              maxLength={120}
            />

            <Text style={styles.fieldLabel}>이야기 분위기</Text>
            <View style={styles.moodGrid}>
              {moods.map((option) => {
                const selected = mood === option.id;
                return (
                  <Pressable key={option.id} onPress={() => setMood(option.id)} style={[styles.moodCard, selected && styles.moodCardSelected]}>
                    <Text style={styles.moodEmoji}>{option.emoji}</Text>
                    <Text style={[styles.moodLabel, selected && styles.moodLabelSelected]}>{option.label}</Text>
                    <Text style={styles.moodDescription}>{option.description}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>이야기 길이</Text>
            <View style={styles.segmentedControl}>
              {lengthOptions.map((option) => (
                <Pressable key={option.id} onPress={() => setLength(option.id)} style={[styles.lengthOption, length === option.id && styles.lengthOptionSelected]}>
                  <Text style={[styles.lengthLabel, length === option.id && styles.lengthLabelSelected]}>{option.label}</Text>
                  <Text style={[styles.lengthDetail, length === option.id && styles.lengthDetailSelected]}>{option.detail}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.creativityHeader}>
              <Text style={styles.fieldLabel}>상상력</Text>
              <Text style={styles.creativityValue}>{creativity} / 9</Text>
            </View>
            <View style={styles.creativityRow}>
              {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => (
                <Pressable key={value} onPress={() => setCreativity(value)} style={[styles.creativityDot, value <= creativity && styles.creativityDotActive]} />
              ))}
            </View>
            <View style={styles.creativityLegend}><Text style={styles.legendText}>일상적</Text><Text style={styles.legendText}>자유로운 상상</Text></View>

            <Pressable onPress={generate} disabled={generating || todayItems.length === 0} style={[styles.generateButton, (generating || todayItems.length === 0) && styles.generateButtonDisabled]}>
              {generating ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.generateSpark}>✦</Text><Text style={styles.generateText}>오늘의 이야기 만들기</Text></>}
            </Pressable>
            <Text style={styles.generateHint}>오늘의 물건 {todayItems.length}개가 모두 이야기에 등장해요</Text>
          </View>

          {story ? (
            <View style={styles.resultSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.stepLabel}>03</Text>
                <View><Text style={styles.sectionTitle}>완성된 그림일기</Text><Text style={styles.sectionHint}>오늘의 순간을 간직해 보세요</Text></View>
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
        <View style={[styles.historyScreen, { paddingTop: insets.top + 12 }]}>
          <View style={styles.historyHeader}>
            <View><Text style={styles.historyTitle}>나의 이야기책</Text><Text style={styles.historySubtitle}>저장한 그림일기 {savedStories.length}편</Text></View>
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 2.1, color: '#806EA8', marginBottom: 7 },
  pageTitle: { fontSize: 30, lineHeight: 38, fontWeight: '900', color: Brand.text, letterSpacing: -1.1 },
  pageSubtitle: { marginTop: 7, fontSize: 14, lineHeight: 20, color: Brand.muted },
  historyButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: Brand.surface, borderWidth: 1, borderColor: Brand.border, alignItems: 'center', justifyContent: 'center' },
  historyIcon: { fontSize: 20, color: Brand.text },
  historyBadge: { position: 'absolute', right: -5, top: -5, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: '#806EA8', alignItems: 'center', justifyContent: 'center' },
  historyBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  stepLabel: { width: 31, height: 31, paddingTop: 7, borderRadius: 10, overflow: 'hidden', textAlign: 'center', backgroundColor: Brand.lavender, color: Brand.text, fontSize: 12, fontWeight: '900' },
  sectionTitle: { fontSize: 19, fontWeight: '900', color: Brand.text, letterSpacing: -0.4 },
  sectionHint: { fontSize: 12, color: Brand.muted, marginTop: 4 },
  emptyObjects: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: Brand.border, marginBottom: 28 },
  emptyObjectsEmoji: { fontSize: 30, marginRight: 13 },
  emptyObjectsCopy: { flex: 1 },
  emptyObjectsTitle: { color: Brand.text, fontSize: 14, fontWeight: '800' },
  emptyObjectsText: { color: Brand.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  objectRail: { gap: 12, paddingRight: 18, paddingBottom: 28 },
  objectChip: { width: 86, alignItems: 'center' },
  objectImageWrap: { width: 78, height: 78, borderRadius: 24, backgroundColor: Brand.surface, borderWidth: 1, borderColor: Brand.border, padding: 10, shadowColor: '#5D4C6D', shadowOpacity: 0.08, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
  objectImage: { width: '100%', height: '100%' },
  objectName: { maxWidth: 82, marginTop: 8, color: Brand.text, fontSize: 12, fontWeight: '700' },
  formCard: { backgroundColor: Brand.surface, borderRadius: 28, padding: 18, borderWidth: 1, borderColor: Brand.border, shadowColor: '#67576B', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 7 } },
  fieldLabel: { fontSize: 14, fontWeight: '900', color: Brand.text, marginTop: 17, marginBottom: 10 },
  optional: { fontSize: 11, color: Brand.muted, fontWeight: '600' },
  conceptInput: { minHeight: 78, borderRadius: 17, backgroundColor: '#FAF7F4', borderWidth: 1, borderColor: '#E9DFE2', padding: 14, fontSize: 14, lineHeight: 20, color: Brand.text, textAlignVertical: 'top' },
  moodGrid: { flexDirection: 'row', gap: 8 },
  moodCard: { flex: 1, minHeight: 118, borderRadius: 18, borderWidth: 1, borderColor: '#E9DFE2', backgroundColor: '#FAF7F4', padding: 10, alignItems: 'center' },
  moodCardSelected: { borderWidth: 2, borderColor: '#927DBD', backgroundColor: '#F1ECFB' },
  moodEmoji: { fontSize: 26, marginBottom: 7 },
  moodLabel: { fontSize: 12, fontWeight: '900', color: Brand.text, textAlign: 'center' },
  moodLabelSelected: { color: '#675293' },
  moodDescription: { fontSize: 9, lineHeight: 13, color: Brand.muted, textAlign: 'center', marginTop: 5 },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#F3EEEC', padding: 4, borderRadius: 17 },
  lengthOption: { flex: 1, borderRadius: 13, alignItems: 'center', paddingVertical: 9 },
  lengthOptionSelected: { backgroundColor: Brand.surface, shadowColor: '#55495B', shadowOpacity: 0.11, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  lengthLabel: { fontSize: 12, fontWeight: '800', color: Brand.muted },
  lengthLabelSelected: { color: Brand.text },
  lengthDetail: { fontSize: 9, color: '#A9A0A4', marginTop: 2 },
  lengthDetailSelected: { color: '#806EA8' },
  creativityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creativityValue: { fontSize: 12, fontWeight: '800', color: '#806EA8', marginTop: 8 },
  creativityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  creativityDot: { width: 22, height: 8, borderRadius: 5, backgroundColor: '#E9E2E1' },
  creativityDotActive: { backgroundColor: '#A28CCB' },
  creativityLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  legendText: { fontSize: 9, color: Brand.muted },
  generateButton: { height: 56, borderRadius: 19, backgroundColor: Brand.text, marginTop: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  generateButtonDisabled: { opacity: 0.36 },
  generateSpark: { color: Brand.primarySoft, fontSize: 21 },
  generateText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  generateHint: { marginTop: 9, textAlign: 'center', color: Brand.muted, fontSize: 10 },
  resultSection: { marginTop: 34 },
  storyCard: { borderRadius: 26, overflow: 'hidden', backgroundColor: '#FFFEFA', borderWidth: 1, borderColor: '#E7DAD5', shadowColor: '#5E4D55', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  storyCardCompact: { marginBottom: 20 },
  illustration: { height: 245, overflow: 'hidden' },
  ground: { position: 'absolute', left: -20, right: -20, bottom: -42, height: 105, borderRadius: 80, backgroundColor: '#B8CFAE' },
  sun: { position: 'absolute', width: 54, height: 54, borderRadius: 27, right: 27, top: 25, backgroundColor: '#FFE29A', opacity: 0.92 },
  cloudOne: { position: 'absolute', width: 78, height: 24, borderRadius: 18, left: 22, top: 34, backgroundColor: 'rgba(255,255,255,0.65)' },
  cloudTwo: { position: 'absolute', width: 55, height: 18, borderRadius: 15, right: 86, top: 77, backgroundColor: 'rgba(255,255,255,0.48)' },
  storyObject: { position: 'absolute', width: 88, height: 88, zIndex: 3 },
  storyObjectImage: { width: '100%', height: '100%' },
  illustrationLabel: { position: 'absolute', left: 16, top: 15, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.7)' },
  illustrationLabelText: { fontSize: 8, letterSpacing: 1.4, fontWeight: '900', color: '#6A5C79' },
  storyPaper: { padding: 22, backgroundColor: '#FFFEFA' },
  storyDate: { color: '#9A8290', fontSize: 11, fontWeight: '700' },
  storyTitle: { marginTop: 7, color: Brand.text, fontSize: 22, lineHeight: 30, fontWeight: '900', letterSpacing: -0.6 },
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
