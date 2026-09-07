import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CommonActions,
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MediaViewer, { MediaViewerNextMonth } from '../components/MediaViewer';
import { MediaItem } from '../context/MediaContext';
import { useMedia } from '../context/MediaContext';
import { matchesMediaType, resolveResumeStart } from '../utils/resumePosition';

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

type MediaViewerScreenRouteProp = RouteProp<
  HomeStackParamList,
  'MediaViewerScreen'
>;
type MediaViewerScreenNavigationProp = StackNavigationProp<
  HomeStackParamList,
  'MediaViewerScreen'
>;

const MediaViewerScreen: React.FC = () => {
  const navigation = useNavigation<MediaViewerScreenNavigationProp>();
  const route = useRoute<MediaViewerScreenRouteProp>();
  const {
    monthKey,
    mediaType,
    initialIndex = 0,
    items: preloadedItems,
    totalCount: routeTotalCount,
  } = route.params;

  const {
    monthSummaries,
    loadMonthContent,
    getMonthItems,
    getMonthViewedStats,
  } = useMedia();

  const [viewerItems, setViewerItems] = useState<MediaItem[]>(
    preloadedItems || [],
  );
  const [isLoading, setIsLoading] = useState(
    !preloadedItems || preloadedItems.length === 0,
  );
  const [viewerInitialIndex, setViewerInitialIndex] = useState(initialIndex);

  // Get total count from summary if not provided
  const monthSummary = monthSummaries.find(m => m.monthKey === monthKey);
  const totalCount =
    routeTotalCount || monthSummary?.totalCount || viewerItems.length;

  const isTrackableMonth =
    !!monthKey &&
    !monthKey.startsWith('TIME_FILTER_') &&
    !monthKey.startsWith('SOURCE_FILTER_');

  // The month after this one in the Home list (newest first), offered once it is finished
  const nextMonth = useMemo<MediaViewerNextMonth | null>(() => {
    if (!isTrackableMonth) return null;
    const index = monthSummaries.findIndex(m => m.monthKey === monthKey);
    if (index < 0) return null;
    const next = monthSummaries[index + 1];
    return next ? { monthKey: next.monthKey, monthName: next.monthName } : null;
  }, [monthSummaries, monthKey, isTrackableMonth]);

  // Progress writes are serialized so a slow write can never overwrite a newer count
  const progressQueueRef = useRef<Promise<void>>(Promise.resolve());

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
      const existingItems = getMonthItems(monthKey).filter(item =>
        matchesMediaType(item, mediaType),
      );
      if (existingItems.length > 0) {
        setViewerItems(existingItems);
        setIsLoading(false);
        return;
      }

      // Load content from context and resume where the user left off
      setIsLoading(true);
      try {
        const monthItems = await loadMonthContent(monthKey, 20);
        const { items, index } = await resolveResumeStart(
          monthKey,
          mediaType,
          monthItems,
          loadMonthContent,
        );
        if (items.length > 0) {
          setViewerItems(items);
          setViewerInitialIndex(index);
        }
      } catch (error) {
        console.error('[MediaViewerScreen] Error loading content:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, [monthKey, mediaType, preloadedItems, getMonthItems, loadMonthContent]);

  // Persist progress in the shape Home reads from storage
  const saveProgress = (
    viewedCount: number,
    monthTotalCount: number,
  ): Promise<void> => {
    if (!isTrackableMonth) return Promise.resolve();

    const write = async () => {
      try {
        const total =
          monthTotalCount > 0
            ? monthTotalCount
            : monthSummary?.totalCount || totalCount || 0;
        const viewed = total > 0 ? Math.min(viewedCount, total) : viewedCount;
        const updatedProgress = {
          viewed,
          total,
          remaining: Math.max(0, total - viewed),
          started: viewed > 0,
        };

        const stored = await AsyncStorage.getItem('monthViewingProgress');
        const existingProgress = stored ? JSON.parse(stored) : {};
        await AsyncStorage.setItem(
          'monthViewingProgress',
          JSON.stringify({ ...existingProgress, [monthKey]: updatedProgress }),
        );
      } catch (error) {
        console.error('[MediaViewerScreen] Error saving progress:', error);
      }
    };

    progressQueueRef.current = progressQueueRef.current.then(write, write);
    return progressQueueRef.current;
  };

  const handleViewProgress = (viewedCount: number, monthTotalCount: number) => {
    void saveProgress(viewedCount, monthTotalCount);
  };

  // The viewer has already flushed the current item. Run the definitive month scan,
  // which also persists the completion flag, before the next screen comes into focus.
  const flushFinalProgress = async () => {
    try {
      if (isTrackableMonth) {
        const stats = await getMonthViewedStats(monthKey);
        await saveProgress(stats.viewedCount, stats.totalCount);
      }
    } catch (error) {
      console.error('[MediaViewerScreen] Error saving final progress:', error);
    }
  };

  const handleClose = async () => {
    await flushFinalProgress();
    navigation.goBack();
  };

  // "Next" in the end-of-month drawer: drop this month's viewer and selection screen
  // from the stack and open the next month's All Media / Photos / Videos screen.
  const handleNextMonth = async () => {
    if (!nextMonth) return;
    await flushFinalProgress();
    navigation.dispatch(state => {
      const viewerIndex = state.routes.findIndex(r => r.key === route.key);
      const below = state.routes.slice(
        0,
        viewerIndex >= 0 ? viewerIndex : state.routes.length,
      );
      const keep =
        below[below.length - 1]?.name === 'MonthSelectionScreen'
          ? below.slice(0, -1)
          : below;
      return CommonActions.reset({
        index: keep.length,
        routes: [
          ...keep.map(r => ({ key: r.key, name: r.name, params: r.params })),
          {
            name: 'MonthSelectionScreen',
            params: {
              monthKey: nextMonth.monthKey,
              monthName: nextMonth.monthName,
            },
          },
        ],
      });
    });
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
      monthName={monthSummary?.monthName}
      mediaType={mediaType}
      totalCount={totalCount}
      nextMonth={nextMonth}
      onNextMonth={handleNextMonth}
    />
  );
};

export default MediaViewerScreen;
