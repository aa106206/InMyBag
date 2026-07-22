import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import Matter, { Bodies, Body, Engine, World } from "matter-js";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Dimensions,
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

const DEFAULT_OBJECT_SIZE = 92;
const MAX_OBJECT_SIZE = 132;
const MIN_OBJECT_SIZE = 72;
const H_PADDING = 16;
const WALL_THICKNESS = 60;
const FIXED_TIMESTEP = 1000 / 60;
const MAX_PHOTO_NOTE_LENGTH = 120;
const DEFAULT_PHOTO_LOCATION_NAME = "위치 정보 없음";

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
function spineHeight(day: number, filled: boolean) {
  if (!filled) return 94;
  return 98 + [0, 7, 3, 10, 5, 2][day % 6];
}

function formatReaderDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

const SPINES_PER_ROW = 10;
const SPINE_GAP = 5;
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
    width: DEFAULT_OBJECT_SIZE,
    height: DEFAULT_OBJECT_SIZE,
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

  return {
    x: Math.max(halfWidth, Math.min(worldSize.width - halfWidth, position.x)),
    y: Math.max(halfHeight, Math.min(worldSize.height - halfHeight, position.y)),
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

function SegmentPreviewModal({
  photo,
  promptBox,
  detectionBoxes,
  selectedDetectionId,
  segmentedResult,
  isDetecting,
  isSegmenting,
  onSelectDetection,
  onMoveBox,
  onCancel,
  onConfirm,
  onRetune,
  onAccept,
  isSaving,
  children,
}: {
  photo: PendingPhoto | null;
  promptBox: Sam2PromptBox | null;
  detectionBoxes: DinoDetectionBox[];
  selectedDetectionId: string | null;
  segmentedResult: Sam2SegmentResult | null;
  isDetecting: boolean;
  isSegmenting: boolean;
  onSelectDetection: (box: DinoDetectionBox) => void;
  onMoveBox: (dx: number, dy: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRetune: () => void;
  onAccept: () => void;
  isSaving: boolean;
  children?: ReactNode;
}) {
  const [previewSize, setPreviewSize] = useState<ObjectSize>({ width: 0, height: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const photoRef = useRef<PendingPhoto | null>(null);
  const imageFrameRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = { x: 0, y: 0 };
      },
      onPanResponderMove: (_, gestureState) => {
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
    }),
  ).current;

  if (!photo || !promptBox) {
    return null;
  }

  const imageFrame = getAspectFitFrame(previewSize, photo);
  const overlayBox = getOverlayBox(promptBox, photo, imageFrame);
  photoRef.current = photo;
  imageFrameRef.current = imageFrame;
  const hasSegmentedResult = Boolean(segmentedResult);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <View style={styles.previewScreen}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>
            {hasSegmentedResult ? "Segment 결과 확인" : "Segment 영역 확인"}
          </Text>
          <Text style={styles.previewSubtitle}>
            {hasSegmentedResult
              ? "분리된 객체가 괜찮으면 가방에 추가해요."
              : isDetecting
                ? "Grounding DINO가 이미지 속 객체 후보를 찾고 있어요."
                : "DINO가 찾은 박스 중 하나를 고르고 필요하면 조정해요."}
          </Text>
        </View>

        {segmentedResult ? (
          <View style={styles.resultStage}>
            {segmentedResult.overlayUri ? (
              <View style={styles.resultOverlayCard}>
                <Text style={styles.resultCardTitle}>Segment 표시</Text>
                <View style={styles.segmentedOverlayFrame}>
                  <Image
                    source={{ uri: segmentedResult.overlayUri }}
                    style={styles.segmentedOverlayImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.resultPreviewCard}>
              <Text style={styles.resultCardTitle}>분리된 객체</Text>
              <View style={styles.segmentedObjectFrame}>
                <Image
                  source={{ uri: segmentedResult.uri }}
                  style={styles.segmentedObjectImage}
                  resizeMode="contain"
                />
              </View>
            </View>
          </View>
        ) : (
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
                  {
                    left: overlayBox.x,
                    top: overlayBox.y,
                    width: overlayBox.width,
                    height: overlayBox.height,
                  },
                ]}
                {...panResponder.panHandlers}
              >
                <View style={styles.promptLabel}>
                  <Text style={styles.promptLabelText}>물건 선택하기</Text>
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
                  <Text style={styles.detectionLoadingText}>객체 후보 탐지중 ..</Text>
                </View>
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.previewControls}>
          <View style={styles.previewActions}>
            {segmentedResult ? (
              <>
                <Pressable
                  style={[styles.previewButton, styles.previewSecondaryButton]}
                  onPress={onRetune}
                  disabled={isSegmenting}
                >
                  <Text style={styles.previewSecondaryText}>물건 다시 선택</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.previewButton,
                    styles.previewPrimaryButton,
                    isSaving && styles.disabledButton,
                  ]}
                  onPress={onAccept}
                  disabled={isSegmenting || isSaving}
                >
                  <Text style={styles.previewPrimaryText}>
                    {isSaving ? "저장 중..." : "가방에 추가"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={[styles.previewButton, styles.previewSecondaryButton]}
                  onPress={onCancel}
                  disabled={isSegmenting}
                >
                  <Text style={styles.previewSecondaryText}>다시 찍기</Text>
                </Pressable>
                {!isDetecting ? (
                  <Pressable
                    style={[
                      styles.previewButton,
                      styles.previewPrimaryButton,
                      isSegmenting && styles.disabledButton,
                    ]}
                    onPress={onConfirm}
                    disabled={isSegmenting}
                  >
                    <Text style={styles.previewPrimaryText}>
                      {isSegmenting ? "분리 중..." : "물건 선택하기"}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
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
          <Text style={styles.noteComposerTitle}>오늘의 기록</Text>
          <Text style={styles.noteComposerSubtitle}>
            이 물건과 함께 남기고 싶은 짧은 글을 적어보세요.
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
              placeholder="오늘 이 물건과 함께한 순간을 적어보세요."
              placeholderTextColor="rgba(255,255,255,0.42)"
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
            style={[styles.previewButton, styles.previewSecondaryButton]}
            onPress={onBack}
            disabled={isSaving}
          >
            <Text style={styles.previewSecondaryText}>이전</Text>
          </Pressable>
          <Pressable
            style={[
              styles.previewButton,
              styles.previewPrimaryButton,
              isSaving && styles.disabledButton,
            ]}
            onPress={onSave}
            disabled={isSaving}
          >
            <Text style={styles.previewPrimaryText}>
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
                      size={23}
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
                    <IconSymbol name="trash.fill" size={24} color="#E5484D" />
                  </Pressable>
                </View>
              </View>
              <View style={styles.infoImageStage}>
                <Image source={{ uri: photo.uri }} style={styles.infoImage} resizeMode="contain" />
              </View>
              {isEditing ? (
                <View style={styles.infoNoteSection}>
                  <Text style={styles.infoNoteTitle}>기록</Text>
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
              ) : photo.note ? (
                <View style={styles.infoNoteSection}>
                  <Text style={styles.infoNoteTitle}>기록</Text>
                  <Text style={styles.infoNoteText}>{photo.note}</Text>
                </View>
              ) : null}
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
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  bodyRef.current = photo.body;
  photoSizeRef.current = { width: photo.width, height: photo.height };
  worldSizeRef.current = worldSize;
  openPhotoInfoRef.current = onOpenPhotoInfo;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const body = bodyRef.current;
        dragStartRef.current = { x: body.position.x, y: body.position.y };
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          openPhotoInfoRef.current(photo);
        }, 1000);
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
        clearLongPressTimer();
        const body = bodyRef.current;
        Body.setPosition(
          body,
          clampPhotoPosition(body.position, photoSizeRef.current, worldSizeRef.current),
        );
        Body.setStatic(body, false);
        Body.setVelocity(body, {
          x: limitThrowSpeed(gestureState.vx * 4),
          y: limitThrowSpeed(gestureState.vy * 4),
        });
      },
      onPanResponderTerminate: () => {
        clearLongPressTimer();
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
  const height = spineHeight(item.day, filled);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        filled ? `${item.dateLabel} 이야기 · ${theme?.label}` : `${item.dateLabel} 빈 자리`
      }
      style={[
        styles.spine,
        { width: SPINE_WIDTH, height, backgroundColor: filled ? theme!.color : "#413C4A" },
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

  return (
    <View style={styles.monthShelf}>
      <View style={styles.monthHeader}>
        <Text style={styles.monthTitle}>{shelf.title}</Text>
        <Text style={styles.monthCount}>
          {shelf.filledCount > 0 ? `${shelf.filledCount}편의 이야기` : "아직 비어 있어요"}
        </Text>
      </View>
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
    </View>
  );
}

function StoryReaderModal({
  story,
  onClose,
}: {
  story: GeneratedStory | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!story) return null;

  const theme = storyTheme(story);
  const image = story.illustrationUrl || story.imageUrls?.[0];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.readerBackdrop} onPress={onClose}>
        <Pressable style={[styles.readerSheet, { paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          <View style={styles.readerHandle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.readerScroll}>
            {image ? <Image source={{ uri: image }} style={styles.readerImage} resizeMode="cover" /> : null}
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
            </View>
          </ScrollView>
          <Pressable style={styles.readerClose} onPress={onClose}>
            <Text style={styles.readerCloseText}>책 덮기</Text>
          </Pressable>
        </Pressable>
      </Pressable>
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

  const years = useMemo(() => {
    const list: number[] = [];
    for (let year = now.getFullYear(); year >= SHELF_START_YEAR; year -= 1) {
      list.push(year);
    }
    return list;
  }, [now]);

  const dayStoryMap = useMemo(() => buildDayStoryMap(stories), [stories]);
  const storyMonths = useMemo(() => collectStoryMonths(stories), [stories]);
  const shelf = useMemo(
    () => buildShelfForMonth(selectedYear, selectedMonth - 1, dayStoryMap),
    [selectedYear, selectedMonth, dayStoryMap],
  );

  // 선택한 연도가 올해면 다음 달(미래)은 고르지 못하게 막는다.
  const maxMonthForYear =
    selectedYear === now.getFullYear() ? now.getMonth() + 1 : 12;
  const selectYear = useCallback(
    (year: number) => {
      setSelectedYear(year);
      const cap = year === now.getFullYear() ? now.getMonth() + 1 : 12;
      setSelectedMonth((month) => Math.min(month, cap));
    },
    [now],
  );

  // 책장을 열 때마다 저장된 이야기를 다시 불러와 최신 상태로 채운다.
  useEffect(() => {
    if (!showHistory || !user) return;
    let active = true;
    loadStories(user.id)
      .then((loaded) => {
        if (active) setStories(loaded);
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

    const subscription = Accelerometer.addListener(({ x, y }: { x: number; y: number; z: number }) => {
      const engine = engineRef.current;
      const isAndroid = Platform.OS === "android";
      const axisX = isAndroid ? -x : x;
      const axisY = isAndroid ? y : -y;

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
      const asset = result.assets[0];
      const width = asset.width || 1024;
      const height = asset.height || 1024;
      const photoLocation = await getCurrentPhotoLocation();
      const nextPhoto = {
        uri: asset.uri,
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
        const detection = await detectObjectsWithDino(asset.uri);
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
  }, []);

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

  const confirmSegmentPreview = useCallback(async () => {
    if (!pendingPhoto || !promptBox) {
      return;
    }

    setIsSegmenting(true);

    try {
      const segmented = await segmentImageWithSam2(pendingPhoto.uri, promptBox, pendingPhoto);
      setSegmentedPreview(segmented);
    } catch (error) {
      console.warn("SAM2 segmentation failed. Skipping rectangular original image.", error);
      Alert.alert(
        "SAM2 연결 실패",
        `객체 분리에 실패해서 사진을 추가하지 않았어요.\n서버 주소: ${getSam2ServerUrl()}`,
      );
    } finally {
      setIsSegmenting(false);
    }
  }, [pendingPhoto, promptBox]);

  const retuneSegmentBox = useCallback(() => {
    if (isSegmenting) {
      return;
    }

    setSegmentedPreview(null);
    setIsWritingPhotoNote(false);
  }, [isSegmenting]);

  const openPhotoNoteComposer = useCallback(() => {
    if (segmentedPreview) {
      setIsWritingPhotoNote(true);
    }
  }, [segmentedPreview]);

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
        segmentedResult={segmentedPreview}
        isDetecting={isDetecting}
        isSegmenting={isSegmenting}
        onSelectDetection={selectDetectionBox}
        onMoveBox={movePromptBox}
        onCancel={cancelSegmentPreview}
        onConfirm={confirmSegmentPreview}
        onRetune={retuneSegmentBox}
        onAccept={openPhotoNoteComposer}
        isSaving={isSavingBagItem}
      >
        <PhotoNoteModal
          visible={isWritingPhotoNote}
          photoUri={segmentedPreview?.uri}
          objectLabel={selectedObjectLabel}
          note={photoNote}
          isSaving={isSavingBagItem}
          onChangeNote={setPhotoNote}
          onBack={() => setIsWritingPhotoNote(false)}
          onSave={acceptSegmentedPreview}
        />
      </SegmentPreviewModal>

      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Image source={require("@/assets/images/SnapBag.png")} style={styles.logoImage} />
        <View style={styles.topCopy}>
          <Text style={styles.topTitle}>{showHistory ? "이야기 책장" : "내 가방"}</Text>
        </View>
        <Pressable
          style={[styles.modeToggle, showHistory ? styles.modeToggleActive : undefined]}
          onPress={() => setShowHistory((value) => !value)}
        >
          <View style={[styles.toggleThumb, showHistory ? styles.toggleThumbActive : undefined]} />
        </Pressable>
      </View>

      {showHistory ? (
        <View style={styles.shelfWrap}>
          <View style={styles.yearStripWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.yearStrip}
            >
              {years.map((year) => {
                const active = year === selectedYear;
                return (
                  <Pressable
                    key={year}
                    onPress={() => selectYear(year)}
                    style={[styles.yearChip, active && styles.yearChipActive]}
                  >
                    <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>
                      {year}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.monthStripWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.monthStrip}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
                const active = month === selectedMonth;
                const disabled = month > maxMonthForYear;
                const hasStories = storyMonths.has(`${selectedYear}-${month - 1}`);
                return (
                  <Pressable
                    key={month}
                    disabled={disabled}
                    onPress={() => setSelectedMonth(month)}
                    style={[
                      styles.monthChip,
                      active && styles.monthChipActive,
                      disabled && styles.monthChipDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthChipText,
                        active && styles.monthChipTextActive,
                        disabled && styles.monthChipTextDisabled,
                      ]}
                    >
                      {month}월
                    </Text>
                    {hasStories ? (
                      <View style={[styles.monthDot, active && styles.monthDotActive]} />
                    ) : (
                      <View style={styles.monthDotPlaceholder} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView
            style={styles.history}
            contentContainerStyle={styles.historyContent}
            showsVerticalScrollIndicator={false}
          >
            <MonthShelf shelf={shelf} onSelect={handleSelectDay} />
            <View style={styles.shelfLegend}>
              {STORY_EMOTIONS.map((meta) => (
                <View key={meta.key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                  <Text style={styles.legendLabel}>{meta.label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
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

      <StoryReaderModal story={readerStory} onClose={() => setReaderStory(null)} />
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
    paddingHorizontal: 22,
    backgroundColor: "rgba(17, 24, 39, 0.42)",
  },
  infoCard: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "66%",
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  infoCloseButton: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 20,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.84)",
  },
  infoCloseText: {
    color: Brand.text,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "900",
  },
  infoScroll: {
    maxHeight: "100%",
  },
  infoScrollContent: {
    paddingBottom: 14,
  },
  infoHeader: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    fontWeight: "900",
  },
  infoTitleInput: {
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  infoCapturedAt: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  infoActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginRight: 28,
  },
  infoActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  infoEditButton: {
    backgroundColor: Brand.secondary,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  infoDeleteButton: {
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "rgba(229, 72, 77, 0.22)",
  },
  infoImageStage: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: Brand.secondary,
  },
  infoImage: {
    width: "86%",
    height: 220,
  },
  infoNoteSection: {
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  infoNoteTitle: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  infoNoteText: {
    color: Brand.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  infoNoteInputWrap: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoNoteInput: {
    minHeight: 82,
    padding: 0,
  },
  infoNoteCounter: {
    alignSelf: "flex-end",
    color: Brand.muted,
    fontSize: 12,
    fontWeight: "800",
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
    fontWeight: "900",
  },
  infoLocationName: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: "800",
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
    color: Brand.text,
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
    borderColor: Brand.primary,
    backgroundColor: "rgba(255,255,255,0.74)",
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
    backgroundColor: Brand.primary,
  },
  segmentingText: {
    color: Brand.text,
    fontSize: 13,
    fontWeight: "900",
  },
  previewScreen: {
    flex: 1,
    backgroundColor: "#050505",
  },
  noteComposerScreen: {
    flex: 1,
    backgroundColor: "#101014",
  },
  noteComposerHeader: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  noteComposerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  noteComposerSubtitle: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  noteComposerContent: {
    flex: 1,
    gap: 14,
    padding: 20,
  },
  notePhotoPreview: {
    height: 210,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: Brand.secondary,
  },
  notePhotoImage: {
    width: "82%",
    height: "82%",
  },
  noteObjectLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  noteInputWrap: {
    minHeight: 150,
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "#19191F",
  },
  noteInput: {
    minHeight: 116,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 23,
  },
  noteCounter: {
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 10,
    color: "rgba(255,255,255,0.5)",
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
    borderTopColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#101014",
  },
  previewHeader: {
    paddingHorizontal: 18,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: "#101014",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  previewTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  previewSubtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  previewStage: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  resultStage: {
    flex: 1,
    gap: 12,
    padding: 16,
    backgroundColor: "#000000",
  },
  resultOverlayCard: {
    flex: 1.15,
    minHeight: 260,
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#16161A",
  },
  resultPreviewCard: {
    flex: 0.85,
    minHeight: 190,
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#16161A",
  },
  resultCardTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  segmentedOverlayFrame: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 12,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#000000",
  },
  segmentedOverlayImage: {
    width: "100%",
    height: "100%",
  },
  segmentedObjectFrame: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 10,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#EDF1F5",
  },
  segmentedObjectImage: {
    width: "100%",
    height: "100%",
  },
  promptBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: Brand.primary,
    backgroundColor: "rgba(255, 158, 187, 0.14)",
  },
  detectedBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  detectedBoxSelected: {
    borderColor: Brand.primary,
    backgroundColor: "rgba(255, 158, 187, 0.16)",
  },
  detectedBoxLabel: {
    position: "absolute",
    left: 6,
    top: -30,
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  detectedBoxLabelSelected: {
    backgroundColor: Brand.primary,
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
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  detectionLoadingCard: {
    alignItems: "center",
    gap: 10,
    minWidth: 190,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(16,16,20,0.88)",
  },
  detectionLoadingLogo: {
    width: 58,
    height: 58,
    borderRadius: 14,
  },
  detectionLoadingBrand: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  detectionLoadingText: {
    color: "rgba(255,255,255,0.82)",
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
    backgroundColor: Brand.primary,
  },
  promptLabelText: {
    color: Brand.text,
    fontSize: 12,
    fontWeight: "900",
  },
  promptCorner: {
    position: "absolute",
    width: 18,
    height: 18,
    borderColor: "#FFFFFF",
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
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: "#101014",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  previewActions: {
    flexDirection: "row",
    gap: 12,
  },
  previewButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 8,
  },
  previewPrimaryButton: {
    backgroundColor: Brand.primary,
  },
  previewSecondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  previewPrimaryText: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: "900",
  },
  previewSecondaryText: {
    color: "#FFFFFF",
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
  yearStripWrap: {
    backgroundColor: Brand.secondary,
  },
  yearStrip: {
    paddingHorizontal: HISTORY_H_PADDING,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  yearChipActive: {
    backgroundColor: Brand.text,
    borderColor: Brand.text,
  },
  yearChipText: {
    color: Brand.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  yearChipTextActive: {
    color: "#FFFFFF",
  },
  monthStripWrap: {
    backgroundColor: Brand.secondary,
  },
  monthStrip: {
    paddingHorizontal: HISTORY_H_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 7,
  },
  monthChip: {
    minWidth: 46,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 13,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: "center",
    gap: 4,
  },
  monthChipActive: {
    backgroundColor: "#EEE7FA",
    borderColor: "#C9B8EC",
  },
  monthChipDisabled: {
    opacity: 0.4,
  },
  monthChipText: {
    color: Brand.text,
    fontSize: 13,
    fontWeight: "800",
  },
  monthChipTextActive: {
    color: "#5C4B86",
  },
  monthChipTextDisabled: {
    color: Brand.muted,
  },
  monthDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#B4A0E0",
  },
  monthDotActive: {
    backgroundColor: "#7C63B6",
  },
  monthDotPlaceholder: {
    width: 5,
    height: 5,
  },
  history: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  historyContent: {
    paddingHorizontal: HISTORY_H_PADDING,
    paddingTop: 4,
    paddingBottom: 28,
  },
  monthShelf: {
    marginBottom: 22,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  monthTitle: {
    color: Brand.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  monthCount: {
    color: "#8E7BB8",
    fontSize: 12,
    fontWeight: "800",
  },
  shelfBoard: {
    backgroundColor: "#2A2633",
    borderRadius: 18,
    paddingHorizontal: SHELF_BOARD_PADDING,
    paddingTop: 14,
    paddingBottom: 6,
    borderWidth: 1,
    borderColor: "#3B3547",
    shadowColor: "#241F2E",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  shelfRow: {
    marginBottom: 12,
  },
  shelfSpines: {
    flexDirection: "row",
    alignItems: "flex-end",
    columnGap: SPINE_GAP,
    minHeight: 110,
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
    marginBottom: 4,
    color: "rgba(255,255,255,0.9)",
    fontSize: 9,
    fontWeight: "800",
  },
  shelfLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "center",
    marginTop: 6,
    paddingHorizontal: 8,
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
    position: "absolute",
    bottom: 24,
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
  readerSheet: {
    maxHeight: "88%",
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
  readerScroll: {
    paddingBottom: 12,
  },
  readerImage: {
    width: "100%",
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
  readerTagText: {
    color: "#725E98",
    fontSize: 12,
    fontWeight: "700",
  },
  readerClose: {
    marginHorizontal: 22,
    marginTop: 8,
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
