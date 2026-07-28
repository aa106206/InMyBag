import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import Matter, { Bodies, Body, Engine, World } from "matter-js";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  DeviceEventEmitter,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PhotoLocationMap } from "@/components/photo-location-map";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { BAG_STACK_TAB_RESELECT_EVENT } from "@/constants/tab-events";
import { Brand } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import {
  deleteBagItem,
  getBagItemPersistenceErrorMessage,
  loadCurrentBagItems,
  saveBagItem,
  updateBagItem,
} from "@/services/bag-items";
import { BagView, fetchBagViews } from "@/services/bag-views";
import {
  detectObjectsWithDino,
  DinoDetectionBox,
  getSam2ServerUrl,
  Sam2PromptBox,
  Sam2SegmentResult,
  segmentImageWithSam2,
} from "@/services/sam2";
import {
  EMOTION_META,
  loadStories,
  resolveEmotion,
  STORY_EMOTIONS,
  type GeneratedStory,
} from "@/services/stories";
import { withSampleStories } from "@/services/story-samples";
import {
  applyShakeImpulseToBodies,
  detectShakeImpulse,
  type ShakeSample,
} from "@/utils/physics-shake";

const TARGET_OBJECT_SIZE = 112;
const H_PADDING = 16;
const WALL_THICKNESS = 60;
const FIXED_TIMESTEP = 1000 / 60;
const MAX_PHOTO_NOTE_LENGTH = 120;
const DEFAULT_PHOTO_LOCATION_NAME = "위치 정보 없음";
// AI 서버가 어차피 긴 변 1024px로 줄여 처리하므로, 업로드 전에 미리 같은 크기로 줄인다.
// 원본(수 MB)을 detect/segment에 두 번 올리던 전송 시간이 크게 줄어든다.
const MAX_UPLOAD_IMAGE_SIZE = 1024;

type PhotoLocation = {
  name: string | null;
  latitude: number | null;
  longitude: number | null;
};

// 이야기 책장: 하루에 한 편씩 만들어진 그림일기를 '책등'으로 꽂아 둔다.
// 책등 색은 그날 사용자가 고른 '감정'에 따라 달라진다.
// (감정을 고르기 전에 만든 예전 이야기는 이야기 톤으로 감정을 추정한다.)
function storyTheme(story: GeneratedStory) {
  return EMOTION_META[resolveEmotion(story)];
}

type ShelfDay = {
  day: number;
  dateLabel: string;
  story: GeneratedStory | null;
};

type MonthShelfData = {
  key: string;
  year: number;
  month: number;
  title: string;
  filledCount: number;
  days: ShelfDay[];
};

const SHELF_START_YEAR = 2020;

// 하루에 한 편, 그날의 마지막 이야기를 'Y-M-D' 키로 정리한다.
function buildDayStoryMap(stories: GeneratedStory[]): Map<string, GeneratedStory> {
  const latestByDay = new Map<string, GeneratedStory>();
  for (const story of stories) {
    const date = new Date(story.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const prev = latestByDay.get(dayKey);
    if (!prev || new Date(story.createdAt) > new Date(prev.createdAt)) {
      latestByDay.set(dayKey, story);
    }
  }
  return latestByDay;
}

// 이야기가 하나라도 있는 달('Y-M')을 표시해, 월 선택 칩에 점을 찍는다.
function collectStoryMonths(stories: GeneratedStory[]): Set<string> {
  const months = new Set<string>();
  for (const story of stories) {
    const date = new Date(story.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    months.add(`${date.getFullYear()}-${date.getMonth()}`);
  }
  return months;
}

// 특정 연·월(0-based) 하나의 책장을 만든다.
function buildShelfForMonth(
  year: number,
  month0: number,
  dayMap: Map<string, GeneratedStory>,
): MonthShelfData {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const days: ShelfDay[] = [];
  let filledCount = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const story = dayMap.get(`${year}-${month0}-${day}`) ?? null;
    if (story) filledCount += 1;
    days.push({ day, dateLabel: `${month0 + 1}월 ${day}일`, story });
  }
  return {
    key: `${year}-${month0}`,
    year,
    month: month0 + 1,
    title: `${year}년 ${month0 + 1}월`,
    filledCount,
    days,
  };
}

// 책등 높이를 날짜별로 살짝 다르게 해 실제 책장처럼 보이게 한다.
// 책장은 스크롤 없이 한 화면에 들어가야 하므로, 고정 px가 아니라
// 선반 한 칸 높이에 대한 비율로 계산해 화면 크기에 맞춰 늘어나고 줄어들게 한다.
function spineHeightRatio(day: number, filled: boolean) {
  if (!filled) return 0.74;
  return 0.86 + [0, 0.07, 0.03, 0.1, 0.05, 0.02][day % 6];
}

function formatReaderDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// 한 줄 10칸이면 31일이 10/10/10/1로 나뉘어 마지막 선반이 거의 비어 보인다.
// 8칸으로 줄이면 8/8/8/7이 되어 선반 네 칸이 고르게 차고 책등도 그만큼 넓어진다.
const SPINES_PER_ROW = 8;
const SPINE_GAP = 6;
const SHELF_BOARD_PADDING = 14;
const HISTORY_H_PADDING = 14;
const SPINE_WIDTH = Math.max(
  16,
  Math.floor(
    (Dimensions.get("window").width -
      HISTORY_H_PADDING * 2 -
      SHELF_BOARD_PADDING * 2 -
      SPINE_GAP * (SPINES_PER_ROW - 1)) /
      SPINES_PER_ROW,
  ),
);

type ObjectSize = {
  width: number;
  height: number;
};

type PhotoItem = ObjectSize & {
  id: string;
  uri: string;
  dbId?: string;
  storagePath?: string | null;
  createdAt?: string;
  objectLabel?: string | null;
  note?: string | null;
  locationName?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  body: Matter.Body;
};

type WorldSize = {
  width: number;
  height: number;
};

type PendingPhoto = ObjectSize & {
  uri: string;
  locationName?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
};

type Rect = {
  x: number;
  y: number;
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

// 화면 위쪽에서 떨어지는 사진 물리 바디를 만든다. 최초 로딩과 화면 초기화에서 함께 쓴다.
function createFallingPhotoBody(displaySize: ObjectSize, worldWidth: number): Matter.Body {
  const halfWidth = displaySize.width / 2;
  const halfHeight = displaySize.height / 2;
  const spawnX =
    halfWidth + Math.random() * Math.max(displaySize.width, worldWidth - displaySize.width);
  const spawnY = halfHeight + WALL_THICKNESS / 2 + 8;

  const body = Bodies.rectangle(spawnX, spawnY, displaySize.width, displaySize.height, {
    label: "photo",
    restitution: 0.28,
    friction: 0.65,
    frictionStatic: 0.85,
    frictionAir: 0.035,
    density: 0.0012,
    chamfer: { radius: 2 },
  });

  (body as PhotoBody).photoSize = displaySize;
  Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
  Body.setVelocity(body, {
    x: (Math.random() - 0.5) * 0.6,
    y: 0.45,
  });

  return body;
}

const STUCK_DRAG_TIMEOUT_MS = 2000;
// 릴리즈 속도 상한. 너무 빠르면 한 프레임에 벽을 뚫고 월드 밖으로 나갈 수 있다(터널링).
const MAX_THROW_SPEED = 16;

type PhotoBody = Matter.Body & {
  dragHeartbeatAt?: number;
  photoSize?: ObjectSize;
};

function markDragHeartbeat(body: Matter.Body) {
  (body as PhotoBody).dragHeartbeatAt = Date.now();
}

function limitThrowSpeed(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, value));
}

// 드래그가 비정상적으로 끊겨 static(고정)으로 남은 사진을 감지해 즉시 다시 움직이게 한다.
// 정상 드래그 중에는 grant/move에서 하트비트가 계속 갱신되므로 여기에 걸리지 않는다.
function releaseBodyIfStuck(body: Matter.Body) {
  if (body.label !== "photo" || !body.isStatic) {
    return;
  }

  const heartbeatAt = (body as PhotoBody).dragHeartbeatAt ?? 0;
  if (Date.now() - heartbeatAt > STUCK_DRAG_TIMEOUT_MS) {
    Body.setStatic(body, false);
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
  }
}

// 매 프레임 사진이 월드 안에 있도록 보정한다.
// 벽을 뚫고 나갔거나 좌표가 NaN으로 오염된 사진을 즉시 되살린다.
function keepBodyInsideWorld(body: Matter.Body, worldSize: WorldSize) {
  if (body.label !== "photo" || worldSize.width <= 0 || worldSize.height <= 0) {
    return;
  }

  const size = (body as PhotoBody).photoSize ?? {
    width: TARGET_OBJECT_SIZE,
    height: TARGET_OBJECT_SIZE,
  };

  if (
    !Number.isFinite(body.position.x) ||
    !Number.isFinite(body.position.y) ||
    !Number.isFinite(body.angle)
  ) {
    Body.setPosition(body, {
      x: worldSize.width / 2,
      y: size.height / 2 + WALL_THICKNESS / 2 + 8,
    });
    Body.setAngle(body, 0);
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
    return;
  }

  const nextPosition = clampPhotoPosition(body.position, size, worldSize);
  if (nextPosition.x !== body.position.x || nextPosition.y !== body.position.y) {
    Body.setPosition(body, nextPosition);
    Body.setVelocity(body, { x: 0, y: 0 });
  }
}

function clampPhotoPosition(
  position: { x: number; y: number },
  size: ObjectSize,
  worldSize: WorldSize,
) {
  if (worldSize.width <= 0 || worldSize.height <= 0) {
    return position;
  }

  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const safeX = Number.isFinite(position.x) ? position.x : worldSize.width / 2;
  const safeY = Number.isFinite(position.y) ? position.y : worldSize.height / 2;

  return {
    x: Math.max(halfWidth, Math.min(worldSize.width - halfWidth, safeX)),
    y: Math.max(halfHeight, Math.min(worldSize.height - halfHeight, safeY)),
  };
}

