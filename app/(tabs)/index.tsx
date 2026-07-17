import { Accelerometer } from 'expo-sensors';
import Matter, { Bodies, Body, Engine, World } from 'matter-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type ImageSourcePropType,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoLocationMap } from '@/components/photo-location-map';
import { Brand } from '@/constants/theme';

const WALL_THICKNESS = 70;
const FIXED_TIMESTEP = 1000 / 60;
const FEED_LOGO = require('@/assets/images/snapbag-feed-logo.png');

type BagPhotoSeed = {
  id: string;
  source: ImageSourcePropType;
  name: string;
  capturedAt: string;
  locationName: string;
  latitude: number;
  longitude: number;
  x: number;
  y: number;
  size: number;
  angle: number;
};

type PhysicsPhotoItem = BagPhotoSeed & {
  body: Matter.Body;
};

type PhotoLikeState = {
  count: number;
  liked: boolean;
};

type SelectedPhotoInfo = {
  photo: BagPhotoSeed;
  photoKey: string;
};

type WorldSize = {
  width: number;
  height: number;
};

type FriendBag = {
  id: string;
  user: string;
  avatar: ImageSourcePropType;
  photos: BagPhotoSeed[];
};

type FriendHistoryItem = {
  id: string;
  date: string;
  photos: BagPhotoSeed[];
};

const initialLikeCounts: Record<string, number> = {
  'james-laptop': 21,
  'james-coffee': 18,
  'james-notebook': 14,
  'james-earbuds': 22,
  'hyunbin-shoes': 15,
  'hyunbin-bottle': 9,
  'hyunbin-watch': 17,
  'hyunbin-towel': 11,
  'dongjun-tablet': 24,
  'dongjun-book': 16,
  'dongjun-pen': 8,
  'dongjun-wallet': 19,
  'yuna-camera': 20,
  'yuna-sunglasses': 13,
  'yuna-keys': 10,
  'yuna-pouch': 23,
};

