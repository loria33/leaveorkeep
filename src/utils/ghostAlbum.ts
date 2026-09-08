import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import type { MediaItem } from '../context/MediaContext';
import { saveGhostThumbnailNative } from '../native/PhotoMonths';

/**
 * GHOST ALBUM
 *
 * Before a photo or video is permanently deleted, a tiny thumbnail of it is saved in
 * app-private storage together with a few facts (when it was taken, when it was
 * deleted, how much space it took). The user can never get the original back from
 * here, but they can always see what they let go, which takes the fear out of
 * deleting.
 *
 * Ghosts are "staged" before the device deletion and only "committed" once the
 * deletion succeeded, so a cancelled system dialog never leaves a ghost of a photo
 * that still exists.
 */

export interface GhostEntry {
  ghostId: string;
  /** Id of the media item this ghost stands in for */
  sourceId: string;
  /** Absolute path of the thumbnail JPEG (no scheme) */
  thumbPath: string;
  type: 'photo' | 'video';
  /** When the original was taken */
  timestamp: number;
  deletedAt: number;
  /** Bytes the original occupied; 0 when unknown */
  size: number;
  filename: string;
  /** "YYYY-MM" of the original, for grouping */
  monthKey: string;
}

const INDEX_KEY = 'ghostAlbumIndex';
const ENABLED_KEY = 'ghostAlbumEnabled';
const THUMB_MAX_SIZE = 320;
const CAPTURE_CONCURRENCY = 3;

export const GHOST_DIR = `${RNFS.DocumentDirectoryPath}/ghosts`;

export const monthKeyForTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}`;
};

export const ghostImageUri = (entry: GhostEntry): string =>
  entry.thumbPath.startsWith('file://')
    ? entry.thumbPath
    : `file://${entry.thumbPath}`;

// ----- Settings -----

export const loadGhostAlbumEnabled = async (): Promise<boolean> => {
  try {
    const stored = await AsyncStorage.getItem(ENABLED_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
};

export const saveGhostAlbumEnabled = async (
  enabled: boolean,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // Best effort
  }
};

// ----- Index -----

export const loadGhosts = async (): Promise<GhostEntry[]> => {
  try {
    const stored = await AsyncStorage.getItem(INDEX_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as GhostEntry[]) : [];
  } catch {
    return [];
  }
};

const saveGhosts = async (entries: GhostEntry[]): Promise<void> => {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(entries));
};

// ----- Capture -----

const captureOne = async (
  item: MediaItem,
  ghostId: string,
  deletedAt: number,
): Promise<GhostEntry | null> => {
  const thumbPath = `${GHOST_DIR}/${ghostId}.jpg`;
  const result = await saveGhostThumbnailNative(
    item.uri,
    thumbPath,
    THUMB_MAX_SIZE,
  );
  if (!result) return null;

  return {
    ghostId,
    sourceId: item.id,
    thumbPath: result.path || thumbPath,
    type: item.type,
    timestamp: item.timestamp,
    deletedAt,
    size: result.size || item.size || 0,
    filename: item.filename,
    monthKey: monthKeyForTimestamp(item.timestamp),
  };
};

/**
 * Render thumbnails for `items` to disk without touching the index. Returns only the
 * ghosts that could be captured; the rest are silently skipped.
 */
export const stageGhosts = async (
  items: MediaItem[],
): Promise<GhostEntry[]> => {
  if (items.length === 0) return [];

  try {
    await RNFS.mkdir(GHOST_DIR);
  } catch {
    // The native side creates the directory as well
  }

  const deletedAt = Date.now();
  const batchTag = Math.random().toString(36).slice(2, 8);
  const staged: GhostEntry[] = [];

  // A few at a time keeps memory flat when a large trash is emptied
  for (let i = 0; i < items.length; i += CAPTURE_CONCURRENCY) {
    const chunk = items.slice(i, i + CAPTURE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((item, j) =>
        captureOne(item, `${deletedAt}_${batchTag}_${i + j}`, deletedAt).catch(
          () => null,
        ),
      ),
    );
    results.forEach(entry => {
      if (entry) staged.push(entry);
    });
  }

  return staged;
};

/** Add staged ghosts to the album. Returns the full, updated list. */
export const commitGhosts = async (
  entries: GhostEntry[],
): Promise<GhostEntry[]> => {
  const existing = await loadGhosts();
  if (entries.length === 0) return existing;
  const next = [...entries, ...existing];
  await saveGhosts(next);
  return next;
};

/** Delete staged thumbnails whose originals were not deleted after all. */
export const discardGhosts = async (entries: GhostEntry[]): Promise<void> => {
  await Promise.all(
    entries.map(entry => RNFS.unlink(entry.thumbPath).catch(() => undefined)),
  );
};

// ----- Management -----

export const removeGhost = async (ghostId: string): Promise<GhostEntry[]> => {
  const existing = await loadGhosts();
  const target = existing.find(entry => entry.ghostId === ghostId);
  const next = existing.filter(entry => entry.ghostId !== ghostId);
  if (target) {
    await RNFS.unlink(target.thumbPath).catch(() => undefined);
  }
  await saveGhosts(next);
  return next;
};

export const wipeGhosts = async (): Promise<void> => {
  const existing = await loadGhosts();
  await discardGhosts(existing);
  await saveGhosts([]);
  try {
    await RNFS.unlink(GHOST_DIR);
  } catch {
    // Directory may already be gone
  }
};

export const ghostStats = (
  entries: GhostEntry[],
): { count: number; bytesFreed: number } => ({
  count: entries.length,
  bytesFreed: entries.reduce((sum, entry) => sum + (entry.size || 0), 0),
});
