import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MediaItem } from '../context/MediaContext';
import {
  fetchLibraryBySizeNative,
  fetchMonthPhotosNative,
  fetchMonthPhotosRankedNative,
} from '../native/PhotoMonths';

/**
 * Pseudo month key for the whole-library size scan: every page is the entire
 * library ordered biggest file first, regardless of the user's sort mode.
 */
export const SIZE_SCAN_KEY = 'SIZE_SCAN_ALL';

/**
 * How a month is ordered in the viewer.
 * - `date`: newest first (the default)
 * - `junk`: "Biggest wins first" — videos, screenshots and chat media come first,
 *   largest file first within each group, so the first swipes free the most space.
 */
export type SortMode = 'date' | 'junk';

export const SORT_MODE_STORAGE_KEY = 'mediaSortMode';

let currentSortMode: SortMode = 'date';

export const getSortMode = (): SortMode => currentSortMode;

export const loadSortMode = async (): Promise<SortMode> => {
  try {
    const stored = await AsyncStorage.getItem(SORT_MODE_STORAGE_KEY);
    if (stored === 'junk' || stored === 'date') {
      currentSortMode = stored;
    }
  } catch {
    // Keep the default
  }
  return currentSortMode;
};

export const persistSortMode = async (mode: SortMode): Promise<void> => {
  currentSortMode = mode;
  try {
    await AsyncStorage.setItem(SORT_MODE_STORAGE_KEY, mode);
  } catch {
    // The in-memory value still applies for this session
  }
};

/**
 * One page of a month in the current sort order. Falls back to date order when the
 * native module cannot rank, so the viewer always has something to show.
 */
export const fetchMonthPage = async (
  monthKey: string,
  offset: number,
  limit: number,
): Promise<MediaItem[] | null> => {
  if (monthKey === SIZE_SCAN_KEY) {
    return fetchLibraryBySizeNative(offset, limit);
  }
  if (currentSortMode === 'junk') {
    const ranked = await fetchMonthPhotosRankedNative(monthKey, offset, limit);
    if (ranked) return ranked;
  }
  return fetchMonthPhotosNative(monthKey, offset, limit);
};
