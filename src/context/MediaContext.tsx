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
import { getViewingConfig, hoursToMs } from '../constants/app';
import { ScanProgress, MonthSummary } from '../utils/mediaScanner';

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
  cooldownEndTime?: number;
}

export interface MonthContent {
  items: MediaItem[];
  hasMore: boolean;
  nextCursor?: string;
  isLoading: boolean;
}

export interface MediaContextType {
  // Legacy support
  mediaItems: MediaItem[];
  groupedMedia: GroupedMedia;

  // New month-based approach
  monthSummaries: MonthSummary[];
  monthContent: { [monthKey: string]: MonthContent };

  // Common state
  trashedItems: MediaItem[];
  isLoading: boolean;
  scanProgress: ScanProgress | null;
  hasMore: boolean;
  hasPermission: boolean;
  onboardingComplete: boolean;
  viewingLimits: ViewingLimits;
  isPremiumUser: boolean;

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
  loadMonthContent: (monthKey: string) => Promise<MediaItem[]>;
  loadMoreMonthContent: (monthKey: string) => Promise<void>;
  getMonthItems: (monthKey: string) => MediaItem[];

  // Viewing limits
  canViewMedia: () => boolean;
  incrementViewCount: () => void;
  getRemainingCooldownTime: () => number;

  // Premium user management
  setPremiumStatus: (isPremium: boolean) => Promise<void>;
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
  });

  // Check and reset viewing limits if cooldown has expired
  useEffect(() => {
    const checkCooldown = () => {
      if (
        viewingLimits.cooldownEndTime &&
        Date.now() >= viewingLimits.cooldownEndTime
      ) {
        const { maxViews } = getViewingConfig();
        const resetLimits = {
          viewCount: 0,
          lastResetTime: Date.now(),
          isBlocked: false,
          remainingViews: maxViews,
        };
        setViewingLimits(resetLimits);
        saveViewingLimitsToStorage(resetLimits);
      }
    };

    // Check immediately when component mounts or when stored limits are loaded
    if (viewingLimits.cooldownEndTime) {
      checkCooldown();
    }

    const interval = setInterval(checkCooldown, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [viewingLimits.cooldownEndTime]);

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
  }, []);

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
      ] = await Promise.all([
        AsyncStorage.getItem('trashedItems'),
        AsyncStorage.getItem('onboardingComplete'),
        AsyncStorage.getItem('hasPermission'),
        AsyncStorage.getItem('viewingLimits'),
        AsyncStorage.getItem('isPremiumUser'),
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

      if (storedViewingLimits) {
        const limits = JSON.parse(storedViewingLimits);

        // Check if cooldown has expired since app was closed
        if (limits.cooldownEndTime && Date.now() >= limits.cooldownEndTime) {
          const { maxViews } = getViewingConfig();
          const resetLimits = {
            viewCount: 0,
            lastResetTime: Date.now(),
            isBlocked: false,
            remainingViews: maxViews,
          };
          setViewingLimits(resetLimits);
          saveViewingLimitsToStorage(resetLimits);
        } else {
          // Cooldown still active, load stored limits
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
  ): Promise<MediaItem[]> => {
    // Set loading state for this month
    setMonthContent(prev => ({
      ...prev,
      [monthKey]: {
        items: prev[monthKey]?.items || [],
        hasMore: prev[monthKey]?.hasMore || false,
        nextCursor: prev[monthKey]?.nextCursor,
        isLoading: true,
      },
    }));

    try {
      // Use native module for fast photo loading
      const { fetchMonthPhotosNative } = await import('../native/PhotoMonths');
      const nativePhotos = await fetchMonthPhotosNative(monthKey);

      if (nativePhotos && nativePhotos.length > 0) {
        // Cache all native photos for pagination
        setNativePhotoCache(prev => ({
          ...prev,
          [monthKey]: nativePhotos,
        }));

        setMonthContent(prev => ({
          ...prev,
          [monthKey]: {
            items: nativePhotos,
            hasMore: false, // We have all photos from native module
            nextCursor: undefined,
            isLoading: false,
          },
        }));

        // Return all photos for the media viewer
        return nativePhotos;
      } else {
        // Fallback to old method
        const { loadMonthContent } = await import('../utils/mediaScanner');
        const result = await loadMonthContent(monthKey, {
          batchSize: 50,
          onProgress: progress => {
            setScanProgress(progress);
          },
        });

        setMonthContent(prev => ({
          ...prev,
          [monthKey]: {
            items: result.items,
            hasMore: result.hasMore,
            nextCursor: result.nextCursor,
            isLoading: false,
          },
        }));

        return result.items;
      }
    } catch (error) {
      // Error loading month content
      setMonthContent(prev => ({
        ...prev,
        [monthKey]: {
          items: prev[monthKey]?.items || [],
          hasMore: false,
          nextCursor: undefined,
          isLoading: false,
        },
      }));

      return [];
    }
  };

  // Load more content for a specific month (not needed anymore since native module loads all photos)
  const loadMoreMonthContentMethod = async (monthKey: string) => {
    return;
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
    const { viewCount, isBlocked, cooldownEndTime } = viewingLimits;
    if (isBlocked && cooldownEndTime && Date.now() < cooldownEndTime) {
      return false;
    }
    return viewCount < getViewingConfig().maxViews;
  };

  const incrementViewCount = () => {
    const { maxViews, cooldownHours } = getViewingConfig();
    const newViewCount = viewingLimits.viewCount + 1;
    const isBlocked = newViewCount >= maxViews;
    const cooldownEndTime = isBlocked
      ? Date.now() + hoursToMs(cooldownHours)
      : undefined;

    const newLimits = {
      viewCount: newViewCount,
      lastResetTime: Date.now(),
      isBlocked,
      remainingViews: isBlocked ? 0 : maxViews - newViewCount,
      cooldownEndTime,
    };

    setViewingLimits(newLimits);
    saveViewingLimitsToStorage(newLimits);
  };

  const getRemainingCooldownTime = () => {
    const { cooldownEndTime } = viewingLimits;
    if (!cooldownEndTime) {
      return 0;
    }
    const remaining = cooldownEndTime - Date.now();
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

  const value: MediaContextType = {
    // Legacy
    mediaItems,
    groupedMedia,

    // New month-based
    monthSummaries,
    monthContent,

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

    // Viewing limits
    canViewMedia,
    incrementViewCount,
    getRemainingCooldownTime,

    // Premium
    setPremiumStatus,
  };

  return (
    <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
  );
};
