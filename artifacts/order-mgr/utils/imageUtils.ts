import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Persistent storage directories
// We create these once per app session, not on every upload.
// ---------------------------------------------------------------------------
let _dirsReady = false;

const IMAGE_DIR = () => new Directory(Paths.document, 'orderflow', 'images');
const THUMB_DIR = () => new Directory(Paths.document, 'orderflow', 'thumbnails');

export function ensureDirs(): void {
  if (Platform.OS === 'web' || _dirsReady) return;
  const imgDir = IMAGE_DIR();
  const thumbDir = THUMB_DIR();
  if (!imgDir.exists) imgDir.create();
  if (!thumbDir.exists) thumbDir.create();
  _dirsReady = true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export interface SavedImage {
  fullPath: string;
  thumbnailPath: string;
}

// ---------------------------------------------------------------------------
// saveImage
//
// Compression strategy — "visually lossless":
//   • Full image  → JPEG compress: 1.0 (100 %).  Re-encoding at 100 % strips
//     EXIF bloat and normalises the byte stream with zero perceptible quality
//     loss. Width is capped at 1920 px so oversized camera shots are
//     brought to a sane size; anything narrower keeps its native resolution.
//   • Thumbnail   → 150 × 150 JPEG compress: 0.9 (90 %).  At this tiny size
//     the difference from 100 % is invisible; keeping it at 0.9 keeps list
//     views snappy.
//
// The two assets are persisted separately so the UI can render a fast
// thumbnail without pulling the full-resolution image into memory.
// ---------------------------------------------------------------------------
export async function saveImage(uri: string): Promise<SavedImage> {
  if (Platform.OS === 'web') {
    return { fullPath: uri, thumbnailPath: uri };
  }

  ensureDirs(); // no-op if already done this session
  const id = generateId();

  // -- Full image: visually-lossless compression, max 1920 px wide ----------
  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }],
    { compress: 1.0, format: ImageManipulator.SaveFormat.JPEG },
  );

  // -- Thumbnail: 150 × 150, 90 % quality -----------------------------------
  const thumbnail = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 150, height: 150 } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );

  // Destination file objects inside our persistent directories
  const fullDest = new File(IMAGE_DIR(), `${id}.jpg`);
  const thumbDest = new File(THUMB_DIR(), `${id}_thumb.jpg`);

  // move() atomically renames the temp file — no copy+delete overhead
  new File(compressed.uri).move(fullDest);
  new File(thumbnail.uri).move(thumbDest);

  return {
    fullPath: fullDest.uri,
    thumbnailPath: thumbDest.uri,
  };
}

// ---------------------------------------------------------------------------
// deleteImage
// Call this when discarding an image that was never saved to an order, or
// when an order is deleted.
// ---------------------------------------------------------------------------
export function deleteImage(fullPath: string, thumbnailPath: string): void {
  if (Platform.OS === 'web') return;
  try {
    if (fullPath) {
      const f = new File(fullPath);
      if (f.exists) f.delete();
    }
    if (thumbnailPath) {
      const t = new File(thumbnailPath);
      if (t.exists) t.delete();
    }
  } catch {
    // Deletion errors are non-critical; swallow silently
  }
}

// ---------------------------------------------------------------------------
// clearOrderImages – thin wrapper kept for backwards-compatibility
// ---------------------------------------------------------------------------
export function clearOrderImages(
  imagePath: string,
  thumbnailPath: string,
): void {
  deleteImage(imagePath, thumbnailPath);
}
