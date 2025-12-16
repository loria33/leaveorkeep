import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { checkMediaPermissionsWithRetry } from '../utils/permissions';
import { getViewingConfig, getStartOfDay, isToday } from '../constants/app';
import { ScanProgress, MonthSummary } from '../utils/mediaScanner';
import {
  markItemAsViewed,
  markItemsAsViewed,
  isItemViewed,
  isMonthCompleted,
  checkMonthCompletion,
  getViewedCount,
  getViewedPercentage,
  loadViewedItems,
  loadCompletedMonths,
  saveViewedItemsImmediately,
  getViewingStats,
} from '../utils/viewedMediaTracker';

export interface MediaItem {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  timestamp: number;
  source: string;
  filename: string;
  location?: string;
  size?: number;
}

export interface GroupedMedia {
  [key: string]: {
    [source: string]: MediaItem[];
  };
}

export interface ViewingLimits {
  viewCount: number;
  lastResetTime: number;
  isBlocked: boolean;
  remainingViews: number;
  currentDay: number; // Start of current day timestamp
}

export interface MonthContent {
  items: MediaItem[];
  hasMore: boolean;
  nextOffset?: number;
  isLoading: boolean;
}

export interface MediaContextType {
  // Legacy support
  mediaItems: MediaItem[];
  groupedMedia: GroupedMedia;

  // New month-based approach
  monthSummaries: MonthSummary[];
  monthContent: { [monthKey: string]: MonthContent };

  // Duplicate detection
  duplicateItems: MediaItem[];
  duplicateGroups: { [filename: string]: MediaItem[] };

  // Common state
  trashedItems: MediaItem[];
  isLoading: boolean;
  scanProgress: ScanProgress | null;
  hasMore: boolean;
  hasPermission: boolean;
  onboardingComplete: boolean;
  viewingLimits: ViewingLimits;
  isPremiumUser: boolean;

  // Month tracking
  viewedMonths: { [monthKey: string]: boolean };
  individualMonthProgress: { [monthKey: string]: number };
  monthProgress: {
    totalMonths: number;
    viewedMonths: number;
    percentage: number;
  };

  // Actions
  setMediaItems: (items: MediaItem[]) => void;
  addToTrash: (item: MediaItem) => void;
  restoreFromTrash: (item: MediaItem) => void;
  deleteFromTrash: (item: MediaItem) => Promise<void>;
  deleteBatchFromTrash: (items: MediaItem[]) => Promise<void>;
  setHasPermission: (hasPermission: boolean) => void;
  setOnboardingComplete: (complete: boolean) => void;

  // Legacy methods (now work with month summaries)
  scanMedia: () => Promise<void>;
  loadMoreMedia: () => Promise<void>;

  // New month-based methods
  scanMonthSummaries: () => Promise<void>;
  loadMonthContent: (monthKey: string, limit?: number) => Promise<MediaItem[]>;
  loadMoreMonthContent: (monthKey: string, limit?: number) => Promise<void>;
  getMonthItems: (monthKey: string) => MediaItem[];

  // Duplicate detection methods
  scanDuplicates: () => Promise<void>;

  // Viewing limits
  canViewMedia: () => boolean;
  incrementViewCount: () => void;
  getRemainingCooldownTime: () => number;

  // Premium user management
  setPremiumStatus: (isPremium: boolean) => Promise<void>;

  // Month tracking methods
  markMonthAsViewed: (monthKey: string, viewedCount?: number) => void;
  getMonthProgress: () => {
    totalMonths: number;
    viewedMonths: number;
    percentage: number;
  };

  // Viewed media tracking methods
  markMediaItemAsViewed: (itemId: string) => Promise<void>;
  markMediaItemsAsViewed: (itemIds: string[]) => Promise<void>;
  isMediaItemViewed: (itemId: string) => Promise<boolean>;
  getMonthViewedStats: (monthKey: string) => Promise<{
    viewedCount: number;
    totalCount: number;
    percentage: number;
    isCompleted: boolean;
  }>;
  checkAndMarkMonthCompleted: (monthKey: string) => Promise<boolean>;
  getViewingStats: () => Promise<{
    totalViewed: number;
    completedMonths: number;
  }>;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const useMedia = () => {
  const context = useContext(MediaContext);
  if (!context) {
    throw new Error('useMedia must be used within a MediaProvider');
  }
  return context;
};

interface MediaProviderProps {
  children: ReactNode;
}

export const MediaProvider: React.FC<MediaProviderProps> = ({ children }) => {
  // Legacy state
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);

