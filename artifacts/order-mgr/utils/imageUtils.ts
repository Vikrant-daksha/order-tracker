import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

const IMAGE_DIR = `${FileSystem.documentDirectory}orderflow/images/`;
const THUMB_DIR = `${FileSystem.documentDirectory}orderflow/thumbnails/`;

export async function ensureDirs(): Promise<void> {
  if (Platform.OS === 'web') return;
  
  const imgDirInfo = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!imgDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }
  
  const thumbDirInfo = await FileSystem.getInfoAsync(THUMB_DIR);
  if (!thumbDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(THUMB_DIR, { intermediates: true });
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export interface SavedImage {
  fullPath: string;
  thumbnailPath: string;
}

export async function saveImage(uri: string): Promise<SavedImage> {
  if (Platform.OS === 'web') {
    return { fullPath: uri, thumbnailPath: uri };
  }

  await ensureDirs();
  const id = generateId();

  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }],
    { compress: 1.0, format: ImageManipulator.SaveFormat.JPEG },
  );

  const thumbnail = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 150, height: 150 } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );

  const fullPath = `${IMAGE_DIR}${id}.jpg`;
  const thumbPath = `${THUMB_DIR}${id}_thumb.jpg`;

  await FileSystem.copyAsync({ from: compressed.uri, to: fullPath });
  await FileSystem.copyAsync({ from: thumbnail.uri, to: thumbPath });

  return { fullPath, thumbnailPath: thumbPath };
}

export async function deleteImage(fullPath: string, thumbnailPath: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (fullPath) await FileSystem.deleteAsync(fullPath, { idempotent: true });
    if (thumbnailPath) await FileSystem.deleteAsync(thumbnailPath, { idempotent: true });
  } catch {}
}

export async function clearOrderImages(imagePath: string, thumbnailPath: string): Promise<void> {
  await deleteImage(imagePath, thumbnailPath);
}
