import React, { useEffect, useState } from 'react';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MediaViewer from '../components/MediaViewer';
import { MediaItem } from '../context/MediaContext';
import { useMedia } from '../context/MediaContext';

// Define navigation params
export type MediaViewerScreenParams = {
  monthKey: string;
  mediaType: 'photos' | 'videos' | 'all';
  initialIndex?: number;
  items?: MediaItem[]; // Optional pre-loaded items
  totalCount?: number;
};

type HomeStackParamList = {
  Home: undefined;
  MonthSelectionScreen: any;
  MediaViewerScreen: MediaViewerScreenParams;
};

type MediaViewerScreenRouteProp = RouteProp<HomeStackParamList, 'MediaViewerScreen'>;
type MediaViewerScreenNavigationProp = StackNavigationProp<HomeStackParamList, 'MediaViewerScreen'>;

const MediaViewerScreen: React.FC = () => {
  const navigation = useNavigation<MediaViewerScreenNavigationProp>();
  const route = useRoute<MediaViewerScreenRouteProp>();
  const { monthKey, mediaType, initialIndex = 0, items: preloadedItems, totalCount: routeTotalCount } = route.params;
  
  const {
    monthContent,
    monthSummaries,
    loadMonthContent,
    getMonthItems,
    getMonthViewedStats,
  } = useMedia();

  const [viewerItems, setViewerItems] = useState<MediaItem[]>(preloadedItems || []);
  const [isLoading, setIsLoading] = useState(!preloadedItems || preloadedItems.length === 0);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(initialIndex);

  // Get total count from summary if not provided
  const monthSummary = monthSummaries.find(m => m.monthKey === monthKey);
  const totalCount = routeTotalCount || monthSummary?.totalCount || viewerItems.length;

  // Load month content if not preloaded
  useEffect(() => {
    const loadContent = async () => {
      if (preloadedItems && preloadedItems.length > 0) {
        // Items already loaded, use them directly
        setViewerItems(preloadedItems);
        setViewerInitialIndex(initialIndex); // Use provided initialIndex
        setIsLoading(false);
        return;
      }

      // Check if content is already loaded in context
      const existingItems = getMonthItems(monthKey);
      if (existingItems.length > 0) {
        // Filter by media type
        let filteredItems = existingItems;
        if (mediaType === 'photos') {
          filteredItems = existingItems.filter(item => item.type === 'photo');
        } else if (mediaType === 'videos') {
          filteredItems = existingItems.filter(item => item.type === 'video');
        }

        if (filteredItems.length > 0) {
          setViewerItems(filteredItems);
          setIsLoading(false);
          return;
        }
      }

      // Load content from context
      setIsLoading(true);
      try {
        const monthItems = await loadMonthContent(monthKey, 20);
        
        // Filter by media type
        let filteredItems = monthItems;
        if (mediaType === 'photos') {
          filteredItems = monthItems.filter(item => item.type === 'photo');
        } else if (mediaType === 'videos') {
          filteredItems = monthItems.filter(item => item.type === 'video');
        }

        if (filteredItems.length > 0) {
          setViewerItems(filteredItems);
          
          // Find starting index (first unviewed or 0)
          const { getLastViewedItemId, loadViewedItems } = await import('../utils/viewedMediaTracker');
          const lastViewedItemId = await getLastViewedItemId(monthKey);
          let startIndex = 0;
          
          if (lastViewedItemId) {
            const foundIndex = filteredItems.findIndex(item => item.id === lastViewedItemId);
            if (foundIndex >= 0) {
              startIndex = foundIndex;
            } else {
              // Find first unviewed
              const viewedItems = await loadViewedItems();
              for (let i = 0; i < filteredItems.length; i++) {
                if (!viewedItems.has(filteredItems[i].id)) {
                  startIndex = i;
                  break;
                }
              }
            }
          } else {
            // Find first unviewed
            const viewedItems = await loadViewedItems();
            for (let i = 0; i < filteredItems.length; i++) {
              if (!viewedItems.has(filteredItems[i].id)) {
                startIndex = i;
                break;
              }
            }
          }
          
          setViewerInitialIndex(startIndex);
        }
      } catch (error) {
        console.error('[MediaViewerScreen] Error loading content:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, [monthKey, mediaType, preloadedItems, getMonthItems, loadMonthContent]);

  const handleClose = async () => {
    // Ensure progress is saved before navigating back
    // Get final viewed count before closing
    try {
      if (monthKey && !monthKey.startsWith('TIME_FILTER_') && !monthKey.startsWith('SOURCE_FILTER_')) {
        const stats = await getMonthViewedStats(monthKey);
        await handleViewProgress(stats.viewedCount);
      }
    } catch (error) {
      console.error('[MediaViewerScreen] Error saving final progress:', error);
    }
    navigation.goBack();
  };

  const handleViewProgress = async (viewedCount: number) => {
    // Save progress to AsyncStorage in the same format Home expects
    if (monthKey && !monthKey.startsWith('TIME_FILTER_') && !monthKey.startsWith('SOURCE_FILTER_')) {
      try {
        // Get total count from summary or use the component's totalCount
        const summary = monthSummaries.find(m => m.monthKey === monthKey);
        const monthTotalCount = summary?.totalCount || totalCount || 0;
        const remaining = monthTotalCount - viewedCount;
        const started = viewedCount > 0;

        const updatedProgress = {
          viewed: viewedCount,
          total: monthTotalCount,
          remaining,
          started,
        };

        // Load existing progress from storage
        const stored = await AsyncStorage.getItem('monthViewingProgress');
        const existingProgress = stored ? JSON.parse(stored) : {};
        
        // Update with new progress
        const newProgress = {
          ...existingProgress,
          [monthKey]: updatedProgress,
        };

        // Save to storage
        await AsyncStorage.setItem('monthViewingProgress', JSON.stringify(newProgress));
      } catch (error) {
        console.error('[MediaViewerScreen] Error saving progress:', error);
      }
    }
  };

  if (isLoading && viewerItems.length === 0) {
    return null; // Or show a loading indicator
  }

  return (
    <MediaViewer
      items={viewerItems}
      initialIndex={viewerInitialIndex}
      onClose={handleClose}
      onViewProgress={handleViewProgress}
      monthKey={monthKey}
      totalCount={totalCount}
    />
  );
};

export default MediaViewerScreen;