  // New month-based state
  const [monthSummaries, setMonthSummaries] = useState<MonthSummary[]>([]);
  const [monthContent, setMonthContent] = useState<{
    [monthKey: string]: MonthContent;
  }>({});

  // Cache for native photos for pagination
  const [nativePhotoCache, setNativePhotoCache] = useState<{
    [monthKey: string]: MediaItem[];
  }>({});

  // Duplicate detection state
  const [duplicateItems, setDuplicateItems] = useState<MediaItem[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<{
    [filename: string]: MediaItem[];
  }>({});

  // Common state
  const [trashedItems, setTrashedItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasPermission, setHasPermission] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [viewingLimits, setViewingLimits] = useState<ViewingLimits>({
    viewCount: 0,
    lastResetTime: Date.now(),
    isBlocked: false,
    remainingViews: getViewingConfig().maxViews,
    currentDay: getStartOfDay(),
  });

  // Month tracking state
  const [viewedMonths, setViewedMonths] = useState<{
    [monthKey: string]: boolean;
  }>({});
  const [individualMonthProgress, setIndividualMonthProgress] = useState<{
    [monthKey: string]: number;
  }>({});

  // Viewed media tracking state
  const [completedMonths, setCompletedMonths] = useState<Set<string>>(
    new Set(),
  );

  // Check and reset viewing limits if it's a new day
  useEffect(() => {
    const checkDailyReset = () => {
      const today = getStartOfDay();
      if (viewingLimits.currentDay !== today) {
        const { maxViews } = getViewingConfig();
        const resetLimits = {
          viewCount: 0,
          lastResetTime: Date.now(),
          isBlocked: false,
          remainingViews: maxViews,
          currentDay: today,
        };
        setViewingLimits(resetLimits);
        saveViewingLimitsToStorage(resetLimits);
      }
    };

    // Check immediately when component mounts
    checkDailyReset();

    // Check every minute to see if it's a new day
    const interval = setInterval(checkDailyReset, 60000);
    return () => clearInterval(interval);
  }, [viewingLimits.currentDay]);

  // Simplified grouped media - only from loaded month content
  const groupedMedia = React.useMemo(() => {
    const grouped: GroupedMedia = {};

    // Only use loaded month content (no first images anymore)
    Object.keys(monthContent).forEach(monthKey => {
      const content = monthContent[monthKey];
      if (!grouped[monthKey]) {
        grouped[monthKey] = {};
      }

      content.items.forEach(item => {
        if (!grouped[monthKey]['Gallery']) {
          grouped[monthKey]['Gallery'] = [];
        }

        grouped[monthKey]['Gallery'].push(item);
      });
    });

    return grouped;
  }, [monthSummaries, monthContent]);

  // Load persisted data on app start
  useEffect(() => {
    loadPersistedData();
    loadViewedMediaData();
  }, []);

  // Load viewed media tracking data
  const loadViewedMediaData = async () => {
    try {
      const [viewedItems, completed] = await Promise.all([
        loadViewedItems(),
        loadCompletedMonths(),
      ]);
      setCompletedMonths(completed);
      // Cache is now loaded in the utility module
    } catch (error) {
      console.log('Error loading viewed media data:', error);
    }
  };

  // Save trash to storage whenever it changes
  useEffect(() => {
    if (trashedItems.length >= 0) {
      saveTrashToStorage();
    }
  }, [trashedItems]);

  const loadPersistedData = async () => {
    try {
      const [
        storedTrash,
        storedOnboarding,
        storedPermission,
        storedViewingLimits,
        storedPremiumStatus,
        storedViewedMonths,
        storedIndividualMonthProgress,
      ] = await Promise.all([
        AsyncStorage.getItem('trashedItems'),
        AsyncStorage.getItem('onboardingComplete'),
        AsyncStorage.getItem('hasPermission'),
        AsyncStorage.getItem('viewingLimits'),
        AsyncStorage.getItem('isPremiumUser'),
        AsyncStorage.getItem('viewedMonths'),
        AsyncStorage.getItem('individualMonthProgress'),
      ]);

      if (storedTrash) {
        setTrashedItems(JSON.parse(storedTrash));
      }

      if (storedOnboarding) {
        setOnboardingComplete(JSON.parse(storedOnboarding));
      }

      // Check current device permissions with retry logic (especially important for iPad)
      const currentPermission = await checkMediaPermissionsWithRetry();
      setHasPermission(currentPermission);

      // Update stored permission state to match current reality
      await AsyncStorage.setItem(
        'hasPermission',
        JSON.stringify(currentPermission),
      );

      if (storedPremiumStatus) {
        setIsPremiumUser(JSON.parse(storedPremiumStatus));
      }

      if (storedViewedMonths) {
        setViewedMonths(JSON.parse(storedViewedMonths));
      }

      if (storedIndividualMonthProgress) {
        setIndividualMonthProgress(JSON.parse(storedIndividualMonthProgress));
      }

      if (storedViewingLimits) {
        const limits = JSON.parse(storedViewingLimits);
        const today = getStartOfDay();

        // Check if it's a new day since app was closed
        if (!limits.currentDay || limits.currentDay !== today) {
          const { maxViews } = getViewingConfig();
          const resetLimits = {
            viewCount: 0,
            lastResetTime: Date.now(),
            isBlocked: false,
            remainingViews: maxViews,
            currentDay: today,
          };
          setViewingLimits(resetLimits);
          saveViewingLimitsToStorage(resetLimits);
        } else {
          // Same day, load stored limits
          setViewingLimits(limits);
        }
      }
    } catch (error) {
      // Error loading persisted data
    }
  };

  const saveTrashToStorage = async () => {
    try {
      await AsyncStorage.setItem('trashedItems', JSON.stringify(trashedItems));
    } catch (error) {
      // Error saving trash to storage
    }
  };

  // New month-based scanning - FILESYSTEM FIRST
  const scanMonthSummariesMethod = async () => {
    setIsLoading(true);
    setScanProgress({ current: 0, total: 0, phase: 'fetching' });

    try {
      // Try native module first for instant month summaries
      const { fetchMonthsNative } = await import('../native/PhotoMonths');
      const nativeMonths = await fetchMonthsNative();
      if (nativeMonths && nativeMonths.length > 0) {
        // Remove duplicates by monthKey
        const uniqueMonths = nativeMonths.filter(
          (month, index, array) =>
            array.findIndex(m => m.monthKey === month.monthKey) === index,
        );

        // Ensure proper sorting (newest first)
        const sortedMonths = uniqueMonths.sort((a, b) => {
          if (a.year !== b.year) {
            return b.year - a.year; // Newer year first
          }
          return b.month - a.month; // Newer month first
        });

        setMonthSummaries(sortedMonths);
        setHasMore(false);
        return; // Done!
      }

      // Fallback: Test Camera Roll access
      const { testCameraRollAccess } = await import('../utils/mediaScanner');
      const hasAccess = await testCameraRollAccess();
      if (!hasAccess) {
        console.log(
          '❌ No Camera Roll access - user may need to grant permissions or has no photos',
        );
      }

      // Fallback to filesystem / CameraRoll scanning chain
      const { scanMonthSummariesFS } = await import('../utils/mediaScanner');
      const summaries = await scanMonthSummariesFS({
        maxMonths: 999, // Allow many more months
        onProgress: progress => {
          setScanProgress(progress);
        },
      });

      // Remove duplicates by monthKey
      const uniqueSummaries = summaries.filter(
        (month, index, array) =>
          array.findIndex(m => m.monthKey === month.monthKey) === index,
      );

      // Ensure proper sorting for fallback results too
      const sortedSummaries = uniqueSummaries.sort((a, b) => {
        if (a.year !== b.year) {
          return b.year - a.year; // Newer year first
        }
        return b.month - a.month; // Newer month first
      });

      setMonthSummaries(sortedSummaries);
      setHasMore(false);
    } catch (error) {
      console.log('❌ Error in scanMonthSummariesMethod:', error);
    } finally {
      setIsLoading(false);
      setScanProgress(null);
    }
  };

  // Load content for a specific month
  const loadMonthContentMethod = async (
    monthKey: string,
    limit: number = 5,
  ): Promise<MediaItem[]> => {
    setMonthContent(prev => ({
      ...prev,
      [monthKey]: {
        items: prev[monthKey]?.items || [],
        hasMore: prev[monthKey]?.hasMore ?? true,
        nextOffset: prev[monthKey]?.nextOffset ?? 0,
        isLoading: true,
      },
    }));

    try {
      const { fetchMonthPhotosNative } = await import('../native/PhotoMonths');
      const nativePhotos = await fetchMonthPhotosNative(monthKey, 0, limit);
      const hasMore = Boolean(nativePhotos && nativePhotos.length === limit);
      setMonthContent(prev => ({
        ...prev,
        [monthKey]: {
          items: nativePhotos || [],
          hasMore,
          nextOffset: nativePhotos ? nativePhotos.length : 0,
          isLoading: false,
        },
      }));
      return nativePhotos || [];
    } catch (error) {
      setMonthContent(prev => ({
        ...prev,
        [monthKey]: {
          items: prev[monthKey]?.items || [],
          hasMore: false,
          nextOffset: prev[monthKey]?.nextOffset ?? 0,
          isLoading: false,
        },
      }));
      return [];
    }
  };

  // Load more content for a specific month (not needed anymore since native module loads all photos)
  const loadMoreMonthContentMethod = async (
    monthKey: string,
    limit: number = 5,
  ) => {
    const current = monthContent[monthKey];
    if (!current || !current.hasMore || current.isLoading) return;
    setMonthContent(prev => ({
      ...prev,
      [monthKey]: {
        ...current,
        isLoading: true,
      },
    }));
    try {
      const { fetchMonthPhotosNative } = await import('../native/PhotoMonths');
      const offset = current.items.length;
      const morePhotos = await fetchMonthPhotosNative(monthKey, offset, limit);
      const hasMore = Boolean(morePhotos && morePhotos.length > 0);
      setMonthContent(prev => ({
        ...prev,
        [monthKey]: {
          items: [...(current.items || []), ...(morePhotos || [])],
          hasMore,
          nextOffset: offset + (morePhotos ? morePhotos.length : 0),
          isLoading: false,
        },
      }));
    } catch (error) {
      setMonthContent(prev => ({
        ...prev,
        [monthKey]: {
          ...current,
          isLoading: false,
        },
      }));
    }
  };

  // Get all items for a specific month (only from loaded content)
  const getMonthItems = (monthKey: string): MediaItem[] => {
    const content = monthContent[monthKey];

    if (!content || content.items.length === 0) {
      return [];
    }

    // Return all loaded items for this month
    return content.items;
  };

  // Legacy scanMedia method (now uses month summaries)
  const scanMedia = async () => {
    await scanMonthSummariesMethod();

    // For backward compatibility, clear mediaItems (no first images anymore)
    setMediaItems([]);
  };

  // Legacy loadMoreMedia method (now no-op since we load months on demand)
  const loadMoreMediaItems = async () => {
    // No-op for now since we load months on demand
  };

  const addToTrash = (item: MediaItem) => {
    setTrashedItems(prev => [...prev, item]);

    // Remove from mediaItems (legacy)
    setMediaItems(prev => prev.filter(i => i.id !== item.id));

    // Remove from month content
    setMonthContent(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(monthKey => {
        updated[monthKey] = {
          ...updated[monthKey],
          items: updated[monthKey].items.filter(i => i.id !== item.id),
        };
      });
      return updated;
    });
  };

