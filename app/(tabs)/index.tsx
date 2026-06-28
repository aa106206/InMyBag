import { Accelerometer } from 'expo-sensors';
import Matter, { Bodies, Body, Engine, World } from 'matter-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type ImageSourcePropType,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';

const WALL_THICKNESS = 70;
const FIXED_TIMESTEP = 1000 / 60;

type BagPhotoSeed = {
  id: string;
  source: ImageSourcePropType;
  x: number;
  y: number;
  size: number;
  angle: number;
};

type PhysicsPhotoItem = BagPhotoSeed & {
  body: Matter.Body;
};

type WorldSize = {
  width: number;
  height: number;
};

type FriendBag = {
  id: string;
  user: string;
  avatar: string;
  photos: BagPhotoSeed[];
};

type FriendHistoryItem = {
  id: string;
  date: string;
  photos: BagPhotoSeed[];
};

type FeedPage =
  | { id: 'friend-list'; type: 'friend-list' }
  | { id: string; type: 'bag'; bag: FriendBag };

const mockBags: FriendBag[] = [
  {
    id: 'james',
    user: 'james',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=240',
    photos: [
      {
        id: 'laptop',
        source: require('@/assets/images/feed-objects/laptop.png'),
        x: 0.28,
        y: 0.22,
        size: 122,
        angle: -0.16,
      },
      {
        id: 'coffee',
        source: require('@/assets/images/feed-objects/coffee.png'),
        x: 0.66,
        y: 0.21,
        size: 102,
        angle: 0.12,
      },
      {
        id: 'notebook',
        source: require('@/assets/images/feed-objects/notebook.png'),
        x: 0.39,
        y: 0.58,
        size: 132,
        angle: 0.08,
      },
      {
        id: 'earbuds',
        source: require('@/assets/images/feed-objects/earbuds.png'),
        x: 0.69,
        y: 0.64,
        size: 96,
        angle: -0.2,
      },
    ],
  },
  {
    id: 'hyunbin',
    user: 'hyunbin',
    avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=240',
    photos: [
      {
        id: 'shoes',
        source: require('@/assets/images/feed-objects/shoes.png'),
        x: 0.3,
        y: 0.28,
        size: 126,
        angle: 0.14,
      },
      {
        id: 'bottle',
        source: require('@/assets/images/feed-objects/bottle.png'),
        x: 0.65,
        y: 0.29,
        size: 94,
        angle: -0.1,
      },
      {
        id: 'watch',
        source: require('@/assets/images/feed-objects/watch.png'),
        x: 0.35,
        y: 0.66,
        size: 102,
        angle: -0.18,
      },
      {
        id: 'towel',
        source: require('@/assets/images/feed-objects/towel.png'),
        x: 0.65,
        y: 0.63,
        size: 122,
        angle: 0.18,
      },
    ],
  },
  {
    id: 'dongjun',
    user: 'dongjun',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240',
    photos: [
      {
        id: 'tablet',
        source: require('@/assets/images/feed-objects/tablet.png'),
        x: 0.29,
        y: 0.23,
        size: 122,
        angle: -0.09,
      },
      {
        id: 'book',
        source: require('@/assets/images/feed-objects/book.png'),
        x: 0.64,
        y: 0.26,
        size: 116,
        angle: 0.17,
      },
      {
        id: 'pen',
        source: require('@/assets/images/feed-objects/pen.png'),
        x: 0.34,
        y: 0.65,
        size: 102,
        angle: 0.18,
      },
      {
        id: 'wallet',
        source: require('@/assets/images/feed-objects/wallet.png'),
        x: 0.68,
        y: 0.63,
        size: 104,
        angle: -0.14,
      },
    ],
  },
  {
    id: 'yuna',
    user: 'yuna',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240',
    photos: [
      {
        id: 'camera',
        source: require('@/assets/images/feed-objects/camera.png'),
        x: 0.3,
        y: 0.25,
        size: 124,
        angle: 0.12,
      },
      {
        id: 'sunglasses',
        source: require('@/assets/images/feed-objects/sunglasses.png'),
        x: 0.67,
        y: 0.24,
        size: 104,
        angle: -0.16,
      },
      {
        id: 'keys',
        source: require('@/assets/images/feed-objects/keys.png'),
        x: 0.33,
        y: 0.64,
        size: 96,
        angle: -0.2,
      },
      {
        id: 'pouch',
        source: require('@/assets/images/feed-objects/pouch.png'),
        x: 0.65,
        y: 0.62,
        size: 126,
        angle: 0.14,
      },
    ],
  },
];

