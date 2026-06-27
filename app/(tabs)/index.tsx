import { Accelerometer } from 'expo-sensors';
import Matter, { Bodies, Body, Engine, World } from 'matter-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';

const WALL_THICKNESS = 70;
const FIXED_TIMESTEP = 1000 / 60;

type BagPhotoSeed = {
  id: string;
  uri: string;
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

const mockBags: FriendBag[] = [
  {
    id: 'james',
    user: 'james',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=240',
    photos: [
      {
        id: 'laptop',
        uri: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=700',
        x: 0.28,
        y: 0.22,
        size: 122,
        angle: -0.16,
      },
      {
        id: 'coffee',
        uri: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=700',
        x: 0.66,
        y: 0.21,
        size: 102,
        angle: 0.12,
      },
      {
        id: 'notebook',
        uri: 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=700',
        x: 0.39,
        y: 0.58,
        size: 132,
        angle: 0.08,
      },
      {
        id: 'earbuds',
        uri: 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=700',
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
        uri: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700',
        x: 0.3,
        y: 0.28,
        size: 126,
        angle: 0.14,
      },
      {
        id: 'bottle',
        uri: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=700',
        x: 0.65,
        y: 0.29,
        size: 94,
        angle: -0.1,
      },
      {
        id: 'watch',
        uri: 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=700',
        x: 0.35,
        y: 0.66,
        size: 102,
        angle: -0.18,
      },
      {
        id: 'towel',
        uri: 'https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=700',
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
        uri: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=700',
        x: 0.29,
        y: 0.23,
        size: 122,
        angle: -0.09,
      },
      {
        id: 'book',
        uri: 'https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=700',
        x: 0.64,
        y: 0.26,
        size: 116,
        angle: 0.17,
      },
      {
        id: 'pen',
        uri: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=700',
        x: 0.34,
        y: 0.65,
        size: 102,
        angle: 0.18,
      },
      {
        id: 'wallet',
        uri: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=700',
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
        uri: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=700',
        x: 0.3,
        y: 0.25,
        size: 124,
        angle: 0.12,
      },
      {
        id: 'sunglasses',
        uri: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=700',
        x: 0.67,
        y: 0.24,
        size: 104,
        angle: -0.16,
      },
      {
        id: 'keys',
        uri: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=700',
        x: 0.33,
        y: 0.64,
        size: 96,
        angle: -0.2,
      },
      {
        id: 'pouch',
        uri: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=700',
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

function PhysicsPhoto({
  photo,
  frame,
  worldSize,
}: {
  photo: PhysicsPhotoItem;
  frame: number;
  worldSize: WorldSize;
}) {
  void frame;

  const bodyRef = useRef(photo.body);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const worldSizeRef = useRef(worldSize);
  bodyRef.current = photo.body;
  worldSizeRef.current = worldSize;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const body = bodyRef.current;
        dragStartRef.current = { x: body.position.x, y: body.position.y };
        Body.setStatic(body, true);
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      },
      onPanResponderMove: (_, gestureState) => {
        const body = bodyRef.current;
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
        const body = bodyRef.current;
        Body.setPosition(
          body,
          clampPhotoPosition(body.position, worldSizeRef.current, photo.size),
        );
        Body.setStatic(body, false);
        Body.setVelocity(body, {
          x: gestureState.vx * 4,
          y: gestureState.vy * 4,
        });
      },
      onPanResponderTerminate: () => {
        const body = bodyRef.current;
        Body.setPosition(
          body,
          clampPhotoPosition(body.position, worldSizeRef.current, photo.size),
        );
        Body.setStatic(body, false);
        Body.setVelocity(body, { x: 0, y: 0 });
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
      <Image source={{ uri: photo.uri }} style={styles.photo} />
    </View>
  );
}

function FriendBagPage({
  bag,
  width,
  topInset,
}: {
  bag: FriendBag;
  width: number;
  topInset: number;
}) {
  const engineRef = useRef(Engine.create({ gravity: { x: 0, y: 0, scale: 0.002 } }));
  const wallsRef = useRef<Matter.Body[]>([]);
  const worldSizeRef = useRef({ width: 0, height: 0 });
  const [photos, setPhotos] = useState<PhysicsPhotoItem[]>([]);
  const [frame, setFrame] = useState(0);

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
      </View>
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {photos.map((photo) => (
          <PhysicsPhoto
            key={photo.id}
            photo={photo}
            frame={frame}
            worldSize={worldSizeRef.current}
          />
        ))}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <FlatList
        data={mockBags}
        horizontal
        pagingEnabled
        bounces={false}
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <FriendBagPage
            bag={item}
            width={width}
            topInset={insets.top}
          />
        )}
      />
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
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userName: {
    color: Brand.text,
    fontSize: 20,
    fontWeight: '900',
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Brand.secondary,
  },
  photoCard: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
});