  const restoreFromTrash = (item: MediaItem) => {
    setTrashedItems(prev => prev.filter(i => i.id !== item.id));

    // Add back to mediaItems (legacy)
    setMediaItems(prev => [...prev, item]);

    // Add back to appropriate month content
    const monthKey = `${new Date(item.timestamp).getFullYear()}-${String(
      new Date(item.timestamp).getMonth() + 1,
    ).padStart(2, '0')}`;

    if (monthContent[monthKey]) {
      setMonthContent(prev => ({
        ...prev,
        [monthKey]: {
          ...prev[monthKey],
          items: [...prev[monthKey].items, item],
        },
      }));
    }
  };

  const deleteFromTrash = async (item: MediaItem) => {
    setTrashedItems(prev => prev.filter(i => i.id !== item.id));

    try {
      // Extract the original URI from the ID (ID format: originalUri + index)
      // We need to find where the index starts by looking for the last occurrence of digits
      const originalUri = item.id.replace(/\d+$/, ''); // Remove trailing digits (index)

      // For iOS, we need to use the original ph:// URI for deletion
      // For Android, we can use the file path
      const uriToDelete = originalUri || item.uri;

      // Try to delete from device photo library
      await CameraRoll.deletePhotos([uriToDelete]);
    } catch (error) {
      // If deletion fails, the item is still removed from trash
      // This handles cases where:
      // - User denies deletion permission on iOS
      // - File no longer exists on device
      // - Other system errors
      // - URI extraction failed
    }
  };

