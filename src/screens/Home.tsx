import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  TouchableOpacity,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ParamListBase,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { MediaViewerScreenParams } from './MediaViewerScreen';
import { MonthSelectionScreenParams } from './MonthSelectionScreen';

type HomeStackParamList = {
  Home: undefined;
  MonthSelectionScreen: MonthSelectionScreenParams;
  MediaViewerScreen: MediaViewerScreenParams;
};

type HomeNavigationProp = StackNavigationProp<HomeStackParamList>;
import { setHomeTabPressHandler } from '../context/TabPressContext';
import LinearGradient from 'react-native-linear-gradient';
import {
  LiquidGlassView,
  isLiquidGlassSupported,
} from '@callstack/liquid-glass';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMedia, MediaItem } from '../context/MediaContext';
import { useAdmin } from '../context/adminContext';
import MediaViewer from '../components/MediaViewer';
import ScreenBackground from '../components/ScreenBackground';
import UpgradeSheet from '../components/UpgradeSheet';
import { checkMediaPermissionsWithRetry } from '../utils/permissions';
import { getViewingConfig } from '../constants/app';
import { getViewBudget } from '../utils/viewBudget';
import { hapticTap } from '../utils/haptics';
import {
  colors,
  getSkinTheme,
  getTabBarClearance,
  monthTints,
  MONTH_ABBREVIATIONS,
} from '../theme';
import {
  loadViewedItems,
  getLastViewedItemId,
} from '../utils/viewedMediaTracker';

const MONTH_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'needToFinish', label: 'In progress' },
  { key: 'notStarted', label: 'Not started' },
] as const;

const keepFlickMark = require('../assets/kf-mark.png');

