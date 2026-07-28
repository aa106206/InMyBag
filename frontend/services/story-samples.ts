import type { GeneratedStory, StoryEmotion, StoryMood } from '@/services/stories';

// 이야기 책장 시연용 더미 그림일기.
//
// 실제 저장된 이야기(AsyncStorage)가 없는 날짜만 채우고, 저장은 하지 않는다.
// 시연이 끝나면 아래 플래그만 false로 바꾸면 책장이 실제 데이터만 보여준다.
export const SHOW_SAMPLE_STORIES = true;

const SAMPLE_YEAR = 2026;
const SAMPLE_MONTH = 7; // 1~12

type SampleSeed = {
  day: number;
  emotion: StoryEmotion;
  mood: StoryMood;
  title: string;
  body: string;
  concept: string;
  creativity: number;
  itemLabels: string[];
};

// 7월 1일~21일 사이 16편. 감정(책등 색)이 한쪽으로 쏠리지 않게 6가지를 고루 섞었다.
const SAMPLE_SEEDS: SampleSeed[] = [
  {
    day: 1,
    emotion: 'calm',
    mood: 'warm',
    title: '텀블러가 데운 아침',
    concept: '이른 아침 도서관에 가는 길',
    creativity: 3,
    itemLabels: ['텀블러', '이어폰'],
    body: '7월의 첫날, 아직 아무도 없는 도서관 앞에서 텀블러를 꼭 쥐었다. 손바닥으로 번지는 온기가 오늘 하루의 첫 문장 같았다.\n\n이어폰에서 흘러나온 노래가 끝날 때쯤 문이 열렸다. 특별한 일은 없었지만, 조용히 시작한 하루가 마음에 들었다.',
  },
  {
    day: 2,
    emotion: 'happy',
    mood: 'comedy',
    title: '볼펜이 벌인 소동',
    concept: '강의실에서 볼펜을 잃어버린 일',
    creativity: 6,
    itemLabels: ['볼펜', '노트', '학생증'],
    body: '분명 필통에 넣어둔 볼펜이 사라졌다. 노트와 학생증까지 총출동해 가방 속을 뒤졌지만 끝내 나오지 않았다.\n\n결국 볼펜은 내 귀 뒤에 얌전히 꽂혀 있었다. 노트가 킥킥 웃는 소리가 들린 것 같아서 나도 따라 웃어 버렸다.',
  },
  {
    day: 4,
    emotion: 'excited',
    mood: 'adventure',
    title: '우산과 떠난 골목 탐험',
    concept: '소나기를 피해 뛰어다닌 오후',
    creativity: 7,
    itemLabels: ['우산', '운동화'],
    body: '갑자기 쏟아진 비에 우산을 펴자, 골목 전체가 커다란 지도처럼 펼쳐졌다. 운동화는 물웅덩이마다 작은 표식을 남겼다.\n\n처마 밑에서 잠시 숨을 고르는 동안 빗소리가 박수처럼 들렸다. 오늘의 탐험은 여기까지, 다음 골목은 내일로 미뤄 두었다.',
  },
  {
    day: 5,
    emotion: 'tired',
    mood: 'warm',
    title: '가방이 무거웠던 하루',
    concept: '과제 마감 전날',
    creativity: 2,
    itemLabels: ['노트북', '충전기', '텀블러'],
    body: '노트북과 충전기를 넣은 가방이 유난히 무거웠다. 어깨에 걸칠 때마다 오늘 해야 할 일의 무게가 그대로 느껴졌다.\n\n그래도 텀블러에 남은 마지막 한 모금이 있어 버틸 수 있었다. 집에 돌아와 가방을 내려놓는 순간이 가장 좋았다.',
  },
  {
    day: 7,
    emotion: 'sad',
    mood: 'warm',
    title: '이어폰 한 짝의 자리',
    concept: '이어폰 한 짝을 잃어버림',
    creativity: 4,
    itemLabels: ['이어폰', '지갑'],
    body: '왼쪽 이어폰이 사라졌다. 별것 아닌데도 케이스의 빈자리가 자꾸 눈에 밟혔다.\n\n지갑을 열어 새 이어폰 값을 세어 보다가 그만두었다. 오늘은 한쪽 귀로만 듣는 세상도 나쁘지 않다고 생각하기로 했다.',
  },
  {
    day: 8,
    emotion: 'calm',
    mood: 'warm',
    title: '책갈피가 멈춘 페이지',
    concept: '카페에서 책을 읽던 시간',
    creativity: 3,
    itemLabels: ['책', '책갈피', '아이스커피'],
    body: '창가 자리에서 책을 펼치자 책갈피가 어제 멈춘 자리를 정확히 알려 주었다. 아이스커피의 얼음이 녹는 속도만큼 천천히 읽었다.\n\n한 챕터를 다 읽고 다시 책갈피를 꽂았다. 내일의 나에게 남기는 짧은 쪽지 같았다.',
  },
  {
    day: 10,
    emotion: 'happy',
    mood: 'adventure',
    title: '버스카드가 데려간 곳',
    concept: '아무 버스나 타고 종점까지 감',
    creativity: 8,
    itemLabels: ['교통카드', '모자', '카메라'],
    body: '교통카드를 찍는 순간 오늘의 목적지가 정해졌다. 모자를 눌러쓰고 창밖만 보다가 종점에 내렸다.',
  },
  {
    day: 11,
    emotion: 'excited',
    mood: 'adventure',
    title: '운동화가 센 걸음 수',
    concept: '친구들과 한강까지 걸어감',
    creativity: 6,
    itemLabels: ['운동화', '물병'],
    body: '운동화가 오늘 하루 동안 만 오천 걸음을 셌다. 물병은 절반쯤 남았고, 다리는 그보다 조금 더 지쳤다.\n\n해가 지는 강가에 앉자 모두 아무 말도 하지 않았다. 그 조용함이 오늘의 가장 좋은 부분이었다.',
  },
  {
    day: 13,
    emotion: 'angry',
    mood: 'comedy',
    title: '충전기가 사라진 날',
    concept: '발표 직전 노트북 배터리 방전',
    creativity: 5,
    itemLabels: ['노트북', '충전기'],
    body: '발표 10분 전, 배터리는 3%였고 충전기는 집 책상 위에 있었다. 노트북 화면이 어두워질 때마다 심장도 같이 어두워졌다.\n\n다행히 앞자리 친구가 충전기를 빌려주었다. 화는 오래가지 않았지만, 오늘의 교훈은 확실히 남았다.',
  },
  {
    day: 14,
    emotion: 'calm',
    mood: 'mystery',
    title: '열쇠고리가 기억하는 문',
    concept: '오래된 열쇠고리를 발견함',
    creativity: 7,
    itemLabels: ['열쇠고리', '지갑'],
    body: '서랍 깊은 곳에서 어느 문의 것인지 모를 열쇠고리가 나왔다. 분명 한때는 매일 여닫던 문이었을 텐데.\n\n어느 문인지는 끝내 떠오르지 않았다. 대신 지갑 옆에 다시 넣어 두었다. 언젠가 그 문이 나를 알아볼지도 모르니까.',
  },
  {
    day: 16,
    emotion: 'happy',
    mood: 'warm',
    title: '작은 선물 상자',
    concept: '친구에게 받은 뜻밖의 선물',
    creativity: 4,
    itemLabels: ['선물 상자', '편지', '리본'],
    body: '아무 날도 아닌데 손바닥만 한 상자를 받았다. 리본을 푸는 동안 괜히 손이 느려졌다.\n\n안에는 짧은 편지 한 장이 들어 있었다. 그 한 문장 덕분에 평범한 목요일이 기념일이 되었다.',
  },
  {
    day: 17,
    emotion: 'tired',
    mood: 'warm',
    title: '텀블러가 비어 있던 오후',
    concept: '하루 종일 이어진 회의',
    creativity: 2,
    itemLabels: ['텀블러', '노트', '볼펜'],
    body: '회의가 이어지는 사이 텀블러는 진작에 비었다. 노트에는 알아볼 수 없는 글씨만 늘어 갔다.\n\n볼펜을 내려놓고 창밖을 보니 어느새 해가 기울어 있었다. 오늘은 여기까지만 하기로 했다.',
  },
  {
    day: 18,
    emotion: 'sad',
    mood: 'mystery',
    title: '사진 속 사라진 오후',
    concept: '지난해 사진을 다시 봄',
    creativity: 6,
    itemLabels: ['카메라', '사진'],
    body: '카메라 폴더를 넘기다 작년 이맘때 사진에서 손이 멈췄다. 같은 자리, 같은 계절인데 무언가 하나가 비어 있었다.\n\n무엇이 달라졌는지는 알 수 없었다. 다만 그 오후는 이제 사진 안에만 남아 있다는 걸 알았다.',
  },
  {
    day: 19,
    emotion: 'excited',
    mood: 'comedy',
    title: '모자와 바람의 추격전',
    concept: '바람에 모자가 날아감',
    creativity: 8,
    itemLabels: ['모자', '운동화', '물병'],
    body: '언덕 위에서 모자가 날아갔다. 운동화가 곧장 뛰기 시작했고, 물병은 가방 안에서 요란하게 응원했다.\n\n모자는 결국 벤치 밑에서 붙잡혔다. 숨을 몰아쉬며 다시 쓰는 순간, 바람이 한 번 더 장난을 걸었다.',
  },
  {
    day: 20,
    emotion: 'tired',
    mood: 'warm',
    title: '우산이 마르는 동안',
    concept: '비 오는 날 집에 머문 하루',
    creativity: 3,
    itemLabels: ['우산', '담요', '머그컵'],
    body: '현관에 세워 둔 우산이 마르는 동안 나도 담요 속에서 마르고 있었다. 머그컵에서 김이 천천히 올라왔다.\n\n아무 데도 가지 않은 하루였는데, 이상하게 하나도 아깝지 않았다.',
  },
  {
    day: 21,
    emotion: 'angry',
    mood: 'adventure',
    title: '지갑이 사라진 30분',
    concept: '지갑을 잃어버린 줄 알았던 소동',
    creativity: 5,
    itemLabels: ['지갑', '가방', '교통카드'],
    body: '계산대 앞에서 지갑이 없다는 걸 알았다. 가방을 세 번 뒤집는 동안 뒷사람의 시선이 등에 꽂혔다.\n\n지갑은 30분 뒤 외투 주머니에서 나왔다. 화가 났다가 안심했다가, 결국 웃음이 났다.',
  },
];

