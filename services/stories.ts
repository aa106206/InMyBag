import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SavedBagItem } from '@/services/bag-items';
import { getSam2ServerUrl } from '@/services/sam2';

export type StoryLength = 'short' | 'medium' | 'long';
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
  mood: StoryMood;
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
  mood,
  emotion,
  creativity,
}: {
  items: SavedBagItem[];
  dailyMoment: string;
  mood: StoryMood;
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
        mood,
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
      mood,
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

export function createStoryDraft({
  items,
  concept,
  length,
  mood,
  emotion,
  creativity,
}: {
  items: SavedBagItem[];
  concept: string;
  length: StoryLength;
  mood: StoryMood;
  emotion?: StoryEmotion;
  creativity: number;
}): GeneratedStory {
  const labels = items.map(getLabel);
  const places = [...new Set(items.map((item) => item.locationName).filter(Boolean))] as string[];
  const subject = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')}와 ${labels.at(-1)}`;
  const place = places[0] || '오늘 내가 머물던 곳';
  const idea = concept.trim() || '평범한 물건들이 시작한 작은 모험';

  const moodCopy = {
    warm: {
      title: `${subject}이 남긴 작은 안부`,
      opening: `${place}에서 ${subject}을(를) 만났다. 오늘은 왜인지 익숙한 물건들이 나에게 조용히 말을 거는 것만 같았다.`,
      ending: `집으로 돌아오는 길, 가방 속의 물건들은 그대로였지만 나는 오늘을 조금 더 좋아하게 되었다.`,
    },
    adventure: {
      title: `${subject}, 비밀의 출구를 찾다`,
      opening: `${place}에서 ${subject}을(를) 모으는 순간, 바닥에 작은 지도 하나가 펼쳐졌다. 지도의 끝은 아무도 모르는 문을 가리키고 있었다.`,
      ending: `마지막 문이 열리자 보물 대신 오늘의 웃음이 나왔다. 우리는 그것을 가방 깊숙한 곳에 잘 넣어 두었다.`,
    },
    comedy: {
      title: `${subject}의 대단히 엉뚱한 작전`,
      opening: `${place}에서 ${subject}을(를) 모아 두자 작은 회의가 열렸다. 안건은 단 하나, 오늘을 세상에서 가장 웃긴 하루로 만드는 것이었다.`,
      ending: `작전은 예상과 완전히 다르게 흘러갔지만 모두가 웃었으니 성공이었다. 물건들은 아무 일도 없었던 척 다시 가방 속으로 돌아갔다.`,
    },
    mystery: {
      title: `${subject}와 사라진 오후`,
      opening: `${place}에서 ${subject}을(를) 발견했을 때, 시계가 정확히 일분 동안 멈춰다. 다시 움직이기 시작한 세상에서는 작은 것 하나가 달라져 있었다.`,
      ending: `답은 아직 모르지만, ${subject}을(를) 볼 때마다 그 일분이 다시 시작될 것 같다. 그래서 오늘의 가방은 조금 조용한 비밀이 되었다.`,
    },
  }[mood];

  const middle = `우리의 이야기는 ‘${idea}’에서 시작됐다. ${labels.map((label, index) => `${label}은(는) ${index % 2 === 0 ? '길을 밝히는 표식이' : '놓친 단서를 찾는 친구가'} 되었다.`).join(' ')}`;
  const vivid = creativity >= 7
    ? ` 그때 하늘에서 파스텔빛 종이비가 내렸고, 우리의 발자국은 작은 별자리로 남았다.`
    : creativity >= 4
      ? ` 익숙한 풍경은 한 장의 그림책처럼 천천히 넘어갔다.`
      : '';
  const extra = `잠시 멈춰 서로를 바라보니, 별것 아닌 하루도 어떻게 기억하느냐에 따라 특별한 이야기가 된다는 걸 알게 되었다.`;

  const paragraphs = [moodCopy.opening, `${middle}${vivid}`];
  if (length === 'long') paragraphs.push(extra);
  if (length !== 'short') paragraphs.push(moodCopy.ending);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: moodCopy.title,
    body: paragraphs.join('\n\n'),
    concept: idea,
    mood,
    emotion,
    creativity,
    createdAt: new Date().toISOString(),
    itemIds: items.map((item) => item.id),
    itemLabels: labels,
    imageUrls: items.map((item) => item.imageUrl),
  };
}