function createWalls(width: number, height: number) {
  const half = WALL_THICKNESS / 2;

  const ground = Bodies.rectangle(
    width / 2,
    height + half - 1,
    width + WALL_THICKNESS * 2,
    WALL_THICKNESS,
    { isStatic: true, label: 'wall', friction: 0.9, restitution: 0.12 },
  );

  const topWall = Bodies.rectangle(
    width / 2,
    -half + 1,
    width + WALL_THICKNESS * 2,
    WALL_THICKNESS,
    { isStatic: true, label: 'wall', friction: 0.9, restitution: 0.12 },
  );

  const leftWall = Bodies.rectangle(-half + 1, height / 2, WALL_THICKNESS, height * 2, {
    isStatic: true,
    label: 'wall',
    friction: 0.4,
    restitution: 0.1,
  });

  const rightWall = Bodies.rectangle(width + half - 1, height / 2, WALL_THICKNESS, height * 2, {
    isStatic: true,
    label: 'wall',
    friction: 0.4,
    restitution: 0.1,
  });

  return [ground, topWall, leftWall, rightWall];
}

function clampPhotoPosition(
  position: { x: number; y: number },
  worldSize: WorldSize,
  photoSize: number,
) {
  if (worldSize.width <= 0 || worldSize.height <= 0) {
    return position;
  }

  const inset = photoSize / 2;

  return {
    x: Math.max(inset, Math.min(worldSize.width - inset, position.x)),
    y: Math.max(inset, Math.min(worldSize.height - inset, position.y)),
  };
}

function clampBodyInsideWorld(body: Matter.Body, worldSize: WorldSize, photoSize: number) {
  const nextPosition = clampPhotoPosition(body.position, worldSize, photoSize);
  const didClamp =
    nextPosition.x !== body.position.x || nextPosition.y !== body.position.y;

  if (didClamp) {
    Body.setPosition(body, nextPosition);
    Body.setVelocity(body, { x: 0, y: 0 });
  }
}

