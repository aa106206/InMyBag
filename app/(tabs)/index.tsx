import { Accelerometer } from 'expo-sensors';
import { useFocusEffect } from 'expo-router';
import Matter, { Bodies, Body, Engine, World } from 'matter-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { loadFriendBagItems, SavedBagItem } from '@/services/bag-items';
import { fetchFriends, FriendProfile } from '@/services/friends';

const WALL_THICKNESS = 70;
const FIXED_TIMESTEP = 1000 / 60;
const FEED_LOGO = require('@/assets/images/snapbag-feed-logo.png');

const DEFAULT_OBJECT_SIZE = 92;
const MAX_OBJECT_SIZE = 132;
const MIN_OBJECT_SIZE = 72;

// 친구 가방 아이템을 캔버스에 흩뿌릴 때 쓰는 상대 좌표들.
const SCATTER_POINTS = [
  { x: 0.28, y: 0.22 },
  { x: 0.66, y: 0.21 },
  { x: 0.39, y: 0.58 },
  { x: 0.69, y: 0.64 },
  { x: 0.5, y: 0.4 },
];

type ObjectSize = {
  width: number;
  height: number;
};

type PhysicsPhotoItem = SavedBagItem & {
  body: Matter.Body;
  displayWidth: number;
  displayHeight: number;
  size: number;
};

type SelectedPhotoInfo = {
  item: SavedBagItem;
  friendName: string;
};

type WorldSize = {
  width: number;
  height: number;
};

function getObjectDisplaySize(width?: number, height?: number): ObjectSize {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: DEFAULT_OBJECT_SIZE, height: DEFAULT_OBJECT_SIZE };
  }

  const longestSide = Math.max(width, height);
  const shortestSide = Math.min(width, height);
  const maxScale = MAX_OBJECT_SIZE / longestSide;
  const minScale = MIN_OBJECT_SIZE / shortestSide;
  const scale = Math.max(maxScale, minScale);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function formatCapturedAt(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDisplayHandle(friend: FriendProfile) {
  return friend.username.split('@')[0];
}

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
  onOpenPhotoInfo,
}: {
  photo: PhysicsPhotoItem;
  frame: number;
  worldSize: WorldSize;
  onOpenPhotoInfo: (item: SavedBagItem) => void;
}) {
  void frame;

  const bodyRef = useRef(photo.body);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const worldSizeRef = useRef(worldSize);
  const isDraggingRef = useRef(false);
  const dragFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOpenPhotoInfoRef = useRef(onOpenPhotoInfo);
  bodyRef.current = photo.body;
  worldSizeRef.current = worldSize;
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
          left: x - photo.displayWidth / 2,
          top: y - photo.displayHeight / 2,
          width: photo.displayWidth,
          height: photo.displayHeight,
          transform: [{ rotate: `${photo.body.angle}rad` }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Image source={{ uri: photo.imageUrl }} style={styles.photo} />
    </View>
  );
}

