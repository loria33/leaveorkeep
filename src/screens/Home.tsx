import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMedia, MediaItem } from '../context/MediaContext';
import { useAdmin } from '../context/adminContext';
import MediaViewer from '../components/MediaViewer';
import MonthSelection from '../components/MonthSelection';
import About from './About';
import { checkMediaPermissionsWithRetry } from '../utils/permissions';
import { getViewingConfig } from '../constants/app';
import { MonthSelectionData } from '../utils/mediaScanner';

const logoImage = require('../assets/logoinApp.png');

// Unified 4-color pastel palette (Light Blue, Light Purple, Light Teal, Light Pink)
const gradientPalette = {
  lightBlue: ['#9FD3FF', '#CBE7FF'],
  lightPurple: ['#CDB6FF', '#E6DDFF'],
  lightTeal: ['#A8F0E1', '#D1FFF4'],
  lightPink: ['#FFB3C1', '#FFD6E0'],
};

const monthGradients = [
  gradientPalette.lightBlue,
  gradientPalette.lightPurple,
  gradientPalette.lightTeal,
  gradientPalette.lightPink,
];

const Home: React.FC = () => {
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
  const [aboutVisible, setAboutVisible] = useState(false);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [hideTimeFilters, setHideTimeFilters] = useState(false);
  const [hideSourceFilters, setHideSourceFilters] = useState(false);
  const [timeFilterItems, setTimeFilterItems] = useState<MediaItem[]>([]);
  const [specialFiltersCollapsed, setSpecialFiltersCollapsed] = useState(true);

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

  const handleDuplicatesPress = () => {
    if (duplicateItems.length > 0) {
      // setViewerItems(duplicateItems); // Remove this
      setViewerInitialIndex(0);
      setViewerVisible(true);
      setCurrentViewingMonth('DUPLICATES'); // Use a special key for duplicates
      setSelectedMediaType('all'); // Reset media type for duplicates
    }
  };

  const handleDuplicateTypePress = (type: 'photos' | 'videos') => {
    const filteredItems = duplicateItems.filter(
      item => item.type === (type === 'photos' ? 'photo' : 'video'),
    );

    if (filteredItems.length > 0) {
      setViewerInitialIndex(0);
      setViewerVisible(true);
      setCurrentViewingMonth('DUPLICATES');
      setSelectedMediaType(type === 'photos' ? 'photos' : 'videos');
    }
  };

  const handleCloseViewer = () => {
    setViewerVisible(false);
    setCurrentViewingMonth('');
    setSelectedMediaType('all');
    // setViewerItems([]); // Remove this
  };

  const handleCloseMonthSelection = () => {
    setMonthSelectionVisible(false);
    setSelectedMonthData(null);
  };

  const handleAboutPress = () => {
    setAboutVisible(true);
  };

  const handleCloseAbout = () => {
    setAboutVisible(false);
    // Reload preferences when About screen closes
    loadHidePreferences();
  };

  const handlePreferencesChanged = () => {
    // Reload preferences immediately when changed
    loadHidePreferences();
  };

  const handleHideDuplicates = async () => {
    const newValue = !hideDuplicates;
    setHideDuplicates(newValue);
    await AsyncStorage.setItem('hideDuplicates', JSON.stringify(newValue));

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
      const monthItems = await loadMonthContent(selectedMonthData.monthKey, 5);
      const photoItems = monthItems.filter(item => item.type === 'photo');

      if (photoItems.length > 0) {
        setViewerInitialIndex(0);
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
      const monthItems = await loadMonthContent(selectedMonthData.monthKey, 5);
      const videoItems = monthItems.filter(item => item.type === 'video');

      if (videoItems.length > 0) {
        setViewerInitialIndex(0);
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
      const monthItems = await loadMonthContent(selectedMonthData.monthKey, 5);

      if (monthItems.length > 0) {
        setViewerInitialIndex(0);
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
          console.log('Error loading month content:', error);
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

  const handleViewProgress = (viewedCount: number) => {
    if (currentViewingMonth && currentViewingMonth !== 'DUPLICATES') {
      markMonthAsViewed(currentViewingMonth, viewedCount);
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
      const [duplicatesHidden, timeFiltersHidden, sourceFiltersHidden] =
        await Promise.all([
          AsyncStorage.getItem('hideDuplicates'),
          AsyncStorage.getItem('hideTimeFilters'),
          AsyncStorage.getItem('hideSourceFilters'),
        ]);

      if (duplicatesHidden) {
        setHideDuplicates(JSON.parse(duplicatesHidden));
      }
      if (timeFiltersHidden) {
        setHideTimeFilters(JSON.parse(timeFiltersHidden));
      }
      if (sourceFiltersHidden) {
        setHideSourceFilters(JSON.parse(sourceFiltersHidden));
      }
    } catch (error) {
      console.log('Error loading hide preferences:', error);
    }
  };

  // Load hide preferences on mount
  useEffect(() => {
    loadHidePreferences();
  }, []);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.permissionContainer}>
          <View style={styles.permissionContent}>
            <Text style={styles.permissionIcon}>📱</Text>
            <Text style={styles.permissionTitle}>Media Access Required</Text>
            <Text style={styles.permissionText}>
              Please grant media permissions to start organizing your photos.
            </Text>
            {Platform.OS === 'ios' && (
              <Text style={styles.permissionSubtext}>
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
        <Text style={styles.scanProgressText}>{phaseText}</Text>
        <View style={styles.scanProgressBar}>
          <View
            style={[styles.scanProgressFill, { width: `${percentage}%` }]}
          />
        </View>
        <Text style={styles.scanProgressCounter}>
          {current} / {total} ({percentage}%)
        </Text>
      </View>
    );
  };

  // Calculate total photos from all months
  const getTotalPhotosCount = () => {
    return monthSummaries.reduce(
      (total, summary) => total + (summary.totalCount || 0),
      0,
    );
  };

  // Get the items to show in the viewer
  let viewerItems: MediaItem[] = [];
  if (currentViewingMonth === 'DUPLICATES') {
    // For duplicates, show all items regardless of media type filter
    viewerItems = duplicateItems;
  } else if (
    currentViewingMonth &&
    currentViewingMonth.startsWith('TIME_FILTER_')
  ) {
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Enhanced Header */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Image
              source={logoImage}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            {!isSmallScreen && (
              <Text style={styles.headerSubtitle}>
                {currentViewingMonth && monthContent[currentViewingMonth]
                  ? `${monthContent[currentViewingMonth].items.length} photos`
                  : `${getTotalPhotosCount()} photos`}
              </Text>
            )}
          </View>
          <View style={styles.rightSection}>
            <TouchableOpacity
              style={styles.aboutButton}
              onPress={handleAboutPress}
            >
              <Text style={styles.aboutButtonText}>ℹ️</Text>
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
          </View>
        </View>
      </View>

      {/* Scan Progress */}
      {renderScanProgress()}

      {/* Content */}
      {isLoading && monthSummaries.length === 0 ? (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color="#1a1a1a" />
            <Text style={styles.loadingText}>Scanning your photos...</Text>
          </View>
        </View>
      ) : monthSummaries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyContent}>
            <Text style={styles.emptyIcon}>📸</Text>
            <Text style={styles.emptyTitle}>No Media Found</Text>
            <Text style={styles.emptyText}>No media found on your device</Text>
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
                tintColor="#1a1a1a"
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {/* Special Filters Section */}
            <View style={styles.specialFiltersContainer}>
              <TouchableOpacity
                style={styles.specialFiltersHeaderRow}
                onPress={() =>
                  setSpecialFiltersCollapsed(!specialFiltersCollapsed)
                }
                activeOpacity={0.7}
              >
                <Text style={styles.specialFiltersHeaderText}>
                  Special Filters
                </Text>
                <Text style={styles.specialFiltersChevron}>
                  {specialFiltersCollapsed ? '⌄' : '⌃'}
                </Text>
              </TouchableOpacity>

              {!specialFiltersCollapsed && (
                <>
                  {/* Duplicates group */}
                  <View style={styles.filterGroup}>
                    <View style={styles.groupHeaderRow}>
                      <Text style={styles.groupTitle}>Duplicates</Text>
                      <TouchableOpacity
                        style={styles.hideButton}
                        onPress={handleHideDuplicates}
                      >
                        <Text
                          style={[
                            styles.hideButtonText,
                            isSmallScreen && styles.hideButtonTextMobile,
                          ]}
                        >
                          {hideDuplicates
                            ? '👁️'
                            : isSmallScreen
                            ? '🚫'
                            : 'Hide'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {!hideDuplicates && (
                      <LinearGradient
                        colors={gradientPalette.lightPurple}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.groupCardGradient}
                      >
                        <View style={styles.groupCardInner}>
                          <View style={styles.groupCardContent}>
                            <View style={styles.groupIconCircle}>
                              <Text style={styles.groupIcon}>♻️</Text>
                            </View>
                            <View style={styles.groupTextCol}>
                              <Text style={styles.groupPrimary}>
                                Find and review duplicates
                              </Text>
                              <Text style={styles.groupSecondary}>
                                {
                                  duplicateItems.filter(i => i.type === 'photo')
                                    .length
                                }{' '}
                                photos •{' '}
                                {
                                  duplicateItems.filter(i => i.type === 'video')
                                    .length
                                }{' '}
                                videos
                              </Text>
                            </View>
                          </View>
                          <View style={styles.chipRow}>
                            <TouchableOpacity
                              style={[
                                styles.chipButton,
                                duplicateItems.filter(i => i.type === 'photo')
                                  .length === 0 && styles.chipDisabled,
                              ]}
                              onPress={() => handleDuplicateTypePress('photos')}
                              disabled={
                                duplicateItems.filter(i => i.type === 'photo')
                                  .length === 0
                              }
                            >
                              <Text style={styles.chipText}>Photos</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.chipButton,
                                duplicateItems.filter(i => i.type === 'video')
                                  .length === 0 && styles.chipDisabled,
                              ]}
                              onPress={() => handleDuplicateTypePress('videos')}
                              disabled={
                                duplicateItems.filter(i => i.type === 'video')
                                  .length === 0
                              }
                            >
                              <Text style={styles.chipText}>Videos</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </LinearGradient>
                    )}
                  </View>

                  {/* Recent group */}
                  <View style={styles.filterGroup}>
                    <View style={styles.groupHeaderRow}>
                      <Text style={styles.groupTitle}>Recent</Text>
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
                    {!hideTimeFilters && (
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
                              onPress={() => handleTimeFilterPress('today')}
                            >
                              <Text style={styles.chipText}>Today</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.chipButton}
                              onPress={() => handleTimeFilterPress('yesterday')}
                            >
                              <Text style={styles.chipText}>Yesterday</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </LinearGradient>
                    )}
                  </View>
                </>
              )}
            </View>

            {monthSummaries.map((summary, index) => {
              const count = summary.totalCount || 0;
              const gradientColors =
                monthGradients[index % monthGradients.length];

              return (
                <TouchableOpacity
                  key={summary.monthKey}
                  style={styles.monthCard}
                  onPress={() => handleMonthPress(summary.monthKey)}
                >
                  <LinearGradient
                    colors={gradientColors}
                    style={styles.monthCardGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <View style={styles.monthCardContent}>
                      <View style={styles.monthInfo}>
                        <View style={styles.monthTitleRow}>
                          <Text style={styles.monthTitle}>
                            {summary.monthName}
                          </Text>
                          <Text style={styles.monthCount}>
                            {count} {count === 1 ? 'item' : 'items'}
                            {viewedMonths[summary.monthKey] && (
                              <Text style={styles.monthProgressText}>
                                {' '}
                                • Viewed ✓{' '}
                                {individualMonthProgress[summary.monthKey] ||
                                  100}
                                %
                              </Text>
                            )}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.monthRight}>
                        <Text style={styles.monthChevron}>›</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}

            <View style={styles.bottomSpacing} />
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
            currentViewingMonth === 'DUPLICATES'
              ? duplicateItems.length
              : monthSummaries.find(m => m.monthKey === currentViewingMonth)
                  ?.totalCount || viewerItems.length
          }
        />
      )}

      {/* About Modal */}
      {aboutVisible && (
        <About
          onClose={handleCloseAbout}
          onPreferencesChanged={handlePreferencesChanged}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fefefe',
  },
  headerContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
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
  headerLogo: {
    height: 50,
    width: 200,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(26, 26, 26, 0.7)',
    fontWeight: '600',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  refreshButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  viewingLimitsBadge: {
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  viewingLimitsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
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
    color: '#1a1a1a',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
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
  },
  monthCardGradient: {
    padding: 16,
    minHeight: 88,
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
  monthTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
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
    color: '#0f172a',
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
    backgroundColor: '#fefefe',
  },
  loadingContent: {
    backgroundColor: 'rgba(255, 250, 240, 0.8)',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 245, 220, 0.8)',
  },
  loadingText: {
    fontSize: 16,
    color: '#1a1a1a',
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#fefefe',
  },
  emptyContent: {
    backgroundColor: 'rgba(255, 250, 240, 0.8)',
    paddingHorizontal: 32,
    paddingVertical: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 245, 220, 0.8)',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 12,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(26, 26, 26, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#fefefe',
  },
  permissionContent: {
    backgroundColor: 'rgba(255, 250, 240, 0.8)',
    paddingHorizontal: 32,
    paddingVertical: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 245, 220, 0.8)',
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: 20,
    opacity: 0.8,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 12,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  permissionText: {
    fontSize: 16,
    color: 'rgba(26, 26, 26, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  permissionSubtext: {
    fontSize: 14,
    color: 'rgba(26, 26, 26, 0.7)',
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: 'rgba(245, 245, 220, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 245, 220, 1)',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
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
    color: '#1a1a1a',
    marginBottom: 8,
  },
  scanProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(245, 245, 220, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  scanProgressFill: {
    height: '100%',
    backgroundColor: 'rgba(245, 245, 220, 0.8)',
    borderRadius: 4,
  },
  scanProgressCounter: {
    fontSize: 14,
    color: 'rgba(26, 26, 26, 0.7)',
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
    color: '#ffffff',
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
  aboutButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(26, 26, 26, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  aboutButtonText: {
    fontSize: 16,
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
    color: 'rgba(26, 26, 26, 0.7)',
  },
  hideButtonTextMobile: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(26, 26, 26, 0.8)',
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
    backgroundColor: '#ffffff',
    borderRadius: 20,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: gradientPalette.lightPink[1],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
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
    color: '#0f172a',
  },
  specialFiltersChevron: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
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
    color: '#0f172a',
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
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  groupSecondary: {
    color: '#334155',
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
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
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
        color: '#ffffff',
        textShadowColor: 'rgba(0, 0, 0, 0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
      duplicateCount: {
        fontSize: 14,
        fontWeight: '600' as const,
        color: '#ffffff',
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
          color: '#ffffff',
          textShadowColor: 'rgba(0, 0, 0, 0.3)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        },
        duplicateCount: {
          fontSize: 10,
          fontWeight: '600' as const,
          color: '#ffffff',
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
          color: '#ffffff',
          textShadowColor: 'rgba(0, 0, 0, 0.3)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        },
        duplicateCount: {
          fontSize: 12,
          fontWeight: '600' as const,
          color: '#ffffff',
          textShadowColor: 'rgba(0, 0, 0, 0.3)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        },
      };
    }
  }
};

export default Home;
