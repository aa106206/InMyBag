import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';

type RankingItem = {
  id: string;
  rank: number;
  name: string;
  owner: string;
  score: number;
  image: string;
};

const rankingItems: RankingItem[] = [
  {
    id: 'camera',
    rank: 1,
    name: '필름 카메라',
    owner: 'yuna',
    score: 98242,
    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600',
  },
  {
    id: 'headphones',
    rank: 2,
    name: '무선 헤드폰',
    owner: 'james',
    score: 85410,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
  },
  {
    id: 'sneakers',
    rank: 3,
    name: '러닝 스니커즈',
    owner: 'hyunbin',
    score: 76335,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
  },
  {
    id: 'tablet',
    rank: 4,
    name: '태블릿',
    owner: 'dongjun',
    score: 62102,
    image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600',
  },
  {
    id: 'notebook',
    rank: 5,
    name: '그리드 노트',
    owner: 'james',
    score: 58920,
    image: 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=600',
  },
  {
    id: 'sunglasses',
    rank: 6,
    name: '선글라스',
    owner: 'yuna',
    score: 44188,
    image: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600',
  },
  {
    id: 'bottle',
    rank: 7,
    name: '스틸 보틀',
    owner: 'hyunbin',
    score: 39210,
    image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600',
  },
  {
    id: 'wallet',
    rank: 8,
    name: '카드 지갑',
    owner: 'dongjun',
    score: 31802,
    image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=600',
  },
  {
    id: 'coffee',
    rank: 9,
    name: '텀블러 커피',
    owner: 'james',
    score: 27614,
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600',
  },
  {
    id: 'keys',
    rank: 10,
    name: '키링 세트',
    owner: 'yuna',
    score: 22477,
    image: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=600',
  },
];

const podiumItems = [rankingItems[1], rankingItems[0], rankingItems[2]];
const listItems = rankingItems.slice(3);

function formatScore(score: number) {
  return score.toLocaleString('ko-KR');
}

function PodiumItem({ item }: { item: RankingItem }) {
  const isFirst = item.rank === 1;

  return (
    <View style={[styles.podiumItem, isFirst ? styles.firstPodiumItem : undefined]}>
      <View style={[styles.podiumImageWrap, isFirst ? styles.firstPodiumImageWrap : undefined]}>
        <Image source={{ uri: item.image }} style={styles.podiumImage} contentFit="cover" />
        <View style={[styles.rankBadge, isFirst ? styles.firstRankBadge : undefined]}>
          <Text style={styles.rankBadgeText}>{item.rank}</Text>
        </View>
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.podiumOwner}>@{item.owner}</Text>
      <View style={[styles.podiumBlock, isFirst ? styles.firstPodiumBlock : undefined]}>
        <Text style={styles.podiumScore}>{formatScore(item.score)}</Text>
      </View>
    </View>
  );
}

function RankingRow({ item }: { item: RankingItem }) {
  return (
    <View style={styles.rankRow}>
      <Text style={styles.rankNumber}>{item.rank}</Text>
      <Image source={{ uri: item.image }} style={styles.rowImage} contentFit="cover" />
      <View style={styles.rowCopy}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowOwner}>@{item.owner}</Text>
      </View>
      <Text style={styles.rowScore}>{formatScore(item.score)}</Text>
    </View>
  );
}

export default function RankingScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 28,
        },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>랭킹</Text>
        <Text style={styles.subtitle}>지금 친구들 가방에서 많이 보이는 물건</Text>
      </View>

      <View style={styles.podium}>
        {podiumItems.map((item) => (
          <PodiumItem key={item.id} item={item} />
        ))}
      </View>

      <View style={styles.listPanel}>
        {listItems.map((item) => (
          <RankingRow key={item.id} item={item} />
        ))}
      </View>
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
  header: {
    gap: 4,
  },
  title: {
    color: Brand.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: Brand.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 290,
    paddingHorizontal: 2,
  },
  podiumItem: {
    width: '31%',
    alignItems: 'center',
    gap: 7,
  },
  firstPodiumItem: {
    paddingBottom: 18,
  },
  podiumImageWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    padding: 4,
    backgroundColor: Brand.surface,
    borderWidth: 2,
    borderColor: Brand.border,
  },
  firstPodiumImageWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderColor: Brand.primary,
  },
  podiumImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  rankBadge: {
    position: 'absolute',
    right: -3,
    top: -5,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.lavender,
    borderWidth: 2,
    borderColor: Brand.surface,
  },
  firstRankBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  rankBadgeText: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '900',
  },
  podiumName: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  podiumOwner: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  podiumBlock: {
    width: '100%',
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surface,
    borderColor: Brand.border,
    borderRadius: 8,
    borderWidth: 1,
  },
  firstPodiumBlock: {
    height: 122,
    borderColor: Brand.primary,
  },
  podiumScore: {
    color: Brand.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  listPanel: {
    backgroundColor: Brand.surface,
    borderColor: Brand.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 6,
  },
  rankRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rankNumber: {
    width: 26,
    color: Brand.muted,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  rowImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Brand.secondary,
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowName: {
    color: Brand.text,
    fontSize: 15,
    fontWeight: '900',
  },
  rowOwner: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  rowScore: {
    color: Brand.text,
    fontSize: 15,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});