function getDefaultPromptBox(width: number, height: number): Sam2PromptBox {
  return {
    x0: width * 0.18,
    y0: height * 0.18,
    x1: width * 0.82,
    y1: height * 0.82,
  };
}

function clampPromptBox(box: Sam2PromptBox, imageSize: ObjectSize): Sam2PromptBox {
  const minSize = Math.min(imageSize.width, imageSize.height) * 0.12;
  const boxWidth = Math.max(minSize, box.x1 - box.x0);
  const boxHeight = Math.max(minSize, box.y1 - box.y0);
  const x0 = Math.max(0, Math.min(imageSize.width - boxWidth, box.x0));
  const y0 = Math.max(0, Math.min(imageSize.height - boxHeight, box.y0));

  return {
    x0,
    y0,
    x1: Math.min(imageSize.width, x0 + boxWidth),
    y1: Math.min(imageSize.height, y0 + boxHeight),
  };
}

function getAspectFitFrame(container: ObjectSize, image: ObjectSize): Rect {
  if (container.width <= 0 || container.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
}

function getOverlayBox(box: Sam2PromptBox, imageSize: ObjectSize, imageFrame: Rect): Rect {
  const scaleX = imageFrame.width / imageSize.width;
  const scaleY = imageFrame.height / imageSize.height;

  return {
    x: imageFrame.x + box.x0 * scaleX,
    y: imageFrame.y + box.y0 * scaleY,
    width: (box.x1 - box.x0) * scaleX,
    height: (box.y1 - box.y0) * scaleY,
  };
}

// 박스를 꾹 눌렀을 때 위아래로 훑는 '스캔' 연출. 분리가 끝날 때까지 반복된다.
function BoxScanEffect({ boxHeight }: { boxHeight: number }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 820,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 820,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const translateY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, boxHeight - 30)],
  });

  return (
    <View pointerEvents="none" style={styles.scanFill}>
      <Animated.View style={[styles.scanBand, { transform: [{ translateY }] }]}>
        <View style={styles.scanGlow} />
        <View style={styles.scanLine} />
      </Animated.View>
    </View>
  );
}

// 프롬프트 박스를 '꾹 누름'으로 인식하기까지의 시간과, 누른 채 움직여도 꾹 누름으로 봐줄 흔들림 허용치.
const PROMPT_LONG_PRESS_MS = 420;
const PROMPT_LONG_PRESS_SLOP = 9;

