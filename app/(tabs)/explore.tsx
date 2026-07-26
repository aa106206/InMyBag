import { useFocusEffect } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import Matter, { Bodies, Body, Engine, World } from 'matter-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutChangeEvent,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoLocationMap } from '@/components/photo-location-map';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { loadFriendBagItems, SavedBagItem } from '@/services/bag-items';
import { ExploreOwner, fetchExploreBagOwners } from '@/services/explore';

const WALL_THICKNESS = 70;
const FIXED_TIMESTEP = 1000 / 60;

const TARGET_OBJECT_SIZE = 112;
const EXPLORE_CARD_GAP = 18;

// 가방 아이템을 캔버스에 흩뿌릴 때 쓰는 상대 좌표들.
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
  ownerName: string;
};

type ExploreCarouselEntry = {
  owner: ExploreOwner;
  loopIndex: number;
  realIndex: number;
};

type WorldSize = {
  width: number;
  height: number;
};

function getObjectDisplaySize(width?: number, height?: number): ObjectSize {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: TARGET_OBJECT_SIZE, height: TARGET_OBJECT_SIZE };
  }

  const longestSide = Math.max(width, height);
  const scale = TARGET_OBJECT_SIZE / longestSide;

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

function getDisplayHandle(owner: ExploreOwner) {
  return owner.username.split('@')[0];
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
  // 좌표가 NaN으로 오염되면 화면 왼쪽 위에 붙은 것처럼 보이므로 안전한 위치로 되살린다.
  if (
    !Number.isFinite(body.position.x) ||
    !Number.isFinite(body.position.y) ||
    !Number.isFinite(body.angle)
  ) {
    if (worldSize.width > 0 && worldSize.height > 0) {
      Body.setPosition(body, { x: worldSize.width / 2, y: worldSize.height / 3 });
      Body.setAngle(body, 0);
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
    }
    return;
  }

  const nextPosition = clampPhotoPosition(body.position, worldSize, photoSize);
  const didClamp = nextPosition.x !== body.position.x || nextPosition.y !== body.position.y;

  if (didClamp) {
    Body.setPosition(body, nextPosition);
    Body.setVelocity(body, { x: 0, y: 0 });
  }
}

const STUCK_DRAG_TIMEOUT_MS = 2000;
// 릴리즈 속도 상한. 너무 빠르면 한 프레임에 벽을 뚫고 월드 밖으로 나갈 수 있다(터널링).
const MAX_THROW_SPEED = 16;

function limitThrowSpeed(value: number) {
  return Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, value));
}

type DraggedBody = Matter.Body & { dragHeartbeatAt?: number };

function markDragHeartbeat(body: Matter.Body) {
  (body as DraggedBody).dragHeartbeatAt = Date.now();
}

// 드래그가 비정상적으로 끊겨 static(고정)으로 남은 사진을 감지해 즉시 다시 움직이게 한다.
function releaseBodyIfStuck(body: Matter.Body) {
  if (body.label !== 'photo' || !body.isStatic) {
    return;
  }

  const heartbeatAt = (body as DraggedBody).dragHeartbeatAt ?? 0;
  if (Date.now() - heartbeatAt > STUCK_DRAG_TIMEOUT_MS) {
    Body.setStatic(body, false);
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
  }
}

