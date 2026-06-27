import * as ImagePicker from "expo-image-picker";
import { Accelerometer } from "expo-sensors";
import Matter, { Bodies, Body, Engine, World } from "matter-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  LayoutChangeEvent,
  Pressable,
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

type PhotoItem = {
  id: string;
  uri: string;
  body: Matter.Body;
};

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

function PhysicsPhoto({ photo, frame }: { photo: PhotoItem; frame: number }) {
  void frame;

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
      pointerEvents="none"
    >
      <Image source={{ uri: photo.uri }} style={styles.cardImage} />
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

    const GRAVITY_MULT = 5.5;
    const GRAVITY_SCALE = 0.0028;
    const FORCE_FACTOR = 0.0032;

    const subscription = Accelerometer.addListener(({ x, y }: { x: number; y: number; z: number }) => {
      const engine = engineRef.current;

      // Map device axes to world gravity and clamp to reasonable limits
      engine.world.gravity.x = Math.max(-5, Math.min(5, x * GRAVITY_MULT));
      engine.world.gravity.y = Math.max(-5, Math.min(5, -y * GRAVITY_MULT));
      engine.world.gravity.scale = GRAVITY_SCALE;

      // Apply a small instantaneous force to photo bodies to make movement more dynamic
      try {
        const bodies = engine.world.bodies as Matter.Body[];
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          if (b.label === "photo") {
            Body.applyForce(b, b.position, {
              x: x * FORCE_FACTOR * (b.mass ?? 1),
              y: -y * FORCE_FACTOR * (b.mass ?? 1),
            });
          }
        }
      } catch (e) {
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
        frictionAir: 0.012,
        density: 0.0012,
        chamfer: { radius: 2 },
      });

      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
      Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 1.5,
        y: 1.5,
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
          <Text style={styles.topTitle}>Bag Stack</Text>
          <Text style={styles.topSubtitle}>사진을 찍으면 가방 속 기록이 차곡차곡 쌓여요</Text>
        </View>
      </View>

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
          <PhysicsPhoto key={photo.id} photo={photo} frame={frame} />
        ))}
      </View>

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <Pressable style={[styles.button, styles.primaryButton]} onPress={pickFromCamera}>
          <Text style={styles.buttonText}>사진 찍기</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={resetStack}>
          <Text style={styles.secondaryButtonText}>리셋</Text>
        </Pressable>
      </View>
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
    paddingBottom: 14,
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
  topSubtitle: {
    color: Brand.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
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
  bottomBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
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
