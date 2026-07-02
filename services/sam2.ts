import Constants from "expo-constants";
import { Platform } from "react-native";

type SegmentResponse = {
  image: string;
  overlayImage?: string;
  score: number;
  bbox: [number, number, number, number];
  promptBox?: [number, number, number, number];
  width: number;
  height: number;
  cutoutWidth: number;
  cutoutHeight: number;
};

type DetectionResponse = {
  width: number;
  height: number;
  prompt?: string;
  boxes: DinoDetectionBox[];
};

type ImageSize = {
  width: number;
  height: number;
};

export type Sam2PromptBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type DinoDetectionBox = {
  id: string;
  label: string;
  dinoLabel?: string;
  score: number;
  box: Sam2PromptBox;
  area?: number;
};

export type Sam2SegmentResult = {
  uri: string;
  overlayUri?: string;
  usedSam2: boolean;
  score?: number;
  width: number;
  height: number;
};

function getDefaultServerUrl() {
  const hostUri = Constants.expoConfig?.hostUri;
  const devServerHost = hostUri?.split(":")[0];

  if (devServerHost) {
    return `http://${devServerHost}:8000`;
  }

  return Platform.select({
    android: "http://10.0.2.2:8000",
    default: "http://localhost:8000",
  });
}

const SAM2_SERVER_URL =
  process.env.EXPO_PUBLIC_SAM2_SERVER_URL?.replace(/\/$/, "") ?? getDefaultServerUrl();

async function imageUriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

function buildSegmentUrl(box?: Sam2PromptBox, imageSize?: ImageSize) {
  const url = new URL(`${SAM2_SERVER_URL}/segment`);

  if (box) {
    url.searchParams.set("box_x0", String(Math.round(box.x0)));
    url.searchParams.set("box_y0", String(Math.round(box.y0)));
    url.searchParams.set("box_x1", String(Math.round(box.x1)));
    url.searchParams.set("box_y1", String(Math.round(box.y1)));
  }

  if (imageSize) {
    url.searchParams.set("image_width", String(Math.round(imageSize.width)));
    url.searchParams.set("image_height", String(Math.round(imageSize.height)));
  }

  return url.toString();
}

export async function segmentImageWithSam2(
  uri: string,
  box?: Sam2PromptBox,
  imageSize?: ImageSize,
): Promise<Sam2SegmentResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const imageBlob = await imageUriToBlob(uri);
    const response = await fetch(buildSegmentUrl(box, imageSize), {
      method: "POST",
      headers: {
        "Content-Type": imageBlob.type || "application/octet-stream",
      },
      body: imageBlob as unknown as BodyInit,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`SAM2 server responded with ${response.status}`);
    }

    const data = (await response.json()) as SegmentResponse;
    return {
      uri: data.image,
      overlayUri: data.overlayImage,
      usedSam2: true,
      score: data.score,
      width: data.cutoutWidth,
      height: data.cutoutHeight,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function detectObjectsWithDino(uri: string): Promise<DetectionResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const imageBlob = await imageUriToBlob(uri);
    const response = await fetch(`${SAM2_SERVER_URL}/detect`, {
      method: "POST",
      headers: {
        "Content-Type": imageBlob.type || "application/octet-stream",
      },
      body: imageBlob as unknown as BodyInit,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Grounding DINO server responded with ${response.status}`);
    }

    return (await response.json()) as DetectionResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getSam2ServerUrl() {
  return SAM2_SERVER_URL;
}
