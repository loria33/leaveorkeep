import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Animated,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  FlatList,
  ViewToken,
  Pressable,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FastImage from 'react-native-fast-image';
import Video from 'react-native-video';
import Share from 'react-native-share';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import STT from 'react-native-davoice-tts/stt';
import { DAVOICE_LICENSE } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMedia, MediaItem } from '../context/MediaContext';
import { loadViewedItems } from '../utils/viewedMediaTracker';
import InAppPurchaseManager from '../utils/InAppPurchaseManager';
import BannerAdManager from '../utils/BannerAdManager';
import BannerAdComponent from './BannerAdComponent';
import {
  checkMicrophonePermission,
  requestMicrophonePermission,
  checkSpeechRecognitionPermission,
  requestSpeechRecognitionPermission,
} from '../utils/permissions';

const shareIcon = require('../assets/share.png');

export type MediaViewerMediaType = 'photos' | 'videos' | 'all';

export interface MediaViewerNextMonth {
  monthKey: string;
  monthName: string;
}

interface MediaViewerProps {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
  /** Month-wide viewed count and total, reported whenever a new item is seen */
  onViewProgress?: (viewedCount: number, totalCount: number) => void;
  monthKey?: string;
  /** Display name of the month, shown in the end-of-month drawer */
  monthName?: string;
  /** What the caller opened; inferred from `items` when omitted */
  mediaType?: MediaViewerMediaType;
  totalCount?: number;
  /** Month offered by the end-of-month drawer; null when this is the last one */
  nextMonth?: MediaViewerNextMonth | null;
  /** Called when the user taps "Next" in the end-of-month drawer */
  onNextMonth?: () => void;
}

const { width, height } = Dimensions.get('window');

// Months that carry progress and can be finished; filters and duplicates cannot
const isTrackableMonth = (key?: string): key is string =>
  !!key &&
  key !== 'DUPLICATES' &&
  !key.startsWith('TIME_FILTER_') &&
  !key.startsWith('SOURCE_FILTER_');

// Where the end-of-month sheet sits while hidden (below the screen edge)
const END_OF_MONTH_SHEET_HIDDEN_Y = 480;