const friendBags: FriendBag[] = [
  {
    id: 'james',
    user: 'james',
    avatar: require('@/assets/images/friend-profiles/james-default.png'),
    photos: [
      {
        id: 'laptop',
        source: require('@/assets/images/feed-objects/laptop.png'),
        name: '노트북',
        capturedAt: '2026.06.17 10:32',
        locationName: '서울 성수동 카페',
        latitude: 37.5446,
        longitude: 127.0557,
        x: 0.28,
        y: 0.22,
        size: 122,
        angle: -0.16,
      },
      {
        id: 'coffee',
        source: require('@/assets/images/feed-objects/coffee.png'),
        name: '커피',
        capturedAt: '2026.06.17 10:40',
        locationName: '서울 성수동 카페',
        latitude: 37.5446,
        longitude: 127.0557,
        x: 0.66,
        y: 0.21,
        size: 102,
        angle: 0.12,
      },
      {
        id: 'notebook',
        source: require('@/assets/images/feed-objects/notebook.png'),
        name: '노트',
        capturedAt: '2026.06.17 11:08',
        locationName: '서울 성수동 카페',
        latitude: 37.5446,
        longitude: 127.0557,
        x: 0.39,
        y: 0.58,
        size: 132,
        angle: 0.08,
      },
      {
        id: 'earbuds',
        source: require('@/assets/images/feed-objects/earbuds.png'),
        name: '이어버드',
        capturedAt: '2026.06.17 11:20',
        locationName: '서울 성수동 카페',
        latitude: 37.5446,
        longitude: 127.0557,
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
    avatar: { uri: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=240' },
    photos: [
      {
        id: 'shoes',
        source: require('@/assets/images/feed-objects/shoes.png'),
        name: '운동화',
        capturedAt: '2026.06.16 14:12',
        locationName: '한강공원',
        latitude: 37.5285,
        longitude: 126.9349,
        x: 0.3,
        y: 0.28,
        size: 126,
        angle: 0.14,
      },
      {
        id: 'bottle',
        source: require('@/assets/images/feed-objects/bottle.png'),
        name: '물병',
        capturedAt: '2026.06.16 14:25',
        locationName: '한강공원',
        latitude: 37.5285,
        longitude: 126.9349,
        x: 0.65,
        y: 0.29,
        size: 94,
        angle: -0.1,
      },
      {
        id: 'watch',
        source: require('@/assets/images/feed-objects/watch.png'),
        name: '스마트워치',
        capturedAt: '2026.06.16 15:02',
        locationName: '한강공원',
        latitude: 37.5285,
        longitude: 126.9349,
        x: 0.35,
        y: 0.66,
        size: 102,
        angle: -0.18,
      },
      {
        id: 'towel',
        source: require('@/assets/images/feed-objects/towel.png'),
        name: '타월',
        capturedAt: '2026.06.16 15:18',
        locationName: '한강공원',
        latitude: 37.5285,
        longitude: 126.9349,
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
    avatar: require('@/assets/images/friend-profiles/dongjun-dog.png'),
    photos: [
      {
        id: 'tablet',
        source: require('@/assets/images/feed-objects/tablet.png'),
        name: '태블릿',
        capturedAt: '2026.06.15 09:44',
        locationName: '강남역 스터디룸',
        latitude: 37.4979,
        longitude: 127.0276,
        x: 0.29,
        y: 0.23,
        size: 122,
        angle: -0.09,
      },
      {
        id: 'book',
        source: require('@/assets/images/feed-objects/book.png'),
        name: '책',
        capturedAt: '2026.06.15 10:05',
        locationName: '강남역 스터디룸',
        latitude: 37.4979,
        longitude: 127.0276,
        x: 0.64,
        y: 0.26,
        size: 116,
        angle: 0.17,
      },
      {
        id: 'pen',
        source: require('@/assets/images/feed-objects/pen.png'),
        name: '펜',
        capturedAt: '2026.06.15 10:37',
        locationName: '강남역 스터디룸',
        latitude: 37.4979,
        longitude: 127.0276,
        x: 0.34,
        y: 0.65,
        size: 102,
        angle: 0.18,
      },
      {
        id: 'wallet',
        source: require('@/assets/images/feed-objects/wallet.png'),
        name: '지갑',
        capturedAt: '2026.06.15 11:03',
        locationName: '강남역 스터디룸',
        latitude: 37.4979,
        longitude: 127.0276,
        x: 0.68,
        y: 0.63,
        size: 104,
        angle: -0.14,
      },
    ],
  },
  {
    id: 'yuna',
    user: 'y.yuna',
    avatar: require('@/assets/images/friend-profiles/y-yuna-character.png'),
    photos: [
      {
        id: 'camera',
        source: require('@/assets/images/feed-objects/camera.png'),
        name: '카메라',
        capturedAt: '2026.06.14 16:22',
        locationName: '북촌 한옥마을',
        latitude: 37.5826,
        longitude: 126.983,
        x: 0.3,
        y: 0.25,
        size: 124,
        angle: 0.12,
      },
      {
        id: 'sunglasses',
        source: require('@/assets/images/feed-objects/sunglasses.png'),
        name: '선글라스',
        capturedAt: '2026.06.14 16:40',
        locationName: '북촌 한옥마을',
        latitude: 37.5826,
        longitude: 126.983,
        x: 0.67,
        y: 0.24,
        size: 104,
        angle: -0.16,
      },
      {
        id: 'keys',
        source: require('@/assets/images/feed-objects/keys.png'),
        name: '열쇠',
        capturedAt: '2026.06.14 17:06',
        locationName: '북촌 한옥마을',
        latitude: 37.5826,
        longitude: 126.983,
        x: 0.33,
        y: 0.64,
        size: 96,
        angle: -0.2,
      },
      {
        id: 'pouch',
        source: require('@/assets/images/feed-objects/pouch.png'),
        name: '파우치',
        capturedAt: '2026.06.14 17:31',
        locationName: '북촌 한옥마을',
        latitude: 37.5826,
        longitude: 126.983,
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
  onOpenPhotoInfo,
}: {
  photo: PhysicsPhotoItem;
  frame: number;
  worldSize: WorldSize;
  onPhotoDragChange: (isDragging: boolean) => void;
  onOpenPhotoInfo: (photo: BagPhotoSeed) => void;
}) {
  void frame;

  const bodyRef = useRef(photo.body);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const worldSizeRef = useRef(worldSize);
  const isDraggingRef = useRef(false);
  const dragFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPhotoDragChangeRef = useRef(onPhotoDragChange);
  const onOpenPhotoInfoRef = useRef(onOpenPhotoInfo);
  bodyRef.current = photo.body;
  worldSizeRef.current = worldSize;
  onPhotoDragChangeRef.current = onPhotoDragChange;
  onOpenPhotoInfoRef.current = onOpenPhotoInfo;

  const clearDragFallback = () => {
    if (dragFallbackRef.current) {
      clearTimeout(dragFallbackRef.current);
      dragFallbackRef.current = null;
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const endPhotoDrag = (velocity = { x: 0, y: 0 }) => {
    const body = bodyRef.current;
    clearDragFallback();
    clearLongPressTimer();
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
      clearLongPressTimer();
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
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          onOpenPhotoInfoRef.current(photo);
        }, 1000);
        scheduleDragFallback();
        dragStartRef.current = { x: body.position.x, y: body.position.y };
        Body.setStatic(body, true);
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      },
      onPanResponderMove: (_, gestureState) => {
        const body = bodyRef.current;
        scheduleDragFallback();
        if (Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8) {
          clearLongPressTimer();
        }
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

function PhotoInfoModal({
  selectedPhoto,
  likeState,
  onToggleLike,
  onClose,
}: {
  selectedPhoto: SelectedPhotoInfo | null;
  likeState: PhotoLikeState;
  onToggleLike: () => void;
  onClose: () => void;
}) {
  const photo = selectedPhoto?.photo;

  return (
    <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.infoOverlay}>
        <View style={styles.infoCard}>
          <Pressable style={styles.infoCloseButton} onPress={onClose} hitSlop={10}>
            <Text style={styles.infoCloseText}>×</Text>
          </Pressable>
          {photo ? (
            <ScrollView
              style={styles.infoScroll}
              contentContainerStyle={styles.infoScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.infoHeader}>
                <View style={styles.infoTitleBlock}>
                  <Text style={styles.infoObjectName}>{photo.name}</Text>
                  <Text style={styles.infoCapturedAt}>{photo.capturedAt}</Text>
                </View>
                <Pressable style={styles.infoLikeButton} onPress={onToggleLike}>
                  <Text style={[styles.infoLikeHeart, likeState.liked ? styles.likeHeartActive : undefined]}>
                    {likeState.liked ? '♥' : '♡'}
                  </Text>
                  <Text style={styles.infoLikeCount}>{likeState.count}</Text>
                </Pressable>
              </View>
              <View style={styles.infoImageStage}>
                <Image source={photo.source} style={styles.infoImage} />
              </View>
              <View style={styles.infoMapSection}>
                <Text style={styles.infoMapTitle}>찍은 위치</Text>
                <Text style={styles.infoLocationName}>{photo.locationName}</Text>
                <PhotoLocationMap
                  latitude={photo.latitude}
                  longitude={photo.longitude}
                  title={photo.name}
                  description={photo.locationName}
                />
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function FeedBrandLogo() {
  return (
    <View style={styles.feedLogoWrap}>
      <Image source={FEED_LOGO} style={styles.feedLogoImage} resizeMode="contain" />
    </View>
  );
}

function FriendStoryRail({
  friends,
  selectedFriendId,
  onSelectFriend,
}: {
  friends: FriendBag[];
  selectedFriendId: string;
  onSelectFriend: (friendId: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.storyContent}
      showsHorizontalScrollIndicator={false}
    >
      {friends.map((friend) => {
        const isSelected = friend.id === selectedFriendId;

        return (
          <Pressable
            key={friend.id}
            style={({ pressed }) => [
              styles.storyItem,
              pressed ? styles.storyItemPressed : undefined,
            ]}
            onPress={() => onSelectFriend(friend.id)}
          >
            <View style={[styles.storyAvatarRing, isSelected ? styles.storyAvatarRingActive : undefined]}>
              <Image source={friend.avatar} style={styles.storyAvatar} />
            </View>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.storyUser}>
              {friend.user}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function getFriendHistoryItems(bag: FriendBag): FriendHistoryItem[] {
  const dates = [
    '6/17',
    '6/5',
    '6/4',
    '5/28',
    '5/20',
    '5/11',
    '5/3',
    '4/26',
    '4/18',
    '4/9',
    '3/31',
    '3/22',
  ];

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
  onPhotoDragChange,
  onOpenPhotoInfo,
}: {
  bag: FriendBag;
  onPhotoDragChange: (isDragging: boolean) => void;
  onOpenPhotoInfo: (info: SelectedPhotoInfo) => void;
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
    <View style={styles.bagPanel}>
      <View style={styles.bagPanelHeader}>
        <View style={styles.bagIdentity}>
          <Image source={bag.avatar} style={styles.bagIdentityAvatar} />
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.bagIdentityUser}>
            @{bag.user}
          </Text>
        </View>
        <Pressable
          style={[styles.modeToggle, styles.bagModeToggle, showHistory ? styles.modeToggleActive : undefined]}
          onPress={() => setShowHistory((value) => !value)}
        >
          <View style={[styles.toggleThumb, showHistory ? styles.toggleThumbActive : undefined]} />
        </Pressable>
      </View>
      <View style={styles.bagPanelBody}>
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
              (() => {
                const photoKey = `${bag.id}-${photo.id}`;

                return (
                  <PhysicsPhoto
                    key={photo.id}
                    photo={photo}
                    frame={frame}
                    worldSize={worldSizeRef.current}
                    onPhotoDragChange={onPhotoDragChange}
                    onOpenPhotoInfo={() => onOpenPhotoInfo({ photo, photoKey })}
                  />
                );
              })()
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [selectedFriendId, setSelectedFriendId] = useState(friendBags[0]?.id ?? '');
  const [photoLikes, setPhotoLikes] = useState<Record<string, PhotoLikeState>>({});
  const [selectedPhotoInfo, setSelectedPhotoInfo] = useState<SelectedPhotoInfo | null>(null);
  const selectedBag = friendBags.find((bag) => bag.id === selectedFriendId) ?? friendBags[0];

  const togglePhotoLike = useCallback((photoKey: string) => {
    setPhotoLikes((current) => {
      const previous = current[photoKey] ?? {
        count: initialLikeCounts[photoKey] ?? 0,
        liked: false,
      };
      const liked = !previous.liked;

      return {
        ...current,
        [photoKey]: {
          liked,
          count: previous.count + (liked ? 1 : -1),
        },
      };
    });
  }, []);

  const selectedPhotoLikeState = selectedPhotoInfo
    ? photoLikes[selectedPhotoInfo.photoKey] ?? {
        count: initialLikeCounts[selectedPhotoInfo.photoKey] ?? 0,
        liked: false,
      }
    : { count: 0, liked: false };

  return (
    <View style={styles.container}>
      <PhotoInfoModal
        selectedPhoto={selectedPhotoInfo}
        likeState={selectedPhotoLikeState}
        onToggleLike={() => {
          if (selectedPhotoInfo) {
            togglePhotoLike(selectedPhotoInfo.photoKey);
          }
        }}
        onClose={() => setSelectedPhotoInfo(null)}
      />
      <View style={[styles.feedHeader, { paddingTop: insets.top + 6 }]}>
        <FeedBrandLogo />
        <FriendStoryRail
          friends={friendBags}
          selectedFriendId={selectedFriendId}
          onSelectFriend={setSelectedFriendId}
        />
      </View>
      {selectedBag ? (
        <FriendBagPage
          key={selectedBag.id}
          bag={selectedBag}
          onPhotoDragChange={() => {}}
          onOpenPhotoInfo={setSelectedPhotoInfo}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.surface,
  },
  infoOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(17, 24, 39, 0.42)',
  },
  infoCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '66%',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  infoCloseButton: {
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
  infoCloseText: {
    color: Brand.text,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '900',
  },
  infoScroll: {
    maxHeight: '100%',
  },
  infoScrollContent: {
    paddingBottom: 14,
  },
  infoHeader: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  infoTitleBlock: {
    flex: 1,
    gap: 3,
  },
  infoObjectName: {
    color: Brand.text,
    fontSize: 21,
    fontWeight: '900',
  },
  infoCapturedAt: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  infoLikeButton: {
    minWidth: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
    marginRight: 28,
  },
  infoLikeHeart: {
    color: Brand.text,
    fontSize: 31,
    lineHeight: 35,
    fontWeight: '900',
  },
  infoLikeCount: {
    color: Brand.text,
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  infoImageStage: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Brand.secondary,
  },
  infoImage: {
    width: '86%',
    height: 220,
    resizeMode: 'contain',
  },
  infoMapSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  infoMapTitle: {
    color: Brand.text,
    fontSize: 16,
    fontWeight: '900',
  },
  infoLocationName: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  feedHeader: {
    backgroundColor: Brand.surface,
    borderBottomWidth: 0,
  },
  feedLogoWrap: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedLogoImage: {
    width: 226,
    height: 46,
  },
  storyContent: {
    gap: 14,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
  },
  storyItem: {
    width: 66,
    alignItems: 'center',
    gap: 6,
  },
  storyItemPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  storyAvatarRing: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    borderWidth: 2,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  storyAvatarRingActive: {
    borderColor: Brand.primary,
  },
  storyAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Brand.secondary,
  },
  storyUser: {
    width: '100%',
    color: Brand.text,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  bagPanel: {
    flex: 1,
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 12,
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  bagPanelHeader: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Brand.surface,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.92)',
  },
  bagPanelBody: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  bagIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: Brand.surface,
  },
  bagIdentityAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: Brand.surface,
    backgroundColor: Brand.surface,
  },
  bagIdentityUser: {
    flexShrink: 1,
    color: Brand.text,
    fontSize: 15,
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
  bagModeToggle: {
    backgroundColor: Brand.secondary,
  },
  history: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  historyContent: {
    paddingTop: 12,
    paddingHorizontal: 10,
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
  likeBubble: {
    position: 'absolute',
    zIndex: 20,
    minWidth: 88,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 13,
    borderRadius: 21,
    backgroundColor: Brand.surface,
    borderWidth: 2,
    borderColor: Brand.border,
  },
  likeHeart: {
    color: Brand.text,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
  },
  likeHeartActive: {
    color: '#EF4444',
  },
  likeCount: {
    color: Brand.text,
    fontSize: 19,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  likeBubbleTail: {
    position: 'absolute',
    bottom: -7,
    width: 14,
    height: 14,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    transform: [{ rotate: '45deg' }],
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
});