  const deleteBatchFromTrash = async (items: MediaItem[]) => {
    // Remove all items from trash first
    setTrashedItems(prev =>
      prev.filter(i => !items.some(item => item.id === i.id)),
    );

    try {
      // Extract all URIs for batch deletion
      const urisToDelete = items.map(item => {
        const originalUri = item.id.replace(/\d+$/, ''); // Remove trailing digits (index)
        return originalUri || item.uri;
      });

      // Delete all photos at once with a single iOS confirmation dialog
      await CameraRoll.deletePhotos(urisToDelete);
    } catch (error) {
      // If deletion fails, the items are still removed from trash
      // This handles cases where:
      // - User denies deletion permission on iOS
      // - Some files no longer exist on device
      // - Other system errors
      // - URI extraction failed
    }
  };

  const handleSetPermission = async (permission: boolean) => {
    setHasPermission(permission);
    try {
      await AsyncStorage.setItem('hasPermission', JSON.stringify(permission));
    } catch (error) {
      // Error saving permission state
    }
  };

  const handleSetOnboardingComplete = async (complete: boolean) => {
    setOnboardingComplete(complete);
    try {
      await AsyncStorage.setItem(
        'onboardingComplete',
        JSON.stringify(complete),
      );
    } catch (error) {
      // Error saving onboarding state
    }
  };

