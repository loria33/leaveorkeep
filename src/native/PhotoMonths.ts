import { NativeModules } from 'react-native';
import { MonthSummary } from '../utils/mediaScanner';
import { MediaItem } from '../context/MediaContext';

declare global {
  interface NativeModulesStatic {
    PhotoMonths?: {
      fetchMonths: () => Promise<MonthSummary[]>;
      fetchAllPhotos: () => Promise<MediaItem[]>;
      fetchMonthPhotos: (
        monthKey: string,
        offset: number,
        limit: number,
      ) => Promise<MediaItem[]>;
      fetchMonthCount: (
        monthKey: string,
      ) => Promise<{ totalCount: number; photoCount: number; videoCount: number }>;
    };
  }
}

const { PhotoMonths } = NativeModules as unknown as NativeModulesStatic;

export const fetchMonthsNative = async (): Promise<MonthSummary[] | null> => {
  if (!PhotoMonths) {
    return null;
  }

  if (typeof PhotoMonths.fetchMonths !== 'function') {
    return null;
  }

  try {
    const result = await PhotoMonths.fetchMonths();

    if (Array.isArray(result) && result.length > 0) {
      return result as MonthSummary[];
    }

    return null;
  } catch (error) {
    return null;
  }
};

export const fetchAllPhotosNative = async (): Promise<MediaItem[] | null> => {
  if (!PhotoMonths) {
    return null;
  }

  if (typeof PhotoMonths.fetchAllPhotos !== 'function') {
    return null;
  }

  try {
    const result = await PhotoMonths.fetchAllPhotos();

    if (Array.isArray(result)) {
      return result as MediaItem[];
    }

    return null;
  } catch (error) {
    return null;
  }
};

export const fetchMonthPhotosNative = async (
  monthKey: string,
  offset: number = 0,
  limit: number = 5,
): Promise<MediaItem[] | null> => {
  if (!PhotoMonths) {
    return null;
  }

  if (typeof PhotoMonths.fetchMonthPhotos !== 'function') {
    return null;
  }

  try {
    const result = await PhotoMonths.fetchMonthPhotos(monthKey, offset, limit);

    if (Array.isArray(result)) {
      return result as MediaItem[];
    }

    return null;
  } catch (error) {
    return null;
  }
};

// LAZY LOADING: Count photos for a month without loading them
export const fetchMonthCountNative = async (
  monthKey: string,
): Promise<{ totalCount: number; photoCount: number; videoCount: number } | null> => {
  if (!PhotoMonths) {
    return null;
  }

  if (typeof PhotoMonths.fetchMonthCount !== 'function') {
    return null;
  }

  try {
    const result = await PhotoMonths.fetchMonthCount(monthKey);

    if (result && typeof result === 'object') {
      return result as { totalCount: number; photoCount: number; videoCount: number };
    }

    return null;
  } catch (error) {
    return null;
  }
};