// Unified 4-color pastel palette (Light Blue, Light Purple, Light Teal, Light Pink)
const gradientPalette = {
  lightBlue: ['#9FD3FF', '#CBE7FF'],
  lightPurple: ['#CDB6FF', '#E6DDFF'],
  lightTeal: ['#A8F0E1', '#D1FFF4'],
  lightPink: ['#FFB3C1', '#FFD6E0'],
  frostyBlue: ['#B0E0E6', '#E0F6FF'], // Frosty blue for pink theme when liquid glass is unavailable
  frostyPink: ['#FFC0CB', '#FFE4E9'], // Frosty pink for blue theme when liquid glass is unavailable
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Abstract Lines Background Component
const AbstractLinesBackground: React.FC = () => {
  return (
    <View style={styles.abstractBackground} pointerEvents="none">
      {/* Diagonal lines - much more visible */}
      <View
        style={[
          styles.abstractLine,
          styles.line1,
          { backgroundColor: 'rgba(0, 217, 255, 0.3)' },
        ]}
      />
      <View
        style={[
          styles.abstractLine,
          styles.line2,
          { backgroundColor: 'rgba(147, 51, 234, 0.3)' },
        ]}
      />
      <View
        style={[
          styles.abstractLine,
          styles.line3,
          { backgroundColor: 'rgba(59, 130, 246, 0.3)' },
        ]}
      />
      <View
        style={[
          styles.abstractLine,
          styles.line4,
          { backgroundColor: 'rgba(168, 85, 247, 0.3)' },
        ]}
      />
      <View
        style={[
          styles.abstractLine,
          styles.line5,
          { backgroundColor: 'rgba(96, 165, 250, 0.3)' },
        ]}
      />

      {/* More diagonal lines */}
      <View
        style={[
          styles.abstractLine,
          styles.line6,
          { backgroundColor: 'rgba(0, 217, 255, 0.25)' },
        ]}
      />
      <View
        style={[
          styles.abstractLine,
          styles.line7,
          { backgroundColor: 'rgba(147, 51, 234, 0.25)' },
        ]}
      />

      {/* Horizontal accent lines */}
      <View
        style={[
          styles.horizontalLine,
          styles.hLine1,
          { backgroundColor: 'rgba(147, 51, 234, 0.25)' },
        ]}
      />
      <View
        style={[
          styles.horizontalLine,
          styles.hLine2,
          { backgroundColor: 'rgba(59, 130, 246, 0.25)' },
        ]}
      />
      <View
        style={[
          styles.horizontalLine,
          styles.hLine3,
          { backgroundColor: 'rgba(0, 217, 255, 0.25)' },
        ]}
      />
      <View
        style={[
          styles.horizontalLine,
          styles.hLine4,
          { backgroundColor: 'rgba(168, 85, 247, 0.25)' },
        ]}
      />

      {/* Vertical accent lines */}
      <View
        style={[
          styles.verticalLine,
          styles.vLine1,
          { backgroundColor: 'rgba(168, 85, 247, 0.25)' },
        ]}
      />
      <View
        style={[
          styles.verticalLine,
          styles.vLine2,
          { backgroundColor: 'rgba(96, 165, 250, 0.25)' },
        ]}
      />
      <View
        style={[
          styles.verticalLine,
          styles.vLine3,
          { backgroundColor: 'rgba(0, 217, 255, 0.25)' },
        ]}
      />
    </View>
  );
};

const Home: React.FC = () => {
  const navigation = useNavigation<HomeNavigationProp>();
  const insets = useSafeAreaInsets();
  const {
    monthSummaries,
    monthContent,
    duplicateItems,
    duplicateGroups,
    isLoading,
    scanProgress,
    hasPermission,
    setHasPermission,
    scanMonthSummaries,
    // scanDuplicates, // REMOVED: Causes memory leak at launch
    loadMonthContent,
    loadMoreMonthContent,
    getMonthItems,
    viewingLimits,
    canViewMedia,
    isPremiumUser,
    viewedMonths,
    individualMonthProgress,
    monthProgress,
    markMonthAsViewed,
    getMonthViewedStats,
    isMediaItemViewed,
  } = useMedia();

  const {
    isTablet,
    screenWidth,
    isSmallScreen,
    isMediumScreen,
    isLargeScreen,
  } = useAdmin();

  const [viewerVisible, setViewerVisible] = useState(false);
  // Remove viewerItems state
  // const [viewerItems, setViewerItems] = useState<MediaItem[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [currentViewingMonth, setCurrentViewingMonth] = useState<string>('');
  const [selectedMediaType, setSelectedMediaType] = useState<
    'photos' | 'videos' | 'all'
  >('all');
  const [hideTimeFilters, setHideTimeFilters] = useState(false);
  const [hideSourceFilters, setHideSourceFilters] = useState(false);
  const [timeFilterItems, setTimeFilterItems] = useState<MediaItem[]>([]);
  const [specialFiltersCollapsed, setSpecialFiltersCollapsed] = useState(true);
  const [monthCompletionStatus, setMonthCompletionStatus] = useState<{
    [monthKey: string]: boolean;
  }>({});
  const [monthViewingProgress, setMonthViewingProgress] = useState<{
    [monthKey: string]: {
      viewed: number;
      total: number;
      remaining: number;
      started: boolean;
    };
  }>({});
  const [statusLoaded, setStatusLoaded] = useState<number>(0);
  const [monthFilter, setMonthFilter] = useState<
    'all' | 'needToFinish' | 'notStarted'
  >('all');
  const [skin, setSkin] = useState<'pink' | 'blue'>('blue');
  const [upgradeSheetVisible, setUpgradeSheetVisible] = useState(false);

  // The inline viewer is immersive: hide the floating tab bar while it is open
  useEffect(() => {
    navigation
      .getParent<BottomTabNavigationProp<ParamListBase>>()
      ?.setOptions({ tabBarStyle: viewerVisible ? { display: 'none' } : {} });
  }, [navigation, viewerVisible]);

  // Cache viewed items Set for performance (avoid reloading on every check)
  const viewedItemsCacheRef = useRef<Set<string> | null>(null);

  // Debounce timer for saving progress (avoid blocking UI on every swipe)
  const saveProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingProgressRef = useRef<{
    [monthKey: string]: {
      viewed: number;
      total: number;
      remaining: number;
      started: boolean;
    };
  } | null>(null);

  // Load viewed items cache on mount
  useEffect(() => {
    const loadCache = async () => {
      try {
        viewedItemsCacheRef.current = await loadViewedItems();
      } catch (error) {
        // Error loading viewed items cache
      }
    };
    loadCache();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    // REMOVED scanDuplicates - causes memory leak (3GB at launch)
    await scanMonthSummaries();
    setRefreshing(false);
  };

  const handleMonthPress = async (monthKey: string) => {
    // Find the month summary to get the counts
    const monthSummary = monthSummaries.find(m => m.monthKey === monthKey);

    if (!monthSummary) {
      Alert.alert('Error', 'Month data not found');
      return;
    }

    // Navigate to MonthSelectionScreen
    navigation.navigate('MonthSelectionScreen', {
      monthKey: monthSummary.monthKey,
      monthName: monthSummary.monthName,
    });
  };

  const handleCloseViewer = async () => {
    const viewingMonth = currentViewingMonth;
    setViewerVisible(false);
    setCurrentViewingMonth('');
    setSelectedMediaType('all');

    // Refresh viewed items cache for next time
    try {
      viewedItemsCacheRef.current = await loadViewedItems();
    } catch (error) {
      // Error refreshing viewed items cache
    }

    // Refresh completion status and progress for the month that was being viewed
    if (
      viewingMonth &&
      !viewingMonth.startsWith('TIME_FILTER_') &&
      !viewingMonth.startsWith('SOURCE_FILTER_')
    ) {
      (async () => {
        try {
          // Update progress - force immediate save on viewer close
          const stats = await getMonthViewedStats(viewingMonth);
          const started = stats.viewedCount > 0;
          const remaining = stats.totalCount - stats.viewedCount;
          setMonthViewingProgress(prev => {
            const newProgress = {
              ...prev,
              [viewingMonth]: {
                viewed: stats.viewedCount,
                total: stats.totalCount,
                remaining,
                started,
              },
            };
            // Save immediately on viewer close (don't debounce)
            // Clear any pending debounced save first
            if (saveProgressTimerRef.current) {
              clearTimeout(saveProgressTimerRef.current);
              saveProgressTimerRef.current = null;
            }
            // Save the new progress state immediately
            (async () => {
              try {
                await AsyncStorage.setItem(
                  'monthViewingProgress',
                  JSON.stringify(newProgress),
                );
                pendingProgressRef.current = null;
              } catch (error) {
                // Error saving month viewing progress
              }
            })();
            return newProgress;
          });

          // Check completion status after a slight delay to allow MediaViewer
          // unmount cleanup (which marks completion asynchronously) to finish
          setTimeout(async () => {
            try {
              const { isMonthCompleted } = await import(
                '../utils/viewedMediaTracker'
              );
              const isCompleted = await isMonthCompleted(viewingMonth);
              setMonthCompletionStatus(prev => ({
                ...prev,
                [viewingMonth]: isCompleted,
              }));
            } catch (error) {
              // Error checking delayed completion status
            }
          }, 2500);
        } catch (error) {
          // Error checking completion status
        }
      })();
    }
  };

  // Close media viewer when Home tab is pressed while it is open
  const modalOpenTimeRef = useRef(0);
  const isHomeFocusedRef = useRef(false);

  // Track when modals are opened
  useEffect(() => {
    if (viewerVisible) {
      modalOpenTimeRef.current = Date.now();
    }
  }, [viewerVisible]);

  // Register handler for Home tab press
  useEffect(() => {
    const handleHomeTabPress = () => {
      // Only close modals if we're already on Home screen
      if (isHomeFocusedRef.current) {
        const timeSinceModalOpen = Date.now() - modalOpenTimeRef.current;
        // Close modals if they're open and weren't just opened (avoid closing immediately)
        if (timeSinceModalOpen > 300) {
          if (viewerVisible) {
            handleCloseViewer();
          }
        }
      }
    };

    setHomeTabPressHandler(handleHomeTabPress);

    return () => {
      setHomeTabPressHandler(null);
    };
  }, [viewerVisible]);

  // Load skin preference function
  const loadSkinPreference = async () => {
    try {
      const savedSkin = await AsyncStorage.getItem('skin');
      if (savedSkin === 'pink' || savedSkin === 'blue') {
        setSkin(savedSkin);
      }
    } catch (error) {
      // Error loading skin preference
    }
  };

  // Save month viewing progress to storage (debounced to avoid blocking UI)
  const saveMonthViewingProgress = (progress: {
    [monthKey: string]: {
      viewed: number;
      total: number;
      remaining: number;
      started: boolean;
    };
  }) => {
    // Store pending progress
    pendingProgressRef.current = progress;

    // Clear existing timer
    if (saveProgressTimerRef.current) {
      clearTimeout(saveProgressTimerRef.current);
    }

    // Debounce save operation (save 1 second after last update)
    saveProgressTimerRef.current = setTimeout(async () => {
      if (pendingProgressRef.current) {
        try {
          await AsyncStorage.setItem(
            'monthViewingProgress',
            JSON.stringify(pendingProgressRef.current),
          );
        } catch (error) {
          // Error saving month viewing progress
        }
        pendingProgressRef.current = null;
      }
      saveProgressTimerRef.current = null;
    }, 1000);
  };

  // Force immediate save (call on viewer close)
  const saveMonthViewingProgressImmediately = async () => {
    // Clear any pending debounced save
    if (saveProgressTimerRef.current) {
      clearTimeout(saveProgressTimerRef.current);
      saveProgressTimerRef.current = null;
    }

    // Save current state immediately
    if (pendingProgressRef.current) {
      try {
        await AsyncStorage.setItem(
          'monthViewingProgress',
          JSON.stringify(pendingProgressRef.current),
        );
        pendingProgressRef.current = null;
      } catch (error) {
        // Error saving month viewing progress
      }
    }
  };

  // Load month viewing progress from storage
  const loadMonthViewingProgress = async (): Promise<{
    [monthKey: string]: {
      viewed: number;
      total: number;
      remaining: number;
      started: boolean;
    };
  }> => {
    try {
      const stored = await AsyncStorage.getItem('monthViewingProgress');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      // Error loading month viewing progress
    }
    return {};
  };

  // Load and update month completion status and progress
  // Extract as a reusable function so it can be called from multiple places
  // Completion is a cached lookup and progress comes from storage, so no media is loaded
  const loadMonthStatus = React.useCallback(async () => {
    if (monthSummaries.length === 0) return;

    const status: { [monthKey: string]: boolean } = {};

    // Load persisted progress from storage first (fast)
    const persistedProgress = await loadMonthViewingProgress();
    const progress: {
      [monthKey: string]: {
        viewed: number;
        total: number;
        remaining: number;
        started: boolean;
      };
    } = { ...persistedProgress };

    // Completion is a cached Set lookup and progress comes from storage, so every
    // month can be processed without loading any media
    const { isMonthCompleted } = await import('../utils/viewedMediaTracker');
    for (const summary of monthSummaries) {
      try {
        status[summary.monthKey] = await isMonthCompleted(summary.monthKey);
      } catch (e) {
        status[summary.monthKey] = false;
      }

      // No persisted progress yet: initialize from the summary
      if (!persistedProgress[summary.monthKey]) {
        const totalCount = summary.totalCount || 0;
        progress[summary.monthKey] = {
          viewed: 0,
          total: totalCount,
          remaining: totalCount,
          started: false,
        };
      }
    }
    // Use functional update to ensure state is set even if component re-renders
    // Force update by creating new objects to ensure React detects the change
    // Update both states and statusLoaded together to ensure re-render
    // IMPORTANT: Preserve existing progress when updating - only overwrite if month doesn't have progress
    setMonthCompletionStatus(prev => {
      const newStatus = { ...prev, ...status };
      // Return new object even if values are the same to force re-render
      return newStatus;
    });
    setMonthViewingProgress(prev => {
      // Always update progress from storage when loading month status
      // This ensures progress is refreshed when returning from MediaViewerScreen
      const newProgress = { ...prev };
      for (const monthKey in progress) {
        // Always use persisted progress from storage if available (it's the source of truth)
        // This ensures we get the latest progress when returning from MediaViewerScreen
        newProgress[monthKey] = progress[monthKey];
      }
      // Return new object even if values are the same to force re-render
      return newProgress;
    });
    // Mark status as loaded to trigger re-render (used in key to force component remount)
    // This will change the key and force React to re-render the month cards
    // Use a counter or timestamp to ensure React always sees a change
    setStatusLoaded(prev => {
      // Always return a new value to ensure React detects the change
      return Date.now();
    });
  }, [monthSummaries]);

  // Track when Home screen is focused and reload preferences
  useFocusEffect(
    React.useCallback(() => {
      isHomeFocusedRef.current = true;
      // Reload preferences when screen comes into focus (in case they were changed in About tab)
      loadHidePreferences();
      loadSkinPreference();
      // Progress and completion are persisted before the viewer navigates back,
      // so they can be read right away
      setStatusLoaded(0);
      loadMonthStatus();
      return () => {
        isHomeFocusedRef.current = false;
      };
    }, [loadMonthStatus]),
  );

  const handleToggleTheme = async () => {
    const newSkin = skin === 'pink' ? 'blue' : 'pink';
    setSkin(newSkin);
    await AsyncStorage.setItem('skin', newSkin);
  };

  const handleOpenUpgradeSheet = () => {
    hapticTap();
    setUpgradeSheetVisible(true);
  };

  // Drives the header badge: wording, colour and fill level of the free-view budget
  const viewBudget = getViewBudget(
    viewingLimits.remainingViews,
    getViewingConfig().maxViews,
    viewingLimits.isBlocked,
  );
  const theme = getSkinTheme(skin);

  const handleHideTimeFilters = async () => {
    const newValue = !hideTimeFilters;
    setHideTimeFilters(newValue);
    await AsyncStorage.setItem('hideTimeFilters', JSON.stringify(newValue));

    // Show help message for first time hiding
    const hasShownHelp = await AsyncStorage.getItem('hasShownHideHelp');
    if (!hasShownHelp) {
      Alert.alert(
        'Hide Filters',
        'To unhide the filters, just tap the about icon (ℹ️) in the header.',
        [
          {
            text: 'OK',
            onPress: () => AsyncStorage.setItem('hasShownHideHelp', 'true'),
          },
        ],
      );
    }
  };

  const handleHideSourceFilters = async () => {
    const newValue = !hideSourceFilters;
    setHideSourceFilters(newValue);
    await AsyncStorage.setItem('hideSourceFilters', JSON.stringify(newValue));

    // Show help message for first time hiding
    const hasShownHelp = await AsyncStorage.getItem('hasShownHideHelp');
    if (!hasShownHelp) {
      Alert.alert(
        'Hide Filters',
        'To unhide the filters, just tap the about icon (ℹ️) in the header.',
        [
          {
            text: 'OK',
            onPress: () => AsyncStorage.setItem('hasShownHideHelp', 'true'),
          },
        ],
      );
    }
  };

  // Helper function to find the first unviewed item index (optimized with cache)
  const findFirstUnviewedIndex = async (
    items: MediaItem[],
  ): Promise<number> => {
    if (items.length === 0) return 0;

    try {
      // Use cached viewed items if available, otherwise load (will cache for next time)
      let viewedItems = viewedItemsCacheRef.current;
      if (!viewedItems) {
        viewedItems = await loadViewedItems();
        viewedItemsCacheRef.current = viewedItems;
      }

      // Find the first item that hasn't been viewed
      // Early exit optimization: if first item is unviewed, return immediately
      if (items.length > 0 && !viewedItems.has(items[0].id)) {
        return 0;
      }

      // Check remaining items
      for (let i = 1; i < items.length; i++) {
        if (!viewedItems.has(items[i].id)) {
          return i;
        }
      }

      // If all items are viewed, start at the beginning
      return 0;
    } catch (error) {
      return 0;
    }
  };

  // Helper function to get the starting index for a month
  // Tries to resume from last viewed item for this month, falls back to first unviewed item
  const getStartingIndex = async (
    items: MediaItem[],
    monthKey: string,
  ): Promise<number> => {
    if (items.length === 0) return 0;

    try {
      // First, try to get the last viewed item ID for this month
      const lastViewedItemId = await getLastViewedItemId(monthKey);

      if (lastViewedItemId) {
        // Find that item in the current items array
        const foundIndex = items.findIndex(
          item => item.id === lastViewedItemId,
        );
        if (foundIndex >= 0) {
          // Resume from where user left off in this month
          return foundIndex;
        }
      }

      // If last viewed item not found in current array, fall back to finding first unviewed item
      return await findFirstUnviewedIndex(items);
    } catch (error) {
      // On error, fall back to first unviewed index
      return await findFirstUnviewedIndex(items);
    }
  };

  const handleSourceFilterPress = (source: string) => {
    // Filter all month content for items from the specified source
    const filteredItems: MediaItem[] = [];
    Object.values(monthContent).forEach(content => {
      let itemsFromSource: MediaItem[] = [];

      if (source === 'screenshots') {
        // Enhanced screenshot detection
        itemsFromSource = content.items.filter(item => {
          const sourceLower = item.source.toLowerCase();
          const filenameLower = item.filename.toLowerCase();

          return (
            sourceLower.includes('screenshot') ||
            sourceLower.includes('screen shot') ||
            filenameLower.includes('screenshot') ||
            filenameLower.includes('screen shot') ||
            (filenameLower.startsWith('img_') &&
              filenameLower.includes('screenshot')) ||
            filenameLower.startsWith('screenshot') ||
            // Common screenshot patterns
            /screenshot|screen.?shot/i.test(filenameLower) ||
            // iOS screenshot pattern
            /^img_\d{8}_\d{6}$/.test(filenameLower.replace(/\.[^.]*$/, ''))
          );
        });
      } else {
        // Regular source filtering
        itemsFromSource = content.items.filter(item =>
          item.source.toLowerCase().includes(source.toLowerCase()),
        );
      }

      filteredItems.push(...itemsFromSource);
    });

    if (filteredItems.length > 0) {
      setViewerInitialIndex(0);
      setViewerVisible(true);
      setCurrentViewingMonth(`SOURCE_FILTER_${source}`);
    } else {
      Alert.alert('No Media', `No media found from ${source}`);
    }
  };

  const handleTimeFilterPress = async (
    filter: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth',
  ) => {
    const now = new Date();
    let startTime: number;
    let endTime: number;

    switch (filter) {
      case 'today':
        startTime = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).getTime();
        endTime = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
        ).getTime();
        break;
      case 'yesterday':
        startTime = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 1,
        ).getTime();
        endTime = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).getTime();
        break;
      case 'thisWeek':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startTime = new Date(
          startOfWeek.getFullYear(),
          startOfWeek.getMonth(),
          startOfWeek.getDate(),
        ).getTime();
        endTime = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
        ).getTime();
        break;
      case 'thisMonth':
        startTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        endTime = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        break;
      default:
        return;
    }

    // More efficient approach: Only load months that could contain items in the time range
    const allItems: MediaItem[] = [];
    const targetMonth = new Date(startTime);
    const targetMonthKey = `${targetMonth.getFullYear()}-${String(
      targetMonth.getMonth() + 1,
    ).padStart(2, '0')}`;

    // Only load the specific month that could contain today/yesterday items
    const relevantMonthKey =
      filter === 'today' || filter === 'yesterday' ? targetMonthKey : null;

    if (
      relevantMonthKey &&
      monthSummaries.find(s => s.monthKey === relevantMonthKey)
    ) {
      if (!monthContent[relevantMonthKey]) {
        try {
          // Load with a reasonable limit to prevent memory issues
          // MEMORY FIX: Reduced from 200 to 20 items to prevent memory bloat
          const items = await loadMonthContent(relevantMonthKey, 20);
          if (items.length > 0) {
            allItems.push(...items);
          }
        } catch (error) {
          // Error loading month content
        }
      } else {
        allItems.push(...monthContent[relevantMonthKey].items);
      }
    } else {
      // For broader time ranges, use existing loaded content
      for (const summary of monthSummaries) {
        if (monthContent[summary.monthKey]) {
          allItems.push(...monthContent[summary.monthKey].items);
        }
      }
    }

    // Filter items within the time range
    const filteredItems = allItems.filter(
      item => item.timestamp >= startTime && item.timestamp < endTime,
    );

    if (filteredItems.length > 0) {
      setTimeFilterItems(filteredItems);
      setViewerInitialIndex(0);
      setViewerVisible(true);
      setCurrentViewingMonth(`TIME_FILTER_${filter}`);
    } else {
      Alert.alert(
        'No Media',
        `No media found for ${filter.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
      );
    }
  };

  const handleViewProgress = async (
    viewedCount: number,
    _totalCount?: number,
  ) => {
    if (
      currentViewingMonth &&
      !currentViewingMonth.startsWith('TIME_FILTER_') &&
      !currentViewingMonth.startsWith('SOURCE_FILTER_')
    ) {
      // Get total count from summary (fast, no item loading)
      const summary = monthSummaries.find(
        m => m.monthKey === currentViewingMonth,
      );
      const totalCount = summary?.totalCount || 0;
      const remaining = totalCount - viewedCount;
      const started = viewedCount > 0;

      const updatedProgress = {
        viewed: viewedCount,
        total: totalCount,
        remaining,
        started,
      };

      // Update state immediately (fast, no blocking)
      setMonthViewingProgress(prev => {
        const newProgress = {
          ...prev,
          [currentViewingMonth]: updatedProgress,
        };
        // Save to storage (debounced, non-blocking)
        saveMonthViewingProgress(newProgress);
        return newProgress;
      });

      // Check completion status periodically (not on every swipe)
      // Only check every 5 items to avoid blocking
      if (viewedCount % 5 === 0 || remaining === 0) {
        try {
          const { isMonthCompleted } = await import(
            '../utils/viewedMediaTracker'
          );
          const isCompleted = await isMonthCompleted(currentViewingMonth);
          setMonthCompletionStatus(prev => ({
            ...prev,
            [currentViewingMonth]: isCompleted,
          }));
        } catch (error) {
          // Error checking completion status in handleViewProgress
        }
      }
    }
  };

  const handleRetryPermissions = async () => {
    try {
      const hasPermission = await checkMediaPermissionsWithRetry();
      if (hasPermission) {
        setHasPermission(true);
        // REMOVED scanDuplicates - causes memory leak (3GB at launch)
        await scanMonthSummaries();
      } else {
        Alert.alert(
          'Permission Required',
          'Unable to access your photos. Please check your device settings and ensure photo access is enabled.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                const { openSettings } = require('react-native-permissions');
                openSettings();
              },
            },
          ],
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        'There was an issue checking permissions. Please try again.',
        [{ text: 'OK' }],
      );
    }
  };

  useEffect(() => {
    if (hasPermission && monthSummaries.length === 0) {
      // REMOVED scanDuplicates - causes memory leak (3GB at launch)
      scanMonthSummaries();
    }
  }, [hasPermission]);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveProgressTimerRef.current) {
        clearTimeout(saveProgressTimerRef.current);
        saveProgressTimerRef.current = null;
      }
      // Save any pending progress before unmounting
      if (pendingProgressRef.current) {
        AsyncStorage.setItem(
          'monthViewingProgress',
          JSON.stringify(pendingProgressRef.current),
        ).catch(() => {
          // Error saving on unmount
        });
      }
    };
  }, []);

  // Load hide preferences function
  const loadHidePreferences = async () => {
    try {
      const [timeFiltersHidden, sourceFiltersHidden] = await Promise.all([
        AsyncStorage.getItem('hideTimeFilters'),
        AsyncStorage.getItem('hideSourceFilters'),
      ]);

      if (timeFiltersHidden) {
        setHideTimeFilters(JSON.parse(timeFiltersHidden));
      }
      if (sourceFiltersHidden) {
        setHideSourceFilters(JSON.parse(sourceFiltersHidden));
      }
    } catch (error) {
      // Error loading hide preferences
    }
  };

  // Load hide preferences and skin preference on mount
  useEffect(() => {
    loadHidePreferences();
    loadSkinPreference();
  }, []);

  useEffect(() => {
    loadMonthStatus();
  }, [loadMonthStatus]);

  // Refresh completion status periodically and when content changes
  // MEMORY FIX: Disabled automatic refresh to prevent loading all months
  // Only refresh when viewer closes, not periodically
  useEffect(() => {
    // DISABLED: This was causing all months to load on startup
    // The refreshStatus function was calling getMonthViewedStats for ALL months
    // which triggered loading 200 items per month. This is now disabled.
    // Status will be refreshed when viewer closes (handled in handleCloseViewer)

    return () => {
      // Cleanup if needed
    };
  }, [monthSummaries, viewerVisible]);

  if (!hasPermission) {
    return (
      <ScreenBackground skin={skin}>
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" />
          <View style={styles.permissionContainer}>
            <View style={styles.permissionContent}>
              <View style={styles.stateIconWrap}>
                <Text style={styles.stateIcon}>📱</Text>
              </View>
              <Text style={styles.permissionTitle}>Media access needed</Text>
              <Text style={styles.permissionText}>
                Allow photo access so KeepFlick can organize your library month
                by month.
              </Text>
              {Platform.OS === 'ios' && (
                <Text style={styles.permissionSubtext}>
                  On iPad, you may need to retry if you've already granted
                  permission.
                </Text>
              )}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.accent },
                ]}
                onPress={handleRetryPermissions}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.primaryButtonText, { color: theme.accentInk }]}
                >
                  Allow access
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const renderScanProgress = () => {
    if (!scanProgress) return null;

    const { current, total, phase } = scanProgress;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

    let phaseText = '';
    switch (phase) {
      case 'fetching':
        phaseText = 'Finding months...';
        break;
      case 'processing':
        phaseText = 'Processing months...';
        break;
      case 'complete':
        phaseText = 'Complete!';
        break;
    }

    return (
      <View style={styles.scanProgressContainer}>
        <View style={styles.scanProgressHeader}>
          <Text style={styles.scanProgressText}>{phaseText}</Text>
          <Text style={styles.scanProgressCounter}>
            {current} / {total} · {percentage}%
          </Text>
        </View>
        <View style={styles.scanProgressBar}>
          <View
            style={[
              styles.scanProgressFill,
              { width: `${percentage}%`, backgroundColor: theme.accent },
            ]}
          />
        </View>
      </View>
    );
  };

  // Get the items to show in the viewer
  let viewerItems: MediaItem[] = [];
  if (currentViewingMonth && currentViewingMonth.startsWith('TIME_FILTER_')) {
    // For time filters, use the pre-filtered items
    viewerItems = timeFilterItems;
  } else if (
    currentViewingMonth &&
    currentViewingMonth.startsWith('SOURCE_FILTER_')
  ) {
    // For source filters, calculate the filtered items
    const source = currentViewingMonth.replace('SOURCE_FILTER_', '');

    // Filter all month content for items from the specified source
    Object.values(monthContent).forEach(content => {
      let itemsFromSource: MediaItem[] = [];

      if (source === 'screenshots') {
        // Enhanced screenshot detection
        itemsFromSource = content.items.filter(item => {
          const sourceLower = item.source.toLowerCase();
          const filenameLower = item.filename.toLowerCase();

          return (
            sourceLower.includes('screenshot') ||
            sourceLower.includes('screen shot') ||
            filenameLower.includes('screenshot') ||
            filenameLower.includes('screen shot') ||
            (filenameLower.startsWith('img_') &&
              filenameLower.includes('screenshot')) ||
            filenameLower.startsWith('screenshot') ||
            // Common screenshot patterns
            /screenshot|screen.?shot/i.test(filenameLower) ||
            // iOS screenshot pattern
            /^img_\d{8}_\d{6}$/.test(filenameLower.replace(/\.[^.]*$/, ''))
          );
        });
      } else {
        // Regular source filtering
        itemsFromSource = content.items.filter(item =>
          item.source.toLowerCase().includes(source.toLowerCase()),
        );
      }

      viewerItems.push(...itemsFromSource);
    });
  } else if (currentViewingMonth) {
    const allItems = monthContent[currentViewingMonth]?.items || [];

    // Filter by selected media type only for regular months
    if (selectedMediaType === 'photos') {
      viewerItems = allItems.filter(item => item.type === 'photo');
    } else if (selectedMediaType === 'videos') {
      viewerItems = allItems.filter(item => item.type === 'video');
    } else {
      viewerItems = allItems;
    }
  }

  const totalItems = monthSummaries.reduce(
    (sum, summary) => sum + (summary.totalCount || 0),
    0,
  );

  return (
    <ScreenBackground skin={skin}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <Image
                source={keepFlickMark}
                style={styles.brandMark}
                resizeMode="contain"
              />
              <View style={styles.brandText}>
                <Text style={styles.brandName}>KeepFlick</Text>
                {monthSummaries.length > 0 && (
                  <Text style={styles.brandSubtitle} numberOfLines={1}>
                    {monthSummaries.length}{' '}
                    {monthSummaries.length === 1 ? 'month' : 'months'}
                    {totalItems > 0 &&
                      ` · ${totalItems.toLocaleString()} items`}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.rightSection}>
              <TouchableOpacity
                style={[
                  styles.glassPill,
                  isSmallScreen && styles.glassPillCompact,
                ]}
                onPress={handleToggleTheme}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Theme: ${skin}. Switch theme`}
              >
                <View
                  style={[styles.themeDot, { backgroundColor: theme.accent }]}
                />
                {!isSmallScreen && (
                  <Text style={styles.glassPillText}>Theme</Text>
                )}
              </TouchableOpacity>
              {!isSmallScreen && (
                <TouchableOpacity
                  style={styles.glassIconButton}
                  onPress={handleRefresh}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Rescan library"
                >
                  <Text style={styles.glassIconText}>
                    {isLoading ? '⟳' : '↻'}
                  </Text>
                </TouchableOpacity>
              )}
              {!isPremiumUser && (
                <TouchableOpacity
                  style={[
                    styles.viewingLimitsBadge,
                    isSmallScreen && styles.viewingLimitsBadgeMobile,
                    {
                      backgroundColor: viewBudget.background,
                      borderColor: viewBudget.border,
                    },
                  ]}
                  onPress={handleOpenUpgradeSheet}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${viewBudget.label}. Upgrade to Premium for unlimited views`}
                  accessibilityHint="Opens upgrade options"
                  testID="viewing-limits-badge"
                >
                  <View style={styles.viewingLimitsRow}>
                    <Text
                      style={[
                        styles.viewingLimitsText,
                        isSmallScreen && styles.viewingLimitsTextMobile,
                        {
                          color: viewBudget.color,
                          textShadowColor: viewBudget.border,
                        },
                      ]}
                    >
                      {viewBudget.label}
                    </Text>
                    <Text
                      style={[
                        styles.viewingLimitsChevron,
                        { color: viewBudget.color },
                      ]}
                    >
                      ›
                    </Text>
                  </View>
                  <View style={styles.viewingLimitsTrack}>
                    <View
                      style={[
                        styles.viewingLimitsFill,
                        {
                          width: `${Math.round(viewBudget.fraction * 100)}%`,
                          backgroundColor: viewBudget.color,
                        },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Scan Progress */}
        {renderScanProgress()}

        {/* Content */}
        {isLoading && monthSummaries.length === 0 ? (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={styles.loadingText}>Scanning your library…</Text>
              <Text style={styles.loadingHint}>
                This only takes a moment the first time.
              </Text>
            </View>
          </View>
        ) : monthSummaries.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyContent}>
              <View style={styles.stateIconWrap}>
                <Text style={styles.stateIcon}>📸</Text>
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>
                No photos or videos were found on this device.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.scrollViewContainer}>
            <ScrollView
              style={styles.scrollView}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor="#ffffff"
                />
              }
              showsVerticalScrollIndicator={false}
            >
              {/* Special Filters Section */}
              {false && (
                <View style={styles.specialFiltersContainer}>
                  <TouchableOpacity
                    style={styles.specialFiltersHeaderRow}
                    onPress={() =>
                      setSpecialFiltersCollapsed(!specialFiltersCollapsed)
                    }
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.specialFiltersHeaderText,
                        skin === 'blue' && { color: '#ffffff' },
                      ]}
                    >
                      Special Filters
                    </Text>
                    <Text
                      style={[
                        styles.specialFiltersChevron,
                        skin === 'blue' && { color: '#ffffff' },
                      ]}
                    >
                      {specialFiltersCollapsed ? '⌄' : '⌃'}
                    </Text>
                  </TouchableOpacity>

                  {!specialFiltersCollapsed && (
                    <>
                      {/* Recent group */}
                      <View style={styles.filterGroup}>
                        <View style={styles.groupHeaderRow}>
                          <Text
                            style={[
                              styles.groupTitle,
                              skin === 'blue' && { color: '#ffffff' },
                            ]}
                          >
                            Recent
                          </Text>
                          <TouchableOpacity
                            style={styles.hideButton}
                            onPress={handleHideTimeFilters}
                          >
                            <Text
                              style={[
                                styles.hideButtonText,
                                isSmallScreen && styles.hideButtonTextMobile,
                              ]}
                            >
                              {hideTimeFilters
                                ? '👁️'
                                : isSmallScreen
                                ? '🚫'
                                : 'Hide'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {!hideTimeFilters &&
                          (isLiquidGlassSupported ? (
                            <LiquidGlassView
                              style={styles.groupCardGradient}
                              interactive
                              effect="clear"
                            >
                              <View style={styles.groupCardInner}>
                                <View style={styles.groupCardContent}>
                                  <View style={styles.groupIconCircle}>
                                    <Text style={styles.groupIcon}>📆</Text>
                                  </View>
                                  <View style={styles.groupTextCol}>
                                    <Text style={styles.groupPrimary}>
                                      Quick time filters
                                    </Text>
                                    <Text style={styles.groupSecondary}>
                                      Today • Yesterday
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.chipRow}>
                                  <TouchableOpacity
                                    style={styles.chipButton}
                                    onPress={() =>
                                      handleTimeFilterPress('today')
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        skin === 'blue' && { color: '#000000' },
                                      ]}
                                    >
                                      Today
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.chipButton}
                                    onPress={() =>
                                      handleTimeFilterPress('yesterday')
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        skin === 'blue' && { color: '#000000' },
                                      ]}
                                    >
                                      Yesterday
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </LiquidGlassView>
                          ) : (
                            <LinearGradient
                              colors={gradientPalette.lightBlue}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={styles.groupCardGradient}
                            >
                              <View style={styles.groupCardInner}>
                                <View style={styles.groupCardContent}>
                                  <View style={styles.groupIconCircle}>
                                    <Text style={styles.groupIcon}>📆</Text>
                                  </View>
                                  <View style={styles.groupTextCol}>
                                    <Text style={styles.groupPrimary}>
                                      Quick time filters
                                    </Text>
                                    <Text style={styles.groupSecondary}>
                                      Today • Yesterday
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.chipRow}>
                                  <TouchableOpacity
                                    style={styles.chipButton}
                                    onPress={() =>
                                      handleTimeFilterPress('today')
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        skin === 'blue' && { color: '#000000' },
                                      ]}
                                    >
                                      Today
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.chipButton}
                                    onPress={() =>
                                      handleTimeFilterPress('yesterday')
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        skin === 'blue' && { color: '#000000' },
                                      ]}
                                    >
                                      Yesterday
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </LinearGradient>
                          ))}
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* Month filter: segmented control */}
              <View style={styles.segmented}>
                {MONTH_FILTER_OPTIONS.map(({ key, label }) => {
                  const isActive = monthFilter === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.segment,
                        isActive && { backgroundColor: theme.accent },
                      ]}
                      onPress={() => setMonthFilter(key)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          isActive && { color: theme.accentInk },
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {monthSummaries
                .filter(summary => {
                  if (monthFilter === 'all') return true;

                  const isCompleted = monthCompletionStatus[summary.monthKey];
                  const progress = monthViewingProgress[summary.monthKey];
                  const hasRemaining = progress?.remaining > 0;
                  const isStarted = progress?.started || false;

                  if (monthFilter === 'needToFinish') {
                    // Months that have "X left" (remaining items)
                    return hasRemaining && !isCompleted;
                  }

                  if (monthFilter === 'notStarted') {
                    // Months that don't have checkmark or "X left" (not started)
                    return !isStarted && !isCompleted;
                  }

                  return true;
                })
                .map((summary, visibleIndex) => {
                  const isCompleted = !!monthCompletionStatus[summary.monthKey];
                  const progress = monthViewingProgress[summary.monthKey];
                  const showProgress =
                    !!progress &&
                    progress.started &&
                    !isCompleted &&
                    progress.remaining > 0;
                  const viewedFraction =
                    showProgress && progress.total > 0
                      ? Math.min(1, progress.viewed / progress.total)
                      : 0;
                  const tint = monthTints[visibleIndex % monthTints.length];
                  const [yearText, monthText] = summary.monthKey.split('-');
                  const abbreviation =
                    MONTH_ABBREVIATIONS[Number(monthText) - 1] ?? '';
                  const totalCount = summary.totalCount || 0;
                  const photoCount = summary.photoCount || 0;
                  const videoCount = summary.videoCount || 0;
                  // Counts are placeholders (0) until the scanner has visited the month
                  const hasCounts = totalCount > 0;
                  const countsLabel = `${photoCount.toLocaleString()} ${
                    photoCount === 1 ? 'photo' : 'photos'
                  } · ${videoCount.toLocaleString()} ${
                    videoCount === 1 ? 'video' : 'videos'
                  }`;
                  let subtitle: string;
                  if (isCompleted) {
                    subtitle = hasCounts
                      ? `All done · ${totalCount.toLocaleString()} items`
                      : 'All done';
                  } else if (showProgress) {
                    subtitle = `${progress.remaining.toLocaleString()} left of ${progress.total.toLocaleString()}`;
                  } else {
                    subtitle = hasCounts ? countsLabel : 'Not started';
                  }

                  const cardContent = (
                    <View style={styles.monthCardContent}>
                      <View
                        style={[styles.monthTile, { backgroundColor: tint.bg }]}
                      >
                        <Text
                          style={[styles.monthTileMonth, { color: tint.fg }]}
                        >
                          {abbreviation}
                        </Text>
                        <Text style={styles.monthTileYear}>{yearText}</Text>
                      </View>
                      <View style={styles.monthInfo}>
                        <Text style={styles.monthTitle} numberOfLines={1}>
                          {summary.monthName}
                        </Text>
                        <Text
                          style={[
                            styles.monthSubtitle,
                            isCompleted && { color: theme.accent },
                          ]}
                          numberOfLines={1}
                        >
                          {subtitle}
                        </Text>
                        {showProgress && (
                          <View style={styles.monthProgressTrack}>
                            <View
                              style={[
                                styles.monthProgressFill,
                                {
                                  width: `${Math.round(viewedFraction * 100)}%`,
                                  backgroundColor: theme.accent,
                                },
                              ]}
                            />
                          </View>
                        )}
                      </View>
                      <View style={styles.monthRight}>
                        {isCompleted ? (
                          <View
                            style={[
                              styles.doneBadge,
                              { borderColor: theme.accent },
                            ]}
                          >
                            <Text
                              style={[
                                styles.doneBadgeText,
                                { color: theme.accent },
                              ]}
                            >
                              ✓
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.monthChevron}>›</Text>
                        )}
                      </View>
                    </View>
                  );

                  return (
                    <TouchableOpacity
                      key={`${summary.monthKey}-${statusLoaded}`}
                      style={styles.monthCard}
                      onPress={() => handleMonthPress(summary.monthKey)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`${summary.monthName}. ${subtitle}`}
                    >
                      {isLiquidGlassSupported ? (
                        <LiquidGlassView
                          style={styles.monthCardSurface}
                          interactive
                          effect="clear"
                        >
                          {cardContent}
                        </LiquidGlassView>
                      ) : (
                        <View
                          style={[
                            styles.monthCardSurface,
                            styles.monthCardFallback,
                          ]}
                        >
                          {cardContent}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

              <View
                style={[
                  styles.bottomSpacing,
                  { height: getTabBarClearance(insets.bottom) },
                ]}
              />
            </ScrollView>
          </View>
        )}

        {/* Premium upgrade sheet, opened from the views-left badge */}
        <UpgradeSheet
          visible={upgradeSheetVisible}
          onClose={() => setUpgradeSheetVisible(false)}
        />

        {/* Media Viewer Modal */}
        {viewerVisible && (
          <MediaViewer
            items={viewerItems}
            initialIndex={viewerInitialIndex}
            onClose={handleCloseViewer}
            onViewProgress={handleViewProgress}
            monthKey={currentViewingMonth}
            totalCount={
              monthSummaries.find(m => m.monthKey === currentViewingMonth)
                ?.totalCount || viewerItems.length
            }
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerContainer: {
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  brandMark: {
    width: 38,
    height: 38,
    marginRight: 10,
  },
  brandText: {
    flexShrink: 1,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.2,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  glassPillCompact: {
    width: 36,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  glassPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: 8,
  },
  themeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  glassIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  glassIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  scrollViewContainer: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 12,
    padding: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  monthCard: {
    marginHorizontal: 20,
    marginVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },
  monthCardSurface: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  monthCardFallback: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthTile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  monthTileMonth: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  monthTileYear: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  monthInfo: {
    flex: 1,
    minWidth: 0,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  monthSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
  },
  monthProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    marginTop: 8,
  },
  monthProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  monthRight: {
    marginLeft: 12,
  },
  monthChevron: {
    fontSize: 26,
    color: colors.textMuted,
    fontWeight: '300',
  },
  doneBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBadgeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingContent: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    paddingHorizontal: 28,
    paddingVertical: 32,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 18,
    textAlign: 'center',
  },
  loadingHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyContent: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    paddingHorizontal: 28,
    paddingVertical: 32,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stateIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  stateIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  permissionContent: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    paddingHorizontal: 28,
    paddingVertical: 32,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 18,
  },
  primaryButton: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  bottomSpacing: {
    height: 32,
  },
  scanProgressContainer: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
  },
  scanProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scanProgressText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  scanProgressCounter: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  scanProgressBar: {
    width: '100%',
    height: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 3,
    overflow: 'hidden',
  },
  scanProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  abstractBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 2,
    zIndex: 0,
    overflow: 'hidden',
  },
  abstractLine: {
    position: 'absolute',
    height: 3,
  },
  line1: {
    width: SCREEN_WIDTH * 1.5,
    transform: [{ rotate: '25deg' }],
    top: 100,
    left: -SCREEN_WIDTH * 0.2,
  },
  line2: {
    width: SCREEN_WIDTH * 1.3,
    transform: [{ rotate: '-15deg' }],
    top: 250,
    left: -SCREEN_WIDTH * 0.1,
  },
  line3: {
    width: SCREEN_WIDTH * 1.4,
    transform: [{ rotate: '35deg' }],
    top: 400,
    left: -SCREEN_WIDTH * 0.15,
  },
  line4: {
    width: SCREEN_WIDTH * 1.2,
    transform: [{ rotate: '-25deg' }],
    top: 550,
    left: -SCREEN_WIDTH * 0.05,
  },
  line5: {
    width: SCREEN_WIDTH * 1.5,
    transform: [{ rotate: '20deg' }],
    top: 700,
    left: -SCREEN_WIDTH * 0.2,
  },
  line6: {
    width: SCREEN_WIDTH * 1.4,
    transform: [{ rotate: '-30deg' }],
    top: 850,
    left: -SCREEN_WIDTH * 0.1,
  },
  line7: {
    width: SCREEN_WIDTH * 1.3,
    transform: [{ rotate: '40deg' }],
    top: 1000,
    left: -SCREEN_WIDTH * 0.15,
  },
  horizontalLine: {
    position: 'absolute',
    height: 3,
    width: SCREEN_WIDTH * 0.8,
  },
  hLine1: {
    top: 180,
    left: SCREEN_WIDTH * 0.1,
  },
  hLine2: {
    top: 380,
    left: SCREEN_WIDTH * 0.15,
  },
  hLine3: {
    top: 580,
    left: SCREEN_WIDTH * 0.05,
  },
  hLine4: {
    top: 780,
    left: SCREEN_WIDTH * 0.12,
  },
  verticalLine: {
    position: 'absolute',
    width: 3,
    height: SCREEN_HEIGHT * 0.6,
  },
  vLine1: {
    top: 150,
    left: SCREEN_WIDTH * 0.3,
  },
  vLine2: {
    top: 200,
    right: SCREEN_WIDTH * 0.25,
  },
  vLine3: {
    top: 350,
    left: SCREEN_WIDTH * 0.6,
  },
  specialFiltersContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
    zIndex: 1,
  },
  specialFiltersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  specialFiltersHeaderText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
  },
  specialFiltersChevron: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  filterGroup: {
    marginBottom: 8,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  groupTitle: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  hideButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 28,
    minWidth: 28,
  },
  hideButtonText: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.7)',
  },
  hideButtonTextMobile: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.8)',
  },
  groupCardGradient: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 30,
    overflow: 'visible',
  },
  groupCardInner: {
    width: '100%',
  },
  groupCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  groupIcon: { fontSize: 18, lineHeight: 20 },
  groupTextCol: { flex: 1 },
  groupPrimary: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  groupSecondary: {
    color: 'rgba(0, 0, 0, 0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 20,
  },
  chipButton: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    marginBottom: 4,
  },
  chipText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  viewingLimitsBadge: {
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.4)',
    minWidth: 112,
  },
  viewingLimitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewingLimitsChevron: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 18,
    marginLeft: 6,
    marginTop: -1,
  },
  viewingLimitsTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
    marginTop: 6,
  },
  viewingLimitsFill: {
    height: '100%',
    borderRadius: 2,
  },
  viewingLimitsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#00D9FF',
    textShadowColor: 'rgba(0, 217, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  viewingLimitsBadgeMobile: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    minWidth: 96,
  },
  viewingLimitsTextMobile: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00D9FF',
    textShadowColor: 'rgba(0, 217, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

// Responsive filter styles based on device type and screen size
const getResponsiveFilterStyles = (
  isTablet: boolean,
  screenWidth: number,
  isSmallScreen: boolean,
) => {
  if (isTablet) {
    // Tablet styles - larger buttons, more spacing
    return {
      timeFilterButton: {
        flex: 1,
        backgroundColor: 'rgba(245, 245, 220, 0.8)',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignItems: 'center' as const,
        borderWidth: 1,
        borderColor: 'rgba(245, 245, 220, 1)',
        marginHorizontal: 4,
      },
      timeFilterText: {
        fontSize: 14,
        fontWeight: '600' as const,
        color: '#1a1a1a',
      },
      sourceFilterButton: {
        flex: 1,
        backgroundColor: 'rgba(245, 245, 220, 0.8)',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignItems: 'center' as const,
        borderWidth: 1,
        borderColor: 'rgba(245, 245, 220, 1)',
        marginHorizontal: 4,
      },
      sourceFilterText: {
        fontSize: 14,
        fontWeight: '600' as const,
        color: '#1a1a1a',
      },
      duplicateCardHalf: {
        flex: 1,
        marginHorizontal: 8,
        minHeight: 80,
      },
      duplicateTitle: {
        fontSize: 16,
        fontWeight: '700' as const,
        color: '#000000',
        textShadowColor: 'rgba(0, 0, 0, 0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
      duplicateCount: {
        fontSize: 14,
        fontWeight: '600' as const,
        color: '#000000',
        textShadowColor: 'rgba(0, 0, 0, 0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
    };
  } else {
    // Phone styles - smaller buttons, tighter spacing
    if (isSmallScreen) {
      // Small phone (iPhone SE, etc.)
      return {
        timeFilterButton: {
          flex: 1,
          backgroundColor: 'rgba(245, 245, 220, 0.8)',
          paddingVertical: 8,
          paddingHorizontal: 8,
          borderRadius: 6,
          alignItems: 'center' as const,
          borderWidth: 1,
          borderColor: 'rgba(245, 245, 220, 1)',
          marginHorizontal: 2,
        },
        timeFilterText: {
          fontSize: 10,
          fontWeight: '600' as const,
          color: '#1a1a1a',
        },
        sourceFilterButton: {
          flex: 1,
          backgroundColor: 'rgba(245, 245, 220, 0.8)',
          paddingVertical: 8,
          paddingHorizontal: 8,
          borderRadius: 6,
          alignItems: 'center' as const,
          borderWidth: 1,
          borderColor: 'rgba(245, 245, 220, 1)',
          marginHorizontal: 2,
        },
        sourceFilterText: {
          fontSize: 10,
          fontWeight: '600' as const,
          color: '#1a1a1a',
        },
        duplicateCardHalf: {
          flex: 1,
          marginHorizontal: 4,
          minHeight: 60,
        },
        duplicateTitle: {
          fontSize: 12,
          fontWeight: '700' as const,
          color: '#000000',
          textShadowColor: 'rgba(0, 0, 0, 0.3)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        },
        duplicateCount: {
          fontSize: 10,
          fontWeight: '600' as const,
          color: '#000000',
          textShadowColor: 'rgba(0, 0, 0, 0.3)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        },
      };
    } else {
      // Regular phone (iPhone 12, 13, 14, etc.)
      return {
        timeFilterButton: {
          flex: 1,
          backgroundColor: 'rgba(245, 245, 220, 0.8)',
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 8,
          alignItems: 'center' as const,
          borderWidth: 1,
          borderColor: 'rgba(245, 245, 220, 1)',
          marginHorizontal: 3,
        },
        timeFilterText: {
          fontSize: 12,
          fontWeight: '600' as const,
          color: '#1a1a1a',
        },
        sourceFilterButton: {
          flex: 1,
          backgroundColor: 'rgba(245, 245, 220, 0.8)',
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 8,
          alignItems: 'center' as const,
          borderWidth: 1,
          borderColor: 'rgba(245, 245, 220, 1)',
          marginHorizontal: 3,
        },
        sourceFilterText: {
          fontSize: 12,
          fontWeight: '600' as const,
          color: '#1a1a1a',
        },
        duplicateCardHalf: {
          flex: 1,
          marginHorizontal: 6,
          minHeight: 70,
        },
        duplicateTitle: {
          fontSize: 14,
          fontWeight: '700' as const,
          color: '#000000',
          textShadowColor: 'rgba(0, 0, 0, 0.3)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        },
        duplicateCount: {
          fontSize: 12,
          fontWeight: '600' as const,
          color: '#000000',
          textShadowColor: 'rgba(0, 0, 0, 0.3)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        },
      };
    }
  }
};

export default Home;