  const canViewMedia = () => {
    const { viewCount } = viewingLimits;
    return viewCount < getViewingConfig().maxViews;
  };

  const incrementViewCount = () => {
    const { maxViews } = getViewingConfig();
    const newViewCount = viewingLimits.viewCount + 1;
    const isBlocked = newViewCount >= maxViews;

    const newLimits = {
      viewCount: newViewCount,
      lastResetTime: Date.now(),
      isBlocked,
      remainingViews: isBlocked ? 0 : maxViews - newViewCount,
      currentDay: viewingLimits.currentDay,
    };

    setViewingLimits(newLimits);
    saveViewingLimitsToStorage(newLimits);
  };

  const getRemainingCooldownTime = () => {
    const today = getStartOfDay();
    const tomorrow = today + 24 * 60 * 60 * 1000; // Next day at midnight
    const remaining = tomorrow - Date.now();
    return Math.max(0, remaining);
  };

  const saveViewingLimitsToStorage = async (limits: ViewingLimits) => {
    try {
      await AsyncStorage.setItem('viewingLimits', JSON.stringify(limits));
    } catch (error) {
      // Error saving viewing limits to storage
    }
  };

  const setPremiumStatus = async (isPremium: boolean) => {
    try {
      setIsPremiumUser(isPremium);
      await AsyncStorage.setItem('isPremiumUser', JSON.stringify(isPremium));
    } catch (error) {
      // Error saving premium status
    }
  };

  // Month tracking methods
  const markMonthAsViewed = (monthKey: string, viewedCount: number = 1) => {
    setViewedMonths(prev => {
      const updated = { ...prev, [monthKey]: true };
      // Save to storage
      AsyncStorage.setItem('viewedMonths', JSON.stringify(updated)).catch(
        () => {
          // Error saving viewed months
        },
      );
      return updated;
    });

    // Calculate actual percentage based on viewed photos
    const monthItems = getMonthItems(monthKey);
    const totalItems = monthItems.length;
    const percentage =
      totalItems > 0 ? Math.round((viewedCount / totalItems) * 100) : 0;

    // Update individual month progress with actual percentage
    setIndividualMonthProgress(prev => {
      const updated = { ...prev, [monthKey]: percentage };
      // Save to storage
      AsyncStorage.setItem(
        'individualMonthProgress',
        JSON.stringify(updated),
      ).catch(() => {
        // Error saving individual month progress
      });
      return updated;
    });
  };

  const getMonthProgress = () => {
    const totalMonths = monthSummaries.length;
    const viewedMonthsCount = Object.keys(viewedMonths).filter(
      key => viewedMonths[key],
    ).length;
    const percentage =
      totalMonths > 0 ? Math.round((viewedMonthsCount / totalMonths) * 100) : 0;

    return {
      totalMonths,
      viewedMonths: viewedMonthsCount,
      percentage,
    };
  };

