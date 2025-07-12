import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkMediaPermissions } from '../utils/permissions';
import { getViewingConfig, hoursToMs } from '../constants/app';

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

export interface MediaContextType {
  mediaItems: MediaItem[];
  groupedMedia: GroupedMedia;
  trashedItems: MediaItem[];
  selectedSources: string[];
  availableSources: string[];
  isLoading: boolean;
  hasPermission: boolean;
  onboardingComplete: boolean;
  viewingLimits: ViewingLimits;

  // Actions
  setMediaItems: (items: MediaItem[]) => void;
  addToTrash: (item: MediaItem) => void;
  restoreFromTrash: (item: MediaItem) => void;
  deleteFromTrash: (item: MediaItem) => void;
  setSelectedSources: (sources: string[]) => void;
  setHasPermission: (hasPermission: boolean) => void;
  setOnboardingComplete: (complete: boolean) => void;
  scanMedia: () => Promise<void>;

  // Viewing limits
  canViewMedia: () => boolean;
  incrementViewCount: () => void;
  getRemainingCooldownTime: () => number;
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
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [trashedItems, setTrashedItems] = useState<MediaItem[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>(['All']);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
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

  // Group media by month and source
  const groupedMedia = React.useMemo(() => {
    const grouped: GroupedMedia = {};

    mediaItems.forEach(item => {
      const date = new Date(item.timestamp);
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, '0')}`;

      if (!grouped[monthKey]) {
        grouped[monthKey] = {};
      }

      if (!grouped[monthKey][item.source]) {
        grouped[monthKey][item.source] = [];
      }

      grouped[monthKey][item.source].push(item);
    });

    return grouped;
  }, [mediaItems]);

  // Get available sources
  const availableSources = React.useMemo(() => {
    const sources = new Set<string>();
    mediaItems.forEach(item => sources.add(item.source));
    return ['All', ...Array.from(sources)];
  }, [mediaItems]);

  // Load persisted data on mount and check for expired cooldowns
  useEffect(() => {
    loadPersistedData();
  }, []);

  // Save trash to storage whenever it changes
  useEffect(() => {
    saveTrashToStorage();
  }, [trashedItems]);

  const loadPersistedData = async () => {
    try {
      const [
        storedTrash,
        storedOnboarding,
        storedPermission,
        storedViewingLimits,
      ] = await Promise.all([
        AsyncStorage.getItem('trashedItems'),
        AsyncStorage.getItem('onboardingComplete'),
        AsyncStorage.getItem('hasPermission'),
        AsyncStorage.getItem('viewingLimits'),
      ]);

      if (storedTrash) {
        setTrashedItems(JSON.parse(storedTrash));
      }

      if (storedOnboarding) {
        setOnboardingComplete(JSON.parse(storedOnboarding));
      }

      // Check current device permissions regardless of stored state
      const currentPermission = await checkMediaPermissions();
      setHasPermission(currentPermission);

      // Update stored permission state to match current reality
      await AsyncStorage.setItem(
        'hasPermission',
        JSON.stringify(currentPermission),
      );

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
      console.error('Error loading persisted data:', error);
    }
  };

  const saveTrashToStorage = async () => {
    try {
      await AsyncStorage.setItem('trashedItems', JSON.stringify(trashedItems));
    } catch (error) {
      console.error('Error saving trash to storage:', error);
    }
  };

  const scanMedia = async () => {
    setIsLoading(true);
    try {
      const { scanDeviceMedia } = await import('../utils/mediaScanner');
      const scannedItems = await scanDeviceMedia();
      setMediaItems(scannedItems);
    } catch (error) {
      console.error('Error scanning media:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addToTrash = (item: MediaItem) => {
    setTrashedItems(prev => [...prev, item]);
    setMediaItems(prev => prev.filter(i => i.id !== item.id));
  };

  const restoreFromTrash = (item: MediaItem) => {
    setTrashedItems(prev => prev.filter(i => i.id !== item.id));
    setMediaItems(prev => [...prev, item]);
  };

  const deleteFromTrash = (item: MediaItem) => {
    setTrashedItems(prev => prev.filter(i => i.id !== item.id));
    // TODO: Implement actual file deletion
  };

  const handleSetPermission = async (permission: boolean) => {
    setHasPermission(permission);
    try {
      await AsyncStorage.setItem('hasPermission', JSON.stringify(permission));
    } catch (error) {
      console.error('Error saving permission state:', error);
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
      console.error('Error saving onboarding state:', error);
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
      console.error('Error saving viewing limits to storage:', error);
    }
  };

  const value: MediaContextType = {
    mediaItems,
    groupedMedia,
    trashedItems,
    selectedSources,
    availableSources,
    isLoading,
    hasPermission,
    onboardingComplete,
    viewingLimits,
    setMediaItems,
    addToTrash,
    restoreFromTrash,
    deleteFromTrash,
    setSelectedSources,
    setHasPermission: handleSetPermission,
    setOnboardingComplete: handleSetOnboardingComplete,
    scanMedia,
    canViewMedia,
    incrementViewCount,
    getRemainingCooldownTime,
  };

  return (
    <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
  );
};