function PhysicsPhoto({
  photo,
  frame,
  worldSize,
  onOpenPhotoInfo,
  onDragActiveChange,
}: {
  photo: PhysicsPhotoItem;
  frame: number;
  worldSize: WorldSize;
  onOpenPhotoInfo: (item: SavedBagItem) => void;
  onDragActiveChange: (active: boolean) => void;
}) {
  void frame;

  const bodyRef = useRef(photo.body);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const worldSizeRef = useRef(worldSize);
  const isDraggingRef = useRef(false);
  const dragFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOpenPhotoInfoRef = useRef(onOpenPhotoInfo);
  const onDragActiveChangeRef = useRef(onDragActiveChange);
  bodyRef.current = photo.body;
  worldSizeRef.current = worldSize;
  onOpenPhotoInfoRef.current = onOpenPhotoInfo;
  onDragActiveChangeRef.current = onDragActiveChange;

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
    onDragActiveChangeRef.current(false);
    Body.setPosition(body, clampPhotoPosition(body.position, worldSizeRef.current, photo.size));
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
        onDragActiveChangeRef.current(false);
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
        onDragActiveChangeRef.current(true);
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          onOpenPhotoInfoRef.current(photo);
        }, 1000);
        scheduleDragFallback();
        dragStartRef.current = { x: body.position.x, y: body.position.y };
        Body.setStatic(body, true);
        markDragHeartbeat(body);
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      },
      onPanResponderMove: (_, gestureState) => {
        const body = bodyRef.current;
        markDragHeartbeat(body);
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
          x: limitThrowSpeed(gestureState.vx * 4),
          y: limitThrowSpeed(gestureState.vy * 4),
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
  const item = selectedPhoto?.item ?? null;
  const objectName = item?.objectLabel?.trim() || '가방 물건';
  const locationName = item?.locationName?.trim() || '위치 정보가 없어요';
  const hasPhotoLocation =
    typeof item?.locationLatitude === 'number'
    && Number.isFinite(item.locationLatitude)
    && typeof item.locationLongitude === 'number'
    && Number.isFinite(item.locationLongitude);

  return (
    <Modal visible={!!selectedPhoto} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.infoOverlay}>
        <View style={styles.infoCard}>
          {selectedPhoto ? (
            <ScrollView
              style={styles.infoScroll}
              contentContainerStyle={styles.infoScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.infoHeader}>
                <View style={styles.infoTitleBlock}>
                  <Text style={styles.infoObjectName}>{objectName}</Text>
                  <Text style={styles.infoCapturedAt}>{formatCapturedAt(selectedPhoto.item.createdAt)}</Text>
                </View>
                <Pressable
                  style={styles.infoCloseButton}
                  onPress={onClose}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="사진 정보 닫기"
                >
                  <Text style={styles.infoCloseText}>×</Text>
                </Pressable>
              </View>
              <View style={styles.infoImageStage}>
                <Image source={{ uri: selectedPhoto.item.imageUrl }} style={styles.infoImage} resizeMode="contain" />
              </View>
              <View style={styles.infoNoteSection}>
                <View style={styles.infoNoteDisplayWrap}>
                  <View pointerEvents="none" style={styles.infoNoteRules}>
                    <View style={styles.infoNoteRule} />
                    <View style={styles.infoNoteRule} />
                    <View style={styles.infoNoteRule} />
                  </View>
                  <Text
                    numberOfLines={3}
                    ellipsizeMode="tail"
                    style={[styles.infoNoteText, styles.infoNoteDisplayText, !selectedPhoto.item.note ? styles.infoEmptyText : null]}
                  >
                    {selectedPhoto.item.note || '아직 기록이 없어요.'}
                  </Text>
                </View>
              </View>
              <View style={styles.infoMapSection}>
                <Text style={styles.infoMapTitle}>찍은 위치</Text>
                <Text style={styles.infoLocationName}>{locationName}</Text>
                {hasPhotoLocation ? (
                  <PhotoLocationMap
                    latitude={selectedPhoto.item.locationLatitude as number}
                    longitude={selectedPhoto.item.locationLongitude as number}
                    title={objectName}
                    description={locationName}
                  />
                ) : null}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function OwnerAvatar({ owner, size }: { owner: ExploreOwner; size: number }) {
  const circleStyle = { width: size, height: size, borderRadius: size / 2 };

  if (owner.avatarUrl) {
    return <Image source={{ uri: owner.avatarUrl }} style={circleStyle} />;
  }

  return (
    <View style={[circleStyle, styles.avatarFallback]}>
      <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>
        {owner.username.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function ExploreSidePreview({ owner, cardWidth }: { owner: ExploreOwner | null; cardWidth: number }) {
  const ownerHandle = owner ? getDisplayHandle(owner) : 'snapbag';

  return (
    <View style={[styles.sidePreviewCard, { width: cardWidth }]}>
      <View style={styles.sidePreviewHeader}>
        {owner ? <OwnerAvatar owner={owner} size={30} /> : <View style={styles.sidePreviewAvatar} />}
        <View style={styles.sidePreviewTextBlock}>
          <Text numberOfLines={1} style={styles.sidePreviewUser}>
            @{ownerHandle}
          </Text>
          <Text style={styles.sidePreviewSub}>오늘의 가방</Text>
        </View>
      </View>
      <View style={styles.sidePreviewBody} />
    </View>
  );
}

function ExploreBagCanvas({
  owner,
  items,
  isLoading,
  cardWidth,
  onOpenPhotoInfo,
  onDragActiveChange,
}: {
  owner: ExploreOwner;
  items: SavedBagItem[];
  isLoading: boolean;
  cardWidth: number;
  onOpenPhotoInfo: (info: SelectedPhotoInfo) => void;
  onDragActiveChange: (active: boolean) => void;
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
          releaseBodyIfStuck(body);
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

  const ownerHandle = getDisplayHandle(owner);

  return (
    <View style={[styles.bagPanel, { width: cardWidth }]}>
      <View style={styles.bagPanelHeader}>
        <View style={styles.bagIdentity}>
          <OwnerAvatar owner={owner} size={34} />
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.bagIdentityUser}>
            @{ownerHandle}
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
                  <Text style={styles.emptyBagText}>@{ownerHandle}님의 가방이 아직 비어 있어요.</Text>
                </View>
              ) : null}
              {photos.map((photo) => (
                <PhysicsPhoto
                  key={photo.id}
                  photo={photo}
                  frame={frame}
                  worldSize={worldSizeRef.current}
                  onOpenPhotoInfo={(item) => onOpenPhotoInfo({ item, ownerName: ownerHandle })}
                  onDragActiveChange={onDragActiveChange}
                />
              ))}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(Math.max(windowWidth - 104, 236), windowWidth - 68, 520);
  const slideDistance = cardWidth + EXPLORE_CARD_GAP;

  const [owners, setOwners] = useState<ExploreOwner[]>([]);
  const [isLoadingOwners, setIsLoadingOwners] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeLoopIndex, setActiveLoopIndex] = useState(0);
  const [bagItemsByOwner, setBagItemsByOwner] = useState<Record<string, SavedBagItem[]>>({});
  const [loadingOwnerId, setLoadingOwnerId] = useState<string | null>(null);
  const [selectedPhotoInfo, setSelectedPhotoInfo] = useState<SelectedPhotoInfo | null>(null);
  // 물건을 잡고 있는 동안에는 캐러셀 좌우 스크롤을 잠근다.
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);

  const carouselRef = useRef<FlatList<ExploreCarouselEntry>>(null);
  const itemsLoadIdRef = useRef(0);
  const ownersCount = owners.length;
  const initialLoopIndex = ownersCount > 1 ? 1 : 0;
  const carouselData = useMemo<ExploreCarouselEntry[]>(() => {
    if (owners.length <= 1) {
      return owners.map((owner, index) => ({ owner, loopIndex: index, realIndex: index }));
    }

    const lastIndex = owners.length - 1;
    return [
      { owner: owners[lastIndex], loopIndex: 0, realIndex: lastIndex },
      ...owners.map((owner, index) => ({
        owner,
        loopIndex: index + 1,
        realIndex: index,
      })),
      { owner: owners[0], loopIndex: owners.length + 1, realIndex: 0 },
    ];
  }, [owners]);

  const scrollToLoopIndex = useCallback(
    (loopIndex: number, animated = false) => {
      requestAnimationFrame(() => {
        carouselRef.current?.scrollToOffset({
          offset: loopIndex * slideDistance,
          animated,
        });
      });
    },
    [slideDistance],
  );

  useEffect(() => {
    if (ownersCount > 0) {
      scrollToLoopIndex(initialLoopIndex);
    }
  }, [initialLoopIndex, ownersCount, scrollToLoopIndex]);

  // 탭에 들어올 때마다 랜덤한 다른 계정 목록을 새로 불러온다. (본인 제외)
  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setOwners([]);
        setIsLoadingOwners(false);
        return;
      }

      let cancelled = false;
      setIsLoadingOwners(true);

      (async () => {
        try {
          const nextOwners = await fetchExploreBagOwners(userId);
          if (!cancelled) {
            setOwners(nextOwners);
            setCurrentIndex(0);
            setActiveLoopIndex(nextOwners.length > 1 ? 1 : 0);
            setBagItemsByOwner({});
            setLoadingOwnerId(null);
          }
        } catch (error) {
          console.warn('Failed to load explore owners', error);
          if (!cancelled) {
            setOwners([]);
          }
        } finally {
          if (!cancelled) {
            setIsLoadingOwners(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  const loadOwnerBag = useCallback(async (owner: ExploreOwner | null) => {
    if (!owner) {
      setLoadingOwnerId(null);
      return;
    }

    const loadId = itemsLoadIdRef.current + 1;
    itemsLoadIdRef.current = loadId;
    setLoadingOwnerId(owner.id);

    try {
      const items = await loadFriendBagItems(owner.id);
      if (itemsLoadIdRef.current === loadId) {
        setBagItemsByOwner((current) => ({ ...current, [owner.id]: items }));
      }
    } catch (error) {
      console.warn('Failed to load explore bag items', error);
      if (itemsLoadIdRef.current === loadId) {
        setBagItemsByOwner((current) => ({ ...current, [owner.id]: [] }));
      }
    } finally {
      if (itemsLoadIdRef.current === loadId) {
        setLoadingOwnerId(null);
      }
    }
  }, []);

  // 현재 인덱스가 가리키는 계정의 가방을 불러온다.
  useEffect(() => {
    void loadOwnerBag(owners[currentIndex] ?? null);
  }, [owners, currentIndex, loadOwnerBag]);

  const handleCarouselSnap = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (carouselData.length === 0) {
        return;
      }

      const rawLoopIndex = Math.round(event.nativeEvent.contentOffset.x / slideDistance);
      const maxLoopIndex = carouselData.length - 1;
      const loopIndex = Math.max(0, Math.min(maxLoopIndex, rawLoopIndex));
      const entry = carouselData[loopIndex];

      if (!entry) {
        return;
      }

      setCurrentIndex(entry.realIndex);

      if (ownersCount > 1 && loopIndex === 0) {
        const nextLoopIndex = ownersCount;
        setActiveLoopIndex(nextLoopIndex);
        scrollToLoopIndex(nextLoopIndex);
        return;
      }

      if (ownersCount > 1 && loopIndex === ownersCount + 1) {
        setActiveLoopIndex(1);
        scrollToLoopIndex(1);
        return;
      }

      setActiveLoopIndex(loopIndex);
    },
    [carouselData, ownersCount, scrollToLoopIndex, slideDistance],
  );

  const renderCarouselItem = useCallback(
    ({ item }: { item: ExploreCarouselEntry }) => {
      const isActiveCard = item.loopIndex === activeLoopIndex;
      const hasBagCache = Object.prototype.hasOwnProperty.call(bagItemsByOwner, item.owner.id);
      const bagItems = bagItemsByOwner[item.owner.id] ?? [];
      const isBagLoading = !hasBagCache || loadingOwnerId === item.owner.id;

      if (!isActiveCard) {
        return <ExploreSidePreview owner={item.owner} cardWidth={cardWidth} />;
      }

      return (
        <ExploreBagCanvas
          owner={item.owner}
          items={bagItems}
          isLoading={isBagLoading}
          cardWidth={cardWidth}
          onOpenPhotoInfo={setSelectedPhotoInfo}
          onDragActiveChange={setIsPhotoDragging}
        />
      );
    },
    [activeLoopIndex, bagItemsByOwner, cardWidth, loadingOwnerId],
  );

  const currentOwner = owners[currentIndex] ?? null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <PhotoInfoModal selectedPhoto={selectedPhotoInfo} onClose={() => setSelectedPhotoInfo(null)} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>둘러보기</Text>
        <Text style={styles.headerHint}>회원님을 위한 추천</Text>
      </View>

      {isLoadingOwners ? (
        <View style={styles.center}>
          <ActivityIndicator color={Brand.primary} size="large" />
        </View>
      ) : owners.length === 0 || !currentOwner ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>둘러볼 가방이 아직 없어요</Text>
          <Text style={styles.emptyText}>
            다른 사람이 가방에 물건을 담으면{'\n'}이곳에서 랜덤으로 구경할 수 있어요.
          </Text>
        </View>
      ) : (
        <View style={styles.swipeArea}>
          <FlatList
            ref={carouselRef}
            data={carouselData}
            keyExtractor={(item) => `${item.owner.id}-${item.loopIndex}`}
            renderItem={renderCarouselItem}
            horizontal
            scrollEnabled={!isPhotoDragging}
            showsHorizontalScrollIndicator={false}
            snapToInterval={slideDistance}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            bounces={false}
            overScrollMode="never"
            initialScrollIndex={initialLoopIndex}
            getItemLayout={(_, index) => ({
              length: slideDistance,
              offset: slideDistance * index,
              index,
            })}
            contentContainerStyle={[
              styles.carouselContent,
              { paddingHorizontal: (windowWidth - cardWidth) / 2 },
            ]}
            ItemSeparatorComponent={() => <View style={{ width: EXPLORE_CARD_GAP }} />}
            onMomentumScrollEnd={handleCarouselSnap}
            onScrollToIndexFailed={({ index }) => {
              scrollToLoopIndex(index);
            }}
            extraData={{
              activeLoopIndex,
              bagItemsByOwner,
              loadingOwnerId,
              cardWidth,
            }}
          />
          {owners.length > 1 ? (
            <View style={styles.paginationDots} pointerEvents="none">
              {owners.map((owner, index) => (
                <View
                  key={owner.id}
                  style={[
                    styles.paginationDot,
                    index === currentIndex ? styles.paginationDotActive : undefined,
                  ]}
                />
              ))}
            </View>
          ) : null}
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
  header: {
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  headerTitle: {
    color: Brand.text,
    fontSize: 24,
    fontWeight: '900',
  },
  headerHint: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: Brand.text,
    fontSize: 19,
    fontWeight: '900',
  },
  emptyText: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  swipeArea: {
    flex: 1,
    overflow: 'hidden',
  },
  carouselContent: {
    alignItems: 'stretch',
  },
  paginationDots: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 8,
  },
  paginationDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(199, 184, 234, 0.32)',
  },
  paginationDotActive: {
    backgroundColor: Brand.primary,
  },
  bagPanel: {
    flex: 1,
    marginTop: 8,
    marginBottom: 12,
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  sidePreviewCard: {
    marginTop: 8,
    marginBottom: 12,
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    opacity: 0.88,
  },
  sidePreviewHeader: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Brand.surface,
  },
  sidePreviewAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Brand.primary,
  },
  sidePreviewTextBlock: {
    flex: 1,
    gap: 2,
  },
  sidePreviewUser: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '900',
  },
  sidePreviewSub: {
    color: Brand.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  sidePreviewBody: {
    flex: 1,
    backgroundColor: Brand.secondary,
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
  bagIdentityUser: {
    flexShrink: 1,
    color: Brand.text,
    fontSize: 15,
    fontWeight: '900',
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
  infoOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(17, 24, 39, 0.30)',
  },
  infoCard: {
    width: '88%',
    maxWidth: 372,
    maxHeight: '80%',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#FFFDF3',
    borderWidth: 1,
    borderColor: 'rgba(230, 215, 221, 0.72)',
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
  infoScroll: {
    maxHeight: '100%',
  },
  infoScrollContent: {
    paddingBottom: 18,
  },
  infoCloseButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  infoCloseText: {
    color: Brand.text,
    fontSize: 34,
    lineHeight: 34,
    fontWeight: '500',
  },
  infoHeader: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: '#FFFDF3',
  },
  infoTitleBlock: {
    flex: 1,
    gap: 4,
    paddingRight: 6,
  },
  infoObjectName: {
    color: Brand.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
  },
  infoCapturedAt: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  infoImageStage: {
    height: 172,
    marginHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.14)',
    backgroundColor: Brand.surface,
  },
  infoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  infoNoteSection: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 6,
    backgroundColor: '#FFFDF3',
  },
  infoNoteTitle: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  infoNoteText: {
    color: Brand.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  infoEmptyText: {
    color: Brand.muted,
    fontWeight: '500',
  },
  infoNoteDisplayWrap: {
    minHeight: 82,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    backgroundColor: Brand.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoNoteDisplayText: {
    zIndex: 1,
  },
  infoNoteRules: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 29,
    gap: 19,
  },
  infoNoteRule: {
    height: 1,
    backgroundColor: 'rgba(199, 184, 234, 0.24)',
  },
  infoMapSection: {
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 0,
    gap: 6,
    backgroundColor: '#FFFDF3',
  },
  infoMapTitle: {
    color: Brand.muted,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  infoLocationName: {
    color: Brand.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