  // Viewed media tracking methods
  const markMediaItemAsViewedMethod = async (itemId: string) => {
    await markItemAsViewed(itemId);
  };

  const markMediaItemsAsViewedMethod = async (itemIds: string[]) => {
    await markItemsAsViewed(itemIds);
  };

  const isMediaItemViewedMethod = async (itemId: string): Promise<boolean> => {
    return await isItemViewed(itemId);
  };

  const getMonthViewedStatsMethod = async (
    monthKey: string,
  ): Promise<{
    viewedCount: number;
    totalCount: number;
    percentage: number;
    isCompleted: boolean;
  }> => {
    // Get total count from month summary (persistent, not dependent on loaded items)
    const summary = monthSummaries.find(m => m.monthKey === monthKey);
    const totalCountFromSummary = summary?.totalCount || 0;

    // Try to get all items to count viewed items accurately
    let allMonthItems: MediaItem[] = [];
    try {
      const { fetchMonthPhotosNative } = await import('../native/PhotoMonths');
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore && offset < 10000) {
        const batch = await fetchMonthPhotosNative(monthKey, offset, batchSize);
        if (batch && batch.length > 0) {
          allMonthItems.push(...batch);
          offset += batch.length;
          hasMore = batch.length === batchSize;
        } else {
          hasMore = false;
        }
      }
    } catch (error) {
      // Fallback to loaded items if native fails
      allMonthItems = getMonthItems(monthKey);
    }

    // If we couldn't get items, use loaded items as fallback
    if (allMonthItems.length === 0) {
      allMonthItems = getMonthItems(monthKey);
    }

    // Use summary totalCount if available, otherwise use actual items found
    // This ensures we have a persistent total count even if items aren't loaded
    const totalCount = totalCountFromSummary > 0 
      ? totalCountFromSummary 
      : allMonthItems.length;
    
    // Count viewed items from the items we have
    const viewedCount = await getViewedCount(allMonthItems);
    
    // If we have a summary total but fewer items loaded, we can't know exact viewed count
    // But we can estimate based on what we have
    const percentage = totalCount > 0 
      ? Math.round((viewedCount / totalCount) * 100) 
      : 0;
    const isCompleted = await isMonthCompleted(monthKey);

