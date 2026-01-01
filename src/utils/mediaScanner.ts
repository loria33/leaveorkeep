import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { MediaItem } from '../context/MediaContext';

export interface ScanProgress {
  current: number;
  total: number;
  phase: 'fetching' | 'processing' | 'complete';
}

export interface MonthSummary {
  monthKey: string;
  year: number;
  month: number;
  monthName: string;
  totalCount: number;
  photoCount: number;
  videoCount: number;
  hasMore: boolean;
}

export interface MonthSelectionData {
  monthKey: string;
  monthName: string;
  photoCount: number;
  videoCount: number;
  totalCount: number;
}

export interface MonthScanOptions {
  maxMonths?: number;
  onProgress?: (progress: ScanProgress) => void;
}

export interface MonthContentOptions {
  batchSize?: number;
  onProgress?: (progress: ScanProgress) => void;
}

const getSimpleMonthKey = (timestamp: any): string => {
  // Fast month calculation
  let ts = timestamp;
  if (typeof ts === 'number' && ts < 10000000000) {
    ts = ts * 1000; // Convert seconds to milliseconds
  }
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}`;
};

const getMonthName = (monthKey: string): string => {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

// FILESYSTEM-BASED ULTRA FAST SCANNING
const getPhotoDirectories = (): string[] => {
  if (Platform.OS === 'ios') {
    // iOS photos are sandboxed and not accessible via filesystem
    // The Camera Roll API is required to access them
    return [];
  } else {
    // Android has accessible photo directories
    return [
      RNFS.ExternalStorageDirectoryPath + '/DCIM/Camera/',
      RNFS.ExternalStorageDirectoryPath + '/DCIM/Screenshots/',
      RNFS.ExternalStorageDirectoryPath + '/Pictures/',
      RNFS.ExternalStorageDirectoryPath + '/Download/',
      RNFS.ExternalStorageDirectoryPath + '/WhatsApp/Media/WhatsApp Images/',
      RNFS.ExternalStorageDirectoryPath + '/WhatsApp/Media/WhatsApp Video/',
    ];
  }
};

const isMediaFile = (filename: string): boolean => {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'mp4',
    'mov',
    'avi',
    'heic',
    'webp',
  ].includes(ext);
};

// FILESYSTEM MONTH SCANNING - BYPASSES CAMERA ROLL COMPLETELY
export const scanMonthSummariesFS = async (
  options: MonthScanOptions = {},
): Promise<MonthSummary[]> => {
  const { maxMonths = 12, onProgress } = options;

  try {
    onProgress?.({ current: 10, total: 100, phase: 'fetching' });

    const monthsFound = new Set<string>();
    const photoDirs = getPhotoDirectories();

    let totalFiles = 0;
    let processedFiles = 0;
    let foundAnyFiles = false;

    // Count total files first for progress
    for (const dir of photoDirs) {
      try {
        const exists = await RNFS.exists(dir);

        if (exists) {
          const files = await RNFS.readDir(dir);
          const mediaFiles = files.filter(file => isMediaFile(file.name));
          totalFiles += mediaFiles.length;

          if (mediaFiles.length > 0) {
            foundAnyFiles = true;
          }
        }
      } catch (error) {
        continue;
      }
    }

    // If no files found via filesystem, fall back to Camera Roll immediately
    if (!foundAnyFiles || totalFiles === 0) {
      throw new Error('No filesystem access to photos');
    }

    onProgress?.({ current: 20, total: 100, phase: 'processing' });

    // Process each directory
    for (const dir of photoDirs) {
      try {
        if (!(await RNFS.exists(dir))) continue;

        const files = await RNFS.readDir(dir);
        const mediaFiles = files.filter(file => isMediaFile(file.name));

        for (const file of mediaFiles) {
          try {
            // Get month from file modification time - SUPER FAST
            const monthKey = getSimpleMonthKey(file.mtime);
            monthsFound.add(monthKey);

            processedFiles++;

            // Update progress
            const progress = 20 + (processedFiles / totalFiles) * 70;
            onProgress?.({
              current: Math.round(progress),
              total: 100,
              phase: 'processing',
            });

            // Stop early if we have enough months
            if (monthsFound.size >= maxMonths) {
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (monthsFound.size >= maxMonths) {
          break;
        }
      } catch (error) {
        continue;
      }
    }

    // Create minimal summaries
    const summaries: MonthSummary[] = [];
    for (const monthKey of monthsFound) {
      try {
        const [year, month] = monthKey.split('-');
        summaries.push({
          monthKey,
          year: parseInt(year),
          month: parseInt(month),
          monthName: getMonthName(monthKey),
          totalCount: 0, // Placeholder, will be updated by loadNextPhotoForMonth
          photoCount: 0, // Placeholder, will be updated by native module
          videoCount: 0, // Placeholder, will be updated by native module
          hasMore: true,
        });
      } catch (error) {
        continue;
      }
    }

    summaries.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    onProgress?.({ current: 100, total: 100, phase: 'complete' });
    return summaries;
  } catch (error) {
    // Fall back to Camera Roll if filesystem access fails
    return await scanMonthSummaries(options);
  }
};

const getPhotosWithLimit = async (
  limit: number,
  afterCursor?: string,
): Promise<{ edges: any[]; hasNextPage: boolean; endCursor?: string }> => {
  try {
    const params: any = {
      first: limit,
      assetType: 'All',
      // Remove all includes - we only need timestamps
    };

    if (afterCursor) {
      params.after = afterCursor;
    }

    const photos = await CameraRoll.getPhotos(params);

    return {
      edges: photos.edges,
      hasNextPage: photos.page_info.has_next_page,
      endCursor: photos.page_info.end_cursor,
    };
  } catch (error) {
    return { edges: [], hasNextPage: false };
  }
};

// Simple test to verify Camera Roll access
export const testCameraRollAccess = async (): Promise<boolean> => {
  try {
    const result = await getPhotosWithLimit(1);
    const hasAccess = result.edges.length > 0;

    return hasAccess;
  } catch (error) {
    return false;
  }
};

// LIGHTNING FAST month scanning - NO IMAGES, just month names
export const scanMonthSummaries = async (
  options: MonthScanOptions = {},
): Promise<MonthSummary[]> => {
  // MEMORY FIX: Reduced default from 999 to 50 to prevent memory spike
  const { maxMonths = 50, onProgress } = options;

  try {
    onProgress?.({ current: 10, total: 100, phase: 'fetching' });

    const monthsFound = new Set<string>();
    let cursor: string | undefined;
    let hasMore = true;
    let batchCount = 0;
    // MEMORY FIX: Reduced from 20 to 5 batches to prevent memory spike
    const maxBatches = 5;

    // MEMORY FIX: Reduced batch sizes dramatically - was loading 2000 photos at once!
    const dynamicBatchSizes = [10, 20, 30]; // Much smaller batches
    let batchIndex = 0;

    while (hasMore && monthsFound.size < maxMonths && batchCount < maxBatches) {
      const batchLimit =
        dynamicBatchSizes[Math.min(batchIndex, dynamicBatchSizes.length - 1)];

      // MEMORY FIX: This loads photo data into memory - keep batches tiny!
      const photoData = await getPhotosWithLimit(batchLimit, cursor);

      if (photoData.edges.length === 0) {
        break;
      }

      batchCount++;

      // Process photos
      for (const edge of photoData.edges) {
        try {
          const monthKey = getSimpleMonthKey(edge.node.timestamp);
          monthsFound.add(monthKey);
          if (monthsFound.size >= maxMonths) break;
        } catch {}
      }

      // Early exit if done
      if (monthsFound.size >= maxMonths) break;

      // Prepare next loop
      cursor = photoData.endCursor;
      hasMore = photoData.hasNextPage;
      batchIndex++; // Increase batch size gradually

      // Progress reporting (simple estimate)
      onProgress?.({
        current: 20 + batchCount * 10,
        total: 100,
        phase: 'processing',
      });
    }

    // Create minimal summaries with just month info
    const summaries: MonthSummary[] = [];

    for (const monthKey of monthsFound) {
      try {
        const [year, month] = monthKey.split('-');
        summaries.push({
          monthKey,
          year: parseInt(year),
          month: parseInt(month),
          monthName: getMonthName(monthKey),
          totalCount: 0, // Placeholder, will be updated by loadNextPhotoForMonth
          photoCount: 0, // Placeholder, will be updated by native module
          videoCount: 0, // Placeholder, will be updated by native module
          hasMore: true,
        });
      } catch (error) {
        continue;
      }
    }

    summaries.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    onProgress?.({ current: 100, total: 100, phase: 'complete' });
    return summaries;
  } catch (error) {
    onProgress?.({ current: 0, total: 0, phase: 'complete' });
    return [];
  }
};

// Load just ONE more photo for a month (not all photos)
export const loadNextPhotoForMonth = async (
  monthKey: string,
  afterCursor?: string,
): Promise<{
  item: MediaItem | null;
  hasMore: boolean;
  nextCursor?: string;
}> => {
  try {
    const batchSize = 100; // Look through 100 photos to find 1 from target month
    let cursor = afterCursor;

    const photoData = await getPhotosWithLimit(batchSize, cursor);

    if (photoData.edges.length === 0) {
      return { item: null, hasMore: false };
    }

    // Find first photo from target month
    for (const edge of photoData.edges) {
      try {
        const nodeMonthKey = getSimpleMonthKey(edge.node.timestamp);

        if (nodeMonthKey === monthKey) {
          const timestamp =
            typeof edge.node.timestamp === 'number'
              ? edge.node.timestamp < 10000000000
                ? edge.node.timestamp * 1000
                : edge.node.timestamp
              : Date.now();

          const mediaItem: MediaItem = {
            id: edge.node.image.uri + '_' + Date.now(),
            uri: edge.node.image.uri,
            type: edge.node.type === 'video' ? 'video' : 'photo',
            timestamp,
            source: 'Gallery',
            filename: edge.node.image.filename || 'photo',
          };

          return {
            item: mediaItem,
            hasMore: photoData.hasNextPage,
            nextCursor: photoData.endCursor,
          };
        }
      } catch (error) {
        continue;
      }
    }

    // No photo found in this batch for target month
    return {
      item: null,
      hasMore: photoData.hasNextPage,
      nextCursor: photoData.endCursor,
    };
  } catch (error) {
    return { item: null, hasMore: false };
  }
};

// Legacy compatibility functions (simplified)
export const loadMonthContent = async (
  monthKey: string,
  options: MonthContentOptions = {},
): Promise<{ items: MediaItem[]; hasMore: boolean; nextCursor?: string }> => {
  // Just load first few photos for this month
  const result = await loadNextPhotoForMonth(monthKey);
  return {
    items: result.item ? [result.item] : [],
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  };
};

export const loadMoreMonthContent = async (
  monthKey: string,
  afterCursor: string,
  limit: number = 1,
): Promise<{ items: MediaItem[]; hasMore: boolean; nextCursor?: string }> => {
  const result = await loadNextPhotoForMonth(monthKey, afterCursor);
  return {
    items: result.item ? [result.item] : [],
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  };
};

export const scanDeviceMedia = async (
  options: any = {},
): Promise<{ items: MediaItem[]; hasMore: boolean; nextCursor?: string }> => {
  // This function is not used anymore - just return empty
  return {
    items: [],
    hasMore: false,
    nextCursor: undefined,
  };
};

export const loadMoreMedia = async (
  afterCursor: string,
  limit: number = 50,
): Promise<{ items: MediaItem[]; hasMore: boolean; nextCursor?: string }> => {
  return { items: [], hasMore: false };
};
