import Constants from "expo-constants";
import { Platform } from "react-native";

type SegmentResponse = {
  image: string;
  score: number;
  bbox: [number, number, number, number];
  width: number;
  height: number;
  cutoutWidth: number;
  cutoutHeight: number;
};

export type Sam2SegmentResult = {
  uri: string;
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

export async function segmentImageWithSam2(uri: string): Promise<Sam2SegmentResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const imageBlob = await imageUriToBlob(uri);
    const response = await fetch(`${SAM2_SERVER_URL}/segment`, {
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
      usedSam2: true,
      score: data.score,
      width: data.cutoutWidth,
      height: data.cutoutHeight,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getSam2ServerUrl() {
  return SAM2_SERVER_URL;
}
