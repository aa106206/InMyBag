import { File as ExpoFile } from 'expo-file-system';
import type { User } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';

const PROFILE_IMAGE_BUCKET = 'bag-items';
const PROFILE_IMAGE_SIGNED_URL_SECONDS = 60 * 60 * 24;

type UploadImageData = {
  body: ArrayBuffer;
  contentType: string;
  extension: string;
};

export type CurrentProfile = {
  avatarUrl: string | null;
  // 비공개 계정이면 서로 친구인 사람에게만 가방이 공개되고 둘러보기에서 빠진다.
  isPrivate: boolean;
};

// is_private 컬럼 마이그레이션을 아직 적용하지 않은 DB에서도 동작하도록 판별한다.
function isMissingPrivacyColumnError(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === '42703'
    || error.code === 'PGRST204'
    || (error.message ?? '').includes('is_private');
}

function getProfileImageStoragePath(value: string | null) {
  if (!value) {
    return null;
  }

  if (!value.startsWith('http')) {
    return value.includes('/') ? value : null;
  }

  const marker = `/object/public/${PROFILE_IMAGE_BUCKET}/`;
  const markerIndex = value.indexOf(marker);

  if (markerIndex >= 0) {
    return decodeURIComponent(value.slice(markerIndex + marker.length).split('?')[0]);
  }

  const signedMarker = `/object/sign/${PROFILE_IMAGE_BUCKET}/`;
  const signedMarkerIndex = value.indexOf(signedMarker);

  if (signedMarkerIndex >= 0) {
    return decodeURIComponent(value.slice(signedMarkerIndex + signedMarker.length).split('?')[0]);
  }

  return null;
}

export async function resolveProfileAvatarUrl(value: string | null) {
  const storagePath = getProfileImageStoragePath(value);

  if (!storagePath) {
    return value;
  }

  const { data, error } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .createSignedUrl(storagePath, PROFILE_IMAGE_SIGNED_URL_SECONDS);

  if (error) {
    console.warn('Profile avatar signed URL failed.', error);
    return value && value.startsWith('http') ? value : null;
  }

  return data.signedUrl;
}

function getImageExtension(uri: string, contentType?: string) {
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) {
    return 'jpg';
  }

  if (contentType?.includes('webp')) {
    return 'webp';
  }

  const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase();

  if (extension === 'jpeg' || extension === 'jpg') {
    return 'jpg';
  }

  if (extension === 'webp') {
    return 'webp';
  }

  return 'png';
}

function getImageContentType(extension: string) {
  return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
}

function decodeBase64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
}

async function getUploadImageData(uri: string): Promise<UploadImageData> {
  const dataUriMatch = uri.match(/^data:([^;,]+)?(;base64)?,(.*)$/);

  if (dataUriMatch) {
    const contentType = dataUriMatch[1] || 'image/png';
    const isBase64 = dataUriMatch[2] === ';base64';
    const payload = dataUriMatch[3];

    if (!isBase64) {
      throw new Error('Only base64 data image URIs are supported.');
    }

    return {
      body: decodeBase64ToArrayBuffer(payload),
      contentType,
      extension: getImageExtension(uri, contentType),
    };
  }

  if (uri.startsWith('file://') || uri.startsWith('content://')) {
    const extension = getImageExtension(uri);
    const bytes = await new ExpoFile(uri).bytes();

    return {
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      contentType: getImageContentType(extension),
      extension,
    };
  }

  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Profile image load failed: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';

  return {
    body: await response.arrayBuffer(),
    contentType,
    extension: getImageExtension(uri, contentType),
  };
}

async function ensureProfile(user: User) {
  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        username: user.user_metadata?.username ?? user.email ?? user.id,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  if (error) {
    throw error;
  }
}

export async function loadCurrentProfile(user: User): Promise<CurrentProfile> {
  let { data, error } = await supabase
    .from('profiles')
    .select('avatar_url, is_private')
    .eq('id', user.id)
    .maybeSingle<{ avatar_url: string | null; is_private: boolean | null }>();

  if (error && isMissingPrivacyColumnError(error)) {
    const legacy = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle<{ avatar_url: string | null }>();

    error = legacy.error;
    data = legacy.data ? { ...legacy.data, is_private: null } : null;
  }

  if (error) {
    throw error;
  }

  const avatarValue =
    data?.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined) ?? null;

  return {
    avatarUrl: await resolveProfileAvatarUrl(avatarValue),
    isPrivate: data?.is_private ?? false,
  };
}

// 계정 공개 범위를 저장한다. true면 비공개 계정이 된다.
export async function updateProfileVisibility(user: User, isPrivate: boolean) {
  await ensureProfile(user);

  const { error } = await supabase
    .from('profiles')
    .update({ is_private: isPrivate })
    .eq('id', user.id);

  if (error) {
    throw error;
  }
}

export function getProfileVisibilityErrorMessage(error: unknown) {
  const source = error as { code?: string; message?: string } | null;

  if (isMissingPrivacyColumnError(source)) {
    return 'Supabase DB에 공개 범위 컬럼이 없어요. 프로젝트의 profile_privacy 마이그레이션을 적용해 주세요.';
  }

  const message = source?.message?.toLowerCase() ?? '';

  if (message.includes('row-level security') || message.includes('permission')) {
    return '공개 범위를 변경할 권한이 없어요. Supabase RLS 정책을 확인해 주세요.';
  }

  if (message.includes('network')) {
    return '네트워크 연결 때문에 공개 범위를 저장하지 못했어요.';
  }

  return '공개 범위를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export async function updateProfileAvatar(user: User, uri: string) {
  await ensureProfile(user);

  const imageData = await getUploadImageData(uri);
  const storagePath = `${user.id}/profile/avatar-${Date.now()}.${imageData.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .upload(storagePath, imageData.body, {
      contentType: imageData.contentType,
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: storagePath })
    .eq('id', user.id)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (updateError) {
    throw updateError;
  }

  if (!updatedProfile) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      email: user.email ?? null,
      username: user.user_metadata?.username ?? user.email ?? user.id,
      avatar_url: storagePath,
    });

    if (insertError) {
      throw insertError;
    }
  }

  const { error: authUpdateError } = await supabase.auth.updateUser({
    data: { avatar_url: storagePath },
  });

  if (authUpdateError) {
    console.warn('Auth metadata avatar update failed.', authUpdateError);
  }

  return (await resolveProfileAvatarUrl(storagePath)) ?? uri;
}

export function getProfileAvatarErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('bucket') && message.includes('not found')) {
    return 'Supabase Storage에 bag-items 버킷이 없어요. Storage 설정을 확인해 주세요.';
  }

  if (message.includes('row-level security') || message.includes('unauthorized')) {
    return '프로필 사진 업로드 권한이 없어요. Storage 정책을 확인해 주세요.';
  }

  if (message.includes('network')) {
    return '네트워크 연결 때문에 프로필 사진을 올리지 못했어요.';
  }

  return '프로필 사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