function PhysicsPhoto({
  photo,
  frame,
  worldSize,
  onPhotoDragChange,
}: {
  photo: PhysicsPhotoItem;
  frame: number;
  worldSize: WorldSize;
  onPhotoDragChange: (isDragging: boolean) => void;
}) {
  void frame;

  const bodyRef = useRef(photo.body);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const worldSizeRef = useRef(worldSize);
  const isDraggingRef = useRef(false);
  const dragFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPhotoDragChangeRef = useRef(onPhotoDragChange);
  bodyRef.current = photo.body;
  worldSizeRef.current = worldSize;
  onPhotoDragChangeRef.current = onPhotoDragChange;

  const clearDragFallback = () => {
    if (dragFallbackRef.current) {
      clearTimeout(dragFallbackRef.current);
      dragFallbackRef.current = null;
    }
  };

  const endPhotoDrag = (velocity = { x: 0, y: 0 }) => {
    const body = bodyRef.current;
    clearDragFallback();
    isDraggingRef.current = false;
    onPhotoDragChangeRef.current(false);
    Body.setPosition(
      body,
      clampPhotoPosition(body.position, worldSizeRef.current, photo.size),
    );
    Body.setStatic(body, false);
    Body.setVelocity(body, velocity);
  };

  const scheduleDragFallback = () => {
    clearDragFallback();
    dragFallbackRef.current = setTimeout(() => {
      if (isDraggingRef.current) {
        endPhotoDrag();
      }
    }, 1200);
  };

  useEffect(
    () => () => {
      clearDragFallback();
      if (isDraggingRef.current) {
        const body = bodyRef.current;
        isDraggingRef.current = false;
        onPhotoDragChangeRef.current(false);
        Body.setStatic(body, false);
      }
    },
    [],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        const body = bodyRef.current;
        isDraggingRef.current = true;
        onPhotoDragChangeRef.current(true);
        scheduleDragFallback();
        dragStartRef.current = { x: body.position.x, y: body.position.y };
        Body.setStatic(body, true);
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      },
      onPanResponderMove: (_, gestureState) => {
        const body = bodyRef.current;
        scheduleDragFallback();
        Body.setPosition(
          body,
          clampPhotoPosition(
            {
              x: dragStartRef.current.x + gestureState.dx,
              y: dragStartRef.current.y + gestureState.dy,
            },
            worldSizeRef.current,
            photo.size,
          ),
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        endPhotoDrag({
          x: gestureState.vx * 4,
          y: gestureState.vy * 4,
        });
      },
      onPanResponderTerminate: () => {
        endPhotoDrag();
      },
    }),
  ).current;

  const { x, y } = photo.body.position;

  return (
    <View
      style={[
        styles.photoCard,
        {
          left: x - photo.size / 2,
          top: y - photo.size / 2,
          width: photo.size,
          height: photo.size,
          transform: [{ rotate: `${photo.body.angle}rad` }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Image source={photo.source} style={styles.photo} />
    </View>
  );
}

function FriendListPage({
  friends,
  searchText,
  onSearchTextChange,
  width,
  topInset,
}: {
  friends: FriendBag[];
  searchText: string;
  onSearchTextChange: (value: string) => void;
  width: number;
  topInset: number;
}) {
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredFriends = normalizedSearch
    ? friends.filter((friend) => friend.user.toLowerCase().includes(normalizedSearch))
    : friends;

  return (
    <View
      style={[
        styles.friendListPage,
        {
          width,
          paddingTop: topInset + 22,
        },
      ]}
    >
      <Text style={styles.friendListTitle}>친구 목록</Text>
      <TextInput
        value={searchText}
        onChangeText={onSearchTextChange}
        placeholder="친구 검색"
        placeholderTextColor={Brand.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.searchInput}
      />
      <ScrollView
        style={styles.friendList}
        contentContainerStyle={styles.friendListContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredFriends.map((friend) => (
          <View key={friend.id} style={styles.friendRow}>
            <Image source={{ uri: friend.avatar }} style={styles.friendAvatar} />
            <Text style={styles.friendUser}>@{friend.user}</Text>
          </View>
        ))}
        {filteredFriends.length === 0 ? (
          <Text style={styles.emptyFriendText}>검색 결과가 없습니다.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function getFriendHistoryItems(bag: FriendBag): FriendHistoryItem[] {
  const dates = ['6/17', '6/5', '6/4', '5/28', '5/20', '5/11'];

  return dates.map((date, index) => {
    const photos = bag.photos
      .slice()
      .sort((a, b) => ((a.id.charCodeAt(0) + index) % 5) - ((b.id.charCodeAt(0) + index) % 5))
      .slice(0, index % 2 === 0 ? 3 : 2);

    return {
      id: `${bag.id}-${date}`,
      date,
      photos,
    };
  });
}

function FriendHistoryCard({ item }: { item: FriendHistoryItem }) {
  return (
    <View style={styles.historyCard}>
      <Text style={styles.historyDate}>{item.date}</Text>
      <View style={styles.historyPreview}>
        {item.photos.map((photo, index) => (
          <View
            key={`${item.id}-${photo.id}`}
            style={[
              styles.historyPhoto,
              {
                left: `${12 + ((index * 22 + photo.x * 30) % 44)}%`,
                top: `${18 + ((index * 19 + photo.y * 28) % 42)}%`,
                width: Math.max(46, photo.size * 0.46),
                height: Math.max(46, photo.size * 0.46),
                transform: [{ rotate: `${photo.angle}rad` }],
              },
            ]}
          >
            <Image source={photo.source} style={styles.photo} />
          </View>
        ))}
      </View>
    </View>
  );
}

function FriendBagPage({
  bag,
  width,
  topInset,
  onPhotoDragChange,
}: {
  bag: FriendBag;
  width: number;
  topInset: number;
  onPhotoDragChange: (isDragging: boolean) => void;
}) {
  const engineRef = useRef(Engine.create({ gravity: { x: 0, y: 0, scale: 0.002 } }));
  const wallsRef = useRef<Matter.Body[]>([]);
  const worldSizeRef = useRef({ width: 0, height: 0 });
  const [photos, setPhotos] = useState<PhysicsPhotoItem[]>([]);
  const [frame, setFrame] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const historyItems = getFriendHistoryItems(bag);

  const syncWorld = useCallback(
    (canvasWidth: number, canvasHeight: number) => {
      if (canvasWidth <= 0 || canvasHeight <= 0) {
        return;
      }

      const world = engineRef.current.world;
      photos.forEach((photo) => World.remove(world, photo.body));
      wallsRef.current.forEach((wall) => World.remove(world, wall));
      wallsRef.current = createWalls(canvasWidth, canvasHeight);
      World.add(world, wallsRef.current);

      const nextPhotos = bag.photos.map((photo) => {
        const body = Bodies.rectangle(
          canvasWidth * photo.x,
          canvasHeight * photo.y,
          photo.size,
          photo.size,
          {
            label: 'photo',
            restitution: 0.24,
            friction: 0.68,
            frictionStatic: 0.86,
            frictionAir: 0.04,
            density: 0.0012,
            chamfer: { radius: 2 },
          },
        );

        (body as Matter.Body & { photoSize: number }).photoSize = photo.size;
        Body.setAngle(body, photo.angle);
        World.add(world, body);

        return { ...photo, body };
      });

      worldSizeRef.current = { width: canvasWidth, height: canvasHeight };
      setPhotos(nextPhotos);
    },
    [bag.photos, photos],
  );

  const onCanvasLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width: canvasWidth, height: canvasHeight } = event.nativeEvent.layout;
      const current = worldSizeRef.current;

      if (current.width === canvasWidth && current.height === canvasHeight) {
        return;
      }

      syncWorld(canvasWidth, canvasHeight);
    },
    [syncWorld],
  );

  useEffect(() => {
    const engine = engineRef.current;
    let frameId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const delta = Math.min(time - lastTime, FIXED_TIMESTEP * 2);
      lastTime = time;
      Engine.update(engine, delta || FIXED_TIMESTEP);
      engine.world.bodies.forEach((body) => {
        if (body.label === 'photo') {
          const photoSize = (body as Matter.Body & { photoSize?: number }).photoSize ?? 0;
          clampBodyInsideWorld(body, worldSizeRef.current, photoSize);
        }
      });
      setFrame((value) => (value + 1) % 1000000);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      Engine.clear(engine);
    };
  }, []);

  useEffect(() => {
    Accelerometer.setUpdateInterval(50);

    const GRAVITY_MULT = 3.2;
    const GRAVITY_SCALE = 0.0018;
    const FORCE_FACTOR = 0.0014;

    const subscription = Accelerometer.addListener(({ x, y }: { x: number; y: number; z: number }) => {
      const engine = engineRef.current;
      const isAndroid = Platform.OS === 'android';
      const axisX = isAndroid ? -x : x;
      const axisY = isAndroid ? y : -y;

      engine.world.gravity.x = Math.max(-5, Math.min(5, axisX * GRAVITY_MULT));
      engine.world.gravity.y = Math.max(-5, Math.min(5, axisY * GRAVITY_MULT));
      engine.world.gravity.scale = GRAVITY_SCALE;

      try {
        const bodies = engine.world.bodies as Matter.Body[];
        for (let i = 0; i < bodies.length; i++) {
          const body = bodies[i];
          if (body.label === 'photo') {
            Body.applyForce(body, body.position, {
              x: axisX * FORCE_FACTOR * (body.mass ?? 1),
              y: axisY * FORCE_FACTOR * (body.mass ?? 1),
            });
          }
        }
      } catch {
        // ignore
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <View
      style={[
        styles.page,
        {
          width,
          paddingTop: topInset + 16,
          paddingBottom: 0,
        },
      ]}
    >
      <View style={styles.profileRow}>
        <Image source={{ uri: bag.avatar }} style={styles.avatar} />
        <Text style={styles.userName}>@{bag.user}</Text>
        <Pressable
          style={[styles.modeToggle, showHistory ? styles.modeToggleActive : undefined]}
          onPress={() => setShowHistory((value) => !value)}
        >
          <View style={[styles.toggleThumb, showHistory ? styles.toggleThumbActive : undefined]} />
        </Pressable>
      </View>
      {showHistory ? (
        <ScrollView
          style={styles.history}
          contentContainerStyle={styles.historyContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.historyGrid}>
            {historyItems.map((item) => (
              <FriendHistoryCard key={item.id} item={item} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.canvas} onLayout={onCanvasLayout}>
          {photos.map((photo) => (
            <PhysicsPhoto
              key={photo.id}
              photo={photo}
              frame={frame}
              worldSize={worldSizeRef.current}
              onPhotoDragChange={onPhotoDragChange}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [friendSearchText, setFriendSearchText] = useState('');
  const feedPages: FeedPage[] = [
    { id: 'friend-list', type: 'friend-list' },
    ...mockBags.map((bag) => ({ id: bag.id, type: 'bag' as const, bag })),
  ];

  return (
    <View style={styles.container}>
      <FlatList
        data={feedPages}
        horizontal
        pagingEnabled
        bounces={false}
        scrollEnabled={!isPhotoDragging}
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) =>
          item.type === 'friend-list' ? (
            <FriendListPage
              friends={mockBags}
              searchText={friendSearchText}
              onSearchTextChange={setFriendSearchText}
              width={width}
              topInset={insets.top}
            />
          ) : (
            <FriendBagPage
              bag={item.bag}
              width={width}
              topInset={insets.top}
              onPhotoDragChange={setIsPhotoDragging}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  friendListPage: {
    flex: 1,
    paddingHorizontal: 18,
    gap: 14,
    backgroundColor: Brand.secondary,
  },
  friendListTitle: {
    color: Brand.text,
    fontSize: 30,
    fontWeight: '900',
  },
  searchInput: {
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    color: Brand.text,
    fontSize: 15,
    fontWeight: '800',
  },
  friendList: {
    flex: 1,
  },
  friendListContent: {
    gap: 10,
    paddingBottom: 20,
  },
  friendRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  friendAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Brand.secondary,
  },
  friendUser: {
    color: Brand.text,
    fontSize: 17,
    fontWeight: '900',
  },
  emptyFriendText: {
    paddingTop: 18,
    color: Brand.muted,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  page: {
    flex: 1,
    gap: 10,
    paddingHorizontal: 14,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Brand.surface,
    borderWidth: 2,
    borderColor: Brand.surface,
  },
  userName: {
    flex: 1,
    color: Brand.text,
    fontSize: 20,
    fontWeight: '900',
  },
  modeToggle: {
    width: 54,
    height: 30,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 3,
    backgroundColor: Brand.secondary,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  modeToggleActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Brand.surface,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  history: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  historyContent: {
    paddingTop: 2,
    paddingBottom: 18,
  },
  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  historyCard: {
    width: '30.8%',
    minHeight: 178,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  historyDate: {
    paddingHorizontal: 10,
    paddingTop: 10,
    color: Brand.text,
    fontSize: 15,
    fontWeight: '900',
  },
  historyPreview: {
    flex: 1,
    marginTop: 6,
    overflow: 'hidden',
    backgroundColor: Brand.secondary,
  },
  historyPhoto: {
    position: 'absolute',
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Brand.secondary,
  },
  photoCard: {
    position: 'absolute',
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
});