const MediaViewer: React.FC<MediaViewerProps> = ({
  items: initialItems,
  initialIndex,
  onClose,
  onViewProgress,
  monthKey,
  monthName,
  mediaType,
  nextMonth = null,
  onNextMonth,
}) => {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const [showControls, setShowControls] = useState(true);
  // Navigation lock lives in refs so async callbacks always see the live value
  const isNavigatingRef = useRef(false);
  const navigationStartIndexRef = useRef<number | null>(null);
  const navigationFailsafeRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [videoError, setVideoError] = useState<{ [key: string]: boolean }>({});
  const [videoPaused, setVideoPaused] = useState<{ [key: string]: boolean }>(
    {},
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFlickTransitioning, setIsFlickTransitioning] = useState(false);
  const [isCheckingLoadMore, setIsCheckingLoadMore] = useState(false);
  const [items, setItems] = useState<MediaItem[]>(() => {
    // Initialize with initialItems if available, otherwise empty array
    return initialItems.length > 0 ? initialItems : [];
  });
  const [showOnlyOneMessage, setShowOnlyOneMessage] = useState(false);
  const viewedItemsRef = useRef<Set<string>>(new Set());
  const [viewedItemsSet, setViewedItemsSet] = useState<Set<string>>(new Set());
  const [isCurrentItemViewed, setIsCurrentItemViewed] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [showVoiceTutorial, setShowVoiceTutorial] = useState(false);
  const [hasSeenVoiceTutorial, setHasSeenVoiceTutorial] = useState(false);
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false);

  // ===== END-OF-MONTH DRAWER =====
  const [showEndOfMonthDrawer, setShowEndOfMonthDrawer] = useState(false);
  const endOfMonthDrawerVisibleRef = useRef(false);
  const endOfMonthNextRequestedRef = useRef(false);
  const endOfMonthSheetY = useRef(
    new Animated.Value(END_OF_MONTH_SHEET_HIDDEN_Y),
  ).current;
  const endOfMonthBackdropOpacity = useRef(new Animated.Value(0)).current;
  // Index a drag started on, so a swipe past the last item can be told apart from
  // the swipe that merely arrived there
  const dragStartIndexRef = useRef<number | null>(null);
  const isStoppingRef = useRef<boolean>(false); // Flag to prevent processing commands when stopping
  const isInitialMountRef = useRef<boolean>(true); // Track if this is the initial mount
  const previousIndexRef = useRef<number>(initialIndex); // Track previous index to detect actual navigation

  // ===== VOICE: ONE COMMAND PER ITEM (HARD GATE) =====
  const commandConsumedForItemRef = useRef<string | null>(null); // item.id that already consumed a command
  const pendingNavRef = useRef<boolean>(false); // blocks until FlatList actually changes item (currentIndex changes)
  const partialCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastPartialRef = useRef<string>('');
  const lastProcessedTranscriptRef = useRef<string>(''); // global, not per-item
  const lastExecutedCommandSignatureRef = useRef<string>('');
  const PARTIAL_STABLE_MS = 250;

  // Load viewed items set on mount for checkmark display
  useEffect(() => {
    const loadViewedSet = async () => {
      try {
        const viewed = await loadViewedItems();
        setViewedItemsSet(viewed);
      } catch (error) {
        // Error loading viewed items
      }
    };
    loadViewedSet();
  }, []);

  // Check if user has seen the voice tutorial
  useEffect(() => {
    const checkVoiceTutorial = async () => {
      try {
        const hasSeen = await AsyncStorage.getItem('hasSeenVoiceTutorial');
        setHasSeenVoiceTutorial(hasSeen === 'true');
      } catch (error) {
        // Error checking voice tutorial status
      }
    };
    checkVoiceTutorial();
  }, []);

  // SINGLE SOURCE OF TRUTH:
  // - If monthKey is provided, use monthContent from context (it's the authoritative source)
  // - If no monthKey, use initialItems prop (for non-month views like duplicates)
  // This prevents two effects from fighting over the same state

  const {
    addToTrash,
    canViewMedia,
    incrementViewCount,
    loadMoreMonthContent,
    monthContent,
    markMediaItemAsViewed,
    checkAndMarkMonthCompleted,
    getRemainingCooldownTime,
    setPremiumStatus,
    isPremiumUser,
    getMonthViewedStats,
  } = useMedia();

  // Latest month content for callbacks that must not be re-created on every load
  const monthContentRef = useRef(monthContent);
  monthContentRef.current = monthContent;

  // FlatList ref for programmatic navigation
  const flatListRef = useRef<FlatList>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // Keep a ref to the latest items array to avoid closure issues
  const itemsRef = useRef<MediaItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const currentItem = items[currentIndex];

  useEffect(() => {
    if (!currentItem) return;
    if (currentItem.type !== 'video') return;

    // Every time a video comes into view, pause it by default
    setVideoPaused(prev => ({
      ...prev,
      [currentItem.id]: true,
    }));
  }, [currentIndex, currentItem?.id, currentItem?.type]);

  // Preload adjacent images for smoother transitions
  useEffect(() => {
    if (currentItem) {
      // Preload next image
      if (currentIndex < items.length - 1) {
        const nextItem = items[currentIndex + 1];
        if (
          nextItem &&
          nextItem.type === 'photo' &&
          !nextItem.uri.startsWith('ph://')
        ) {
          FastImage.preload([
            { uri: nextItem.uri, priority: FastImage.priority.low },
          ]);
        }
      }
      // Preload previous image
      if (currentIndex > 0) {
        const prevItem = items[currentIndex - 1];
        if (
          prevItem &&
          prevItem.type === 'photo' &&
          !prevItem.uri.startsWith('ph://')
        ) {
          FastImage.preload([
            { uri: prevItem.uri, priority: FastImage.priority.low },
          ]);
        }
      }
    }
  }, [currentIndex, items, currentItem]);

  // Debug logging for current item
  React.useEffect(() => {
    // Use ref to avoid dependency on items.length
    const currentItemsLength = itemsRef.current.length;
    const itemsStateLength = items.length;

    // Update current item when index or items change
  }, [currentItem, currentIndex, items]); // Include items to track when it changes

  // Check if current item is viewed and update state (only if it was already viewed before)
  useEffect(() => {
    if (currentItem) {
      // Only show checkmark if item was already viewed BEFORE we started viewing it
      // Check the viewedItemsSet that was loaded from storage, not the one we're updating
      const wasAlreadyViewed = viewedItemsSet.has(currentItem.id);
      setIsCurrentItemViewed(wasAlreadyViewed);

      // Also update viewedItemsRef for tracking
      if (wasAlreadyViewed && !viewedItemsRef.current.has(currentItem.id)) {
        viewedItemsRef.current.add(currentItem.id);
      }
    } else {
      setIsCurrentItemViewed(false);
    }
  }, [currentItem, viewedItemsSet]);

  // Determine media type filter based on provided items (not current state)
  // This prevents issues when items state is in transition
  const getMediaTypeFilter = (
    itemsToCheck: MediaItem[],
  ): 'photo' | 'video' | 'all' => {
    if (itemsToCheck.length === 0) return 'all';
    const hasPhotos = itemsToCheck.some(item => item.type === 'photo');
    const hasVideos = itemsToCheck.some(item => item.type === 'video');
    if (hasPhotos && !hasVideos) return 'photo';
    if (hasVideos && !hasPhotos) return 'video';
    return 'all';
  };

  // The media-type filter is fixed for the life of the viewer: it comes from the
  // caller's mediaType, or failing that from the items the viewer was opened with.
  // It must never be derived from the list being filtered (that made it a no-op).
  const mediaTypeFilterRef = useRef<'photo' | 'video' | 'all'>(
    mediaType === 'photos'
      ? 'photo'
      : mediaType === 'videos'
      ? 'video'
      : mediaType === 'all'
      ? 'all'
      : getMediaTypeFilter(initialItems),
  );
  const filterItems = (allItems: MediaItem[]): MediaItem[] => {
    const filterType = mediaTypeFilterRef.current;
    if (filterType === 'all') return allItems;
    return allItems.filter(item => item.type === filterType);
  };

  // MEMORY OPTIMIZATION: Load items in batches
  const MAX_ITEMS_IN_VIEWER = 200; // Increased to allow more items
  const LOAD_MORE_THRESHOLD = 10; // Load more when within 10 items of the end
  const BATCH_SIZE = 20; // Load 20 items at a time

  // Load first batch when component mounts if needed
  const hasLoadedInitialRef = useRef(false);

  useEffect(() => {
    if (monthKey && !hasLoadedInitialRef.current) {
      const currentItemsLength = itemsRef.current.length;
      if (currentItemsLength === 0) {
        const content = monthContent[monthKey];
        if (content && content.hasMore && !content.isLoading) {
          hasLoadedInitialRef.current = true;
          setIsLoading(true);
          loadMoreMonthContent(monthKey, BATCH_SIZE).finally(() => {
            setIsLoading(false);
          });
        }
      }
    }
  }, [monthKey]);

  // Load more items when user approaches the end of loaded items
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    if (!monthKey || isLoadingMoreRef.current) {
      return;
    }
    if (!canViewMedia()) return;

    const currentItemsLength = itemsRef.current.length;
    if (currentItemsLength === 0) return; // <-- critical
    const content = monthContent[monthKey];

    // Only show checking indicator when we're near the threshold
    const isNearThreshold =
      currentIndex >= currentItemsLength - LOAD_MORE_THRESHOLD;

    // Load more if user is within threshold of the end and there are more items
    if (
      isNearThreshold &&
      currentItemsLength < MAX_ITEMS_IN_VIEWER &&
      content &&
      content.hasMore &&
      !content.isLoading
    ) {
      // Show loading indicator when actually loading
      isLoadingMoreRef.current = true;
      setIsLoading(true);
      setIsCheckingLoadMore(true);
      loadMoreMonthContent(monthKey, BATCH_SIZE)
        .catch(error => {
          console.error('[MediaViewer] ❌ Error loading more items:', error);
        })
        .finally(() => {
          setIsLoading(false);
          setIsCheckingLoadMore(false);
          isLoadingMoreRef.current = false;
        });
    } else if (
      isNearThreshold &&
      content &&
      content.hasMore &&
      !content.isLoading
    ) {
      // Show brief indicator when near threshold but conditions not fully met (e.g., at max items)
      setIsCheckingLoadMore(true);
      setTimeout(() => {
        setIsCheckingLoadMore(false);
      }, 300);
    } else {
      // Don't show indicator when not near threshold
      setIsCheckingLoadMore(false);
    }
  }, [currentIndex, monthKey, monthContent]);

  // SINGLE SOURCE OF TRUTH: Update items from the appropriate source
  // - If monthKey exists: use monthContent (authoritative source from context)
  // - If no monthKey: use initialItems prop (for non-month views)
  const lastProcessedMonthRef = useRef<string>('');
  const lastProcessedContentLengthRef = useRef<number>(0);
  const lastProcessedContentSignatureRef = useRef<string>(''); // Track content by length + first item ID

  // Create stable signatures for dependency tracking (prevents infinite loops from object reference changes)
  const monthContentSignature = React.useMemo(() => {
    if (!monthKey) return null;
    const content = monthContent[monthKey];
    if (!content?.items?.length) return 'empty';
    const firstItem = content.items[0];
    const signature = `${content.items.length}-${firstItem?.id || ''}`;
    return signature;
  }, [monthKey, monthContent]);

  // CRITICAL: When monthKey exists, initialItems is ONLY for initial mount
  // Ignore changes to initialItems prop after mount - monthContent is the source of truth
  const initialItemsSignature = React.useMemo(() => {
    if (initialItems.length === 0) return 'empty';
    return `${initialItems.length}-${initialItems[0]?.id || ''}`;
  }, [initialItems.length, initialItems[0]?.id]);

  // Track if we've initialized from initialItems (only once on mount)
  const hasInitializedFromPropsRef = useRef(false);

  // Track if we're currently processing to prevent concurrent updates
  const isProcessingRef = useRef(false);

  // Track effect execution count to detect infinite loops
  const monthContentEffectCountRef = useRef(0);
  const initialItemsEffectCountRef = useRef(0);

  // SEPARATE EFFECTS: Split monthContent and initialItems into separate effects
  // This prevents initialItems changes from triggering when monthKey exists

  // Effect 1: Handle monthContent updates (ONLY when monthKey exists)
  useEffect(() => {
    monthContentEffectCountRef.current += 1;

    // Warn if effect is running too many times
    if (monthContentEffectCountRef.current > 10) {
      console.warn(
        '[MediaViewer] WARNING: monthContent effect has run',
        monthContentEffectCountRef.current,
        'times - possible infinite loop!',
      );
    }

    if (!monthKey) return; // Skip if no monthKey

    // Prevent concurrent processing
    if (isProcessingRef.current) {
      return;
    }

    // Use ref to get current items length (avoids stale closure issues)
    const currentItemsLength = itemsRef.current.length;
    const content = monthContent[monthKey];

    // Reset tracking when monthKey changes
    if (lastProcessedMonthRef.current !== monthKey) {
      lastProcessedMonthRef.current = monthKey;
      lastProcessedContentLengthRef.current = 0;
      lastProcessedContentSignatureRef.current = '';
      hasInitializedFromPropsRef.current = false; // Reset for new month
    }

    // Use the stable memoized signature
    const contentSignature = monthContentSignature || 'empty';

    // Skip if we've already processed this exact content
    if (
      contentSignature === lastProcessedContentSignatureRef.current &&
      contentSignature !== 'empty'
    ) {
      return;
    }

    // If content is loading or empty, preserve existing items
    if (!content || !content.items || content.items.length === 0) {
      // CRITICAL: Never clear items if we already have them loaded
      if (currentItemsLength > 0) {
        return; // Keep current items - don't clear them!
      }
      // Only use initialItems ONCE on initial mount if we truly have nothing
      if (
        currentItemsLength === 0 &&
        !hasInitializedFromPropsRef.current &&
        initialItems.length > 0 &&
        lastProcessedContentLengthRef.current === 0
      ) {
        isProcessingRef.current = true;
        const limitedItems = initialItems.slice(0, MAX_ITEMS_IN_VIEWER);
        setItems(limitedItems);
        itemsRef.current = limitedItems;
        lastProcessedContentLengthRef.current = initialItems.length;
        lastProcessedContentSignatureRef.current = `${initialItems.length}-${
          initialItems[0]?.id || ''
        }`;
        hasInitializedFromPropsRef.current = true;
        isProcessingRef.current = false;
      }
      return;
    }

    const filtered = filterItems(content.items);
    const filteredSignature = `${filtered.length}-${filtered[0]?.id || ''}`;

    // Update signature ref IMMEDIATELY to prevent concurrent processing
    if (filteredSignature !== lastProcessedContentSignatureRef.current) {
      lastProcessedContentSignatureRef.current = filteredSignature;
    } else {
      return; // Same signature, skip
    }

    // Only update if content actually increased
    if (filtered.length > lastProcessedContentLengthRef.current) {
      isProcessingRef.current = true;
      lastProcessedContentLengthRef.current = filtered.length;

      if (filtered.length > currentItemsLength || currentItemsLength === 0) {
        const limitedItems = filtered.slice(0, MAX_ITEMS_IN_VIEWER);
        setItems(limitedItems);
        itemsRef.current = limitedItems;
      }
      isProcessingRef.current = false;
    } else if (filtered.length > 0) {
      // Content changed but length didn't increase
      isProcessingRef.current = true;
      if (currentItemsLength === 0 || filtered.length !== currentItemsLength) {
        const limitedItems = filtered.slice(0, MAX_ITEMS_IN_VIEWER);
        setItems(limitedItems);
        itemsRef.current = limitedItems;
      }
      isProcessingRef.current = false;
    }
  }, [monthKey, monthContentSignature]); // ONLY depend on monthContent - ignore initialItems completely

  // Effect 2: Handle initialItems updates (ONLY when NO monthKey)
  useEffect(() => {
    initialItemsEffectCountRef.current += 1;

    // Warn if effect is running too many times
    if (initialItemsEffectCountRef.current > 10) {
      console.warn(
        '[MediaViewer] WARNING: initialItems effect has run',
        initialItemsEffectCountRef.current,
        'times - possible infinite loop!',
      );
    }

    if (monthKey) {
      return; // Skip if monthKey exists - monthContent is the source of truth
    }

    // Prevent concurrent processing
    if (isProcessingRef.current) {
      return;
    }

    const signature = initialItemsSignature || 'empty';

    if (
      signature !== lastProcessedContentSignatureRef.current &&
      initialItems.length > 0
    ) {
      isProcessingRef.current = true;
      const limitedItems = initialItems.slice(0, 50);
      setItems(limitedItems);
      itemsRef.current = limitedItems;
      lastProcessedContentSignatureRef.current = signature;
      lastProcessedContentLengthRef.current = initialItems.length;
      isProcessingRef.current = false;
    }
  }, [monthKey, initialItemsSignature]); // Only run when monthKey is null/undefined and initialItems changes

  // Keep refs for cleanup function to access latest values without dependencies
  const currentIndexRef = useRef(currentIndex);
  const monthKeyRef = useRef(monthKey);
  const itemsRefForCallback = useRef(items);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    monthKeyRef.current = monthKey;
    itemsRefForCallback.current = items;
  }, [currentIndex, monthKey, items]);

  // The last loaded item is the end of the month only once nothing more can be loaded
  const isAtEndOfMonth = useCallback((): boolean => {
    const key = monthKeyRef.current;
    if (!isTrackableMonth(key)) return false;
    const content = monthContentRef.current[key];
    return !content || !content.hasMore;
  }, []);

  const openEndOfMonthDrawer = useCallback(() => {
    if (endOfMonthDrawerVisibleRef.current) return;
    endOfMonthDrawerVisibleRef.current = true;
    setShowEndOfMonthDrawer(true);
    endOfMonthSheetY.setValue(END_OF_MONTH_SHEET_HIDDEN_Y);
    endOfMonthBackdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(endOfMonthSheetY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(endOfMonthBackdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [endOfMonthSheetY, endOfMonthBackdropOpacity]);

  const closeEndOfMonthDrawer = useCallback(() => {
    if (!endOfMonthDrawerVisibleRef.current) return;
    endOfMonthDrawerVisibleRef.current = false;
    Animated.parallel([
      Animated.timing(endOfMonthSheetY, {
        toValue: END_OF_MONTH_SHEET_HIDDEN_Y,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(endOfMonthBackdropOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      // A reopen during the close animation keeps the drawer mounted
      if (finished && !endOfMonthDrawerVisibleRef.current) {
        setShowEndOfMonthDrawer(false);
      }
    });
  }, [endOfMonthSheetY, endOfMonthBackdropOpacity]);

  // ===== VIEWED TRACKING =====
  // Month-wide progress = (viewed count scanned once when the viewer opened) + (items
  // newly marked in this session). Swipes never rescan the month; the parent runs the
  // definitive scan when the viewer closes.
  const viewedBaselineRef = useRef<{ viewed: number; total: number } | null>(
    null,
  );
  const newlyViewedCountRef = useRef(0);
  const completionRequestedRef = useRef(false);
  const closedViaButtonRef = useRef(false);
  const onViewProgressRef = useRef(onViewProgress);
  const markMediaItemAsViewedRef = useRef(markMediaItemAsViewed);
  const checkAndMarkMonthCompletedRef = useRef(checkAndMarkMonthCompleted);
  onViewProgressRef.current = onViewProgress;
  markMediaItemAsViewedRef.current = markMediaItemAsViewed;
  checkAndMarkMonthCompletedRef.current = checkAndMarkMonthCompleted;

  const reportProgress = useCallback(() => {
    const key = monthKeyRef.current;
    const baseline = viewedBaselineRef.current;
    if (!isTrackableMonth(key) || !baseline) return;

    const rawViewed = baseline.viewed + newlyViewedCountRef.current;
    const viewed =
      baseline.total > 0 ? Math.min(baseline.total, rawViewed) : rawViewed;
    onViewProgressRef.current?.(viewed, baseline.total);

    // Everything has been seen: ask for the definitive check once
    if (
      baseline.total > 0 &&
      viewed >= baseline.total &&
      !completionRequestedRef.current
    ) {
      completionRequestedRef.current = true;
      checkAndMarkMonthCompletedRef.current(key).catch(() => {
        completionRequestedRef.current = false;
      });
    }
  }, []);

  // Marks an item viewed once per session and reports progress when it is new
  const recordItemViewed = useCallback(
    async (itemId: string) => {
      if (viewedItemsRef.current.has(itemId)) return;
      viewedItemsRef.current.add(itemId);
      try {
        const isNew = await markMediaItemAsViewedRef.current(itemId);
        if (isNew) {
          newlyViewedCountRef.current += 1;
          reportProgress();
        }
      } catch (error) {
        // Storage error; the close-time flush retries
      }
    },
    [reportProgress],
  );

  // Scan the month once when the viewer opens to get the true viewed/total baseline
  useEffect(() => {
    if (!isTrackableMonth(monthKey)) return;
    let cancelled = false;
    viewedBaselineRef.current = null;
    newlyViewedCountRef.current = 0;
    completionRequestedRef.current = false;
    (async () => {
      try {
        // Snapshot the viewed set so items marked while the scan runs are not counted twice
        const snapshot = new Set(await loadViewedItems());
        const stats = await getMonthViewedStats(monthKey, snapshot);
        if (cancelled) return;
        viewedBaselineRef.current = {
          viewed: stats.viewedCount,
          total: stats.totalCount,
        };
        reportProgress();
      } catch (error) {
        // No baseline; the close-time scan still produces the final numbers
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  // Mark the item we navigated away from and count the view against the free-tier limit
  useEffect(() => {
    // Skip on initial mount - the first item is marked when the user leaves it
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      previousIndexRef.current = currentIndex;
      return;
    }

    const previousIndex = previousIndexRef.current;
    if (previousIndex === currentIndex) return;
    previousIndexRef.current = currentIndex;

    if (canViewMedia()) {
      incrementViewCount();
    }

    const itemToMark = items[previousIndex];
    if (itemToMark) {
      recordItemViewed(itemToMark.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, items]);

  // ===== VOICE GATE RESET: ONLY when item actually changes =====
  useEffect(() => {
    // Allow exactly one new voice command per new item
    pendingNavRef.current = false;
    commandConsumedForItemRef.current = null;

    // Clear any pending partial debounce so it doesn't fire after navigation
    if (partialCommitTimerRef.current) {
      clearTimeout(partialCommitTimerRef.current);
      partialCommitTimerRef.current = null;
    }
    lastPartialRef.current = '';
    // Forget the last transcript and command so the same word can drive the next item.
    // Continuous engines emit one result per utterance, so "keep" twice in a row must work.
    lastProcessedTranscriptRef.current = '';
    lastExecutedCommandSignatureRef.current = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id]);

  // Save viewed items and check completion when component unmounts (viewer closes)
  // CRITICAL FIX: Only depend on monthKey, not items or currentIndex
  // Use refs to access current values in cleanup to prevent infinite loops
  useEffect(() => {
    return () => {
      // MEMORY FIX: Clear FastImage cache when closing viewer
      try {
        FastImage.clearMemoryCache();
        FastImage.clearDiskCache();
      } catch (error) {
        // Error clearing cache
      }

      // Clear voice timers/listeners safety
      if (partialCommitTimerRef.current) {
        clearTimeout(partialCommitTimerRef.current);
        partialCommitTimerRef.current = null;
      }
      lastPartialRef.current = '';
      pendingNavRef.current = false;
      commandConsumedForItemRef.current = null;

      // MEMORY OPTIMIZATION: Clear items array to free memory
      // Use ref to get current items value
      const currentItems = itemsRef.current;
      const currentIndexOnClose = currentIndexRef.current;
      const currentMonthKey = monthKeyRef.current;

      setItems([]);

      // Mark the current item as viewed when closing (no-op if the close button already did)
      const currentItemOnClose = currentItems[currentIndexOnClose];
      if (currentItemOnClose) {
        recordItemViewed(currentItemOnClose.id);
      }

      // Mark all items that were displayed as viewed (in case any were missed)
      const itemsToMark = Array.from(viewedItemsRef.current);
      if (itemsToMark.length > 0) {
        import('../utils/viewedMediaTracker').then(
          ({ markItemsAsViewed, saveViewedItemsImmediately }) => {
            markItemsAsViewed(itemsToMark).then(() => {
              saveViewedItemsImmediately().catch(() => {
                // Error saving
              });
            });
          },
        );
      } else {
        import('../utils/viewedMediaTracker').then(
          ({ saveViewedItemsImmediately }) => {
            saveViewedItemsImmediately().catch(() => {
              // Error saving
            });
          },
        );
      }

      // Clear viewed items ref to free memory
      viewedItemsRef.current.clear();

      // Reload viewed items set when closing to refresh for next time
      loadViewedItems()
        .then(set => {
          setViewedItemsSet(set);
        })
        .catch(() => {
          // Error reloading
        });

      // Save last viewed item ID for this month so user can resume where they left off
      if (
        currentItemOnClose &&
        currentMonthKey &&
        currentMonthKey !== 'DUPLICATES' &&
        !currentMonthKey.startsWith('TIME_FILTER_') &&
        !currentMonthKey.startsWith('SOURCE_FILTER_')
      ) {
        import('../utils/viewedMediaTracker').then(
          ({ setLastViewedItemId }) => {
            setLastViewedItemId(currentMonthKey, currentItemOnClose.id).catch(
              () => {
                // Error saving last viewed item ID
              },
            );
          },
        );
      }

      // Fallback completion check for closes that bypass the close button (e.g. modal
      // swipe-down). The button path lets the parent run the definitive scan instead.
      if (isTrackableMonth(currentMonthKey) && !closedViaButtonRef.current) {
        checkAndMarkMonthCompletedRef.current(currentMonthKey).catch(() => {
          // Error checking completion
        });
      }
    };
  }, [monthKey]); // ONLY depend on monthKey - cleanup should only run on unmount or monthKey change

  // Timer effect for blocked view
  useEffect(() => {
    if (!canViewMedia()) {
      // Update timer immediately
      const updateTimer = () => {
        const time = getRemainingCooldownTime();
        setRemainingTime(time);
      };

      updateTimer();

      // Update timer every second
      const interval = setInterval(updateTimer, 1000);

      return () => clearInterval(interval);
    } else {
      setRemainingTime(0);
    }
  }, [canViewMedia, getRemainingCooldownTime]);

  // Format time as MM:SS (for 15-minute cooldown)
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
      2,
      '0',
    )}`;
  };

  // Handle premium purchase
  const handleGoPremium = async () => {
    if (isLoadingPurchase) return;

    setIsLoadingPurchase(true);
    try {
      const iapManager = InAppPurchaseManager.getInstance();
      const success = await iapManager.purchaseRemoveAds();

      if (success) {
        // Wait a bit for the purchase listener to process the purchase
        await new Promise<void>(resolve => setTimeout(resolve, 1000));

        // Check premium status after purchase
        const isPremium = await iapManager.checkPremiumStatus();
        if (isPremium) {
          // Update MediaContext premium status
          await setPremiumStatus(true);
          Alert.alert(
            'Premium Activated!',
            'You now have unlimited views and no ads. Enjoy!',
            [{ text: 'OK', onPress: onClose }],
          );
        } else {
          // Purchase might still be processing, check again after a delay
          setTimeout(async () => {
            const premiumStatus = await iapManager.checkPremiumStatus();
            if (premiumStatus) {
              await setPremiumStatus(true);
            }
          }, 2000);
        }
      }
    } catch (error: any) {
      console.error('Purchase error:', error);
      if (error.code !== 'E_USER_CANCELLED') {
        Alert.alert(
          'Purchase Failed',
          error.message || 'Unable to complete purchase. Please try again.',
          [{ text: 'OK' }],
        );
      }
    } finally {
      setIsLoadingPurchase(false);
    }
  };

  // Handle restore purchases
  const handleRestorePurchases = async () => {
    if (isLoadingPurchase) return;

    setIsLoadingPurchase(true);
    try {
      const iapManager = InAppPurchaseManager.getInstance();
      const restored = await iapManager.restorePurchases();

      if (restored) {
        const premiumStatus = await iapManager.checkPremiumStatus();
        await setPremiumStatus(premiumStatus);
        Alert.alert('Success', 'Your purchases have been restored.', [
          { text: 'OK', onPress: premiumStatus ? onClose : undefined },
        ]);
      } else {
        Alert.alert(
          'No Purchases Found',
          'No previous purchases were found to restore.',
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Restore Failed',
        error.message || 'Unable to restore purchases. Please try again.',
      );
    } finally {
      setIsLoadingPurchase(false);
    }
  };

  // Called when a programmatic scroll settles (momentum end) and by the failsafe timer
  const finishNavigation = useCallback((fromFailsafe: boolean) => {
    isNavigatingRef.current = false;
    if (!fromFailsafe) return;
    navigationFailsafeRef.current = null;
    // If the page never changed, free the voice gate so the next command is not stuck
    if (
      navigationStartIndexRef.current !== null &&
      currentIndexRef.current === navigationStartIndexRef.current
    ) {
      pendingNavRef.current = false;
      commandConsumedForItemRef.current = null;
    }
    navigationStartIndexRef.current = null;
  }, []);

  // Navigate using FlatList scrollToIndex for smooth native scrolling.
  // Returns false when nothing will move so callers can undo any locks they took.
  const smoothNavigate = useCallback(
    (direction: 'next' | 'prev'): boolean => {
      if (isNavigatingRef.current) return false;
      if (endOfMonthDrawerVisibleRef.current) return false;

      const currentItemsLength = itemsRef.current.length;
      // Going forward from the last item of a finished month offers the next month
      if (
        direction === 'next' &&
        currentItemsLength > 0 &&
        currentIndexRef.current === currentItemsLength - 1 &&
        isAtEndOfMonth()
      ) {
        openEndOfMonthDrawer();
        return false;
      }
      if (currentItemsLength === 1) {
        setShowOnlyOneMessage(true);
        setTimeout(() => setShowOnlyOneMessage(false), 2000);
        return false;
      }
      if (currentItemsLength === 0 || !flatListRef.current) return false;

      const prevIndex = currentIndexRef.current;
      const targetIndex = direction === 'next' ? prevIndex + 1 : prevIndex - 1;

      // Wrap around at boundaries
      let finalTargetIndex = targetIndex;
      if (targetIndex < 0) {
        finalTargetIndex = currentItemsLength - 1;
      } else if (targetIndex >= currentItemsLength) {
        finalTargetIndex = 0;
      }

      isNavigatingRef.current = true;
      navigationStartIndexRef.current = prevIndex;
      if (navigationFailsafeRef.current) {
        clearTimeout(navigationFailsafeRef.current);
      }
      // onViewableItemsChanged updates currentIndex. The failsafe always runs, so a
      // missing momentum-end event can never leave the viewer locked.
      navigationFailsafeRef.current = setTimeout(
        () => finishNavigation(true),
        600,
      );

      flatListRef.current.scrollToIndex({
        index: finalTargetIndex,
        animated: true,
      });
      return true;
    },
    [finishNavigation, isAtEndOfMonth, openEndOfMonthDrawer],
  );

  const handleNext = useCallback(
    (): boolean => smoothNavigate('next'),
    [smoothNavigate],
  );

  const handlePrevious = useCallback(
    (): boolean => smoothNavigate('prev'),
    [smoothNavigate],
  );

  const handleTrash = useCallback((): boolean => {
    if (!currentItem) return false;
    if (endOfMonthDrawerVisibleRef.current) return false;

    // Flicking the last item of a finished month leaves nothing left to do
    const wasLastItem = currentIndex === items.length - 1;

    // A flicked item is done with, so it counts as seen for month progress
    recordItemViewed(currentItem.id);

    // Add to trash
    addToTrash(currentItem);

    // Animate and move to next item
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -height,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Show overlay to hide FlatList re-layout jank
      setIsFlickTransitioning(true);

      // Remove item from local items array
      const newItems = items.filter((_, index) => index !== currentIndex);

      // Reset animations
      translateY.setValue(0);
      opacity.setValue(1);

      let targetIdx: number;
      if (currentIndex < newItems.length) {
        targetIdx = currentIndex;
      } else if (newItems.length > 0) {
        targetIdx = newItems.length - 1;
      } else {
        setIsFlickTransitioning(false);
        // Nothing left to show: the parent runs the final scan, so skip the fallback
        closedViaButtonRef.current = true;
        onClose();
        return;
      }

      // Update state behind the overlay
      setItems(newItems);
      setCurrentIndex(targetIdx);

      // Wait for FlatList to settle, then scroll and hide overlay
      setTimeout(() => {
        if (flatListRef.current && newItems.length > 0) {
          flatListRef.current.scrollToIndex({
            index: targetIdx,
            animated: false,
          });
        }
        // Give FlatList one more frame to finish layout
        setTimeout(() => {
          setIsFlickTransitioning(false);
          if (wasLastItem && isAtEndOfMonth()) {
            openEndOfMonthDrawer();
          }
        }, 150);
      }, 150);
    });
    return true;
  }, [
    currentItem,
    currentIndex,
    items,
    addToTrash,
    onClose,
    recordItemViewed,
    isAtEndOfMonth,
    openEndOfMonthDrawer,
  ]);

  // Close button: flush the current item as viewed first so the parent's final
  // scan includes it, then let the parent run that scan.
  const handleClosePress = useCallback(async () => {
    closedViaButtonRef.current = true;
    const item = itemsRef.current[currentIndexRef.current];
    if (item) {
      await recordItemViewed(item.id);
    }
    onClose();
  }, [onClose, recordItemViewed]);

  // "Next" in the end-of-month drawer: flush the current item the way the close
  // button does, then let the parent move on to the next month.
  const handleEndOfMonthNext = useCallback(async () => {
    if (!onNextMonth || endOfMonthNextRequestedRef.current) return;
    endOfMonthNextRequestedRef.current = true;
    closedViaButtonRef.current = true;
    const item = itemsRef.current[currentIndexRef.current];
    if (item) {
      await recordItemViewed(item.id);
    }
    onNextMonth();
  }, [onNextMonth, recordItemViewed]);

  const handleShare = async () => {
    if (!currentItem || currentItem.type === 'video') return;

    try {
      await Share.open({
        url: currentItem.uri,
        type: 'image/*',
      });
    } catch (error) {
      // Error sharing media
    }
  };

  // ===== VOICE ENGINE =====
  // Latest handlers via refs so the stable speech callbacks never go stale
  const handleNextRef = useRef<(() => boolean) | undefined>(undefined);
  const handleTrashRef = useRef<(() => boolean) | undefined>(undefined);
  handleNextRef.current = handleNext;
  handleTrashRef.current = handleTrash;

  const wantsListeningRef = useRef(false); // true from the VoiceIT press until Stop/close
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineFailuresRef = useRef(0);
  const startEngineRef = useRef<() => Promise<void>>(async () => {});
  const MAX_ENGINE_FAILURES = 3;

  const clearVoiceBuffers = useCallback(() => {
    if (partialCommitTimerRef.current) {
      clearTimeout(partialCommitTimerRef.current);
      partialCommitTimerRef.current = null;
    }
    lastPartialRef.current = '';
    lastProcessedTranscriptRef.current = '';
    lastExecutedCommandSignatureRef.current = '';
  }, []);

  const releaseVoiceGate = useCallback(() => {
    pendingNavRef.current = false;
    commandConsumedForItemRef.current = null;
  }, []);

  const stopVoiceRecognition = useCallback(async () => {
    wantsListeningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    // Swallow results that are still in flight
    isStoppingRef.current = true;
    clearVoiceBuffers();
    releaseVoiceGate();
    setIsListening(false);
    setVoiceTranscript('');
    try {
      await STT.stop();
    } catch (error) {
      // Engine was already stopped
    }
    setTimeout(() => {
      isStoppingRef.current = false;
    }, 1000);
  }, [clearVoiceBuffers, releaseVoiceGate]);

  const commitVoiceCommandOncePerItem = useCallback(
    (transcript: string) => {
      if (isStoppingRef.current) return;

      const normalized = transcript
        .toLowerCase()
        .replace(/[^\w\s']/g, '')
        .trim();
      if (!normalized) return;

      // Ignore repeated callbacks carrying the same transcript
      if (normalized === lastProcessedTranscriptRef.current) return;
      lastProcessedTranscriptRef.current = normalized;

      const item = itemsRef.current[currentIndexRef.current];
      if (!item) return;

      const cmdRegex =
        /\b(keep|swipe|next|continue|trash|flick|delete|remove)\b/g;
      const currentCommands: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = cmdRegex.exec(normalized)) !== null) {
        currentCommands.push(match[1]);
      }
      if (currentCommands.length === 0) return;

      // The final result repeats the command sequence the partial already executed
      const commandSignature = currentCommands.join(',');
      if (commandSignature === lastExecutedCommandSignatureRef.current) return;

      if (commandConsumedForItemRef.current === item.id) {
        return;
      }
      if (pendingNavRef.current) {
        return;
      }

      const lastCmd = currentCommands[currentCommands.length - 1];
      const isTrash = ['trash', 'flick', 'delete', 'remove'].includes(lastCmd);
      const isNext = ['keep', 'swipe', 'next', 'continue'].includes(lastCmd);
      if (!isTrash && !isNext) return;

      commandConsumedForItemRef.current = item.id;
      pendingNavRef.current = true;
      setVoiceTranscript('');

      const executed = isTrash
        ? handleTrashRef.current?.() === true
        : handleNextRef.current?.() === true;

      if (executed) {
        // Only a command that actually ran counts as executed
        lastExecutedCommandSignatureRef.current = commandSignature;
      } else {
        // Nothing moved (single item, navigation in progress...): undo the locks so
        // the user can simply say it again
        releaseVoiceGate();
        lastProcessedTranscriptRef.current = '';
      }
    },
    [releaseVoiceGate],
  );

  // Continuous engines fire onSpeechEnd after every utterance while still listening;
  // Apple's recognizer fires it (or a benign error) when the session really ended.
  // Ask the engine which case it is, twice, before restarting it.
  const scheduleEngineRestartIfNeeded = useCallback((reason: string) => {
    if (!wantsListeningRef.current || restartTimerRef.current) return;

    const isEngineIdle = async (): Promise<boolean> => {
      try {
        return (await STT.isRecognizing()) === 0;
      } catch (error) {
        return true;
      }
    };

    restartTimerRef.current = setTimeout(async () => {
      restartTimerRef.current = null;
      if (!wantsListeningRef.current) return;
      if (!(await isEngineIdle())) return;
      await new Promise<void>(resolve => setTimeout(resolve, 500));
      if (!wantsListeningRef.current) return;
      if (!(await isEngineIdle())) return;

      try {
        await startEngineRef.current();
      } catch (error) {
        engineFailuresRef.current += 1;
        if (engineFailuresRef.current >= MAX_ENGINE_FAILURES) {
          console.warn(
            '[VoiceIt] giving up after repeated engine failures',
            error,
          );
          wantsListeningRef.current = false;
          setIsListening(false);
          return;
        }
        scheduleEngineRestartIfNeeded('restart failed');
      }
    }, 400);
  }, []);

  // The single place speech handlers are registered. The STT wrapper binds native
  // listeners to whatever functions are set when start() runs, so this is called
  // right before every start.
  const attachSpeechHandlers = useCallback(() => {
    STT.onSpeechStart = () => {
      engineFailuresRef.current = 0;
      setIsListening(true);
    };
    STT.onSpeechRecognized = () => {};
    STT.onSpeechEnd = () => {
      scheduleEngineRestartIfNeeded('speech end');
    };
    STT.onSpeechError = (e: any) => {
      clearVoiceBuffers();
      releaseVoiceGate();
      setVoiceTranscript('');
      const description = `${e?.error?.message ?? ''} ${
        e?.error?.code ?? ''
      }`.trim();
      // Silence, session caps and cancellations are normal; anything else is a failure
      const isBenign =
        /no speech|retry|cancel|timeout|\b(216|203|1110)\b/i.test(description);
      if (!isBenign) {
        engineFailuresRef.current += 1;
        console.warn('[VoiceIt] speech error:', description);
        if (engineFailuresRef.current >= MAX_ENGINE_FAILURES) {
          wantsListeningRef.current = false;
          setIsListening(false);
          return;
        }
      }
      scheduleEngineRestartIfNeeded(isBenign ? 'benign error' : 'error');
    };
    STT.onSpeechResults = (e: any) => {
      if (isStoppingRef.current) return;
      if (partialCommitTimerRef.current) {
        clearTimeout(partialCommitTimerRef.current);
        partialCommitTimerRef.current = null;
      }
      const transcript = e?.value?.[0];
      if (typeof transcript === 'string' && transcript) {
        const lower = transcript.toLowerCase();
        setVoiceTranscript(lower);
        commitVoiceCommandOncePerItem(lower);
      }
    };
    STT.onSpeechPartialResults = (e: any) => {
      if (isStoppingRef.current) return;
      const transcript = e?.value?.[0];
      if (typeof transcript !== 'string' || !transcript) return;
      const partial = transcript.toLowerCase();
      setVoiceTranscript(partial);
      lastPartialRef.current = partial;
      // Commit once the partial has been stable for a moment; no need to wait for the final
      if (partialCommitTimerRef.current) {
        clearTimeout(partialCommitTimerRef.current);
      }
      partialCommitTimerRef.current = setTimeout(() => {
        commitVoiceCommandOncePerItem(lastPartialRef.current);
      }, PARTIAL_STABLE_MS);
    };
    STT.onSpeechVolumeChanged = () => {};
  }, [
    clearVoiceBuffers,
    releaseVoiceGate,
    commitVoiceCommandOncePerItem,
    scheduleEngineRestartIfNeeded,
  ]);

  // Tear down, re-register handlers, apply the license and start the engine
  const startEngine = useCallback(async () => {
    try {
      await STT.destroy();
    } catch (error) {
      // Nothing to destroy
    }
    // Give the audio session a moment to release before starting again
    await new Promise<void>(resolve => setTimeout(resolve, 300));
    if (!wantsListeningRef.current) return;

    attachSpeechHandlers();

    // destroy() discards the native recognizer (and its license on iOS), so re-apply every time
    if (DAVOICE_LICENSE) {
      try {
        const licenseAccepted = await STT.setLicense(DAVOICE_LICENSE);
        if (!licenseAccepted) {
          console.warn('[VoiceIt] DaVoice license key was rejected');
        }
      } catch (licenseError) {
        console.warn('[VoiceIt] Failed to set DaVoice license', licenseError);
      }
    } else {
      console.warn(
        '[VoiceIt] DAVOICE_LICENSE is not set in src/.env; speech recognition may not start',
      );
    }

    await STT.start('en-US');
    setIsListening(true);
  }, [attachSpeechHandlers]);
  startEngineRef.current = startEngine;

  const startVoiceRecognitionInternal = async () => {
    isStoppingRef.current = false;
    releaseVoiceGate();
    clearVoiceBuffers();
    engineFailuresRef.current = 0;

    // Check microphone permission
    let hasMicPermission = await checkMicrophonePermission();
    if (!hasMicPermission) {
      hasMicPermission = await requestMicrophonePermission();
    }
    if (!hasMicPermission) {
      Alert.alert(
        'Permission Required',
        'Microphone permission is required to use voice commands.',
      );
      return;
    }

    // Speech recognition permission (the iOS engine is built on Apple's recognizer)
    if (Platform.OS === 'ios') {
      let hasSpeechPermission = await checkSpeechRecognitionPermission();
      if (!hasSpeechPermission) {
        hasSpeechPermission = await requestSpeechRecognitionPermission();
      }
      if (!hasSpeechPermission) {
        Alert.alert(
          'Permission Required',
          'Speech recognition permission is required to use voice commands.',
        );
        return;
      }
    }

    // Pause the current video while the microphone is open
    const currentItemForVoice = itemsRef.current[currentIndexRef.current];
    if (currentItemForVoice?.type === 'video') {
      setVideoPaused(prev => ({ ...prev, [currentItemForVoice.id]: true }));
    }

    wantsListeningRef.current = true;
    try {
      await startEngine();
      setVoiceTranscript('');
    } catch (error) {
      console.warn('[VoiceIt] failed to start speech recognition', error);
      wantsListeningRef.current = false;
      setIsListening(false);
    }
  };

  const startVoiceRecognition = async () => {
    // First use: show the tutorial and start once it is dismissed
    if (!hasSeenVoiceTutorial) {
      setShowVoiceTutorial(true);
      return;
    }
    await startVoiceRecognitionInternal();
  };

  // Stop the engine when the viewer goes away
  useEffect(() => {
    return () => {
      wantsListeningRef.current = false;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (partialCommitTimerRef.current) {
        clearTimeout(partialCommitTimerRef.current);
        partialCommitTimerRef.current = null;
      }
      STT.destroy()
        .then(() => STT.removeAllListeners())
        .catch(() => {
          // Engine was not running
        });
    };
  }, []);

  // Only handle vertical gestures for trash (horizontal is handled by FlatList)
  const onVerticalGestureEvent = Animated.event(
    [
      {
        nativeEvent: {
          translationY: translateY,
        },
      },
    ],
    { useNativeDriver: true },
  );

  // Handle vertical gesture state changes (for trash)
  const onVerticalHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationY, velocityY } = event.nativeEvent;

      // Check for vertical swipe up (trash) - drag up goes to trash
      if (translationY < -100 || velocityY < -1000) {
        handleTrash();
        return;
      }

      // Reset position if swipe wasn't strong enough
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    }
  };

  // Track viewable items to update currentIndex - use refs to avoid stale closures
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const newIndex = viewableItems[0].index;
        const currentIdx = currentIndexRef.current;
        const currentItems = itemsRefForCallback.current;

        if (
          newIndex !== currentIdx &&
          newIndex >= 0 &&
          newIndex < currentItems.length
        ) {
          // Track swipe for banner ads (only count forward swipes, not backward)
          if (newIndex > currentIdx) {
            BannerAdManager.getInstance()
              .handleSwipe()
              .catch(() => {
                // Silently handle any errors
              });
          }
          setCurrentIndex(newIndex);
        }
      }
    },
    [], // Empty deps - using refs for latest values
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Track if we've scrolled to initial position - use state so we can use it in render
  const [hasScrolledToInitial, setHasScrolledToInitial] = useState(false);
  const initialIndexRef = useRef(initialIndex);

  useEffect(() => {
    // Reset when initialIndex prop changes (new viewer opened)
    if (initialIndexRef.current !== initialIndex) {
      setHasScrolledToInitial(false);
      initialIndexRef.current = initialIndex;
    }
  }, [initialIndex]);

  useEffect(() => {
    // Only scroll once when items are first loaded
    if (!hasScrolledToInitial && items.length > 0 && flatListRef.current) {
      const targetIndex = initialIndexRef.current;
      if (targetIndex >= 0 && targetIndex < items.length) {
        setHasScrolledToInitial(true);
        // Small delay to ensure FlatList is ready
        setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToIndex({
              index: targetIndex,
              animated: false,
            });
          }
        }, 100);
      }
    }
  }, [hasScrolledToInitial, items.length]);

  const toggleControls = () => {
    setShowControls(!showControls);
  };

  const handleCloseVoiceTutorial = async () => {
    try {
      await AsyncStorage.setItem('hasSeenVoiceTutorial', 'true');
      setHasSeenVoiceTutorial(true);
      setShowVoiceTutorial(false);
      // Now start voice recognition after closing tutorial
      await startVoiceRecognitionInternal();
    } catch (error) {
      setShowVoiceTutorial(false);
      // Still start voice recognition even if saving fails
      await startVoiceRecognitionInternal();
    }
  };

  // Always render - conditionally show content based on state
  // This ensures all hooks are always called in the same order
  const isBlocked = !canViewMedia();
  const hasNoItem = !currentItem;

  // Render blocked view
  if (isBlocked) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.blockedContainer}>
          <Text style={styles.blockedIcon}>⏳</Text>
          <Text style={styles.blockedTitle}>Viewing Limit Reached</Text>
          <Text style={styles.blockedTimer}>
            Resets in: {formatTime(remainingTime)}
          </Text>
          <Text style={styles.premiumDescription}>
            Go premium - pay once no more limits no more ads.
          </Text>
          <View style={styles.blockedButtonsContainer}>
            <TouchableOpacity
              style={[styles.blockedButton, styles.premiumButton]}
              onPress={handleGoPremium}
              disabled={isLoadingPurchase}
            >
              {isLoadingPurchase ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.blockedButtonText}>Go Premium</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.blockedButton} onPress={onClose}>
              <Text style={styles.blockedButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestorePurchases}
            disabled={isLoadingPurchase}
          >
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render loading view if no item
  if (hasNoItem) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  // Render main media viewer
  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Loading Indicator */}
      {(isLoading || isCheckingLoadMore || isFlickTransitioning) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Media Container - Using FlatList for native smooth scrolling */}
      <View style={styles.mediaContainer}>
        <PanGestureHandler
          onGestureEvent={onVerticalGestureEvent}
          onHandlerStateChange={onVerticalHandlerStateChange}
          activeOffsetY={[-20, 20]} // only activate after vertical intent
          failOffsetX={[-20, 20]} // fail quickly on horizontal intent
          simultaneousHandlers={flatListRef} // <-- key: don't block FlatList
        >
          <Animated.View style={{ flex: 1 }}>
            <FlatList
              ref={flatListRef}
              data={items}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, index) => {
                // Always include index to ensure uniqueness, even if item.id exists
                // This prevents duplicate key warnings when items have the same ID
                const baseKey = item.id || item.uri || `item-${index}`;
                return `${baseKey}-${index}`;
              }}
              initialScrollIndex={
                hasScrolledToInitial
                  ? undefined
                  : initialIndex >= 0 && initialIndex < items.length
                  ? initialIndex
                  : 0
              }
              getItemLayout={(data, index) => ({
                length: width,
                offset: width * index,
                index,
              })}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              onScrollToIndexFailed={info => {
                // Fallback: scroll to offset if scrollToIndex fails
                const wait = new Promise<void>(resolve =>
                  setTimeout(resolve, 500),
                );
                wait.then(() => {
                  if (flatListRef.current) {
                    flatListRef.current.scrollToOffset({
                      offset: info.averageItemLength * info.index,
                      animated: true,
                    });
                  }
                });
              }}
              removeClippedSubviews={Platform.OS === 'android'}
              windowSize={Platform.OS === 'android' ? 2 : 5}
              initialNumToRender={Platform.OS === 'android' ? 1 : 2}
              maxToRenderPerBatch={Platform.OS === 'android' ? 1 : 2}
              updateCellsBatchingPeriod={Platform.OS === 'android' ? 16 : 50}
              scrollEventThrottle={16}
              decelerationRate="fast"
              snapToInterval={width}
              snapToAlignment="start"
              maintainVisibleContentPosition={{
                minIndexForVisible: 0,
              }}
              onScrollBeginDrag={() => {
                dragStartIndexRef.current = currentIndexRef.current;
                if (!hasScrolledToInitial) {
                  setHasScrolledToInitial(true);
                }
              }}
              onScrollEndDrag={event => {
                // A forward swipe that started on the last item has nowhere to go:
                // iOS bounces past the end, Android stays put. Either way the offset
                // is still at (or beyond) the last page when the finger lifts.
                const startIndex = dragStartIndexRef.current;
                dragStartIndexRef.current = null;
                const count = itemsRef.current.length;
                if (
                  startIndex === null ||
                  count === 0 ||
                  startIndex !== count - 1
                ) {
                  return;
                }
                if (!isAtEndOfMonth()) return;
                const lastPageOffset = (count - 1) * width;
                if (event.nativeEvent.contentOffset.x >= lastPageOffset - 2) {
                  openEndOfMonthDrawer();
                }
              }}
              onMomentumScrollEnd={() => finishNavigation(false)}
              onScrollAnimationEnd={() => finishNavigation(false)}
              onEndReached={() => {
                // Load more items when reaching the end
                if (monthKey && !isLoadingMoreRef.current) {
                  const currentItemsLength = itemsRef.current.length;
                  const content = monthContent[monthKey];

                  if (
                    currentItemsLength < MAX_ITEMS_IN_VIEWER &&
                    content &&
                    content.hasMore &&
                    !content.isLoading
                  ) {
                    isLoadingMoreRef.current = true;
                    setIsLoading(true);
                    loadMoreMonthContent(monthKey, BATCH_SIZE)
                      .catch(error => {
                        console.error(
                          '[MediaViewer] ❌ onEndReached - Error loading:',
                          error,
                        );
                      })
                      .finally(() => {
                        setIsLoading(false);
                        isLoadingMoreRef.current = false;
                      });
                  }
                }
              }}
              onEndReachedThreshold={0.5}
              renderItem={({ item, index }) => {
                const isCurrentItem = index === currentIndex;
                return (
                  <View style={styles.mediaItemContainer}>
                    <TouchableOpacity
                      style={styles.mediaTouch}
                      onPress={toggleControls}
                      activeOpacity={1}
                    >
                      <Animated.View
                        style={[
                          styles.mediaWrapper,
                          isCurrentItem
                            ? {
                                transform: [{ translateY: translateY }],
                              }
                            : {},
                        ]}
                      >
                        {item.type === 'video' ? (
                          videoError[item.id] ? (
                            <View style={styles.videoErrorContainer}>
                              <Text style={styles.videoErrorIcon}>🎥</Text>
                              <Text style={styles.videoErrorTitle}>
                                Video Unavailable
                              </Text>
                              <Text style={styles.videoErrorText}>
                                This video cannot be played
                              </Text>
                            </View>
                          ) : (
                            <Video
                              source={{ uri: item.uri }}
                              style={styles.media}
                              resizeMode="contain"
                              controls={false}
                              paused={
                                videoPaused[item.id] !== false ||
                                !isCurrentItem ||
                                isListening
                              }
                              repeat={false}
                              playInBackground={false}
                              playWhenInactive={false}
                              ignoreSilentSwitch="ignore"
                              fullscreen={false}
                              fullscreenAutorotate={true}
                              fullscreenOrientation="all"
                              disableAudioSessionManagement={true}
                              bufferConfig={{
                                minBufferMs: 1000,
                                maxBufferMs: 5000,
                                bufferForPlaybackMs: 1000,
                                bufferForPlaybackAfterRebufferMs: 1000,
                              }}
                              maxBitRate={2000000}
                              onError={error => {
                                setVideoError(prev => ({
                                  ...prev,
                                  [item.id]: true,
                                }));
                              }}
                              onLoad={data => {
                                setVideoError(prev => ({
                                  ...prev,
                                  [item.id]: false,
                                }));
                              }}
                              onEnd={() => {
                                // Cleanup video when it ends
                              }}
                            />
                          )
                        ) : // Use React Native Image for ph:// URIs (FastImage doesn't support ph://)
                        item.uri.startsWith('ph://') ? (
                          <Image
                            source={{ uri: item.uri }}
                            style={styles.media}
                            resizeMode="contain"
                            onError={() => {
                              // Image failed to load
                            }}
                            onLoad={() => {
                              // Image loaded successfully
                            }}
                          />
                        ) : (
                          <FastImage
                            source={{
                              uri: item.uri,
                              priority: isCurrentItem
                                ? FastImage.priority.high
                                : FastImage.priority.low,
                              cache: FastImage.cacheControl.web,
                            }}
                            style={styles.media}
                            resizeMode={FastImage.resizeMode.contain}
                            onError={() => {
                              console.error('[MediaViewer] FastImage ERROR:', {
                                uri: item.uri,
                                id: item.id,
                              });
                            }}
                            onLoad={() => {
                              // Image loaded successfully
                            }}
                          />
                        )}
                      </Animated.View>

                      {/* Viewed Checkmark Badge - only show on current item */}
                      {isCurrentItem && isCurrentItemViewed && (
                        <View style={styles.viewedBadge}>
                          <Text style={styles.viewedCheckmark}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </Animated.View>
        </PanGestureHandler>
      </View>

      {/* Only One Item Message */}
      {showOnlyOneMessage && (
        <View style={styles.onlyOneMessageContainer}>
          <Text style={styles.onlyOneMessageText}>
            Only one - where you swiping to?
          </Text>
        </View>
      )}

      {/* Voice Tutorial Overlay */}
      {showVoiceTutorial && (
        <View style={styles.voiceTutorialOverlay}>
          <View style={styles.voiceTutorialContainer}>
            <TouchableOpacity
              style={styles.voiceTutorialCloseButton}
              onPress={handleCloseVoiceTutorial}
            >
              <Text style={styles.voiceTutorialCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.voiceTutorialTitle}>Voice Commands</Text>
            <View style={styles.voiceTutorialContent}>
              <Text style={styles.voiceTutorialText}>
                Say <Text style={styles.voiceTutorialHighlight}>swipe</Text> or{' '}
                <Text style={styles.voiceTutorialHighlight}>keep</Text> to move
                to the next image or video
              </Text>
              <Text style={styles.voiceTutorialText}>
                Say <Text style={styles.voiceTutorialHighlight}>flick</Text> or{' '}
                <Text style={styles.voiceTutorialHighlight}>trash</Text> to
                trash
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Floating Controls */}
      {showControls && (
        <View style={styles.controlsOverlay}>
          {/* Top Controls */}
          <View style={styles.topControls}>
            <TouchableOpacity
              onPress={handleClosePress}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={
                // Debounce press: prevent double taps
                isListening ? stopVoiceRecognition : startVoiceRecognition
              }
              activeOpacity={0.6}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              style={[
                styles.voiceButton,
                isListening && styles.voiceButtonActive,
              ]}
            >
              <Text style={styles.voiceButtonText}>
                {isListening ? 'Stop' : 'VoiceIT'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleShare}
            >
              <Image source={shareIcon} style={styles.controlButtonImage} />
            </TouchableOpacity>
            {currentItem.type === 'video' && (
              <TouchableOpacity
                style={styles.controlButton}
                onPress={() => {
                  if (isListening) {
                    stopVoiceRecognition();
                  }
                  setVideoPaused(prev => {
                    const isCurrentlyPaused = prev[currentItem.id] !== false;
                    return {
                      ...prev,
                      [currentItem.id]: !isCurrentlyPaused,
                    };
                  });
                }}
              >
                <Text style={styles.videoControlIcon}>
                  {videoPaused[currentItem.id] !== false ? '▶️' : '⏸️'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Gesture Instructions */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionText}>← KEEP →</Text>
            <Text style={styles.instructionSubText}>↑ FLICK up to TRASH</Text>
          </View>
        </View>
      )}

      {/* End-of-month drawer */}
      {showEndOfMonthDrawer && (
        <View style={styles.endOfMonthRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeEndOfMonthDrawer}
            accessibilityLabel="Close"
          >
            <Animated.View
              style={[
                styles.endOfMonthBackdrop,
                { opacity: endOfMonthBackdropOpacity },
              ]}
            />
          </Pressable>
          <Animated.View
            style={[
              styles.endOfMonthSheet,
              {
                paddingBottom: 20 + insets.bottom,
                transform: [{ translateY: endOfMonthSheetY }],
              },
            ]}
          >
            <View style={styles.endOfMonthHandle} />
            <Text style={styles.endOfMonthTitle}>Month complete</Text>
            <Text style={styles.endOfMonthBody}>
              {monthName
                ? `You've gone through everything in ${monthName}.`
                : "You've gone through everything in this month."}
            </Text>
            {nextMonth ? (
              <TouchableOpacity
                style={styles.endOfMonthPrimaryButton}
                onPress={handleEndOfMonthNext}
                activeOpacity={0.85}
              >
                <Text style={styles.endOfMonthPrimaryText}>Next</Text>
                <Text style={styles.endOfMonthPrimaryHint}>
                  {nextMonth.monthName} ›
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.endOfMonthNote}>
                This was the last month in your list.
              </Text>
            )}
            <TouchableOpacity
              style={styles.endOfMonthSecondaryButton}
              onPress={closeEndOfMonthDrawer}
              activeOpacity={0.85}
            >
              <Text style={styles.endOfMonthSecondaryText}>Continue</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Banner Ad */}
      <BannerAdComponent style={styles.bannerAdContainer} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 1000,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1001,
  },
  mediaContainer: {
    flex: 1,
  },
  mediaItemContainer: {
    width: width,
    height: height,
  },
  mediaTouch: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verticalGestureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    pointerEvents: 'box-none', // Don't block touches, just detect gestures
  },
  mediaWrapper: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: width,
    height: height,
  },
  gestureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
  topControls: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  voiceButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    marginLeft: 12,
  },
  voiceButtonActive: {
    backgroundColor: 'rgba(255, 0, 0, 0.7)',
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  voiceButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    flexDirection: 'column',
    alignItems: 'center',
  },
  controlButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  controlButtonImage: {
    width: 48,
    height: 48,
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  instructionText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 18,
    marginBottom: 8,
  },
  instructionSubText: {
    color: 'rgba(255, 0, 0, 0.8)',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
  },
  blockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  blockedIcon: {
    fontSize: 80,
    color: '#fff',
    marginBottom: 10,
  },
  blockedTitle: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  blockedTimer: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  premiumDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  blockedButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
    paddingHorizontal: 20,
  },
  blockedButton: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumButton: {
    backgroundColor: '#28a745',
  },
  blockedButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  restoreButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  restoreButtonText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  videoErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  videoErrorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  videoErrorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  videoErrorText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    textAlign: 'center',
  },
  videoControlsOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1001,
  },
  videoControlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoControlIcon: {
    fontSize: 48,
  },
  onlyOneMessageContainer: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    transform: [{ translateY: -25 }],
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1001,
  },
  onlyOneMessageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  viewedBadge: {
    position: 'absolute',
    top: 80,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 255, 136, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00FF88',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  viewedCheckmark: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  voiceTutorialOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  voiceTutorialContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    maxWidth: width * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  voiceTutorialCloseButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  voiceTutorialCloseText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
  },
  voiceTutorialTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  voiceTutorialContent: {
    marginTop: 8,
  },
  voiceTutorialText: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 16,
  },
  voiceTutorialHighlight: {
    fontWeight: 'bold',
    color: '#667eea',
  },
  bannerAdContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  endOfMonthRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 2100,
  },
  endOfMonthBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  endOfMonthSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 16,
  },
  endOfMonthHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 16,
  },
  endOfMonthTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  endOfMonthBody: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  endOfMonthPrimaryButton: {
    backgroundColor: '#667eea',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  endOfMonthPrimaryText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  endOfMonthPrimaryHint: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    marginTop: 2,
  },
  endOfMonthNote: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  endOfMonthSecondaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  endOfMonthSecondaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default MediaViewer;
