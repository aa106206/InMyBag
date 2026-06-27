import { Image } from 'expo-image';
import { useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';

type BagPhoto = {
  id: string;
  uri: string;
  left: `${number}%`;
  top: `${number}%`;
  size: number;
  rotate: string;
};

type FriendBag = {
  id: string;
  user: string;
  name: string;
  title: string;
  mood: string;
  avatarColor: string;
  items: string[];
  photos: BagPhoto[];
};

const mockBags: FriendBag[] = [
  {
    id: 'james',
    user: 'james',
    name: 'James',
    title: '카페 작업 가방',
    mood: '노트북, 커피, 필기구',
    avatarColor: '#0145F2',
    items: ['MacBook', 'AirPods', 'Notebook', 'Coffee'],
    photos: [
      {
        id: 'laptop',
        uri: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600',
        left: '11%',
        top: '10%',
        size: 128,
        rotate: '-9deg',
      },
      {
        id: 'coffee',
        uri: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600',
        left: '53%',
        top: '6%',
        size: 108,
        rotate: '8deg',
      },
      {
        id: 'notebook',
        uri: 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=600',
        left: '28%',
        top: '42%',
        size: 136,
        rotate: '5deg',
      },
      {
        id: 'earbuds',
        uri: 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=600',
        left: '60%',
        top: '51%',
        size: 104,
        rotate: '-12deg',
      },
    ],
  },
  {
    id: 'hyunbin',
    user: 'hyunbin',
    name: 'Hyunbin',
    title: '운동 끝나고 바로 외출',
    mood: '가볍게 챙긴 gym day',
    avatarColor: '#16A34A',
    items: ['Sneakers', 'Bottle', 'Towel', 'Protein'],
    photos: [
      {
        id: 'shoes',
        uri: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
        left: '10%',
        top: '13%',
        size: 132,
        rotate: '8deg',
      },
      {
        id: 'bottle',
        uri: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600',
        left: '57%',
        top: '18%',
        size: 98,
        rotate: '-6deg',
      },
      {
        id: 'watch',
        uri: 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=600',
        left: '22%',
        top: '51%',
        size: 106,
        rotate: '-11deg',
      },
      {
        id: 'towel',
        uri: 'https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=600',
        left: '55%',
        top: '50%',
        size: 126,
        rotate: '12deg',
      },
    ],
  },
  {
    id: 'dongjun',
    user: 'dongjun',
    name: 'Dongjun',
    title: '수업 가는 백팩',
    mood: '태블릿이랑 책 위주',
    avatarColor: '#7C3AED',
    items: ['Tablet', 'Book', 'Pen', 'Wallet'],
    photos: [
      {
        id: 'tablet',
        uri: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600',
        left: '14%',
        top: '9%',
        size: 124,
        rotate: '-5deg',
      },
      {
        id: 'book',
        uri: 'https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=600',
        left: '51%',
        top: '12%',
        size: 118,
        rotate: '10deg',
      },
      {
        id: 'pen',
        uri: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600',
        left: '20%',
        top: '49%',
        size: 110,
        rotate: '11deg',
      },
      {
        id: 'wallet',
        uri: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=600',
        left: '58%',
        top: '52%',
        size: 106,
        rotate: '-8deg',
      },
    ],
  },
  {
    id: 'yuna',
    user: 'yuna',
    name: 'Yuna',
    title: '주말 산책 가방',
    mood: '카메라, 선글라스, 작은 지갑',
    avatarColor: '#EA580C',
    items: ['Camera', 'Sunglasses', 'Lip balm', 'Keys'],
    photos: [
      {
        id: 'camera',
        uri: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600',
        left: '13%',
        top: '12%',
        size: 126,
        rotate: '7deg',
      },
      {
        id: 'sunglasses',
        uri: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600',
        left: '56%',
        top: '9%',
        size: 108,
        rotate: '-9deg',
      },
      {
        id: 'keys',
        uri: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=600',
        left: '18%',
        top: '51%',
        size: 102,
        rotate: '-12deg',
      },
      {
        id: 'pouch',
        uri: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=600',
        left: '54%',
        top: '48%',
        size: 132,
        rotate: '8deg',
      },
    ],
  },
];

function BagPage({
  bag,
  width,
  topInset,
  bottomInset,
}: {
  bag: FriendBag;
  width: number;
  topInset: number;
  bottomInset: number;
}) {
  const canvasHeight = Math.min(460, Math.max(360, width * 1.05));

  return (
    <View
      style={[
        styles.page,
        {
          width,
          paddingTop: topInset + 18,
          paddingBottom: bottomInset + 28,
        },
      ]}
    >
      <View style={styles.header}>
        <Image source={require('@/assets/images/InMyBag.png')} style={styles.logoImage} />
        <View style={styles.headerCopy}>
          <Text style={styles.brandName}>InMyBag</Text>
          <Text style={styles.feedLabel}>Friends Bag Feed</Text>
        </View>
      </View>

      <View style={styles.friendRow}>
        <View style={[styles.avatar, { backgroundColor: bag.avatarColor }]}>
          <Text style={styles.avatarText}>{bag.name[0]}</Text>
        </View>
        <View style={styles.friendCopy}>
          <Text style={styles.userName}>@{bag.user}</Text>
          <Text style={styles.mood}>{bag.mood}</Text>
        </View>
      </View>

      <View style={[styles.bagCanvas, { height: canvasHeight }]}>
        <View style={styles.canvasGlow} />
        {bag.photos.map((photo) => (
          <View
            key={photo.id}
            style={[
              styles.photoCard,
              {
                left: photo.left,
                top: photo.top,
                width: photo.size,
                height: photo.size,
                transform: [{ rotate: photo.rotate }],
              },
            ]}
          >
            <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
          </View>
        ))}
      </View>

      <View style={styles.summary}>
        <Text style={styles.title}>{bag.title}</Text>
        <View style={styles.chips}>
          {bag.items.map((item) => (
            <View key={item} style={styles.chip}>
              <Text style={styles.chipText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(nextIndex);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={mockBags}
        horizontal
        pagingEnabled
        bounces={false}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        renderItem={({ item }) => (
          <BagPage
            bag={item}
            width={width}
            topInset={insets.top}
            bottomInset={insets.bottom}
          />
        )}
      />

      <View style={[styles.pagination, { bottom: insets.bottom + 18 }]}>
        {mockBags.map((bag, index) => (
          <View
            key={bag.id}
            style={[styles.dot, activeIndex === index ? styles.activeDot : undefined]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  page: {
    flex: 1,
    paddingHorizontal: 18,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoImage: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  headerCopy: {
    flex: 1,
  },
  brandName: {
    color: Brand.primary,
    fontSize: 26,
    fontWeight: '900',
  },
  feedLabel: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Brand.surface,
    borderColor: Brand.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  friendCopy: {
    flex: 1,
  },
  userName: {
    color: Brand.text,
    fontSize: 16,
    fontWeight: '900',
  },
  mood: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  bagCanvas: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#07101F',
    borderColor: '#17233B',
    borderRadius: 8,
    borderWidth: 1,
  },
  canvasGlow: {
    position: 'absolute',
    left: '12%',
    top: '8%',
    width: '76%',
    height: '76%',
    borderRadius: 999,
    backgroundColor: 'rgba(1, 69, 242, 0.18)',
  },
  photoCard: {
    position: 'absolute',
    overflow: 'hidden',
    borderColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 4,
    backgroundColor: '#FFFFFF',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  summary: {
    gap: 12,
  },
  title: {
    color: Brand.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: Brand.surface,
    borderColor: Brand.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    color: Brand.text,
    fontSize: 13,
    fontWeight: '800',
  },
  pagination: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#B7C0CC',
  },
  activeDot: {
    width: 22,
    backgroundColor: Brand.primary,
  },
});
