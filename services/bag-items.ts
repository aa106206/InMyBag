import { File as ExpoFile } from 'expo-file-system';
import type { User } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';

const BAG_ITEMS_BUCKET = 'bag-items';
const SIGNED_URL_SECONDS = 60 * 60;

type ImageSize = {
  width: number;
  height: number;
};

export type SavedBagItem = ImageSize & {
  id: string;
  imageUrl: string;
  storagePath: string | null;
  createdAt: string;
};

type BagStackRow = {
  id: string;
};

type BagItemRow = {
  id: string;
  image_url: string;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

type UploadImageData = {
  body: ArrayBuffer | Uint8Array<ArrayBuffer>;
  contentType: string;
  extension: string;
};

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

function decodeBase64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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
      body: decodeBase64ToBytes(payload),
      contentType,
      extension: getImageExtension(uri, contentType),
    };
  }

  if (uri.startsWith('file://') || uri.startsWith('content://')) {
    const extension = getImageExtension(uri);

    return {
      body: await new ExpoFile(uri).bytes(),
      contentType: getImageContentType(extension),
      extension,
    };
  }

  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Image file load failed: ${response.status}`);
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
        username: user.email ?? user.id,
      },
      { onConflict: 'id' },
    );

  if (error) {
    throw error;
  }
}

async function getCurrentBagStackId(user: User) {
  await ensureProfile(user);

  const { data: existingStack, error: selectError } = await supabase
    .from('bag_stacks')
    .select('id')
    .eq('user_id', user.id)
    .eq('title', 'Current Bag')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<BagStackRow>();

  if (selectError) {
    throw selectError;
  }

  if (existingStack?.id) {
    return existingStack.id;
  }

  const { data: createdStack, error: insertError } = await supabase
    .from('bag_stacks')
    .insert({
      user_id: user.id,
      title: 'Current Bag',
    })
    .select('id')
    .single<BagStackRow>();

  if (insertError) {
    throw insertError;
  }

  return createdStack.id;
}

async function getDisplayUrl(storagePath: string | null, fallbackUrl: string) {
  if (!storagePath) {
    return fallbackUrl;
  }

  const { data, error } = await supabase.storage
    .from(BAG_ITEMS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) {
    return fallbackUrl;
  }

  return data.signedUrl;
}

export async function loadCurrentBagItems(user: User): Promise<SavedBagItem[]> {
  const bagStackId = await getCurrentBagStackId(user);

  const { data, error } = await supabase
    .from('bag_items')
    .select('id,image_url,storage_path,width,height,created_at')
    .eq('bag_stack_id', bagStackId)
    .order('created_at', { ascending: true })
    .returns<BagItemRow[]>();

  if (error) {
    throw error;
  }

  return Promise.all(
    (data ?? []).map(async (item) => ({
      id: item.id,
      imageUrl: await getDisplayUrl(item.storage_path, item.image_url),
      storagePath: item.storage_path,
      width: item.width ?? 92,
      height: item.height ?? 92,
      createdAt: item.created_at,
    })),
  );
}

export async function saveBagItem(
  user: User,
  uri: string,
  imageSize: ImageSize,
): Promise<SavedBagItem> {
  const bagStackId = await getCurrentBagStackId(user);
  const imageData = await getUploadImageData(uri);
  const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${imageData.extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BAG_ITEMS_BUCKET)
    .upload(storagePath, imageData.body, {
      contentType: imageData.contentType,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: item, error: insertError } = await supabase
    .from('bag_items')
    .insert({
      bag_stack_id: bagStackId,
      image_url: storagePath,
      storage_path: storagePath,
      width: Math.round(imageSize.width),
      height: Math.round(imageSize.height),
    })
    .select('id,image_url,storage_path,width,height,created_at')
    .single<BagItemRow>();

  if (insertError) {
    await supabase.storage.from(BAG_ITEMS_BUCKET).remove([storagePath]);
    throw insertError;
  }

  return {
    id: item.id,
    imageUrl: uri,
    storagePath: item.storage_path,
    width: item.width ?? imageSize.width,
    height: item.height ?? imageSize.height,
    createdAt: item.created_at,
  };
}

export async function deleteBagItem(itemId: string, storagePath?: string | null) {
  const { error } = await supabase.from('bag_items').delete().eq('id', itemId);

  if (error) {
    throw error;
  }

  if (storagePath) {
    await supabase.storage.from(BAG_ITEMS_BUCKET).remove([storagePath]);
  }
}