function SegmentPreviewModal({
  photo,
  promptBox,
  detectionBoxes,
  selectedDetectionId,
  isDetecting,
  isSegmenting,
  onSelectDetection,
  onScanDetection,
  onScanPromptBox,
  onMoveBox,
  onCancel,
  children,
}: {
  photo: PendingPhoto | null;
  promptBox: Sam2PromptBox | null;
  detectionBoxes: DinoDetectionBox[];
  selectedDetectionId: string | null;
  isDetecting: boolean;
  isSegmenting: boolean;
  onSelectDetection: (box: DinoDetectionBox) => void;
  onScanDetection: (box: DinoDetectionBox) => void;
  onScanPromptBox: () => void;
  onMoveBox: (dx: number, dy: number) => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const [previewSize, setPreviewSize] = useState<ObjectSize>({ width: 0, height: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const photoRef = useRef<PendingPhoto | null>(null);
  const imageFrameRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const onScanPromptBoxRef = useRef(onScanPromptBox);
  const promptPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onScanPromptBoxRef.current = onScanPromptBox;

  const clearPromptPressTimer = () => {
    if (promptPressTimerRef.current) {
      clearTimeout(promptPressTimerRef.current);
      promptPressTimerRef.current = null;
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = { x: 0, y: 0 };
        // 드래그 없이 꾹 누르고 있으면 이 박스로 바로 스캔을 시작한다.
        clearPromptPressTimer();
        promptPressTimerRef.current = setTimeout(() => {
          promptPressTimerRef.current = null;
          onScanPromptBoxRef.current();
        }, PROMPT_LONG_PRESS_MS);
      },
      onPanResponderMove: (_, gestureState) => {
        if (
          Math.abs(gestureState.dx) > PROMPT_LONG_PRESS_SLOP ||
          Math.abs(gestureState.dy) > PROMPT_LONG_PRESS_SLOP
        ) {
          clearPromptPressTimer();
        }

        const currentPhoto = photoRef.current;
        const currentImageFrame = imageFrameRef.current;

        if (!currentPhoto || currentImageFrame.width <= 0 || currentImageFrame.height <= 0) {
          return;
        }

        const displayDx = gestureState.dx - dragStartRef.current.x;
        const displayDy = gestureState.dy - dragStartRef.current.y;
        const imageDx = displayDx * (currentPhoto.width / currentImageFrame.width);
        const imageDy = displayDy * (currentPhoto.height / currentImageFrame.height);

        onMoveBox(imageDx, imageDy);
        dragStartRef.current = { x: gestureState.dx, y: gestureState.dy };
      },
      onPanResponderRelease: () => {
        clearPromptPressTimer();
      },
      onPanResponderTerminate: () => {
        clearPromptPressTimer();
      },
    }),
  ).current;

  if (!photo || !promptBox) {
    return null;
  }

  const imageFrame = getAspectFitFrame(previewSize, photo);
  const overlayBox = getOverlayBox(promptBox, photo, imageFrame);
  photoRef.current = photo;
  imageFrameRef.current = imageFrame;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <View style={styles.previewScreen}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>물건 선택</Text>
          <Text style={styles.previewSubtitle}>
            {isSegmenting
              ? "물건을 스캔해서 배경을 지우는 중이에요.."
              : isDetecting
                ? "사진 속 물건을 찾고 있어요.."
                : "물건 박스를 꾹 누르면 배경이 지워지고 가방에 담겨요."}
          </Text>
        </View>

        <View
          style={styles.previewStage}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setPreviewSize({ width, height });
          }}
        >
          <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="contain" />
          {imageFrame.width > 0 && !isDetecting
            ? detectionBoxes.map((detectedBox) => {
                const candidateBox = getOverlayBox(detectedBox.box, photo, imageFrame);
                const isSelected = detectedBox.id === selectedDetectionId;

                return (
                  <Pressable
                    key={detectedBox.id}
                    style={[
                      styles.detectedBox,
                      isSelected ? styles.detectedBoxSelected : undefined,
                      {
                        left: candidateBox.x,
                        top: candidateBox.y,
                        width: candidateBox.width,
                        height: candidateBox.height,
                      },
                    ]}
                    onPress={() => onSelectDetection(detectedBox)}
                    onLongPress={() => onScanDetection(detectedBox)}
                    delayLongPress={PROMPT_LONG_PRESS_MS}
                    disabled={isSegmenting}
                  >
                    <View
                      style={[
                        styles.detectedBoxLabel,
                        isSelected ? styles.detectedBoxLabelSelected : undefined,
                      ]}
                    >
                      <Text style={styles.detectedBoxLabelText}>
                        {detectedBox.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            : null}
          {imageFrame.width > 0 && !isDetecting ? (
            <View
              style={[
                styles.promptBox,
                isSegmenting ? styles.promptBoxScanning : undefined,
                {
                  left: overlayBox.x,
                  top: overlayBox.y,
                  width: overlayBox.width,
                  height: overlayBox.height,
                },
              ]}
              pointerEvents={isSegmenting ? "none" : "auto"}
              {...panResponder.panHandlers}
            >
              {isSegmenting ? <BoxScanEffect boxHeight={overlayBox.height} /> : null}
              <View style={styles.promptLabel}>
                <Text style={styles.promptLabelText}>
                  {isSegmenting ? "스캔 중.." : "꾹 눌러서 담기"}
                </Text>
              </View>
              <View style={[styles.promptCorner, styles.promptCornerTopLeft]} />
              <View style={[styles.promptCorner, styles.promptCornerTopRight]} />
              <View style={[styles.promptCorner, styles.promptCornerBottomLeft]} />
              <View style={[styles.promptCorner, styles.promptCornerBottomRight]} />
            </View>
          ) : null}
          {isDetecting ? (
            <View style={styles.detectionLoadingOverlay}>
              <View style={styles.detectionLoadingCard}>
                <Image
                  source={require("@/assets/images/SnapBag.png")}
                  style={styles.detectionLoadingLogo}
                  resizeMode="contain"
                />
                <Text style={styles.detectionLoadingBrand}>SnapBag</Text>
                <ActivityIndicator color={Brand.primary} size="small" />
                <Text style={styles.detectionLoadingText}>사진 속 물건을 찾는 중 ..</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.previewControls}>
          <View style={styles.previewActions}>
            <Pressable
              style={[styles.previewButton, styles.previewSecondaryButton]}
              onPress={onCancel}
              disabled={isSegmenting}
            >
              <Text style={styles.previewSecondaryText}>다시 찍기</Text>
            </Pressable>
          </View>
        </View>
      </View>
      {children}
    </Modal>
  );
}

function PhotoNoteModal({
  visible,
  photoUri,
  objectLabel,
  note,
  isSaving,
  onChangeNote,
  onBack,
  onSave,
}: {
  visible: boolean;
  photoUri?: string;
  objectLabel?: string | null;
  note: string;
  isSaving: boolean;
  onChangeNote: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onBack}
    >
      <KeyboardAvoidingView
        style={styles.noteComposerScreen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.noteComposerHeader}>
          <Text style={styles.noteComposerTitle}>메모 추가</Text>
          <Text style={styles.noteComposerSubtitle}>
            이 물건에 대한 짧은 메모를 남겨주세요.
          </Text>
        </View>

        <View style={styles.noteComposerContent}>
          {photoUri ? (
            <View style={styles.notePhotoPreview}>
              <Image source={{ uri: photoUri }} style={styles.notePhotoImage} resizeMode="contain" />
            </View>
          ) : null}
          <Text style={styles.noteObjectLabel}>{objectLabel || "가방 물건"}</Text>
          <View style={styles.noteInputWrap}>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={onChangeNote}
              placeholder="물건에 대한 메모를 입력하세요."
              placeholderTextColor={Brand.muted}
              multiline
              maxLength={MAX_PHOTO_NOTE_LENGTH}
              autoFocus
              textAlignVertical="top"
              editable={!isSaving}
            />
            <Text style={styles.noteCounter}>
              {note.length}/{MAX_PHOTO_NOTE_LENGTH}
            </Text>
          </View>
        </View>

        <View style={styles.noteComposerControls}>
          <Pressable
            style={[styles.previewButton, styles.noteSecondaryButton]}
            onPress={onBack}
            disabled={isSaving}
          >
            <Text style={styles.noteSecondaryText}>이전</Text>
          </Pressable>
          <Pressable
            style={[
              styles.previewButton,
              styles.notePrimaryButton,
              isSaving && styles.disabledButton,
            ]}
            onPress={onSave}
            disabled={isSaving}
          >
            <Text style={styles.notePrimaryText}>
              {isSaving ? "저장 중..." : "가방에 추가"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function formatCapturedAt(value?: string) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "촬영 시간 정보 없음";
  }

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${date.getFullYear()}.${month}.${day} ${hours}:${minutes}`;
}

function formatLocationName(place?: Location.LocationGeocodedAddress | null) {
  if (!place) {
    return DEFAULT_PHOTO_LOCATION_NAME;
  }

  return [
    place.city || place.subregion || place.region,
    place.district,
    place.street,
    place.name,
  ]
    .filter(Boolean)
    .join(" ")
    || DEFAULT_PHOTO_LOCATION_NAME;
}

async function getCurrentPhotoLocation(): Promise<PhotoLocation> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      return {
        name: DEFAULT_PHOTO_LOCATION_NAME,
        latitude: null,
        longitude: null,
      };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = position.coords;
    let name = DEFAULT_PHOTO_LOCATION_NAME;

    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      name = formatLocationName(place);
    } catch (error) {
      console.warn("Reverse geocode failed.", error);
    }

    return { name, latitude, longitude };
  } catch (error) {
    console.warn("Current photo location failed.", error);
    return {
      name: DEFAULT_PHOTO_LOCATION_NAME,
      latitude: null,
      longitude: null,
    };
  }
}

function BagPhotoInfoModal({
  photo,
  onDelete,
  onClose,
  onUpdate,
}: {
  photo: PhotoItem | null;
  onDelete: () => void;
  onClose: () => void;
  onUpdate: (updates: { objectLabel: string | null; note: string | null }) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftObjectLabel, setDraftObjectLabel] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const locationName = photo?.locationName || DEFAULT_PHOTO_LOCATION_NAME;
  const hasPhotoLocation =
    typeof photo?.locationLatitude === "number"
    && typeof photo?.locationLongitude === "number";

  useEffect(() => {
    setIsEditing(false);
    setDraftObjectLabel(photo?.objectLabel ?? "");
    setDraftNote(photo?.note ?? "");
    setIsSavingEdit(false);
  }, [photo?.id, photo?.objectLabel, photo?.note]);

  const saveEdit = useCallback(async () => {
    if (!photo || isSavingEdit) {
      return;
    }

    setIsSavingEdit(true);

    try {
      await onUpdate({
        objectLabel: draftObjectLabel.trim() || null,
        note: draftNote.trim() || null,
      });
      setIsEditing(false);
    } catch (error) {
      console.warn("Bag item update failed.", error);
      Alert.alert("수정 실패", "사진 정보를 수정하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSavingEdit(false);
    }
  }, [draftNote, draftObjectLabel, isSavingEdit, onUpdate, photo]);

  return (
    <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.infoOverlay}>
        <View style={styles.infoCard}>
          {photo ? (
            <ScrollView
              style={styles.infoScroll}
              contentContainerStyle={styles.infoScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.infoHeader}>
                <View style={styles.infoTitleBlock}>
                  {isEditing ? (
                    <TextInput
                      style={[styles.infoObjectName, styles.infoTitleInput]}
                      value={draftObjectLabel}
                      onChangeText={setDraftObjectLabel}
                      placeholder="물건 이름"
                      placeholderTextColor={Brand.muted}
                      maxLength={40}
                      editable={!isSavingEdit}
                    />
                  ) : (
                    <Text style={styles.infoObjectName}>{photo.objectLabel || "가방 물건"}</Text>
                  )}
                  <Text style={styles.infoCapturedAt}>{formatCapturedAt(photo.createdAt)}</Text>
                </View>
                <View style={styles.infoActionRow}>
                  <Pressable
                    style={[styles.infoActionButton, styles.infoEditButton]}
                    onPress={isEditing ? saveEdit : () => setIsEditing(true)}
                    disabled={isSavingEdit}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={isEditing ? "수정 저장" : "사진 정보 수정"}
                  >
                    <IconSymbol
                      name={isEditing ? "checkmark" : "pencil"}
                      size={24}
                      color={Brand.text}
                    />
                  </Pressable>
                  <Pressable
                    style={[styles.infoActionButton, styles.infoDeleteButton]}
                    onPress={onDelete}
                    disabled={isSavingEdit}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="사진 삭제"
                  >
                    <IconSymbol name="trash.fill" size={25} color={Brand.text} />
                  </Pressable>
                  <Pressable
                    style={[styles.infoActionButton, styles.infoCloseInlineButton]}
                    onPress={onClose}
                    disabled={isSavingEdit}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="사진 정보 닫기"
                  >
                    <Text style={styles.infoCloseText}>×</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.infoImageStage}>
                <Image source={{ uri: photo.uri }} style={styles.infoImage} resizeMode="contain" />
              </View>
              {isEditing ? (
                <View style={styles.infoNoteSection}>
                  <View style={styles.infoNoteInputWrap}>
                    <TextInput
                      style={[styles.infoNoteText, styles.infoNoteInput]}
                      value={draftNote}
                      onChangeText={setDraftNote}
                      placeholder="이 물건에 대한 기록을 적어보세요."
                      placeholderTextColor={Brand.muted}
                      multiline
                      maxLength={MAX_PHOTO_NOTE_LENGTH}
                      textAlignVertical="top"
                      editable={!isSavingEdit}
                    />
                    <Text style={styles.infoNoteCounter}>
                      {draftNote.length}/{MAX_PHOTO_NOTE_LENGTH}
                    </Text>
                  </View>
                </View>
              ) : (
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
                      style={[styles.infoNoteText, styles.infoNoteDisplayText, !photo.note ? styles.infoEmptyText : null]}
                    >
                      {photo.note || "아직 기록이 없어요."}
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.infoMapSection}>
                <Text style={styles.infoMapTitle}>찍은 위치</Text>
                <Text style={styles.infoLocationName}>{locationName}</Text>
                {hasPhotoLocation ? (
                  <PhotoLocationMap
                    latitude={photo.locationLatitude as number}
                    longitude={photo.locationLongitude as number}
                    title={photo.objectLabel || "가방 물건"}
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

function formatBagViewTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${date.getFullYear()}.${month}.${day} ${hours}:${minutes}`;
}

function BagViewsModal({
  visible,
  views,
  isLoading,
  onClose,
}: {
  visible: boolean;
  views: BagView[];
  isLoading: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewsOverlay}>
        <View style={styles.viewsCard}>
          <View style={styles.viewsHeader}>
            <View style={styles.viewsTitleBlock}>
              <Text style={styles.viewsTitle}>조회수</Text>
              <Text style={styles.viewsSubtitle}>내 가방을 조회한 사람</Text>
            </View>
            <Pressable style={styles.viewsCloseButton} onPress={onClose} hitSlop={10}>
              <Text style={styles.viewsCloseText}>×</Text>
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.viewsCenter}>
              <ActivityIndicator color={Brand.primary} />
            </View>
          ) : views.length === 0 ? (
            <View style={styles.viewsCenter}>
              <Text style={styles.viewsEmptyText}>아직 내 가방을 조회한 사람이 없어요.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.viewsScroll}
              contentContainerStyle={styles.viewsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {views.map((view) => (
                <View key={view.viewerId} style={styles.viewsRow}>
                  <Text style={styles.viewsUser} numberOfLines={1} ellipsizeMode="tail">
                    @{view.viewerName.split("@")[0]}
                  </Text>
                  <Text style={styles.viewsTime}>{formatBagViewTime(view.viewedAt)}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function PhysicsPhoto({
  photo,
  frame,
  worldSize,
  onOpenPhotoInfo,
}: {
  photo: PhotoItem;
  frame: number;
  worldSize: WorldSize;
  onOpenPhotoInfo: (photo: PhotoItem) => void;
}) {
  void frame;

  const bodyRef = useRef(photo.body);
  const photoSizeRef = useRef<ObjectSize>({ width: photo.width, height: photo.height });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const worldSizeRef = useRef(worldSize);
  const openPhotoInfoRef = useRef(onOpenPhotoInfo);
  const isDraggingRef = useRef(false);
  const dragFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  bodyRef.current = photo.body;
  photoSizeRef.current = { width: photo.width, height: photo.height };
  worldSizeRef.current = worldSize;
  openPhotoInfoRef.current = onOpenPhotoInfo;

  const clearDragFallback = useCallback(() => {
    if (dragFallbackRef.current) {
      clearTimeout(dragFallbackRef.current);
      dragFallbackRef.current = null;
    }
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const endPhotoDrag = useCallback(
    (velocity = { x: 0, y: 0 }) => {
      const body = bodyRef.current;
      clearDragFallback();
      clearLongPressTimer();
      isDraggingRef.current = false;
      Body.setPosition(
        body,
        clampPhotoPosition(body.position, photoSizeRef.current, worldSizeRef.current),
      );
      Body.setStatic(body, false);
      Body.setVelocity(body, velocity);
      Body.setAngularVelocity(
        body,
        Number.isFinite(body.angularVelocity) ? body.angularVelocity : 0,
      );
    },
    [clearDragFallback, clearLongPressTimer],
  );

  const scheduleDragFallback = useCallback(() => {
    clearDragFallback();
    dragFallbackRef.current = setTimeout(() => {
      if (isDraggingRef.current) {
        endPhotoDrag();
      }
    }, 1200);
  }, [clearDragFallback, endPhotoDrag]);

  useEffect(
    () => () => {
      clearDragFallback();
      clearLongPressTimer();
      if (isDraggingRef.current) {
        const body = bodyRef.current;
        isDraggingRef.current = false;
        Body.setStatic(body, false);
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      }
    },
    [clearDragFallback, clearLongPressTimer],
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
        dragStartRef.current = { x: body.position.x, y: body.position.y };
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          openPhotoInfoRef.current(photo);
        }, 1000);
        scheduleDragFallback();
        Body.setStatic(body, true);
        markDragHeartbeat(body);
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8) {
          clearLongPressTimer();
        }

        const body = bodyRef.current;
        markDragHeartbeat(body);
        scheduleDragFallback();
        Body.setPosition(
          body,
          clampPhotoPosition(
            {
              x: dragStartRef.current.x + gestureState.dx,
              y: dragStartRef.current.y + gestureState.dy,
            },
            photoSizeRef.current,
            worldSizeRef.current,
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
  const angle = photo.body.angle;

  return (
    <View
      style={[
        styles.objectLayer,
        {
          left: x - photo.width / 2,
          top: y - photo.height / 2,
          width: photo.width,
          height: photo.height,
          transform: [{ rotate: `${angle}rad` }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Image source={{ uri: photo.uri }} style={styles.objectImage} resizeMode="contain" />
    </View>
  );
}

function BookSpine({ item, onPress }: { item: ShelfDay; onPress: () => void }) {
  const filled = !!item.story;
  const theme = item.story ? storyTheme(item.story) : null;
  const heightPercent = `${Math.round(spineHeightRatio(item.day, filled) * 100)}%` as const;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        filled ? `${item.dateLabel} 이야기 · ${theme?.label}` : `${item.dateLabel} 빈 자리`
      }
      style={[
        styles.spine,
        {
          width: SPINE_WIDTH,
          height: heightPercent,
          backgroundColor: filled ? theme!.color : "#413C4A",
        },
        filled && styles.spineFilled,
      ]}
    >
      {filled ? <View style={[styles.spineCap, { backgroundColor: theme!.cap }]} /> : null}
      {filled ? <Text style={styles.spineDay}>{item.day}</Text> : null}
    </Pressable>
  );
}

function MonthShelf({
  shelf,
  onSelect,
}: {
  shelf: MonthShelfData;
  onSelect: (day: ShelfDay) => void;
}) {
  const rows: ShelfDay[][] = [];
  for (let index = 0; index < shelf.days.length; index += SPINES_PER_ROW) {
    rows.push(shelf.days.slice(index, index + SPINES_PER_ROW));
  }

  // 선반 칸 수는 달마다 4줄로 같으므로, 남은 세로 공간을 각 줄이 flex로 나눠 갖는다.
  // 덕분에 기기 화면이 작아도 스크롤 없이 한 화면에 들어간다.
  return (
    <View style={styles.shelfBoard}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.shelfRow}>
          <View style={styles.shelfSpines}>
            {row.map((day) => (
              <BookSpine key={day.day} item={day} onPress={() => onSelect(day)} />
            ))}
          </View>
          <View style={styles.shelfLedge} />
        </View>
      ))}
    </View>
  );
}

// 연/월을 한 번에 고르는 그리드 시트.
// 평소에는 상단 화살표로 한 달씩 옮기고, 먼 달로 건너뛸 때만 이 시트를 연다.
function PeriodPickerSheet({
  visible,
  year,
  month,
  today,
  storyMonths,
  onSelect,
  onClose,
}: {
  visible: boolean;
  year: number;
  month: number;
  today: Date;
  storyMonths: Set<string>;
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}) {
  const [draftYear, setDraftYear] = useState(year);

  useEffect(() => {
    if (visible) {
      setDraftYear(year);
    }
  }, [visible, year]);

  const maxYear = today.getFullYear();
  const maxMonth = draftYear === maxYear ? today.getMonth() + 1 : 12;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.pickerBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerCard} onPress={() => {}}>
          <View style={styles.pickerYearRow}>
            <Pressable
              style={[styles.pickerYearArrow, draftYear <= SHELF_START_YEAR && styles.arrowDisabled]}
              onPress={() => setDraftYear((value) => value - 1)}
              disabled={draftYear <= SHELF_START_YEAR}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="이전 연도"
            >
              <Text style={styles.pickerYearArrowText}>‹</Text>
            </Pressable>
            <Text style={styles.pickerYearText}>{draftYear}년</Text>
            <Pressable
              style={[styles.pickerYearArrow, draftYear >= maxYear && styles.arrowDisabled]}
              onPress={() => setDraftYear((value) => value + 1)}
              disabled={draftYear >= maxYear}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="다음 연도"
            >
              <Text style={styles.pickerYearArrowText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.pickerGrid}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => {
              const active = draftYear === year && value === month;
              const disabled = value > maxMonth;
              const hasStories = storyMonths.has(`${draftYear}-${value - 1}`);

              return (
                <Pressable
                  key={value}
                  disabled={disabled}
                  onPress={() => {
                    onSelect(draftYear, value);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled }}
                  style={[
                    styles.pickerMonth,
                    active && styles.pickerMonthActive,
                    disabled && styles.pickerMonthDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.pickerMonthText,
                      active && styles.pickerMonthTextActive,
                      disabled && styles.pickerMonthTextDisabled,
                    ]}
                  >
                    {value}월
                  </Text>
                  {hasStories && !disabled ? (
                    <View style={[styles.pickerMonthDot, active && styles.pickerMonthDotActive]} />
                  ) : (
                    <View style={styles.pickerMonthDotPlaceholder} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type ReaderDayPhoto = {
  id: string;
  uri: string;
};

// 이야기 아래 '이 날의 가방'에서 사진들을 흩어 놓을 때 쓰는 상대 좌표(%)와 기울기.
const READER_BAG_SPOTS = [
  { left: 8, top: 14, rotate: -7 },
  { left: 38, top: 6, rotate: 4 },
  { left: 66, top: 16, rotate: 9 },
  { left: 20, top: 46, rotate: 6 },
  { left: 50, top: 38, rotate: -5 },
  { left: 72, top: 54, rotate: -9 },
  { left: 5, top: 60, rotate: 3 },
  { left: 40, top: 64, rotate: -3 },
];

function StoryReaderModal({
  story,
  dayPhotos,
  onClose,
}: {
  story: GeneratedStory | null;
  dayPhotos: ReaderDayPhoto[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!story) return null;

  const theme = storyTheme(story);
  const image = story.illustrationUrl || story.imageUrls?.[0];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.readerBackdrop}>
        <Pressable style={styles.readerBackdropDismiss} onPress={onClose} />
        <View style={[styles.readerSheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.readerHandle} />
          <ScrollView
            style={styles.readerScroller}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.readerScroll}
            nestedScrollEnabled
            bounces
          >
            {image ? (
              // 일러스트는 서버가 4:3으로 그려 주므로 cover여도 잘리지 않는다.
              // 일러스트가 없어 물건 사진(비율 제각각)을 쓸 때는 contain으로 전체를 보여준다.
              <Image
                source={{ uri: image }}
                style={styles.readerImage}
                resizeMode={story.illustrationUrl ? "cover" : "contain"}
              />
            ) : null}
            <View style={styles.readerBody}>
              <View style={styles.readerMetaRow}>
                <View style={[styles.emotionChip, { backgroundColor: theme.color }]}>
                  <Text style={styles.emotionChipText}>{theme.emoji} {theme.label}</Text>
                </View>
                <Text style={styles.readerDate}>{formatReaderDate(story.createdAt)}</Text>
              </View>
              <Text style={styles.readerTitle}>{story.title}</Text>
              <View style={styles.readerDivider} />
              <Text style={styles.readerText}>{story.body}</Text>
              {story.itemLabels?.length ? (
                <View style={styles.readerTags}>
                  {story.itemLabels.slice(0, 6).map((label, index) => (
                    <View key={`${label}-${index}`} style={styles.readerTag}>
                      <Text style={styles.readerTagText}>#{label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {dayPhotos.length > 0 ? (
                <View style={styles.readerBagSection}>
                  <Text style={styles.readerBagTitle}>이 날의 가방</Text>
                  <Text style={styles.readerBagHint}>
                    이 날 찍어서 담은 물건 {dayPhotos.length}개
                  </Text>
                  <View style={styles.readerBagHandle} />
                  <View style={styles.readerBagBody}>
                    {dayPhotos.slice(0, READER_BAG_SPOTS.length).map((photo, index) => {
                      const spot = READER_BAG_SPOTS[index];
                      return (
                        <View
                          key={photo.id}
                          style={[
                            styles.readerBagPhoto,
                            {
                              left: `${spot.left}%`,
                              top: `${spot.top}%`,
                              transform: [{ rotate: `${spot.rotate}deg` }],
                            },
                          ]}
                        >
                          <Image
                            source={{ uri: photo.uri }}
                            style={styles.readerBagPhotoImage}
                            resizeMode="contain"
                          />
                        </View>
                      );
                    })}
                    {dayPhotos.length > READER_BAG_SPOTS.length ? (
                      <View style={styles.readerBagMoreBadge}>
                        <Text style={styles.readerBagMoreText}>
                          +{dayPhotos.length - READER_BAG_SPOTS.length}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          </ScrollView>
          <Pressable style={styles.readerClose} onPress={onClose}>
            <Text style={styles.readerCloseText}>책 덮기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function BagStackScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const engineRef = useRef(Engine.create({ gravity: { x: 0, y: 0, scale: 0.002 } }));
  const wallsRef = useRef<Matter.Body[]>([]);
  const worldSizeRef = useRef<WorldSize>({ width: 0, height: 0 });
  const savedItemsLoadIdRef = useRef(0);
  const previousShakeSampleRef = useRef<ShakeSample | null>(null);
  const lastShakeAtRef = useRef(0);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [canvasSize, setCanvasSize] = useState<WorldSize>({ width: 0, height: 0 });
  const [frame, setFrame] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [isLoadingSavedItems, setIsLoadingSavedItems] = useState(false);
  const [isSavingBagItem, setIsSavingBagItem] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [promptBox, setPromptBox] = useState<Sam2PromptBox | null>(null);
  const [detectionBoxes, setDetectionBoxes] = useState<DinoDetectionBox[]>([]);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [segmentedPreview, setSegmentedPreview] = useState<Sam2SegmentResult | null>(null);
  const [isWritingPhotoNote, setIsWritingPhotoNote] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const [stories, setStories] = useState<GeneratedStory[]>([]);
  const [readerStory, setReaderStory] = useState<GeneratedStory | null>(null);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1~12
  const [isPeriodPickerOpen, setIsPeriodPickerOpen] = useState(false);

  const dayStoryMap = useMemo(() => buildDayStoryMap(stories), [stories]);
  const storyMonths = useMemo(() => collectStoryMonths(stories), [stories]);
  const shelf = useMemo(
    () => buildShelfForMonth(selectedYear, selectedMonth - 1, dayStoryMap),
    [selectedYear, selectedMonth, dayStoryMap],
  );

  // 첫 달(2020년 1월)보다 앞이나 이번 달보다 뒤로는 넘어가지 않는다.
  const canGoPrevMonth = !(selectedYear === SHELF_START_YEAR && selectedMonth === 1);
  const canGoNextMonth = !(
    selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1
  );

  const shiftMonth = useCallback(
    (offset: number) => {
      const next = new Date(selectedYear, selectedMonth - 1 + offset, 1);
      const year = next.getFullYear();
      const month = next.getMonth() + 1;

      if (year < SHELF_START_YEAR) return;
      if (year > now.getFullYear()) return;
      if (year === now.getFullYear() && month > now.getMonth() + 1) return;

      setSelectedYear(year);
      setSelectedMonth(month);
    },
    [now, selectedMonth, selectedYear],
  );

  const selectPeriod = useCallback((year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
  }, []);

  // 책장을 열 때마다 저장된 이야기를 다시 불러와 최신 상태로 채운다.
  useEffect(() => {
    if (!showHistory || !user) return;
    let active = true;
    loadStories(user.id)
      .then((loaded) => {
        if (active) setStories(withSampleStories(loaded));
      })
      .catch((error) => console.warn("이야기 책장 불러오기 실패", error));
    return () => {
      active = false;
    };
  }, [showHistory, user]);

  // 빈 날짜를 누르면 잠깐 안내를 띄우고 자동으로 사라지게 한다.
  useEffect(() => {
    if (!emptyHint) return;
    const timer = setTimeout(() => setEmptyHint(null), 1600);
    return () => clearTimeout(timer);
  }, [emptyHint]);

  const handleSelectDay = useCallback((day: ShelfDay) => {
    if (day.story) {
      setEmptyHint(null);
      setReaderStory(day.story);
    } else {
      setReaderStory(null);
      setEmptyHint(`${day.dateLabel} · 아직 이야기가 없어요`);
    }
  }, []);

  // 이야기 날짜와 같은 날 가방에 저장된 사진들.
  // 가방에서 지웠거나 샘플 이야기라 실물이 없으면 이야기에 저장된 사진 스냅샷을 대신 쓴다.
  const readerDayPhotos = useMemo<ReaderDayPhoto[]>(() => {
    if (!readerStory) return [];

    const storyDate = new Date(readerStory.createdAt);
    if (Number.isNaN(storyDate.getTime())) return [];

    const sameDayPhotos = photos
      .filter((photo) => {
        if (!photo.createdAt) return false;
        const photoDate = new Date(photo.createdAt);
        return (
          photoDate.getFullYear() === storyDate.getFullYear() &&
          photoDate.getMonth() === storyDate.getMonth() &&
          photoDate.getDate() === storyDate.getDate()
        );
      })
      .map((photo) => ({ id: photo.id, uri: photo.uri }));

    if (sameDayPhotos.length > 0) return sameDayPhotos;

    return (readerStory.imageUrls ?? []).map((uri, index) => ({
      id: `${readerStory.id}-snapshot-${index}`,
      uri,
    }));
  }, [photos, readerStory]);
  const [isBagViewsOpen, setIsBagViewsOpen] = useState(false);
  const [bagViews, setBagViews] = useState<BagView[]>([]);
  const [isLoadingBagViews, setIsLoadingBagViews] = useState(false);

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
      setCanvasSize({ width, height });
    },
    [syncWalls],
  );

  const clearPhotos = useCallback(() => {
    setPhotos((current) => {
      current.forEach((photo) => World.remove(engineRef.current.world, photo.body));
      return [];
    });
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    let frameId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const delta = Math.min(time - lastTime, FIXED_TIMESTEP * 2);
      lastTime = time;
      Engine.update(engine, delta || FIXED_TIMESTEP);
      engine.world.bodies.forEach((body) => {
        releaseBodyIfStuck(body);
        keepBodyInsideWorld(body, worldSizeRef.current);
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

    const subscription = Accelerometer.addListener(({ x, y, z = 0 }: { x: number; y: number; z: number }) => {
      const engine = engineRef.current;
      const isAndroid = Platform.OS === "android";
      const axisX = isAndroid ? -x : x;
      const axisY = isAndroid ? y : -y;
      const nextShakeSample = { axisX, axisY, z };
      const nowMs = Date.now();
      const shakeImpulse = detectShakeImpulse(
        previousShakeSampleRef.current,
        nextShakeSample,
        nowMs,
        lastShakeAtRef.current,
      );
      previousShakeSampleRef.current = nextShakeSample;

      engine.world.gravity.x = Math.max(-5, Math.min(5, axisX * GRAVITY_MULT));
      engine.world.gravity.y = Math.max(-5, Math.min(5, axisY * GRAVITY_MULT));
      engine.world.gravity.scale = GRAVITY_SCALE;

      try {
        const bodies = engine.world.bodies as Matter.Body[];
        for (let i = 0; i < bodies.length; i++) {
          const body = bodies[i];
          if (body.label === "photo") {
            Body.applyForce(body, body.position, {
              x: axisX * FORCE_FACTOR * (body.mass ?? 1),
              y: axisY * FORCE_FACTOR * (body.mass ?? 1),
            });
          }
        }
        if (shakeImpulse) {
          lastShakeAtRef.current = nowMs;
          applyShakeImpulseToBodies(bodies, shakeImpulse);
        }
      } catch {
        // ignore
      }
    });

    return () => subscription.remove();
  }, []);

  const spawnPhoto = useCallback(
    (
      uri: string,
      imageSize?: ObjectSize,
      savedItem?: {
        id?: string;
        dbId?: string;
        storagePath?: string | null;
        createdAt?: string;
        objectLabel?: string | null;
        note?: string | null;
        locationName?: string | null;
        locationLatitude?: number | null;
        locationLongitude?: number | null;
      },
    ): string | null => {
      const { width: worldWidth, height: worldHeight } = worldSizeRef.current;
      if (worldWidth <= 0 || worldHeight <= 0) {
        return null;
      }

      const displaySize = getObjectDisplaySize(imageSize?.width, imageSize?.height);
      const body = createFallingPhotoBody(displaySize, worldWidth);
      World.add(engineRef.current.world, body);

      const item: PhotoItem = {
        id: savedItem?.id ?? `${Date.now()}-${body.id}`,
        uri,
        dbId: savedItem?.dbId,
        storagePath: savedItem?.storagePath,
        createdAt: savedItem?.createdAt ?? new Date().toISOString(),
        objectLabel: savedItem?.objectLabel,
        note: savedItem?.note,
        locationName: savedItem?.locationName,
        locationLatitude: savedItem?.locationLatitude,
        locationLongitude: savedItem?.locationLongitude,
        width: displaySize.width,
        height: displaySize.height,
        body,
      };

      setPhotos((prev) => [...prev, item]);
      return item.id;
    },
    [],
  );

  const reloadSavedBagItems = useCallback(async () => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    if (!user) {
      clearPhotos();
      return;
    }

    const loadId = savedItemsLoadIdRef.current + 1;
    savedItemsLoadIdRef.current = loadId;
    clearPhotos();
    setIsLoadingSavedItems(true);

    try {
      const items = await loadCurrentBagItems(user);

      if (savedItemsLoadIdRef.current !== loadId) {
        return;
      }

      items.forEach((item) => {
        spawnPhoto(
          item.imageUrl,
          { width: item.width, height: item.height },
          {
            id: item.id,
            dbId: item.id,
            storagePath: item.storagePath,
            createdAt: item.createdAt,
            objectLabel: item.objectLabel,
            note: item.note,
            locationName: item.locationName,
            locationLatitude: item.locationLatitude,
            locationLongitude: item.locationLongitude,
          },
        );
      });
    } catch (error) {
      console.warn("Saved bag items load failed.", error);
    } finally {
      if (savedItemsLoadIdRef.current === loadId) {
        setIsLoadingSavedItems(false);
      }
    }
  }, [canvasSize.height, canvasSize.width, clearPhotos, spawnPhoto, user]);

  useEffect(() => {
    void reloadSavedBagItems();
    return () => {
      savedItemsLoadIdRef.current += 1;
    };
  }, [reloadSavedBagItems]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      BAG_STACK_TAB_RESELECT_EVENT,
      () => {
        void reloadSavedBagItems();
      },
    );

    return () => subscription.remove();
  }, [reloadSavedBagItems]);

  const deletePhoto = useCallback((photoToDelete: PhotoItem) => {
    World.remove(engineRef.current.world, photoToDelete.body);
    setPhotos((current) => current.filter((photo) => photo.id !== photoToDelete.id));

    if (photoToDelete.dbId) {
      deleteBagItem(photoToDelete.dbId, photoToDelete.storagePath).catch((error) => {
        console.warn("Saved bag item delete failed.", error);
        Alert.alert("삭제 실패", "서버에서 사진을 삭제하지 못했어요.");
      });
    }
  }, []);

  const deleteSelectedPhoto = useCallback(() => {
    if (!selectedPhoto) {
      return;
    }

    const photoToDelete = selectedPhoto;

    Alert.alert("삭제하시겠습니까?", "이 사진을 내 가방에서 삭제할까요?", [
      {
        text: "아니요",
        style: "cancel",
      },
      {
        text: "예",
        style: "destructive",
        onPress: () => {
          deletePhoto(photoToDelete);
          setSelectedPhoto(null);
        },
      },
    ]);
  }, [deletePhoto, selectedPhoto]);

  const updateSelectedPhoto = useCallback(async (updates: { objectLabel: string | null; note: string | null }) => {
    if (!selectedPhoto) {
      return;
    }

    const photoToUpdate = selectedPhoto;

    if (photoToUpdate.dbId) {
      await updateBagItem(photoToUpdate.dbId, updates);
    }

    const updatedPhoto = {
      ...photoToUpdate,
      objectLabel: updates.objectLabel,
      note: updates.note,
    };

    setPhotos((current) =>
      current.map((photo) => (photo.id === photoToUpdate.id ? { ...photo, ...updatedPhoto } : photo)),
    );
    setSelectedPhoto(updatedPhoto);
  }, [selectedPhoto]);

  const downscaleForUpload = useCallback(
    async (asset: { uri: string; width?: number; height?: number }) => {
      const assetWidth = asset.width ?? 0;
      const assetHeight = asset.height ?? 0;
      const longestSide = Math.max(assetWidth, assetHeight);

      if (longestSide > 0 && longestSide <= MAX_UPLOAD_IMAGE_SIZE) {
        return { uri: asset.uri, width: assetWidth, height: assetHeight };
      }

      try {
        const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
        context.resize(
          assetWidth >= assetHeight
            ? { width: MAX_UPLOAD_IMAGE_SIZE }
            : { height: MAX_UPLOAD_IMAGE_SIZE },
        );
        const rendered = await context.renderAsync();
        const saved = await rendered.saveAsync({
          format: ImageManipulator.SaveFormat.JPEG,
          compress: 0.8,
        });
        return { uri: saved.uri, width: saved.width, height: saved.height };
      } catch (error) {
        console.warn("업로드용 이미지 축소 실패. 원본으로 진행합니다.", error);
        return { uri: asset.uri, width: assetWidth || 1024, height: assetHeight || 1024 };
      }
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
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const scaled = await downscaleForUpload(result.assets[0]);
      const width = scaled.width || 1024;
      const height = scaled.height || 1024;
      const photoLocation = await getCurrentPhotoLocation();
      const nextPhoto = {
        uri: scaled.uri,
        width,
        height,
        locationName: photoLocation.name,
        locationLatitude: photoLocation.latitude,
        locationLongitude: photoLocation.longitude,
      };

      setPendingPhoto(nextPhoto);
      setPromptBox(getDefaultPromptBox(width, height));
      setDetectionBoxes([]);
      setSelectedDetectionId(null);
      setSegmentedPreview(null);
      setIsWritingPhotoNote(false);
      setPhotoNote("");

      setIsDetecting(true);
      try {
        const detection = await detectObjectsWithDino(scaled.uri);
        const boxes = detection.boxes ?? [];
        setDetectionBoxes(boxes);

        if (boxes.length > 0) {
          setSelectedDetectionId(boxes[0].id);
          setPromptBox(boxes[0].box);
        }
      } catch (error) {
        console.warn("Grounding DINO detection failed. Falling back to default bbox.", error);
        Alert.alert(
          "객체 후보 탐지 실패",
          "Grounding DINO가 bbox 후보를 찾지 못해서 기본 박스를 사용해요.",
        );
      } finally {
        setIsDetecting(false);
      }
    }
  }, [downscaleForUpload]);

  const selectDetectionBox = useCallback((box: DinoDetectionBox) => {
    setSelectedDetectionId(box.id);
    setPromptBox(box.box);
    setSegmentedPreview(null);
  }, []);

  const movePromptBox = useCallback(
    (dx: number, dy: number) => {
      if (!pendingPhoto || !promptBox) {
        return;
      }

      setPromptBox((current) => {
        if (!current) {
          return current;
        }

        return clampPromptBox(
          {
            x0: current.x0 + dx,
            y0: current.y0 + dy,
            x1: current.x1 + dx,
            y1: current.y1 + dy,
          },
          pendingPhoto,
        );
      });
    },
    [pendingPhoto, promptBox],
  );

  const cancelSegmentPreview = useCallback(() => {
    if (isSegmenting) {
      return;
    }

    setPendingPhoto(null);
    setPromptBox(null);
    setDetectionBoxes([]);
    setSelectedDetectionId(null);
    setSegmentedPreview(null);
    setIsWritingPhotoNote(false);
    setPhotoNote("");
  }, [isSegmenting]);

  // 박스를 꾹 누르면 호출된다. 분리가 끝나면 결과 확인 화면 없이 바로 '오늘의 기록'으로 넘어간다.
  const runSegmentation = useCallback(
    async (box: Sam2PromptBox) => {
      if (!pendingPhoto || isSegmenting) {
        return;
      }

      setIsSegmenting(true);

      try {
        const segmented = await segmentImageWithSam2(pendingPhoto.uri, box, pendingPhoto);
        setSegmentedPreview(segmented);
        setIsWritingPhotoNote(true);
      } catch (error) {
        console.warn("SAM2 segmentation failed. Skipping rectangular original image.", error);
        Alert.alert(
          "SAM2 연결 실패",
          `객체 분리에 실패해서 사진을 추가하지 않았어요.\n서버 주소: ${getSam2ServerUrl()}`,
        );
      } finally {
        setIsSegmenting(false);
      }
    },
    [pendingPhoto, isSegmenting],
  );

  const scanDetectionBox = useCallback(
    (box: DinoDetectionBox) => {
      setSelectedDetectionId(box.id);
      setPromptBox(box.box);
      void runSegmentation(box.box);
    },
    [runSegmentation],
  );

  const scanPromptBox = useCallback(() => {
    if (promptBox) {
      void runSegmentation(promptBox);
    }
  }, [promptBox, runSegmentation]);

  const retuneSegmentBox = useCallback(() => {
    if (isSegmenting) {
      return;
    }

    setSegmentedPreview(null);
    setIsWritingPhotoNote(false);
  }, [isSegmenting]);

  const acceptSegmentedPreview = useCallback(async () => {
    if (!segmentedPreview) {
      return;
    }

    if (!user) {
      Alert.alert("로그인 필요", "객체를 저장하려면 다시 로그인해 주세요.");
      return;
    }

    const imageSize = {
      width: segmentedPreview.width,
      height: segmentedPreview.height,
    };
    const objectLabel = detectionBoxes
      .find((box) => box.id === selectedDetectionId)
      ?.label
      .trim() || null;
    const note = photoNote.trim() || null;
    const capturedLocation = {
      locationName: pendingPhoto?.locationName ?? DEFAULT_PHOTO_LOCATION_NAME,
      locationLatitude: pendingPhoto?.locationLatitude ?? null,
      locationLongitude: pendingPhoto?.locationLongitude ?? null,
    };

    setIsSavingBagItem(true);
    try {
      const savedItem = await saveBagItem(user, segmentedPreview.uri, imageSize, {
        objectLabel,
        note,
        ...capturedLocation,
      });

      spawnPhoto(
        savedItem.imageUrl,
        { width: savedItem.width, height: savedItem.height },
        {
          id: savedItem.id,
          dbId: savedItem.id,
          storagePath: savedItem.storagePath,
          createdAt: savedItem.createdAt,
          objectLabel: savedItem.objectLabel,
          note: savedItem.note,
          locationName: savedItem.locationName,
          locationLatitude: savedItem.locationLatitude,
          locationLongitude: savedItem.locationLongitude,
        },
      );

      setPendingPhoto(null);
      setPromptBox(null);
      setDetectionBoxes([]);
      setSelectedDetectionId(null);
      setSegmentedPreview(null);
      setIsWritingPhotoNote(false);
      setPhotoNote("");
    } catch (error) {
      console.warn("Saved bag item upload failed.", error);
      Alert.alert("가방 저장 실패", getBagItemPersistenceErrorMessage(error));
    } finally {
      setIsSavingBagItem(false);
    }
  }, [detectionBoxes, pendingPhoto, photoNote, segmentedPreview, selectedDetectionId, spawnPhoto, user]);

  const openBagViews = useCallback(async () => {
    if (!user) {
      Alert.alert("로그인 필요", "조회 기록을 보려면 다시 로그인해 주세요.");
      return;
    }

    setIsBagViewsOpen(true);
    setIsLoadingBagViews(true);

    try {
      const views = await fetchBagViews(user.id);
      setBagViews(views);
    } catch (error) {
      console.warn("Bag views load failed.", error);
      Alert.alert("조회 기록 불러오기 실패", "조회 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoadingBagViews(false);
    }
  }, [user]);

  const closeBagViews = useCallback(() => {
    setIsBagViewsOpen(false);
  }, []);

  const selectedObjectLabel =
    detectionBoxes.find((box) => box.id === selectedDetectionId)?.label ?? null;

  return (
    <View style={styles.screen}>
      <BagPhotoInfoModal
        photo={selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        onDelete={deleteSelectedPhoto}
        onUpdate={updateSelectedPhoto}
      />
      <SegmentPreviewModal
        photo={pendingPhoto}
        promptBox={promptBox}
        detectionBoxes={detectionBoxes}
        selectedDetectionId={selectedDetectionId}
        isDetecting={isDetecting}
        isSegmenting={isSegmenting}
        onSelectDetection={selectDetectionBox}
        onScanDetection={scanDetectionBox}
        onScanPromptBox={scanPromptBox}
        onMoveBox={movePromptBox}
        onCancel={cancelSegmentPreview}
      >
        <PhotoNoteModal
          visible={isWritingPhotoNote}
          photoUri={segmentedPreview?.uri}
          objectLabel={selectedObjectLabel}
          note={photoNote}
          isSaving={isSavingBagItem}
          onChangeNote={setPhotoNote}
          onBack={retuneSegmentBox}
          onSave={acceptSegmentedPreview}
        />
      </SegmentPreviewModal>
      <BagViewsModal
        visible={isBagViewsOpen}
        views={bagViews}
        isLoading={isLoadingBagViews}
        onClose={closeBagViews}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 2 }]}>
        <Image
          source={require("@/assets/images/snapbag-feed-logo.png")}
          style={styles.headerBrandLogo}
          resizeMode="contain"
        />
        <Pressable
          style={[styles.viewsBadgeButton, styles.topViewsButton, { top: insets.top + 9 }]}
          onPress={openBagViews}
          hitSlop={8}
        >
          <Text style={styles.viewsBadgeText}>조회</Text>
        </Pressable>
        <View style={styles.bagModeTabs}>
          <Pressable
            style={styles.bagModeTab}
            onPress={() => setShowHistory(false)}
            accessibilityRole="button"
            accessibilityState={{ selected: !showHistory }}
          >
            <Text style={[styles.bagModeTabText, !showHistory && styles.bagModeTabTextActive]}>
              내 가방
            </Text>
          </Pressable>
          <Pressable
            style={styles.bagModeTab}
            onPress={() => setShowHistory(true)}
            accessibilityRole="button"
            accessibilityState={{ selected: showHistory }}
          >
            <Text style={[styles.bagModeTabText, showHistory && styles.bagModeTabTextActive]}>
              이야기 책장
            </Text>
          </Pressable>
        </View>
      </View>

      {showHistory ? (
        <View style={styles.shelfWrap}>
          <View style={styles.periodBar}>
            <Pressable
              style={[styles.periodArrow, !canGoPrevMonth && styles.arrowDisabled]}
              onPress={() => shiftMonth(-1)}
              disabled={!canGoPrevMonth}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="이전 달 보기"
            >
              <Text style={styles.periodArrowText}>‹</Text>
            </Pressable>

            <Pressable
              style={styles.periodPill}
              onPress={() => setIsPeriodPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${selectedYear}년 ${selectedMonth}월. 다른 연도와 달 고르기`}
            >
              <Text style={styles.periodPillText}>{shelf.title}</Text>
              <Text style={styles.periodPillCaret}>▾</Text>
            </Pressable>

            <Pressable
              style={[styles.periodArrow, !canGoNextMonth && styles.arrowDisabled]}
              onPress={() => shiftMonth(1)}
              disabled={!canGoNextMonth}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="다음 달 보기"
            >
              <Text style={styles.periodArrowText}>›</Text>
            </Pressable>
          </View>

          <Text style={styles.periodCaption}>
            {shelf.filledCount > 0 ? `${shelf.filledCount}편의 이야기` : "아직 비어 있어요"}
          </Text>

          <View style={styles.shelfArea}>
            <MonthShelf shelf={shelf} onSelect={handleSelectDay} />
          </View>

          <View style={styles.shelfLegend}>
            {STORY_EMOTIONS.map((meta) => (
              <View key={meta.key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                <Text style={styles.legendLabel}>{meta.label}</Text>
              </View>
            ))}
          </View>

          {emptyHint ? (
            <View style={styles.hintToast} pointerEvents="none">
              <Text style={styles.hintToastText}>{emptyHint}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.canvas} onLayout={onCanvasLayout}>
            {photos.length === 0 && !isLoadingSavedItems ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>첫 번째 물건을 담아보세요</Text>
                <Text style={styles.emptyText}>
                  셔터 버튼으로 사진을 찍으면 SAM2가 물건만 잘라 이 공간에 떨어뜨립니다.
                </Text>
              </View>
            ) : null}
            {isSegmenting || isSavingBagItem || isLoadingSavedItems ? (
              <View style={styles.segmentingBadge}>
                <Text style={styles.segmentingText}>
                  {isLoadingSavedItems
                    ? "가방 불러오는 중..."
                    : isSavingBagItem
                      ? "가방 저장 중..."
                      : "SAM2 분석 중..."}
                </Text>
              </View>
            ) : null}
            {photos.map((photo) => (
              <PhysicsPhoto
                key={photo.id}
                photo={photo}
                frame={frame}
                worldSize={worldSizeRef.current}
                onOpenPhotoInfo={setSelectedPhoto}
              />
            ))}
            <Pressable
              style={[
                styles.shutterButton,
                (isSegmenting || isSavingBagItem) && styles.disabledButton,
              ]}
              onPress={pickFromCamera}
              disabled={isSegmenting || isSavingBagItem}
            >
              <View style={styles.shutterInner} />
            </Pressable>
          </View>
        </>
      )}

      <PeriodPickerSheet
        visible={isPeriodPickerOpen}
        year={selectedYear}
        month={selectedMonth}
        today={now}
        storyMonths={storyMonths}
        onSelect={selectPeriod}
        onClose={() => setIsPeriodPickerOpen(false)}
      />
      <StoryReaderModal
        story={readerStory}
        dayPhotos={readerDayPhotos}
        onClose={() => setReaderStory(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  infoOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(17, 24, 39, 0.30)",
  },
  infoCard: {
    width: "88%",
    maxWidth: 372,
    maxHeight: "80%",
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#FFFDF3",
    borderWidth: 1,
    borderColor: "rgba(230, 215, 221, 0.72)",
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
  infoCloseText: {
    color: Brand.text,
    fontSize: 34,
    lineHeight: 34,
    fontWeight: "500",
  },
  infoScroll: {
    maxHeight: "100%",
  },
  infoScrollContent: {
    paddingBottom: 18,
  },
  infoHeader: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: "#FFFDF3",
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
    fontWeight: "800",
  },
  infoTitleInput: {
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
  },
  infoCapturedAt: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
  },
  infoActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  infoActionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  infoEditButton: {
    backgroundColor: "transparent",
  },
  infoDeleteButton: {
    backgroundColor: "transparent",
  },
  infoCloseInlineButton: {
    backgroundColor: "transparent",
  },
  infoImageStage: {
    height: 172,
    marginHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(17, 24, 39, 0.14)",
    backgroundColor: Brand.surface,
  },
  infoImage: {
    width: "100%",
    height: "100%",
  },
  infoNoteSection: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 6,
    backgroundColor: "#FFFDF3",
  },
  infoNoteTitle: {
    color: Brand.muted,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
  },
  infoNoteText: {
    color: Brand.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  infoEmptyText: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  infoNoteDisplayWrap: {
    minHeight: 82,
    justifyContent: "flex-start",
    overflow: "hidden",
    position: "relative",
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
    position: "absolute",
    left: 12,
    right: 12,
    top: 29,
    gap: 19,
  },
  infoNoteRule: {
    height: 1,
    backgroundColor: "rgba(199, 184, 234, 0.24)",
  },
  infoNoteInputWrap: {
    minHeight: 104,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    backgroundColor: Brand.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoNoteInput: {
    minHeight: 70,
    padding: 0,
  },
  infoNoteCounter: {
    alignSelf: "flex-end",
    color: Brand.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  infoMapSection: {
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 0,
    gap: 6,
    backgroundColor: "#FFFDF3",
  },
  infoMapTitle: {
    color: Brand.muted,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
  },
  infoLocationName: {
    color: Brand.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  topBar: {
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
    backgroundColor: Brand.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: Brand.borderSoft,
  },
  headerBrandLogo: {
    width: 150,
    height: 34,
  },
  topViewsButton: {
    position: "absolute",
    right: H_PADDING,
  },
  bagModeTabs: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 34,
    marginTop: 4,
  },
  bagModeTab: {
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  bagModeTabText: {
    color: Brand.mutedSoft,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
  },
  bagModeTabTextActive: {
    color: Brand.text,
  },
  logoImage: {
    width: 46,
    height: 46,
    borderRadius: 12,
  },
  topCopy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topTitle: {
    color: Brand.text,
    fontSize: 22,
    fontWeight: "900",
  },
  viewsBadgeButton: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Brand.primary,
  },
  viewsBadgeText: {
    color: Brand.text,
    fontSize: 12,
    fontWeight: "900",
  },
  viewsOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    backgroundColor: "rgba(17, 24, 39, 0.42)",
  },
  viewsCard: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "66%",
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  viewsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  viewsTitleBlock: {
    flex: 1,
    gap: 3,
  },
  viewsTitle: {
    color: Brand.text,
    fontSize: 18,
    fontWeight: "900",
  },
  viewsSubtitle: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  viewsCloseButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Brand.secondary,
  },
  viewsCloseText: {
    color: Brand.text,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "900",
  },
  viewsCenter: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  viewsEmptyText: {
    color: Brand.muted,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 21,
  },
  viewsScroll: {
    maxHeight: "100%",
  },
  viewsScrollContent: {
    paddingVertical: 6,
  },
  viewsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  viewsUser: {
    flex: 1,
    color: Brand.text,
    fontSize: 15,
    fontWeight: "900",
  },
  viewsTime: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  modeToggle: {
    width: 54,
    height: 30,
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 3,
    backgroundColor: Brand.surfaceTint,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  modeToggleActive: {
    backgroundColor: Brand.lavenderDeep,
    borderColor: Brand.lavenderDeep,
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
    borderColor: Brand.primary,
    backgroundColor: "rgba(255, 252, 248, 0.88)",
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 5,
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
  segmentingBadge: {
    position: "absolute",
    alignSelf: "center",
    top: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surfaceElevated,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 6,
  },
  segmentingText: {
    color: Brand.text,
    fontSize: 13,
    fontWeight: "900",
  },
  previewScreen: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  noteComposerScreen: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  noteComposerHeader: {
    paddingHorizontal: 22,
    paddingTop: 56,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: Brand.borderSoft,
    backgroundColor: Brand.surfaceElevated,
  },
  noteComposerTitle: {
    color: Brand.text,
    fontSize: 24,
    fontWeight: "900",
  },
  noteComposerSubtitle: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  noteComposerContent: {
    flex: 1,
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
  },
  notePhotoPreview: {
    height: 214,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: Brand.surfaceElevated,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  notePhotoImage: {
    width: "78%",
    height: "78%",
  },
  noteObjectLabel: {
    alignSelf: "flex-start",
    overflow: "hidden",
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.primary,
    color: Brand.text,
    fontSize: 14,
    fontWeight: "900",
  },
  noteInputWrap: {
    minHeight: 150,
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
    backgroundColor: Brand.surfaceElevated,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
  },
  noteInput: {
    minHeight: 116,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    color: Brand.text,
    fontSize: 16,
    lineHeight: 23,
  },
  noteCounter: {
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 10,
    color: Brand.muted,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  noteComposerControls: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: Brand.borderSoft,
    backgroundColor: Brand.surfaceElevated,
  },
  notePrimaryButton: {
    backgroundColor: Brand.text,
  },
  noteSecondaryButton: {
    backgroundColor: Brand.surfaceWarm,
    borderWidth: 1,
    borderColor: Brand.borderSoft,
  },
  notePrimaryText: {
    color: Brand.surface,
    fontSize: 14,
    fontWeight: "900",
  },
  noteSecondaryText: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: "900",
  },
  previewHeader: {
    paddingHorizontal: 22,
    paddingTop: 56,
    paddingBottom: 14,
  },
  previewTitle: {
    color: Brand.text,
    fontSize: 24,
    fontWeight: "900",
  },
  previewSubtitle: {
    color: Brand.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
    fontWeight: "600",
  },
  previewStage: {
    flex: 1,
    marginHorizontal: 16,
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: "#EFE6DA",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  promptBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: Brand.lavenderDeep,
    backgroundColor: "rgba(199, 184, 234, 0.16)",
  },
  promptBoxScanning: {
    borderColor: Brand.lavenderDeep,
    backgroundColor: "rgba(199, 184, 234, 0.10)",
  },
  scanFill: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: "rgba(199, 184, 234, 0.20)",
  },
  scanBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  scanGlow: {
    height: 26,
    backgroundColor: "rgba(143, 130, 216, 0.22)",
  },
  scanLine: {
    height: 3,
    backgroundColor: Brand.lavenderDeep,
    shadowColor: Brand.lavenderDeep,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  detectedBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  detectedBoxSelected: {
    borderColor: Brand.lavenderDeep,
    backgroundColor: "rgba(199, 184, 234, 0.18)",
  },
  detectedBoxLabel: {
    position: "absolute",
    left: 6,
    top: -30,
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.66)",
  },
  detectedBoxLabelSelected: {
    backgroundColor: Brand.lavenderDeep,
  },
  detectedBoxLabelText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  detectionLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 243, 230, 0.55)",
  },
  detectionLoadingCard: {
    alignItems: "center",
    gap: 10,
    minWidth: 190,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceElevated,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  detectionLoadingLogo: {
    width: 58,
    height: 58,
    borderRadius: 14,
  },
  detectionLoadingBrand: {
    color: Brand.text,
    fontSize: 20,
    fontWeight: "900",
  },
  detectionLoadingText: {
    color: Brand.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  promptLabel: {
    position: "absolute",
    left: 8,
    top: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Brand.lavenderDeep,
  },
  promptLabelText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  promptCorner: {
    position: "absolute",
    width: 18,
    height: 18,
    borderColor: Brand.lavenderDeep,
  },
  promptCornerTopLeft: {
    left: -2,
    top: -2,
    borderLeftWidth: 3,
    borderTopWidth: 3,
  },
  promptCornerTopRight: {
    right: -2,
    top: -2,
    borderRightWidth: 3,
    borderTopWidth: 3,
  },
  promptCornerBottomLeft: {
    left: -2,
    bottom: -2,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
  },
  promptCornerBottomRight: {
    right: -2,
    bottom: -2,
    borderRightWidth: 3,
    borderBottomWidth: 3,
  },
  previewControls: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 26,
  },
  previewActions: {
    flexDirection: "row",
    gap: 12,
  },
  previewButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 18,
  },
  previewSecondaryButton: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  previewSecondaryText: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: "900",
  },
  objectLayer: {
    position: "absolute",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    elevation: 0,
    shadowOpacity: 0,
    overflow: "visible",
  },
  objectImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
  shelfWrap: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  // 연/월 선택: 가로 스크롤 스트립 두 줄 대신 화살표 + 현재 월 한 줄로 통합했다.
  periodBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 10,
  },
  periodArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  periodArrowText: {
    color: Brand.text,
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "800",
  },
  arrowDisabled: {
    opacity: 0.3,
  },
  periodPill: {
    minWidth: 150,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    backgroundColor: Brand.text,
  },
  periodPillText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  periodPillCaret: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "900",
  },
  periodCaption: {
    marginTop: 7,
    marginBottom: 10,
    textAlign: "center",
    color: "#8E7BB8",
    fontSize: 12,
    fontWeight: "800",
  },
  pickerBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "rgba(26,22,34,0.5)",
  },
  pickerCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: Brand.surfaceElevated,
    borderWidth: 1,
    borderColor: Brand.border,
    shadowColor: Brand.text,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  pickerYearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  pickerYearArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerYearArrowText: {
    color: Brand.text,
    fontSize: 24,
    lineHeight: 27,
    fontWeight: "800",
  },
  pickerYearText: {
    color: Brand.text,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  pickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  pickerMonth: {
    width: "23%",
    height: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  pickerMonthActive: {
    backgroundColor: "#EEE7FA",
    borderColor: "#A88FE0",
    borderWidth: 2,
  },
  pickerMonthDisabled: {
    opacity: 0.35,
  },
  pickerMonthText: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: "800",
  },
  pickerMonthTextActive: {
    color: "#5C4B86",
  },
  pickerMonthTextDisabled: {
    color: Brand.muted,
  },
  pickerMonthDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#B4A0E0",
  },
  pickerMonthDotActive: {
    backgroundColor: "#7C63B6",
  },
  pickerMonthDotPlaceholder: {
    width: 5,
    height: 5,
  },
  // 책장은 스크롤 없이 남은 세로 공간을 그대로 채운다.
  shelfArea: {
    flex: 1,
    paddingHorizontal: HISTORY_H_PADDING,
  },
  shelfBoard: {
    flex: 1,
    backgroundColor: "#2A2633",
    borderRadius: 18,
    paddingHorizontal: SHELF_BOARD_PADDING,
    paddingTop: 12,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: "#3B3547",
    shadowColor: "#241F2E",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  shelfRow: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 8,
  },
  shelfSpines: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    columnGap: SPINE_GAP,
  },
  shelfLedge: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#17141F",
    marginTop: 3,
  },
  spine: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
    overflow: "hidden",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  spineFilled: {
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 4,
    shadowOffset: { width: 1, height: 2 },
  },
  spineCap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 7,
    opacity: 0.92,
  },
  spineDay: {
    marginBottom: 5,
    color: "rgba(255,255,255,0.92)",
    fontSize: 10,
    fontWeight: "800",
  },
  shelfLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 14,
    rowGap: 6,
    justifyContent: "center",
    paddingTop: 12,
    paddingBottom: 6,
    paddingHorizontal: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 11,
    height: 11,
    borderRadius: 3,
  },
  legendLabel: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  hintToast: {
    // 하단 감정 범례를 가리지 않도록 책장 위쪽에 띄운다.
    position: "absolute",
    bottom: 72,
    alignSelf: "center",
    backgroundColor: "rgba(42,38,51,0.94)",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
  },
  hintToastText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  readerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,22,34,0.55)",
    justifyContent: "flex-end",
  },
  readerBackdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  readerSheet: {
    height: "86%",
    backgroundColor: Brand.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    overflow: "hidden",
  },
  readerHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D8CFE0",
    marginBottom: 6,
  },
  readerScroller: {
    flex: 1,
  },
  readerScroll: {
    paddingBottom: 24,
  },
  readerImage: {
    width: "100%",
    // 고정 높이 + cover가 그림 하단을 잘라내던 문제를 4:3 비율 고정으로 해결.
    aspectRatio: 4 / 3,
    backgroundColor: Brand.secondary,
  },
  readerBody: {
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  readerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  emotionChip: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 12,
  },
  emotionChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  readerDate: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  readerTitle: {
    color: Brand.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  readerDivider: {
    height: 1,
    backgroundColor: "#EEE8E6",
    marginVertical: 14,
  },
  readerText: {
    color: "#3A3540",
    fontSize: 15,
    lineHeight: 25,
  },
  readerTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
  },
  readerTag: {
    backgroundColor: "#F1ECFB",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 12,
  },
  readerBagSection: {
    marginTop: 26,
  },
  readerBagTitle: {
    color: Brand.text,
    fontSize: 17,
    fontWeight: "900",
  },
  readerBagHint: {
    color: Brand.muted,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 14,
  },
  readerBagHandle: {
    alignSelf: "center",
    width: 92,
    height: 34,
    borderTopLeftRadius: 46,
    borderTopRightRadius: 46,
    borderWidth: 5,
    borderBottomWidth: 0,
    borderColor: Brand.border,
    marginBottom: -6,
    zIndex: 1,
  },
  readerBagBody: {
    height: 216,
    borderRadius: 22,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    borderWidth: 2,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceWarm,
    overflow: "hidden",
  },
  readerBagPhoto: {
    position: "absolute",
    width: 74,
    height: 74,
  },
  readerBagPhotoImage: {
    width: "100%",
    height: "100%",
  },
  readerBagMoreBadge: {
    position: "absolute",
    right: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  readerBagMoreText: {
    color: Brand.text,
    fontSize: 12,
    fontWeight: "900",
  },
  readerTagText: {
    color: "#725E98",
    fontSize: 12,
    fontWeight: "700",
  },
  readerClose: {
    marginHorizontal: 22,
    marginTop: 16,
    height: 52,
    borderRadius: 18,
    backgroundColor: Brand.text,
    alignItems: "center",
    justifyContent: "center",
  },
  readerCloseText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.64,
  },
  shutterButton: {
    position: "absolute",
    bottom: 22,
    alignSelf: "center",
    width: 78,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 39,
    backgroundColor: Brand.surface,
    borderWidth: 2,
    borderColor: Brand.border,
    shadowColor: Brand.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 12,
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
});