    return {
      viewedCount,
      totalCount,
      percentage,
      isCompleted,
    };
  };

  const checkAndMarkMonthCompletedMethod = async (
    monthKey: string,
  ): Promise<boolean> => {
    try {
      // Load ALL items for the month to check completion properly
      // Use native module to get all items, not just loaded ones
      const { fetchMonthPhotosNative } = await import('../native/PhotoMonths');
      
      // Fetch a large number of items (enough to cover most months)
      let allMonthItems: MediaItem[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const batch = await fetchMonthPhotosNative(monthKey, offset, batchSize);
        
        if (batch && batch.length > 0) {
          allMonthItems.push(...batch);
          offset += batch.length;
          hasMore = batch.length === batchSize;
        } else {
          hasMore = false;
        }
        
        // Safety limit to prevent infinite loops
        if (offset > 10000) {
          break;
        }
      }
      
      // If we couldn't get all items via native, fall back to loaded items
      if (allMonthItems.length === 0) {
        const loadedItems = getMonthItems(monthKey);
        if (loadedItems.length > 0) {
          console.log(`⚠️ ${monthKey}: Native returned 0 items, using ${loadedItems.length} loaded items`);
          allMonthItems = loadedItems;
        } else {
          console.log(`⚠️ ${monthKey}: No items available from native or loaded items`);
        }
      } else {
        console.log(`📦 ${monthKey}: Fetched ${allMonthItems.length} items from native`);
      }
      
      const isCompleted = await checkMonthCompletion(monthKey, allMonthItems);
      
      if (isCompleted) {
        setCompletedMonths(prev => new Set(prev).add(monthKey));
      }
      
      return isCompleted;
    } catch (error) {
      console.log(`❌ Error checking ${monthKey}:`, error);
      // Fallback to loaded items if native module fails
      const monthItems = getMonthItems(monthKey);
      const isCompleted = await checkMonthCompletion(monthKey, monthItems);
      
      if (isCompleted) {
        setCompletedMonths(prev => new Set(prev).add(monthKey));
      }
      
      return isCompleted;
    }
  };

  const getViewingStatsMethod = async () => {
    return await getViewingStats();
  };

  // Calculate month progress
  const monthProgress = getMonthProgress();

  const value: MediaContextType = {
    // Legacy
    mediaItems,
    groupedMedia,

    // New month-based
    monthSummaries,
    monthContent,

    // Duplicate detection
    duplicateItems,
    duplicateGroups,

    // Common
    trashedItems,
    isLoading,
    scanProgress,
    hasMore,
    hasPermission,
    onboardingComplete,
    viewingLimits,
    isPremiumUser,

    // Actions
    setMediaItems,
    addToTrash,
    restoreFromTrash,
    deleteFromTrash,
    deleteBatchFromTrash,
    setHasPermission: handleSetPermission,
    setOnboardingComplete: handleSetOnboardingComplete,

    // Legacy methods
    scanMedia,
    loadMoreMedia: loadMoreMediaItems,

    // New methods
    scanMonthSummaries: scanMonthSummariesMethod,
    loadMonthContent: loadMonthContentMethod,
    loadMoreMonthContent: loadMoreMonthContentMethod,
    getMonthItems,

    // Duplicate detection methods
    scanDuplicates: async () => {
      try {
        // Try native module first for fast duplicate detection
        const { fetchAllPhotosNative } = await import('../native/PhotoMonths');
        const allPhotos = await fetchAllPhotosNative();

        if (allPhotos && allPhotos.length > 0) {
          // Separate photos and videos for different duplicate detection logic
          const photos = allPhotos.filter(item => item.type === 'photo');
          const videos = allPhotos.filter(item => item.type === 'video');

          const duplicateGroups: { [key: string]: MediaItem[] } = {};
          const allDuplicates: MediaItem[] = [];

          // For PHOTOS: Group by filename pattern and timestamp proximity
          const photoGroups: { [key: string]: MediaItem[] } = {};
          photos.forEach(photo => {
            const filename = photo.filename || '';
            const timestamp = (photo as any).timestamp || 0;

            // Extract base filename without extension and numbers
            const baseFilename = filename
              .replace(/_\d+$/, '')
              .replace(/\.[^.]*$/, '');

            // Round timestamp to nearest 10 seconds for more tolerance
            const roundedTimestamp = Math.floor(timestamp / 10000) * 10000;

            const key = `photo_${baseFilename}_${roundedTimestamp}`;
            if (!photoGroups[key]) {
              photoGroups[key] = [];
            }
            photoGroups[key].push(photo);
          });

          // For VIDEOS: Group by filename (more reliable for forwarded/shared videos)
          const videoGroups: { [key: string]: MediaItem[] } = {};
          videos.forEach(video => {
            const filename = video.filename || 'unknown_video';
            const key = `video_${filename}`;
            if (!videoGroups[key]) {
              videoGroups[key] = [];
            }
            videoGroups[key].push(video);
          });

          // Find duplicate photos (same dimensions + timestamp)
          Object.keys(photoGroups).forEach(key => {
            const group = photoGroups[key];
            if (group.length > 1) {
              duplicateGroups[key] = group;
              allDuplicates.push(...group);
            }
          });

          // Find duplicate videos (same filename)
          Object.keys(videoGroups).forEach(key => {
            const group = videoGroups[key];
            if (group.length > 1) {
              duplicateGroups[key] = group;
              allDuplicates.push(...group);
            }
          });

          setDuplicateGroups(duplicateGroups);
          setDuplicateItems(allDuplicates);
        }
      } catch (error) {
        console.log('❌ Error in scanDuplicates:', error);
      }
    },

    // Viewing limits
    canViewMedia,
    incrementViewCount,
    getRemainingCooldownTime,

    // Premium
    setPremiumStatus,

    // Month tracking
    viewedMonths,
    individualMonthProgress,
    monthProgress,
    markMonthAsViewed,
    getMonthProgress,

    // Viewed media tracking
    markMediaItemAsViewed: markMediaItemAsViewedMethod,
    markMediaItemsAsViewed: markMediaItemsAsViewedMethod,
    isMediaItemViewed: isMediaItemViewedMethod,
    getMonthViewedStats: getMonthViewedStatsMethod,
    checkAndMarkMonthCompleted: checkAndMarkMonthCompletedMethod,
    getViewingStats: getViewingStatsMethod,
  };

  return (
    <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
  );
};
