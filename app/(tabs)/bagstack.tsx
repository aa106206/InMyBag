import * as ImagePicker from "expo-image-picker";
import { Accelerometer } from "expo-sensors";
import Matter, { Bodies, Body, Engine, World } from "matter-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "@/constants/theme";

const CARD_SIZE = 92;
const H_PADDING = 16;
const WALL_THICKNESS = 60;
const FIXED_TIMESTEP = 1000 / 60;

type HistoryPhoto = {
  id: string;
  uri: string;
  left: `${number}%`;
  top: `${number}%`;
  size: number;
  rotate: string;
};

type BagHistoryItem = {
  id: string;
  date: string;
  photos: HistoryPhoto[];
};

type PhotoItem = {
  id: string;
  uri: string;
  body: Matter.Body;
};

type WorldSize = {
  width: number;
  height: number;
};

const historyItems: BagHistoryItem[] = [
  {
    id: "2026-06-17",
    date: "6/17",
    photos: [
      {
        id: "camera",
        uri: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=500",
        left: "12%",
        top: "16%",
        size: 54,
        rotate: "-8deg",
      },
      {
        id: "coffee",
        uri: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500",
        left: "47%",
        top: "31%",
        size: 48,
        rotate: "9deg",
      },
      {
        id: "notebook",
        uri: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=500",
        left: "27%",
        top: "58%",
        size: 58,
        rotate: "4deg",
      },
    ],
  },
  {
    id: "2026-06-05",
    date: "6/5",
    photos: [
      {
        id: "tablet",
        uri: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500",
        left: "16%",
        top: "18%",
        size: 58,
        rotate: "6deg",
      },
      {
        id: "wallet",
        uri: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=500",
        left: "50%",
        top: "40%",
        size: 48,
        rotate: "-10deg",
      },
    ],
  },
  {
    id: "2026-06-04",
    date: "6/4",
    photos: [
      {
        id: "shoes",
        uri: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500",
        left: "10%",
        top: "24%",
        size: 60,
        rotate: "-7deg",
      },
      {
        id: "bottle",
        uri: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500",
        left: "54%",
        top: "20%",
        size: 46,
        rotate: "8deg",
      },
      {
        id: "watch",
        uri: "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=500",
        left: "34%",
        top: "58%",
        size: 50,
        rotate: "12deg",
      },
    ],
  },
  {
    id: "2026-05-28",
    date: "5/28",
    photos: [
      {
        id: "headphones",
        uri: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
        left: "14%",
        top: "18%",
        size: 56,
        rotate: "10deg",
      },
      {
        id: "book",
        uri: "https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=500",
        left: "45%",
        top: "47%",
        size: 58,
        rotate: "-5deg",
      },
    ],
  },
  {
    id: "2026-05-20",
    date: "5/20",
    photos: [
      {
        id: "sunglasses",
        uri: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500",
        left: "18%",
        top: "24%",
        size: 50,
        rotate: "-12deg",
      },
      {
        id: "pouch",
        uri: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=500",
        left: "50%",
        top: "44%",
        size: 58,
        rotate: "7deg",
      },
    ],
  },
  {
    id: "2026-05-11",
    date: "5/11",
    photos: [
      {
        id: "keys",
        uri: "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=500",
        left: "16%",
        top: "44%",
        size: 48,
        rotate: "9deg",
      },
      {
        id: "earbuds",
        uri: "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=500",
        left: "50%",
        top: "22%",
        size: 52,
        rotate: "-7deg",
      },
    ],
  },
  {
    id: "2026-05-03",
    date: "5/3",
    photos: [
      {
        id: "tablet",
        uri: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500",
        left: "14%",
        top: "18%",
        size: 56,
        rotate: "-6deg",
      },
      {
        id: "coffee",
        uri: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500",
        left: "48%",
        top: "40%",
        size: 50,
        rotate: "10deg",
      },
    ],
  },
  {
    id: "2026-04-26",
    date: "4/26",
    photos: [
      {
        id: "notebook",
        uri: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=500",
        left: "12%",
        top: "24%",
        size: 60,
        rotate: "7deg",
      },
      {
        id: "wallet",
        uri: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=500",
        left: "52%",
        top: "47%",
        size: 48,
        rotate: "-11deg",
      },
    ],
  },
  {
    id: "2026-04-19",
    date: "4/19",
    photos: [
      {
        id: "camera",
        uri: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=500",
        left: "16%",
        top: "18%",
        size: 54,
        rotate: "8deg",
      },
      {
        id: "sunglasses",
        uri: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500",
        left: "48%",
        top: "52%",
        size: 52,
        rotate: "-9deg",
      },
    ],
  },
  {
    id: "2026-04-12",
    date: "4/12",
    photos: [
      {
        id: "shoes",
        uri: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500",
        left: "12%",
        top: "42%",
        size: 58,
        rotate: "-8deg",
      },
      {
        id: "bottle",
        uri: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500",
        left: "54%",
        top: "24%",
        size: 48,
        rotate: "7deg",
      },
    ],
  },
  {
    id: "2026-04-04",
    date: "4/4",
    photos: [
      {
        id: "headphones",
        uri: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
        left: "15%",
        top: "18%",
        size: 58,
        rotate: "11deg",
      },
      {
        id: "keys",
        uri: "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=500",
        left: "48%",
        top: "50%",
        size: 46,
        rotate: "-5deg",
      },
    ],
  },
  {
    id: "2026-03-29",
    date: "3/29",
    photos: [
      {
        id: "book",
        uri: "https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=500",
        left: "13%",
        top: "20%",
        size: 58,
        rotate: "-7deg",
      },
      {
        id: "pouch",
        uri: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=500",
        left: "52%",
        top: "44%",
        size: 54,
        rotate: "9deg",
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
    { isStatic: true, label: "wall", friction: 0.9, restitution: 0.15 },
  );

  const leftWall = Bodies.rectangle(
    -half + 1,
    height / 2,
    WALL_THICKNESS,
    height * 2,
    { isStatic: true, label: "wall", friction: 0.4, restitution: 0.1 },
  );

  const rightWall = Bodies.rectangle(
    width + half - 1,
    height / 2,
    WALL_THICKNESS,
    height * 2,
    { isStatic: true, label: "wall", friction: 0.4, restitution: 0.1 },
  );

  const topWall = Bodies.rectangle(
    width / 2,
    -half + 1,
    width + WALL_THICKNESS * 2,
    WALL_THICKNESS,
    { isStatic: true, label: "wall", friction: 0.9, restitution: 0.15 },
  );

  return [ground, leftWall, rightWall, topWall];
}

function clampPhotoPosition(
  position: { x: number; y: number },
  worldSize: WorldSize,
) {
  if (worldSize.width <= 0 || worldSize.height <= 0) {
    return position;
  }

  const half = CARD_SIZE / 2;

  return {
    x: Math.max(half, Math.min(worldSize.width - half, position.x)),
    y: Math.max(half, Math.min(worldSize.height - half, position.y)),
  };
}

function PhysicsPhoto({
  photo,
  frame,
  worldSize,
}: {
  photo: PhotoItem;
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
          ),
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        const body = bodyRef.current;
        Body.setPosition(body, clampPhotoPosition(body.position, worldSizeRef.current));
        Body.setStatic(body, false);
        Body.setVelocity(body, {
          x: gestureState.vx * 4,
          y: gestureState.vy * 4,
        });
      },
      onPanResponderTerminate: () => {
        const body = bodyRef.current;
        Body.setStatic(body, false);
        Body.setVelocity(body, { x: 0, y: 0 });
      },
    }),
  ).current;

  const { x, y } = photo.body.position;
  const angle = photo.body.angle;

  return (
    <View
      style={[
        styles.card,
        {
          left: x - CARD_SIZE / 2,
          top: y - CARD_SIZE / 2,
          transform: [{ rotate: `${angle}rad` }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Image source={{ uri: photo.uri }} style={styles.cardImage} />
    </View>
  );
}

function HistoryCard({ item }: { item: BagHistoryItem }) {
  return (
    <View style={styles.historyCard}>
      <Text style={styles.historyDate}>{item.date}</Text>
      <View style={styles.historyPreview}>
        {item.photos.map((photo) => (
          <View
            key={photo.id}
            style={[
              styles.historyPhoto,
              {
                left: photo.left,
                top: photo.top,
                width: photo.size,
                height: photo.size,
                transform: [{ rotate: photo.rotate }],
              },
            ]}
          >
            <Image source={{ uri: photo.uri }} style={styles.cardImage} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function BagStackScreen() {
  const insets = useSafeAreaInsets();
  const engineRef = useRef(Engine.create({ gravity: { x: 0, y: 0, scale: 0.002 } }));
  const wallsRef = useRef<Matter.Body[]>([]);
  const worldSizeRef = useRef({ width: 0, height: 0 });

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [frame, setFrame] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const syncWalls = useCallback((width: number, height: number) => {
    if (width <= 0 || height <= 0) {
      return;
    }

    const world = engineRef.current.world;
    wallsRef.current.forEach((wall) => World.remove(world, wall));
    wallsRef.current = createWalls(width, height);
    World.add(world, wallsRef.current);
    worldSizeRef.current = { width, height };
  }, []);

  const onCanvasLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      syncWalls(width, height);
    },
    [syncWalls],
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
      const isAndroid = Platform.OS === "android";
      const axisX = isAndroid ? -x : x;
      const axisY = isAndroid ? y : -y;

      // Normalize accelerometer axes across iOS/Android so the physics feel consistent.
      engine.world.gravity.x = Math.max(-5, Math.min(5, axisX * GRAVITY_MULT));
      engine.world.gravity.y = Math.max(-5, Math.min(5, axisY * GRAVITY_MULT));
      engine.world.gravity.scale = GRAVITY_SCALE;

      // Apply a small instantaneous force to photo bodies to make movement more dynamic
      try {
        const bodies = engine.world.bodies as Matter.Body[];
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          if (b.label === "photo") {
            Body.applyForce(b, b.position, {
              x: axisX * FORCE_FACTOR * (b.mass ?? 1),
              y: axisY * FORCE_FACTOR * (b.mass ?? 1),
            });
          }
        }
      } catch {
        // ignore
      }
    });

    return () => subscription.remove();
  }, []);

  const spawnPhoto = useCallback(
    (uri: string) => {
      const { width, height } = worldSizeRef.current;
      if (width <= 0 || height <= 0) {
        return;
      }

      const spawnX =
        CARD_SIZE / 2 +
        Math.random() * Math.max(CARD_SIZE, width - CARD_SIZE);
      const spawnY = CARD_SIZE / 2 + WALL_THICKNESS / 2 + 8;

      const body = Bodies.rectangle(spawnX, spawnY, CARD_SIZE, CARD_SIZE, {
        label: "photo",
        restitution: 0.28,
        friction: 0.65,
        frictionStatic: 0.85,
        frictionAir: 0.035,
        density: 0.0012,
        chamfer: { radius: 2 },
      });

      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
      Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 0.6,
        y: 0.45,
      });

      World.add(engineRef.current.world, body);

      const item: PhotoItem = {
        id: `${Date.now()}-${body.id}`,
        uri,
        body,
      };

      setPhotos((prev) => [...prev, item]);
    },
    [],
  );

  const pickFromCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("카메라 권한 필요", "사진을 찍으려면 카메라 접근 권한이 필요해요.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]?.uri) {
      spawnPhoto(result.assets[0].uri);
    }
  }, [spawnPhoto]);

  const resetStack = useCallback(() => {
    const world = engineRef.current.world;
    setPhotos((current) => {
      current.forEach((photo) => World.remove(world, photo.body));
      return [];
    });
  }, []);

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Image source={require("@/assets/images/InMyBag.png")} style={styles.logoImage} />
        <View style={styles.topCopy}>
          <Text style={styles.topTitle}>{showHistory ? "가방 기록" : "내 가방"}</Text>
        </View>
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
              <HistoryCard key={item.id} item={item} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <>
          <View
            style={styles.canvas}
            onLayout={onCanvasLayout}
          >
            {photos.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>첫 번째 물건을 담아보세요</Text>
                <Text style={styles.emptyText}>아래 버튼으로 사진을 찍으면 이 공간에 카드가 떨어집니다.</Text>
              </View>
            ) : null}
            {photos.map((photo) => (
              <PhysicsPhoto
                key={photo.id}
                photo={photo}
                frame={frame}
                worldSize={worldSizeRef.current}
              />
            ))}
          </View>

          <View
            style={[
              styles.bottomBar,
              { paddingBottom: 8 },
            ]}
          >
            <Pressable style={[styles.button, styles.primaryButton]} onPress={pickFromCamera}>
              <Text style={styles.buttonText}>사진 찍기</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={resetStack}>
              <Text style={styles.secondaryButtonText}>리셋</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: H_PADDING,
    paddingBottom: 10,
    backgroundColor: Brand.surface,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  logoImage: {
    width: 46,
    height: 46,
    borderRadius: 12,
  },
  topCopy: {
    flex: 1,
  },
  topTitle: {
    color: Brand.primary,
    fontSize: 22,
    fontWeight: "900",
  },
  modeToggle: {
    width: 54,
    height: 30,
    justifyContent: "center",
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
    alignSelf: "flex-end",
  },
  canvas: {
    flex: 1,
    backgroundColor: Brand.secondary,
    overflow: "hidden",
  },
  emptyState: {
    position: "absolute",
    left: 24,
    right: 24,
    top: 36,
    alignItems: "center",
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#B9C7D8",
    backgroundColor: "rgba(255,255,255,0.64)",
  },
  emptyTitle: {
    color: Brand.text,
    fontSize: 18,
    fontWeight: "900",
  },
  emptyText: {
    color: Brand.muted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  card: {
    position: "absolute",
    width: CARD_SIZE,
    height: CARD_SIZE,
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 3,
    borderColor: Brand.surface,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  history: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  historyContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  historyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  historyCard: {
    width: "30.8%",
    minHeight: 178,
    overflow: "hidden",
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
    fontWeight: "900",
  },
  historyPreview: {
    flex: 1,
    marginTop: 6,
    backgroundColor: Brand.secondary,
    overflow: "hidden",
  },
  historyPhoto: {
    position: "absolute",
    overflow: "hidden",
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Brand.surface,
    backgroundColor: Brand.surface,
  },
  bottomBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    backgroundColor: Brand.surface,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
  },
  primaryButton: {
    backgroundColor: Brand.primary,
  },
  secondaryButton: {
    backgroundColor: Brand.secondary,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButtonText: {
    color: Brand.primary,
    fontSize: 15,
    fontWeight: "800",
  },
});
