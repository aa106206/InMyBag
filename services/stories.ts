import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SavedBagItem } from '@/services/bag-items';
import { getSam2ServerUrl } from '@/services/sam2';

// 이야기 톤을 따로 묻던 시절의 값. 지금은 '오늘의 기분'이 톤을 대신하며,
// 예전에 만들어 둔 이야기의 감정을 추정할 때만 쓰인다.
export type StoryMood = 'warm' | 'adventure' | 'comedy' | 'mystery';

// 그날의 감정/기분. 이야기 톤(mood)과 별개로 사용자가 직접 고른다.
// 책등 색과 책장 분류의 기준이 된다.
export type StoryEmotion = 'happy' | 'excited' | 'calm' | 'sad' | 'angry' | 'tired';

export type EmotionMeta = {
  key: StoryEmotion;
  label: string;
  emoji: string;
  color: string; // 책등 본문 색
  cap: string; // 책등 윗면(하이라이트) 색
};

// 감정 팔레트: 빨강=화남, 파랑=슬픔, 초록=편안(안정)처럼 색이 곧 감정 언어가 된다.
export const STORY_EMOTIONS: EmotionMeta[] = [
  { key: 'happy', label: '행복', emoji: '😊', color: '#F2B84B', cap: '#F8D488' },
  { key: 'excited', label: '설렘', emoji: '🥰', color: '#F58BB0', cap: '#FAB6D0' },
  { key: 'calm', label: '편안', emoji: '😌', color: '#4FAE63', cap: '#88D191' },
  { key: 'sad', label: '슬픔', emoji: '😢', color: '#4C8DD6', cap: '#8BB8E8' },
  { key: 'angry', label: '화남', emoji: '😡', color: '#E0574B', cap: '#EE8B82' },
  { key: 'tired', label: '지침', emoji: '😮‍💨', color: '#8E88A6', cap: '#B6B1C8' },
];

export const EMOTION_META: Record<StoryEmotion, EmotionMeta> = STORY_EMOTIONS.reduce(
  (acc, meta) => {
    acc[meta.key] = meta;
    return acc;
  },
  {} as Record<StoryEmotion, EmotionMeta>,
);

export const DEFAULT_EMOTION: StoryEmotion = 'calm';

// 감정을 고르기 전에 만든 예전 이야기는 이야기 톤(mood)으로 감정을 추정한다.
const MOOD_TO_EMOTION: Record<StoryMood, StoryEmotion> = {
  warm: 'calm',
  adventure: 'excited',
  comedy: 'happy',
  mystery: 'tired',
};

export function resolveEmotion(story: { emotion?: StoryEmotion; mood?: StoryMood }): StoryEmotion {
  if (story.emotion && EMOTION_META[story.emotion]) {
    return story.emotion;
  }
  return (story.mood && MOOD_TO_EMOTION[story.mood]) || DEFAULT_EMOTION;
}

export type GeneratedStory = {
  id: string;
  title: string;
  body: string;
  concept: string;
  mood?: StoryMood; // 구버전 이야기 호환용
  emotion?: StoryEmotion;
  creativity: number;
  createdAt: string;
  itemIds: string[];
  itemLabels: string[];
  imageUrls: string[];
  illustrationUrl?: string;
  textModel?: string;
  imageModel?: string;
};

type GeminiStoryResponse = {
  title: string;
  body: string;
  image: string;
  textModel: string;
  imageModel: string;
};

const storageKey = (userId: string) => `snapbag:stories:${userId}`;

export async function loadStories(userId: string): Promise<GeneratedStory[]> {
  const value = await AsyncStorage.getItem(storageKey(userId));
  if (!value) return [];

  try {
    return JSON.parse(value) as GeneratedStory[];
  } catch {
    return [];
  }
}

export async function saveStory(userId: string, story: GeneratedStory) {
  const current = await loadStories(userId);
  const next = [story, ...current.filter((item) => item.id !== story.id)];
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  return next;
}

function getLabel(item: SavedBagItem) {
  return item.objectLabel?.trim() || '이름 미등록 물건';
}

export async function generateStoryWithGemini({
  items,
  dailyMoment,
  emotion,
  creativity,
}: {
  items: SavedBagItem[];
  dailyMoment: string;
  emotion: StoryEmotion;
  creativity: number;
}): Promise<GeneratedStory> {
  const controller = new AbortController();
  // 이야기(최대 90초)와 이미지(최대 150초)가 순차 생성됩니다.
  const timeoutId = setTimeout(() => controller.abort(), 300000);

  try {
    const response = await fetch(`${getSam2ServerUrl()}/story/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dailyMoment: dailyMoment.trim(),
        emotion,
        creativity,
        objects: items.map((item) => ({
          label: getLabel(item),
          locationName: item.locationName,
          imageUrl: item.imageUrl,
        })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json() as { detail?: string };
        detail = errorBody.detail || detail;
      } catch {
        // JSON이 아닌 오류 응답은 상태 코드로 안내합니다.
      }
      throw new Error(detail);
    }

    const generated = await response.json() as GeminiStoryResponse;
    if (!generated.title || !generated.body || !generated.image) {
      throw new Error('Gemini returned an incomplete story diary.');
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: generated.title,
      body: generated.body,
      concept: dailyMoment.trim(),
      emotion,
      creativity,
      createdAt: new Date().toISOString(),
      itemIds: items.map((item) => item.id),
      itemLabels: items.map(getLabel),
      imageUrls: items.map((item) => item.imageUrl),
      illustrationUrl: generated.image,
      textModel: generated.textModel,
      imageModel: generated.imageModel,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('이야기와 그림 생성 시간이 너무 길어졌어요. 잠시 후 다시 시도해 주세요.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
