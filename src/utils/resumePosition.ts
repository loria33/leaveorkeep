import { MediaItem } from '../context/MediaContext';
import { fetchMonthPhotosNative } from '../native/PhotoMonths';
import { getLastViewedItemId, loadViewedItems } from './viewedMediaTracker';

export type ViewerMediaType = 'photos' | 'videos' | 'all';

// Both the context and the viewer cap a month at this many loaded items
const MAX_LOADED_ITEMS = 200;
const SCAN_BATCH_SIZE = 200;

export const matchesMediaType = (
  item: MediaItem,
  mediaType: ViewerMediaType,
): boolean =>
  mediaType === 'all' ||
  item.type === (mediaType === 'photos' ? 'photo' : 'video');

/**
 * Index to resume at within `items`: the item the user was last on, else the first
 * unviewed one. Null when neither is among these items.
 */
export const findResumeIndexInItems = async (
  monthKey: string,
  items: MediaItem[],
): Promise<number | null> => {
  if (items.length === 0) return null;

  const lastViewedItemId = await getLastViewedItemId(monthKey);
  if (lastViewedItemId) {
    const found = items.findIndex(item => item.id === lastViewedItemId);
    if (found >= 0) return found;
  }

  const viewed = await loadViewedItems();
  const firstUnviewed = items.findIndex(item => !viewed.has(item.id));
  return firstUnviewed >= 0 ? firstUnviewed : null;
};

/**
 * The same search over the whole month, using native metadata batches so nothing is
 * kept in memory. `rawIndex` counts all media of the month, `filteredIndex` only the
 * requested type.
 */
export const findResumePositionInMonth = async (
  monthKey: string,
  mediaType: ViewerMediaType,
): Promise<{ rawIndex: number; filteredIndex: number } | null> => {
  const lastViewedItemId = await getLastViewedItemId(monthKey);
  const viewed = await loadViewedItems();

  let offset = 0;
  let rawIndex = 0;
  let filteredIndex = 0;
  let firstUnviewed: { rawIndex: number; filteredIndex: number } | null = null;

  while (true) {
    const batch = await fetchMonthPhotosNative(
      monthKey,
      offset,
      SCAN_BATCH_SIZE,
    );
    if (!batch || batch.length === 0) break;

    for (const item of batch) {
      if (matchesMediaType(item, mediaType)) {
        if (lastViewedItemId && item.id === lastViewedItemId) {
          return { rawIndex, filteredIndex };
        }
        if (!firstUnviewed && !viewed.has(item.id)) {
          firstUnviewed = { rawIndex, filteredIndex };
          if (!lastViewedItemId) return firstUnviewed;
        }
        filteredIndex += 1;
      }
      rawIndex += 1;
    }

    if (batch.length < SCAN_BATCH_SIZE) break;
    offset += batch.length;
  }

  return firstUnviewed;
};

/**
 * Decide which items a viewer session opens with and where it starts. When the resume
 * point lies beyond the loaded page, more of the month is loaded (up to the item cap).
 */
export const resolveResumeStart = async (
  monthKey: string,
  mediaType: ViewerMediaType,
  loadedItems: MediaItem[],
  loadMonthContent: (monthKey: string, limit: number) => Promise<MediaItem[]>,
): Promise<{ items: MediaItem[]; index: number }> => {
  const filtered = loadedItems.filter(item =>
    matchesMediaType(item, mediaType),
  );

  try {
    const local = await findResumeIndexInItems(monthKey, filtered);
    if (local !== null) return { items: filtered, index: local };

    const position = await findResumePositionInMonth(monthKey, mediaType);
    if (!position) return { items: filtered, index: 0 }; // everything seen: start at the top
    if (position.filteredIndex < filtered.length) {
      return { items: filtered, index: position.filteredIndex };
    }

    // The resume point is past the loaded page: load up to it, with a little runway
    const wanted = Math.min(MAX_LOADED_ITEMS, position.rawIndex + 21);
    if (wanted <= loadedItems.length) {
      return { items: filtered, index: Math.max(0, filtered.length - 1) };
    }
    const more = (await loadMonthContent(monthKey, wanted)).filter(item =>
      matchesMediaType(item, mediaType),
    );
    if (more.length === 0) return { items: filtered, index: 0 };
    return {
      items: more,
      index: Math.min(position.filteredIndex, more.length - 1),
    };
  } catch (error) {
    return { items: filtered, index: 0 };
  }
};
