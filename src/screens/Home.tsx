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
  ImageBackground,
  Platform,
  PlatformColor,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
import MonthSelection from '../components/MonthSelection';
import { checkMediaPermissionsWithRetry } from '../utils/permissions';
import { getViewingConfig } from '../constants/app';
import { MonthSelectionData } from '../utils/mediaScanner';
import { loadViewedItems } from '../utils/viewedMediaTracker';

const backgroundImagePink = require('../assets/bg.png');
const backgroundImageBlue = require('../assets/bg2.jpg');
const keepFlickIcon = require('../assets/kf.png');

// Unified 4-color pastel palette (Light Blue, Light Purple, Light Teal, Light Pink)
const gradientPalette = {
  lightBlue: ['#9FD3FF', '#CBE7FF'],
  lightPurple: ['#CDB6FF', '#E6DDFF'],
  lightTeal: ['#A8F0E1', '#D1FFF4'],
  lightPink: ['#FFB3C1', '#FFD6E0'],
  frostyBlue: ['#B0E0E6', '#E0F6FF'], // Frosty blue for pink theme when liquid glass is unavailable
  frostyPink: ['#FFC0CB', '#FFE4E9'], // Frosty pink for blue theme when liquid glass is unavailable
};

const monthGradients = [
  gradientPalette.lightBlue,
  gradientPalette.lightPurple,
  gradientPalette.lightTeal,
  gradientPalette.lightPink,
];

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
  const navigation = useNavigation();
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
    scanDuplicates,
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
  const [monthSelectionVisible, setMonthSelectionVisible] = useState(false);
  const [selectedMonthData, setSelectedMonthData] =
    useState<MonthSelectionData | null>(null);
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

  // Cache viewed items Set for performance (avoid reloading on every check)
  const viewedItemsCacheRef = useRef<Set<string> | null>(null);

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
    await Promise.all([scanMonthSummaries(), scanDuplicates()]);
    setRefreshing(false);
  };

  const handleMonthPress = async (monthKey: string) => {
    // Find the month summary to get the counts
    const monthSummary = monthSummaries.find(m => m.monthKey === monthKey);
    if (!monthSummary) {
      Alert.alert('Error', 'Month data not found');
      return;
    }

    // Create month selection data
    const monthData: MonthSelectionData = {
      monthKey: monthSummary.monthKey,
      monthName: monthSummary.monthName,
      photoCount: monthSummary.photoCount || 0,
      videoCount: monthSummary.videoCount || 0,
      totalCount: monthSummary.totalCount || 0,
    };

    setSelectedMonthData(monthData);
    setMonthSelectionVisible(true);
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
    // Wait a bit for storage to be updated from MediaViewer
    if (
      viewingMonth &&
      !viewingMonth.startsWith('TIME_FILTER_') &&
      !viewingMonth.startsWith('SOURCE_FILTER_')
    ) {
      setTimeout(async () => {
        try {
          // Check completion status
          const { isMonthCompleted } = await import(
            '../utils/viewedMediaTracker'
          );
          const isCompleted = await isMonthCompleted(viewingMonth);
          setMonthCompletionStatus(prev => ({
            ...prev,
            [viewingMonth]: isCompleted,
          }));

          // Update progress
          const stats = await getMonthViewedStats(viewingMonth);
          const started = stats.viewedCount > 0;
          const remaining = stats.totalCount - stats.viewedCount;
          setMonthViewingProgress(prev => ({
            ...prev,
            [viewingMonth]: {
              viewed: stats.viewedCount,
              total: stats.totalCount,
              remaining,
              started,
            },
          }));
        } catch (error) {
          // Error checking completion status
        }
      }, 1500); // Wait 1.5s for storage to be saved
    }
  };

  // Close media viewer and month selection when Home tab is pressed while they are open
  const modalOpenTimeRef = useRef(0);
  const isHomeFocusedRef = useRef(false);

  // Track when modals are opened
  useEffect(() => {
    if (viewerVisible || monthSelectionVisible) {
      modalOpenTimeRef.current = Date.now();
    }
  }, [viewerVisible, monthSelectionVisible]);

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
          if (monthSelectionVisible) {
            handleCloseMonthSelection();
          }
        }
      }
    };

    setHomeTabPressHandler(handleHomeTabPress);

    return () => {
      setHomeTabPressHandler(null);
    };
  }, [viewerVisible, monthSelectionVisible]);

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

  // Load and update month completion status and progress
  // Extract as a reusable function so it can be called from multiple places
  const loadMonthStatus = React.useCallback(async () => {
    if (monthSummaries.length === 0) return;

    const status: { [monthKey: string]: boolean } = {};
    const progress: {
      [monthKey: string]: {
        viewed: number;
        total: number;
        remaining: number;
        started: boolean;
      };
    } = {};

    for (const summary of monthSummaries) {
      try {
        // Check completion status
        const { isMonthCompleted } = await import(
          '../utils/viewedMediaTracker'
        );
        status[summary.monthKey] = await isMonthCompleted(summary.monthKey);

        // Get progress stats
        const stats = await getMonthViewedStats(summary.monthKey);
        const started = stats.viewedCount > 0;
        const remaining = stats.totalCount - stats.viewedCount;

        progress[summary.monthKey] = {
          viewed: stats.viewedCount,
          total: stats.totalCount,
          remaining,
          started,
        };
      } catch (error) {
        status[summary.monthKey] = false;
        progress[summary.monthKey] = {
          viewed: 0,
          total: 0,
          remaining: 0,
          started: false,
        };
      }
    }
    // Use functional update to ensure state is set even if component re-renders
    // Force update by creating new objects to ensure React detects the change
    // Update both states and statusLoaded together to ensure re-render
    setMonthCompletionStatus(prev => {
      const newStatus = { ...prev, ...status };
      // Return new object even if values are the same to force re-render
      return newStatus;
    });
    setMonthViewingProgress(prev => {
      const newProgress = { ...prev, ...progress };
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
  }, [monthSummaries, getMonthViewedStats]);

  // Track when Home screen is focused and reload preferences
  useFocusEffect(
    React.useCallback(() => {
      isHomeFocusedRef.current = true;
      // Reload preferences when screen comes into focus (in case they were changed in About tab)
      loadHidePreferences();
      loadSkinPreference();
      // Also reload month status on focus to ensure checkmarks show up, especially when liquidglass is not available
      // Reset statusLoaded to 0 first to ensure re-render happens
      setStatusLoaded(0);
      loadMonthStatus();
      return () => {
        isHomeFocusedRef.current = false;
      };
    }, [loadMonthStatus]),
  );

  const handleCloseMonthSelection = () => {
    setMonthSelectionVisible(false);
    setSelectedMonthData(null);
  };

  const handleToggleTheme = async () => {
    const newSkin = skin === 'pink' ? 'blue' : 'pink';
    setSkin(newSkin);
    await AsyncStorage.setItem('skin', newSkin);
  };

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

  const handleSelectPhotos = async () => {
    if (!selectedMonthData) return;

    setSelectedMediaType('photos');
    setMonthSelectionVisible(false);

    // Check viewing limits before fetching
    if (!canViewMedia()) {
      setViewerInitialIndex(0);
      setViewerVisible(true);
      setCurrentViewingMonth(selectedMonthData.monthKey);
      return;
    }

    try {
      // Load first 40 items
      const monthItems = await loadMonthContent(selectedMonthData.monthKey, 40);
      const photoItems = monthItems.filter(item => item.type === 'photo');

      if (photoItems.length > 0) {
        // Find the first unviewed item to start from
        const startIndex = await findFirstUnviewedIndex(photoItems);
        setViewerInitialIndex(startIndex);
        setViewerVisible(true);
        setCurrentViewingMonth(selectedMonthData.monthKey);
      } else {
        Alert.alert(
          'No Photos',
          `No photos found for ${selectedMonthData.monthName}`,
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load photos for this month');
    }
  };

  const handleSelectVideos = async () => {
    if (!selectedMonthData) return;

    setSelectedMediaType('videos');
    setMonthSelectionVisible(false);

    // Check viewing limits before fetching
    if (!canViewMedia()) {
      setViewerInitialIndex(0);
      setViewerVisible(true);
      setCurrentViewingMonth(selectedMonthData.monthKey);
      return;
    }

    try {
      // Load first 40 items
      const monthItems = await loadMonthContent(selectedMonthData.monthKey, 40);
      const videoItems = monthItems.filter(item => item.type === 'video');

      if (videoItems.length > 0) {
        // Find the first unviewed item to start from
        const startIndex = await findFirstUnviewedIndex(videoItems);
        setViewerInitialIndex(startIndex);
        setViewerVisible(true);
        setCurrentViewingMonth(selectedMonthData.monthKey);
      } else {
        Alert.alert(
          'No Videos',
          `No videos found for ${selectedMonthData.monthName}`,
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load videos for this month');
    }
  };

  const handleSelectAllMedia = async () => {
    if (!selectedMonthData) return;

    setSelectedMediaType('all');
    setMonthSelectionVisible(false);

    // Check viewing limits before fetching
    if (!canViewMedia()) {
      setViewerInitialIndex(0);
      setViewerVisible(true);
      setCurrentViewingMonth(selectedMonthData.monthKey);
      return;
    }

    try {
      // Load first 40 items
      const monthItems = await loadMonthContent(selectedMonthData.monthKey, 40);

      if (monthItems.length > 0) {
        // Find the first unviewed item to start from
        const startIndex = await findFirstUnviewedIndex(monthItems);
        setViewerInitialIndex(startIndex);
        setViewerVisible(true);
        setCurrentViewingMonth(selectedMonthData.monthKey);
      } else {
        Alert.alert(
          'No Media',
          `No media found for ${selectedMonthData.monthName}`,
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load media for this month');
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
          const items = await loadMonthContent(relevantMonthKey, 200);
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

  const handleViewProgress = async (viewedCount: number) => {
    if (
      currentViewingMonth &&
      !currentViewingMonth.startsWith('TIME_FILTER_') &&
      !currentViewingMonth.startsWith('SOURCE_FILTER_')
    ) {
      // Update progress immediately to prevent double counting
      const stats = await getMonthViewedStats(currentViewingMonth);
      const remaining = stats.totalCount - stats.viewedCount;
      const started = stats.viewedCount > 0;

      setMonthViewingProgress(prev => ({
        ...prev,
        [currentViewingMonth]: {
          viewed: stats.viewedCount,
          total: stats.totalCount,
          remaining,
          started,
        },
      }));

      // Also check completion status immediately so checkmark appears right away
      // This is especially important when liquidglass is not available
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
  };

  const handleRetryPermissions = async () => {
    try {
      const hasPermission = await checkMediaPermissionsWithRetry();
      if (hasPermission) {
        setHasPermission(true);
        await Promise.all([scanMonthSummaries(), scanDuplicates()]);
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
      Promise.all([scanMonthSummaries(), scanDuplicates()]);
    }
  }, [hasPermission]);

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
  useEffect(() => {
    let isRefreshing = false; // Prevent concurrent refreshes

    const refreshStatus = async () => {
      // Prevent double counting by skipping if already refreshing
      if (isRefreshing) return;
      isRefreshing = true;

      try {
        const status: { [monthKey: string]: boolean } = {};
        const progress: {
          [monthKey: string]: {
            viewed: number;
            total: number;
            remaining: number;
            started: boolean;
          };
        } = {};

        for (const summary of monthSummaries) {
          try {
            const { isMonthCompleted } = await import(
              '../utils/viewedMediaTracker'
            );
            status[summary.monthKey] = await isMonthCompleted(summary.monthKey);

            // Get progress stats
            const stats = await getMonthViewedStats(summary.monthKey);
            const started = stats.viewedCount > 0;
            const remaining = stats.totalCount - stats.viewedCount;

            progress[summary.monthKey] = {
              viewed: stats.viewedCount,
              total: stats.totalCount,
              remaining,
              started,
            };
          } catch (error) {
            status[summary.monthKey] = false;
          }
        }
        setMonthCompletionStatus(prev => ({ ...prev, ...status }));
        setMonthViewingProgress(prev => ({ ...prev, ...progress }));
      } finally {
        isRefreshing = false;
      }
    };

    // Refresh when viewer closes or periodically
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, [monthSummaries, viewerVisible]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.permissionContainer}>
          <View style={styles.permissionContent}>
            <Text style={styles.permissionIcon}>📱</Text>
            <Text
              style={[
                styles.permissionTitle,
                skin === 'blue' && { color: '#ffffff' },
              ]}
            >
              Media Access Required
            </Text>
            <Text
              style={[
                styles.permissionText,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
              ]}
            >
              Please grant media permissions to start organizing your photos.
            </Text>
            {Platform.OS === 'ios' && (
              <Text
                style={[
                  styles.permissionSubtext,
                  skin === 'blue' && { color: 'rgba(255, 255, 255, 0.8)' },
                ]}
              >
                On iPad, you may need to retry if you've already granted
                permission.
              </Text>
            )}
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetryPermissions}
            >
              <Text style={styles.retryButtonText}>Retry Permissions</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
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
        <Text
          style={[
            styles.scanProgressText,
            skin === 'blue' && { color: '#ffffff' },
          ]}
        >
          {phaseText}
        </Text>
        <View style={styles.scanProgressBar}>
          <View
            style={[styles.scanProgressFill, { width: `${percentage}%` }]}
          />
        </View>
        <Text
          style={[
            styles.scanProgressCounter,
            skin === 'blue' && { color: 'rgba(255, 255, 255, 0.8)' },
          ]}
        >
          {current} / {total} ({percentage}%)
        </Text>
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

  const backgroundImage =
    skin === 'blue' ? backgroundImageBlue : backgroundImagePink;

  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      {skin === 'blue' && <View style={styles.blueTintOverlay} />}
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Enhanced Header */}
        <View style={styles.headerContainer}>
          <View style={styles.header}>
            <View style={styles.headerInfo}>
              <Image
                source={keepFlickIcon}
                style={styles.headerIcon}
                resizeMode="contain"
              />
            </View>
            <View style={styles.rightSection}>
              <TouchableOpacity
                style={[
                  styles.themeToggleButton,
                  skin === 'pink'
                    ? { backgroundColor: '#4A90E2' }
                    : { backgroundColor: '#FFB3C1' },
                ]}
                onPress={handleToggleTheme}
                activeOpacity={0.7}
              >
                <Text style={styles.themeToggleText}>Theme</Text>
              </TouchableOpacity>
              {!isSmallScreen && (
                <TouchableOpacity
                  style={styles.refreshButton}
                  onPress={handleRefresh}
                  disabled={isLoading}
                >
                  <Text style={styles.refreshButtonText}>
                    {isLoading ? '⟳' : '↻'}
                  </Text>
                </TouchableOpacity>
              )}
              {!isPremiumUser && (
                <View
                  style={[
                    styles.viewingLimitsBadge,
                    isSmallScreen && styles.viewingLimitsBadgeMobile,
                  ]}
                >
                  <Text
                    style={[
                      styles.viewingLimitsText,
                      isSmallScreen && styles.viewingLimitsTextMobile,
                    ]}
                  >
                    {viewingLimits.remainingViews} views left
                  </Text>
                </View>
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
              <ActivityIndicator
                size="large"
                color={skin === 'blue' ? '#ffffff' : '#1a1a1a'}
              />
              <Text
                style={[
                  styles.loadingText,
                  skin === 'blue' && { color: '#ffffff' },
                ]}
              >
                Scanning your photos...
              </Text>
            </View>
          </View>
        ) : monthSummaries.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyContent}>
              <Text style={styles.emptyIcon}>📸</Text>
              <Text
                style={[
                  styles.emptyTitle,
                  skin === 'blue' && { color: '#ffffff' },
                ]}
              >
                No Media Found
              </Text>
              <Text
                style={[
                  styles.emptyText,
                  skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
                ]}
              >
                No media found on your device
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

              {/* Month Filter Cards */}
              <View style={styles.monthFilterCardsContainer}>
                <TouchableOpacity
                  style={[
                    styles.monthFilterCard,
                    monthFilter === 'all' && styles.monthFilterCardActive,
                  ]}
                  onPress={() => setMonthFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.monthFilterCardText,
                      monthFilter === 'all' && styles.monthFilterCardTextActive,
                      skin === 'blue' && { color: '#ffffff' },
                    ]}
                  >
                    Show all
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.monthFilterCard,
                    monthFilter === 'needToFinish' &&
                      styles.monthFilterCardActive,
                  ]}
                  onPress={() => setMonthFilter('needToFinish')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.monthFilterCardText,
                      monthFilter === 'needToFinish' &&
                        styles.monthFilterCardTextActive,
                      skin === 'blue' && { color: '#ffffff' },
                    ]}
                  >
                    Need to finish
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.monthFilterCard,
                    monthFilter === 'notStarted' &&
                      styles.monthFilterCardActive,
                  ]}
                  onPress={() => setMonthFilter('notStarted')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.monthFilterCardText,
                      monthFilter === 'notStarted' &&
                        styles.monthFilterCardTextActive,
                      skin === 'blue' && { color: '#ffffff' },
                    ]}
                  >
                    Not started
                  </Text>
                </TouchableOpacity>
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
                .map(summary => {
                  const count = summary.totalCount || 0;
                  // Find original index in monthSummaries for gradient color
                  const originalIndex = monthSummaries.findIndex(
                    m => m.monthKey === summary.monthKey,
                  );
                  // Use frosty colors for all months when liquid glass is unavailable
                  // Pink theme -> frosty blue, Blue theme -> frosty pink
                  const gradientColors =
                    !isLiquidGlassSupported && skin === 'pink'
                      ? gradientPalette.frostyBlue
                      : !isLiquidGlassSupported && skin === 'blue'
                      ? gradientPalette.frostyPink
                      : monthGradients[originalIndex % monthGradients.length];
                  const isCompleted = monthCompletionStatus[summary.monthKey];
                  const progress = monthViewingProgress[summary.monthKey];
                  const showProgress =
                    progress?.started && !isCompleted && progress.remaining > 0;

                  return (
                    <TouchableOpacity
                      key={`${summary.monthKey}-${statusLoaded}`}
                      style={styles.monthCard}
                      onPress={() => handleMonthPress(summary.monthKey)}
                    >
                      {isLiquidGlassSupported ? (
                        <LiquidGlassView
                          style={styles.monthCardGradient}
                          interactive
                          effect="clear"
                        >
                          <View style={styles.monthCardContent}>
                            <View style={styles.monthInfo}>
                              <View style={styles.monthTitleRow}>
                                <View style={styles.monthTitleContainer}>
                                  <Text
                                    style={[
                                      styles.monthTitle,
                                      Platform.OS === 'ios' && {
                                        color: PlatformColor('labelColor'),
                                      },
                                      skin === 'blue' && { color: '#ffffff' },
                                    ]}
                                  >
                                    {summary.monthName}
                                  </Text>
                                  {isCompleted && (
                                    <Text style={styles.completedCheckmark}>
                                      ✓
                                    </Text>
                                  )}
                                  {showProgress && (
                                    <Text
                                      style={[
                                        styles.progressBadge,
                                        skin === 'pink' &&
                                          styles.progressBadgePink,
                                      ]}
                                    >
                                      {progress.remaining} left
                                    </Text>
                                  )}
                                </View>
                              </View>
                            </View>

                            <View style={styles.monthRight}>
                              <Text
                                style={[
                                  styles.monthChevron,
                                  Platform.OS === 'ios' && {
                                    color: PlatformColor('labelColor'),
                                  },
                                  skin === 'blue' && { color: '#ffffff' },
                                ]}
                              >
                                ›
                              </Text>
                            </View>
                          </View>
                        </LiquidGlassView>
                      ) : (
                        <LinearGradient
                          colors={gradientColors}
                          style={styles.monthCardGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                        >
                          <View style={styles.monthCardContent}>
                            <View style={styles.monthInfo}>
                              <View style={styles.monthTitleRow}>
                                <View style={styles.monthTitleContainer}>
                                  <Text
                                    style={[
                                      styles.monthTitle,
                                      skin === 'blue' && { color: '#ffffff' },
                                    ]}
                                  >
                                    {summary.monthName}
                                  </Text>
                                  {isCompleted && (
                                    <Text style={styles.completedCheckmark}>
                                      ✓
                                    </Text>
                                  )}
                                  {showProgress && (
                                    <Text
                                      style={[
                                        styles.progressBadge,
                                        skin === 'pink' &&
                                          styles.progressBadgePink,
                                      ]}
                                    >
                                      {progress.remaining} left
                                    </Text>
                                  )}
                                </View>
                              </View>
                            </View>

                            <View style={styles.monthRight}>
                              <Text
                                style={[
                                  styles.monthChevron,
                                  skin === 'blue' && { color: '#ffffff' },
                                ]}
                              >
                                ›
                              </Text>
                            </View>
                          </View>
                        </LinearGradient>
                      )}
                    </TouchableOpacity>
                  );
                })}

              <View
                style={[
                  styles.bottomSpacing,
                  { height: Math.max(insets.bottom, 32) + 60 },
                ]}
              />
            </ScrollView>
          </View>
        )}

        {/* Month Selection Modal */}
        {monthSelectionVisible && selectedMonthData && (
          <MonthSelection
            monthData={selectedMonthData}
            onSelectPhotos={handleSelectPhotos}
            onSelectVideos={handleSelectVideos}
            onSelectAllMedia={handleSelectAllMedia}
            onClose={handleCloseMonthSelection}
          />
        )}

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
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerContainer: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 4,
    textDecorationLine: 'underline',
    textDecorationColor: '#00D9FF',
    textDecorationStyle: 'solid',
    borderBottomWidth: 3,
    borderBottomColor: '#00D9FF',
  },
  headerIcon: {
    width: 150,
    height: 50,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(0, 0, 0, 0.7)',
    fontWeight: '600',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  refreshButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  viewingLimitsBadge: {
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.4)',
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  viewingLimitsTextMobile: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00D9FF',
    textShadowColor: 'rgba(0, 217, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  scrollViewContainer: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
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
  monthCard: {
    marginHorizontal: 20,
    marginVertical: 6,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
    zIndex: 1,
  },
  monthCardGradient: {
    padding: 16,
    minHeight: 88,
    borderRadius: 12,
  },
  monthCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthInfo: {
    flex: 1,
  },
  monthTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000000',
  },
  completedCheckmark: {
    fontSize: 16,
    fontWeight: '900',
    color: '#00FF88',
    backgroundColor: 'rgba(0, 255, 136, 0.25)',
    borderRadius: 12,
    width: 26,
    height: 26,
    textAlign: 'center',
    lineHeight: 22,
    borderWidth: 2,
    borderColor: '#00FF88',
    overflow: 'hidden',
    textShadowColor: 'rgba(0, 255, 136, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  progressBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00D9FF',
    backgroundColor: 'rgba(0, 217, 255, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: '#00D9FF',
    textShadowColor: 'rgba(0, 217, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  progressBadgePink: {
    color: '#4A90E2',
    backgroundColor: 'rgba(74, 144, 226, 0.25)',
    borderColor: '#4A90E2',
    textShadowColor: 'rgba(74, 144, 226, 0.5)',
  },
  monthCount: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '700',
  },
  monthRight: {
    marginLeft: 16,
  },
  monthChevron: {
    fontSize: 28,
    color: '#000000',
    fontWeight: '300',
  },
  monthProgressContainer: {
    marginTop: 4,
  },
  monthProgressText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: 'transparent',
  },
  loadingContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  loadingText: {
    fontSize: 16,
    color: '#000000',
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: 'transparent',
  },
  emptyContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 32,
    paddingVertical: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 217, 255, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: 'transparent',
  },
  permissionContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 32,
    paddingVertical: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: 20,
    opacity: 0.8,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 217, 255, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  permissionText: {
    fontSize: 16,
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  permissionSubtext: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.7)',
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.4)',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00D9FF',
  },
  bottomSpacing: {
    height: 32,
  },

  scanProgressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  scanProgressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  scanProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  scanProgressFill: {
    height: '100%',
    backgroundColor: '#00D9FF',
    borderRadius: 4,
  },
  scanProgressCounter: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.7)',
    marginTop: 8,
  },
  duplicateCardsContainer: {
    width: '100%',
    flexDirection: 'row',
    alignContent: 'center',
    justifyContent: 'center',
  },
  // New action-style cards used in special filters
  actionCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginVertical: 8,
  },
  actionGradientSm: {
    padding: 14,
    minHeight: 68,
    borderRadius: 18,
  },
  actionContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionIconLg: {
    fontSize: 20,
    lineHeight: 22,
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitleDark: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  actionCountDark: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  actionArrowDark: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '300',
    marginLeft: 8,
  },
  duplicateCard: {
    marginHorizontal: 20,
    marginVertical: 6,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  duplicateCardHalf: {
    width: '40%',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  disabledCard: {
    opacity: 0.5,
  },
  duplicateCardGradient: {
    padding: 12,
    minHeight: 72,
  },
  duplicateCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duplicateInfo: {
    flex: 1,
  },
  duplicateTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duplicateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  duplicateCount: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
  },
  duplicateSubtext: {
    fontSize: 14,
    color: '#000000',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  duplicateRight: {
    marginLeft: 16,
  },
  duplicateChevron: {
    fontSize: 20,
    color: '#0f172a',
    fontWeight: '300',
  },
  timeFilterContainer: {
    width: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeFilterButton: {
    width: '15%',
    backgroundColor: 'rgba(245, 245, 220, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 245, 220, 1)',
  },
  timeFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  themeToggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  themeToggleText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  duplicateCardsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hideIconButton: {
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    alignContent: 'center',
  },
  hideIconText: {
    fontSize: 16,
    fontWeight: '600',
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
  timeFilterButtonsRow: {
    width: '80%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: '2%',
  },
  sourceFilterContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  sourceFilterButton: {
    width: '15%',
    backgroundColor: 'rgba(245, 245, 220, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 245, 220, 1)',
  },
  sourceFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a1a',
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
  chipDisabled: { opacity: 0.5 },
  chipText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  monthFilterCardsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    gap: 8,
  },
  monthFilterCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 60,
  },
  monthFilterCardActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(0, 217, 255, 0.3)',
    shadowOpacity: 0.5,
  },
  monthFilterCardText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  monthFilterCardTextActive: {
    color: '#00D9FF',
  },
  blueTintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(230, 240, 248, 0.22)',
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
