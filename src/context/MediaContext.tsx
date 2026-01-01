import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { checkMediaPermissionsWithRetry } from '../utils/permissions';
import {
  getViewingConfig,
  getStartOfDay,
  getStartOfHour,
  isToday,
} from '../constants/app';
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
  currentHour: number; // Start of current hour timestamp
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

  // Memory management: Limit number of months kept in memory (reduced for better memory management)
  const MAX_MONTHS_IN_MEMORY = 3; // Keep only 3 most recently accessed months (reduced from 5)
  const monthAccessOrder = useRef<string[]>([]); // Track access order for LRU cleanup

  // Cleanup old months from memory (LRU eviction)
  const cleanupOldMonths = useCallback(() => {
    setMonthContent(prev => {
      const monthKeys = Object.keys(prev);
      if (monthKeys.length <= MAX_MONTHS_IN_MEMORY) {
        return prev;
      }

      // Remove months that are not in the most recently accessed list
      const recentMonths = monthAccessOrder.current.slice(
        -MAX_MONTHS_IN_MEMORY,
      );
      const cleaned: { [monthKey: string]: MonthContent } = {};

      recentMonths.forEach((monthKey: string) => {
        if (prev[monthKey]) {
          cleaned[monthKey] = prev[monthKey];
        }
      });

      return cleaned;
    });
  }, []);

  // REMOVED: nativePhotoCache - was causing memory bloat, using monthContent instead

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
    currentHour: getStartOfHour(),
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

  // Check and reset viewing limits after 15-minute cooldown
  useEffect(() => {
    const checkCooldownReset = () => {
      // If blocked, check if 15 minutes have passed since lastResetTime
      if (viewingLimits.isBlocked && viewingLimits.lastResetTime) {
        const cooldownDuration = 15 * 60 * 1000; // 15 minutes in milliseconds
        const resetTime = viewingLimits.lastResetTime + cooldownDuration;
        const now = Date.now();

        if (now >= resetTime) {
          // Cooldown expired, reset views
          const { maxViews } = getViewingConfig();
          const resetLimits = {
            viewCount: 0,
            lastResetTime: Date.now(),
            isBlocked: false,
            remainingViews: maxViews,
            currentHour: getStartOfHour(),
          };
          setViewingLimits(resetLimits);
          saveViewingLimitsToStorage(resetLimits);
        }
      }
    };

    // Check immediately when component mounts
    checkCooldownReset();

    // Check every second to see if cooldown has expired
    const interval = setInterval(checkCooldownReset, 1000);
    return () => clearInterval(interval);
  }, [viewingLimits.isBlocked, viewingLimits.lastResetTime]);

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
      // Error loading viewed media data
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
        const currentHour = getStartOfHour();

        // Check if blocked and if 15-minute cooldown has expired
        if (limits.isBlocked && limits.lastResetTime) {
          const cooldownDuration = 15 * 60 * 1000; // 15 minutes in milliseconds
          const resetTime = limits.lastResetTime + cooldownDuration;
          const now = Date.now();

          if (now >= resetTime) {
            // Cooldown expired, reset views
            const { maxViews } = getViewingConfig();
            const resetLimits = {
              viewCount: 0,
              lastResetTime: Date.now(),
              isBlocked: false,
              remainingViews: maxViews,
              currentHour: currentHour,
            };
            setViewingLimits(resetLimits);
            saveViewingLimitsToStorage(resetLimits);
          } else {
            // Still in cooldown, load stored limits
            setViewingLimits(limits);
          }
        } else {
          // Not blocked, load stored limits
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

        // LAZY LOADING: Set counts to 0 - will be calculated when month is opened
        const lazyMonths = uniqueMonths.map(month => ({
          ...month,
          totalCount: 0, // Will be counted when month is opened
          photoCount: 0, // Will be counted when month is opened
          videoCount: 0, // Will be counted when month is opened
        }));

        // Ensure proper sorting (newest first)
        const sortedMonths = lazyMonths.sort((a, b) => {
          if (a.year !== b.year) {
            return b.year - a.year; // Newer year first
          }
          return b.month - a.month; // Newer month first
        });

        setMonthSummaries(sortedMonths);
        setHasMore(false);
        return; // Done! No photo data loaded
      }

      // Fallback: Test Camera Roll access
      const { testCameraRollAccess } = await import('../utils/mediaScanner');
      const hasAccess = await testCameraRollAccess();

      // Fallback to filesystem / CameraRoll scanning chain
      // MEMORY FIX: Limit months to prevent memory issues
      const { scanMonthSummariesFS } = await import('../utils/mediaScanner');
      const summaries = await scanMonthSummariesFS({
        maxMonths: 50, // Reduced from 999 to 50 to prevent memory spike
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
      // Error in scanMonthSummariesMethod
    } finally {
      setIsLoading(false);
      setScanProgress(null);
    }
  };

  // Load content for a specific month
  const loadMonthContentMethod = async (
    monthKey: string,
    limit: number = 10, // Increased default from 5 to 10 for better UX, but still limited
  ): Promise<MediaItem[]> => {
    // MEMORY FIX: Enforce hard limit from the start
    const MAX_ITEMS_PER_MONTH = 200; // Increased to match MediaViewer limit
    const actualLimit = Math.min(limit, MAX_ITEMS_PER_MONTH);

    // Update access order (move to end if exists, add if new)
    monthAccessOrder.current = monthAccessOrder.current.filter(
      (key: string) => key !== monthKey,
    );
    monthAccessOrder.current.push(monthKey);

    // Cleanup old months if we exceed limit
    cleanupOldMonths();

    // MEMORY FIX: Clear existing items when loading fresh (prevent accumulation)
    setMonthContent(prev => ({
      ...prev,
      [monthKey]: {
        items: [], // Clear existing items to prevent accumulation
        hasMore: true,
        nextOffset: 0,
        isLoading: true,
      },
    }));

    try {
      const { fetchMonthPhotosNative } = await import('../native/PhotoMonths');
      const nativePhotos = await fetchMonthPhotosNative(
        monthKey,
        0,
        actualLimit,
      );
      const hasMore = Boolean(
        nativePhotos && nativePhotos.length === actualLimit,
      );

      // MEMORY FIX: Enforce hard limit
      const limitedPhotos = (nativePhotos || []).slice(0, MAX_ITEMS_PER_MONTH);

      // LAZY LOADING: Count photos for this month when it's opened
      // Only count if count was 0 (lazy loaded)
      const currentMonth = monthSummaries.find(m => m.monthKey === monthKey);

      if (currentMonth && currentMonth.totalCount === 0) {
        try {
          const { fetchMonthCountNative } = await import(
            '../native/PhotoMonths'
          );
          const counts = await fetchMonthCountNative(monthKey);

          if (counts) {
            // Update month summary with actual counts
            setMonthSummaries(prev => {
              return prev.map(month => {
                if (month.monthKey === monthKey) {
                  return {
                    ...month,
                    totalCount: counts.totalCount,
                    photoCount: counts.photoCount,
                    videoCount: counts.videoCount,
                  };
                }
                return month;
              });
            });
          }
        } catch (error) {
          // If count fails, use loaded photos as approximation
          const photoCount = limitedPhotos.filter(
            item => item.type === 'photo',
          ).length;
          const videoCount = limitedPhotos.filter(
            item => item.type === 'video',
          ).length;

          setMonthSummaries(prev => {
            return prev.map(month => {
              if (month.monthKey === monthKey) {
                return {
                  ...month,
                  totalCount: limitedPhotos.length, // Approximate count
                  photoCount: photoCount,
                  videoCount: videoCount,
                };
              }
              return month;
            });
          });
        }
      }

      setMonthContent(prev => ({
        ...prev,
        [monthKey]: {
          items: limitedPhotos,
          hasMore: hasMore && limitedPhotos.length < MAX_ITEMS_PER_MONTH,
          nextOffset: limitedPhotos.length,
          isLoading: false,
        },
      }));
      return limitedPhotos;
    } catch (error) {
      setMonthContent(prev => ({
        ...prev,
        [monthKey]: {
          items: [],
          hasMore: false,
          nextOffset: 0,
          isLoading: false,
        },
      }));
      return [];
    }
  };

  // Load more content for a specific month (not needed anymore since native module loads all photos)
  const loadMoreMonthContentMethod = async (
    monthKey: string,
    limit: number = 10, // Increased default from 5 to 10 for better UX
  ) => {
    const current = monthContent[monthKey];
    if (!current || current.isLoading) return; // Don't load if already loading

    // MEMORY FIX: Hard limit - don't load more if we're already at the limit
    const MAX_ITEMS_PER_MONTH = 200; // Increased to match MediaViewer limit
    if (current.items.length >= MAX_ITEMS_PER_MONTH) {
      return; // Already at limit, don't load more
    }

    // Calculate how many more we can load
    const remaining = MAX_ITEMS_PER_MONTH - current.items.length;
    const actualLimit = Math.min(limit, remaining);

    if (actualLimit <= 0) {
      return; // No room for more items
    }

    // Update access order
    monthAccessOrder.current = monthAccessOrder.current.filter(
      (key: string) => key !== monthKey,
    );
    monthAccessOrder.current.push(monthKey);

    // Cleanup old months if needed
    cleanupOldMonths();

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
      const morePhotos = await fetchMonthPhotosNative(
        monthKey,
        offset,
        actualLimit,
      );
      // hasMore logic:
      // - If we got fewer items than requested, there are no more available
      // - If we got exactly the number requested, there might be more (set to true)
      // - But if we've hit MAX_ITEMS_PER_MONTH, set to false (can't load more)
      const gotFullBatch = morePhotos && morePhotos.length === actualLimit;
      const totalAfterLoad = current.items.length + (morePhotos?.length || 0);
      const hasMore = gotFullBatch && totalAfterLoad < MAX_ITEMS_PER_MONTH;

      // CRITICAL FIX: Use functional update to get CURRENT state, not stale closure
      // This prevents race conditions where state changes between async operations
      setMonthContent(prev => {
        const existingContent = prev[monthKey];
        if (!existingContent) {
          // Month was cleared (e.g., by cleanupOldMonths), restore from current
          return {
            ...prev,
            [monthKey]: {
              ...current,
              isLoading: false,
            },
          };
        }

        // MEMORY FIX: Enforce hard limit - never exceed MAX_ITEMS_PER_MONTH
        // Use items from CURRENT state (prev), not stale closure (current)
        const existingItems = existingContent.items || [];
        const newItems = [...existingItems, ...(morePhotos || [])];
        const limitedItems = newItems.slice(0, MAX_ITEMS_PER_MONTH); // Hard cut

        return {
          ...prev,
          [monthKey]: {
            items: limitedItems,
            hasMore: hasMore && limitedItems.length < MAX_ITEMS_PER_MONTH,
            nextOffset: limitedItems.length,
            isLoading: false,
          },
        };
      });
    } catch (error) {
      // Use functional update to get current state
      setMonthContent(prev => {
        const existingContent = prev[monthKey];
        if (!existingContent) {
          // Month was cleared, restore from current
          return {
            ...prev,
            [monthKey]: {
              ...current,
              isLoading: false,
            },
          };
        }
        return {
          ...prev,
          [monthKey]: {
            ...existingContent,
            isLoading: false,
          },
        };
      });
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
    // Premium users have unlimited views
    if (isPremiumUser) {
      return true;
    }
    const { viewCount } = viewingLimits;
    return viewCount < getViewingConfig().maxViews;
  };

  const incrementViewCount = () => {
    // Premium users don't have view limits, so don't increment count
    if (isPremiumUser) {
      return;
    }

    const { maxViews } = getViewingConfig();
    const newViewCount = viewingLimits.viewCount + 1;
    const isBlocked = newViewCount >= maxViews;

    // Set lastResetTime when limit is reached (for 15-minute cooldown)
    const lastResetTime = isBlocked ? Date.now() : viewingLimits.lastResetTime;

    const newLimits = {
      viewCount: newViewCount,
      lastResetTime,
      isBlocked,
      remainingViews: isBlocked ? 0 : maxViews - newViewCount,
      currentHour: viewingLimits.currentHour,
    };

    setViewingLimits(newLimits);
    saveViewingLimitsToStorage(newLimits);
  };

  const getRemainingCooldownTime = () => {
    // If blocked, calculate 15 minutes from lastResetTime
    if (viewingLimits.isBlocked && viewingLimits.lastResetTime) {
      const cooldownDuration = 15 * 60 * 1000; // 15 minutes in milliseconds
      const resetTime = viewingLimits.lastResetTime + cooldownDuration;
      const remaining = resetTime - Date.now();
      return Math.max(0, remaining);
    }
    return 0;
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

    // MEMORY FIX: Use loaded items if available, otherwise use summary count
    // Don't load all photos just to count viewed items
    const loadedItems = getMonthItems(monthKey);
    let viewedCount = 0;
    let processedCount = 0;

    if (loadedItems.length > 0) {
      // Use already loaded items
      viewedCount = await getViewedCount(loadedItems);
      processedCount = loadedItems.length;
    } else {
      // MEMORY OPTIMIZATION: Only load small batch if we really need to count
      // Don't load 2000 items just for stats
      const batchSize = 50; // Much smaller batch
      const maxItemsToProcess = 200; // Reduced from 2000 to 200

      try {
        const { fetchMonthPhotosNative } = await import(
          '../native/PhotoMonths'
        );
        const batch = await fetchMonthPhotosNative(monthKey, 0, batchSize);
        if (batch && batch.length > 0) {
          // Process batch and count viewed items
          viewedCount = await getViewedCount(batch);
          processedCount = batch.length;
        }
      } catch (error) {
        // Error loading batch for stats
      }
    }

    // Use summary totalCount if available, otherwise use processed count
    const totalCount =
      totalCountFromSummary > 0 ? totalCountFromSummary : processedCount;

    // Calculate percentage
    const percentage =
      totalCount > 0 ? Math.round((viewedCount / totalCount) * 100) : 0;
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
      // MEMORY OPTIMIZATION: Process items in batches without accumulating all in memory
      // Use native module to get items in batches
      const { fetchMonthPhotosNative } = await import('../native/PhotoMonths');

      let totalViewed = 0;
      let totalCount = 0;
      let offset = 0;
      const batchSize = 50; // MEMORY FIX: Reduced from 200 to 50 to prevent loading all items
      const maxItemsToProcess = 200; // MEMORY FIX: Reduced from 2000 to 200
      let hasMore = true;

      // Get total count from summary first
      const summary = monthSummaries.find(m => m.monthKey === monthKey);
      const expectedTotal = summary?.totalCount || 0;

      while (hasMore && totalCount < maxItemsToProcess) {
        const batch = await fetchMonthPhotosNative(monthKey, offset, batchSize);

        if (batch && batch.length > 0) {
          // Check viewed status for this batch without accumulating
          const batchViewed = await getViewedCount(batch);
          totalViewed += batchViewed;
          totalCount += batch.length;

          // Release batch from memory
          offset += batch.length;
          hasMore = batch.length === batchSize;

          // Early exit if we've checked enough items
          if (expectedTotal > 0 && totalCount >= expectedTotal) {
            break;
          }
        } else {
          hasMore = false;
        }
      }

      // Use expected total if available, otherwise use processed count
      const finalTotal = expectedTotal > 0 ? expectedTotal : totalCount;

      // Check if all items are viewed
      const isCompleted = finalTotal > 0 && totalViewed >= finalTotal;

      if (isCompleted) {
        setCompletedMonths(prev => new Set(prev).add(monthKey));
      }

      return isCompleted;
    } catch (error) {
      // Fallback to loaded items if native module fails
      const monthItems = getMonthItems(monthKey);
      if (monthItems.length > 0) {
        const isCompleted = await checkMonthCompletion(monthKey, monthItems);
        if (isCompleted) {
          setCompletedMonths(prev => new Set(prev).add(monthKey));
        }
        return isCompleted;
      }
      return false;
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
    // REMOVED: scanDuplicates causes memory leak (3GB at launch)
    // Replaced with no-op to prevent memory issues
    scanDuplicates: async () => {
      // No-op: Duplicate scanning removed due to memory issues
      // It was loading thousands of photos into memory at launch
      setDuplicateGroups({});
      setDuplicateItems([]);
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