function toIsoAt(day: number) {
  // 하루의 마지막 이야기가 그날의 책등이 되므로 저녁 시간으로 고정한다.
  return new Date(SAMPLE_YEAR, SAMPLE_MONTH - 1, day, 21, 0, 0).toISOString();
}

export const SAMPLE_STORIES: GeneratedStory[] = SAMPLE_SEEDS.map((seed) => ({
  id: `sample-${SAMPLE_YEAR}-${SAMPLE_MONTH}-${seed.day}`,
  title: seed.title,
  body: seed.body,
  concept: seed.concept,
  mood: seed.mood,
  emotion: seed.emotion,
  creativity: seed.creativity,
  createdAt: toIsoAt(seed.day),
  itemIds: [],
  itemLabels: seed.itemLabels,
  imageUrls: [],
}));

function dayKey(story: GeneratedStory) {
  const date = new Date(story.createdAt);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// 실제 이야기가 있는 날짜는 그대로 두고, 비어 있는 날짜에만 샘플을 끼워 넣는다.
export function withSampleStories(stories: GeneratedStory[]): GeneratedStory[] {
  if (!SHOW_SAMPLE_STORIES) {
    return stories;
  }

  const usedDays = new Set(stories.map(dayKey));
  return [...stories, ...SAMPLE_STORIES.filter((story) => !usedDays.has(dayKey(story)))];
}