function PhotoInfoModal({
  selectedPhoto,
  onClose,
}: {
  selectedPhoto: SelectedPhotoInfo | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!selectedPhoto} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.infoOverlay}>
        <View style={styles.infoCard}>
          <Pressable style={styles.infoCloseButton} onPress={onClose} hitSlop={10}>
            <Text style={styles.infoCloseText}>×</Text>
          </Pressable>
          {selectedPhoto ? (
            <>
              <View style={styles.infoHeader}>
                <View style={styles.infoTitleBlock}>
                  <Text style={styles.infoObjectName}>@{selectedPhoto.friendName}의 물건</Text>
                  <Text style={styles.infoCapturedAt}>
                    {formatCapturedAt(selectedPhoto.item.createdAt)}에 담았어요
                  </Text>
                </View>
              </View>
              <View style={styles.infoImageStage}>
                <Image source={{ uri: selectedPhoto.item.imageUrl }} style={styles.infoImage} />
              </View>
            </>
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

function FriendAvatar({
  friend,
  size,
  style,
}: {
  friend: FriendProfile;
  size: number;
  style?: object;
}) {
  const circleStyle = { width: size, height: size, borderRadius: size / 2 };

  if (friend.avatarUrl) {
    return <Image source={{ uri: friend.avatarUrl }} style={[circleStyle, style]} />;
  }

  return (
    <View style={[circleStyle, styles.avatarFallback, style]}>
      <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>
        {friend.username.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function FriendStoryRail({
  friends,
  selectedFriendId,
  onSelectFriend,
}: {
  friends: FriendProfile[];
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
              <FriendAvatar friend={friend} size={52} />
            </View>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.storyUser}>
              {getDisplayHandle(friend)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function FriendBagPage({
  friend,
  items,
  isLoading,
  onOpenPhotoInfo,
}: {
  friend: FriendProfile;
  items: SavedBagItem[];
  isLoading: boolean;
  onOpenPhotoInfo: (info: SelectedPhotoInfo) => void;
}) {
  const engineRef = useRef(Engine.create({ gravity: { x: 0, y: 0, scale: 0.002 } }));
  const wallsRef = useRef<Matter.Body[]>([]);
  const worldSizeRef = useRef({ width: 0, height: 0 });
  const photosRef = useRef<PhysicsPhotoItem[]>([]);
  const [photos, setPhotos] = useState<PhysicsPhotoItem[]>([]);
  const [canvasSize, setCanvasSize] = useState<WorldSize>({ width: 0, height: 0 });
  const [frame, setFrame] = useState(0);
  photosRef.current = photos;

  const onCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: canvasWidth, height: canvasHeight } = event.nativeEvent.layout;
    setCanvasSize((current) =>
      current.width === canvasWidth && current.height === canvasHeight
        ? current
        : { width: canvasWidth, height: canvasHeight },
    );
  }, []);

  useEffect(() => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    const world = engineRef.current.world;
    photosRef.current.forEach((photo) => World.remove(world, photo.body));
    wallsRef.current.forEach((wall) => World.remove(world, wall));
    wallsRef.current = createWalls(canvasSize.width, canvasSize.height);
    World.add(world, wallsRef.current);
    worldSizeRef.current = { width: canvasSize.width, height: canvasSize.height };

    const nextPhotos = items.map((item, index) => {
      const displaySize = getObjectDisplaySize(item.width, item.height);
      const size = Math.max(displaySize.width, displaySize.height);
      const scatter = SCATTER_POINTS[index % SCATTER_POINTS.length];
      const cycleOffset = Math.floor(index / SCATTER_POINTS.length) * 14;
      const position = clampPhotoPosition(
        {
          x: canvasSize.width * scatter.x + cycleOffset,
          y: canvasSize.height * scatter.y + cycleOffset,
        },
        worldSizeRef.current,
        size,
      );

      const body = Bodies.rectangle(position.x, position.y, displaySize.width, displaySize.height, {
        label: 'photo',
        restitution: 0.24,
        friction: 0.68,
        frictionStatic: 0.86,
        frictionAir: 0.04,
        density: 0.0012,
        chamfer: { radius: 2 },
      });

      (body as Matter.Body & { photoSize: number }).photoSize = size;
      Body.setAngle(body, ((index % 5) - 2) * 0.08);
      World.add(world, body);

      return {
        ...item,
        body,
        displayWidth: displaySize.width,
        displayHeight: displaySize.height,
        size,
      };
    });

    setPhotos(nextPhotos);
    // photosRef를 통해 이전 사진들을 정리하므로 photos는 의존성에서 제외한다.
  }, [items, canvasSize]);

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

  const friendHandle = getDisplayHandle(friend);

  return (
    <View style={styles.bagPanel}>
      <View style={styles.bagPanelHeader}>
        <View style={styles.bagIdentity}>
          <FriendAvatar friend={friend} size={34} style={styles.bagIdentityAvatar} />
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.bagIdentityUser}>
            @{friendHandle}
          </Text>
        </View>
      </View>
      <View style={styles.bagPanelBody}>
        <View style={styles.canvas} onLayout={onCanvasLayout}>
          {isLoading ? (
            <View style={styles.canvasCenter}>
              <ActivityIndicator color={Brand.primary} size="large" />
            </View>
          ) : (
            <>
              {photos.length === 0 ? (
                <View style={styles.canvasCenter}>
                  <Text style={styles.emptyBagText}>
                    @{friendHandle}님의 가방이 아직 비어 있어요.
                  </Text>
                </View>
              ) : null}
              {photos.map((photo) => (
                <PhysicsPhoto
                  key={photo.id}
                  photo={photo}
                  frame={frame}
                  worldSize={worldSizeRef.current}
                  onOpenPhotoInfo={(item) => onOpenPhotoInfo({ item, friendName: friendHandle })}
                />
              ))}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [bagItems, setBagItems] = useState<SavedBagItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [selectedPhotoInfo, setSelectedPhotoInfo] = useState<SelectedPhotoInfo | null>(null);

  // 피드 탭에 들어올 때마다 친구 목록을 새로 불러온다 (새로 추가한 친구 반영).
  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setFriends([]);
        setIsLoadingFriends(false);
        return;
      }

      let cancelled = false;

      (async () => {
        try {
          const nextFriends = await fetchFriends(userId);
          if (!cancelled) {
            setFriends(nextFriends);
          }
        } catch (error) {
          console.warn('Failed to load friends for feed', error);
        } finally {
          if (!cancelled) {
            setIsLoadingFriends(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  // 선택된 친구가 목록에 없으면 첫 번째 친구를 선택한다.
  useEffect(() => {
    if (friends.length === 0) {
      setSelectedFriendId(null);
      return;
    }

    if (!selectedFriendId || !friends.some((friend) => friend.id === selectedFriendId)) {
      setSelectedFriendId(friends[0].id);
    }
  }, [friends, selectedFriendId]);

  // 선택된 친구의 가방 아이템을 불러온다.
  useEffect(() => {
    if (!selectedFriendId) {
      setBagItems([]);
      return;
    }

    let cancelled = false;
    setIsLoadingItems(true);

    loadFriendBagItems(selectedFriendId)
      .then((items) => {
        if (!cancelled) {
          setBagItems(items);
        }
      })
      .catch((error) => {
        console.warn('Failed to load friend bag items', error);
        if (!cancelled) {
          setBagItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingItems(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFriendId]);

  const selectedFriend = friends.find((friend) => friend.id === selectedFriendId) ?? null;

  return (
    <View style={styles.container}>
      <PhotoInfoModal
        selectedPhoto={selectedPhotoInfo}
        onClose={() => setSelectedPhotoInfo(null)}
      />
      <View style={[styles.feedHeader, { paddingTop: insets.top + 6 }]}>
        <FeedBrandLogo />
        {friends.length > 0 ? (
          <FriendStoryRail
            friends={friends}
            selectedFriendId={selectedFriendId ?? ''}
            onSelectFriend={setSelectedFriendId}
          />
        ) : null}
      </View>
      {isLoadingFriends ? (
        <View style={styles.feedCenter}>
          <ActivityIndicator color={Brand.primary} size="large" />
        </View>
      ) : selectedFriend ? (
        <FriendBagPage
          key={selectedFriend.id}
          friend={selectedFriend}
          items={bagItems}
          isLoading={isLoadingItems}
          onOpenPhotoInfo={setSelectedPhotoInfo}
        />
      ) : (
        <View style={styles.feedCenter}>
          <Text style={styles.emptyFeedTitle}>아직 친구가 없어요</Text>
          <Text style={styles.emptyFeedText}>
            설정 → 친구 관리에서 친구를 추가하면{'\n'}이곳에서 친구의 가방을 구경할 수 있어요.
          </Text>
        </View>
      )}
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
    paddingRight: 28,
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
  feedCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyFeedTitle: {
    color: Brand.text,
    fontSize: 19,
    fontWeight: '900',
  },
  emptyFeedText: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
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
  storyUser: {
    width: '100%',
    color: Brand.text,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primary,
  },
  avatarInitial: {
    color: Brand.text,
    fontWeight: '900',
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
    borderWidth: 2,
    borderColor: Brand.surface,
  },
  bagIdentityUser: {
    flexShrink: 1,
    color: Brand.text,
    fontSize: 15,
    fontWeight: '900',
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Brand.secondary,
  },
  canvasCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyBagText: {
    color: Brand.muted,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
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
