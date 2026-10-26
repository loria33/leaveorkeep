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
import { formatBytes } from '../utils/format';
import { hapticKeep, hapticFlick } from '../utils/haptics';
import { loadViewedItems } from '../utils/viewedMediaTracker';
import BannerAdManager from '../utils/BannerAdManager';
import BannerAdComponent from './BannerAdComponent';
import {
  checkMicrophonePermission,
  requestMicrophonePermission,
  checkSpeechRecognitionPermission,
  requestSpeechRecognitionPermission,
} from '../utils/permissions';
import {
  advanceVoiceUtterance,
  closeVoiceUtterance,
  EMPTY_VOICE_UTTERANCE,
  VoiceCommand,
  VoiceUtteranceState,
} from '../utils/voiceCommands';
import VoiceListeningIndicator from './VoiceListeningIndicator';
import Ionicons from 'react-native-vector-icons/Ionicons';
import UpgradeSheet from './UpgradeSheet';
import { formatCountdown } from '../utils/viewBudget';
import { colors } from '../theme';
import { speakPrompt, stopPrompt } from '../utils/voicePrompt';

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

// ===== VOICE TUNING =====
// 'starting' from the VoiceIT tap until the engine really hears audio
type VoiceState = 'off' | 'starting' | 'listening';
// Restarts of a dead engine with no sign of life in between before giving up
const MAX_ENGINE_FAILURES = 3;
// Words spoken while the viewer is still moving wait here, in order
const MAX_QUEUED_VOICE_COMMANDS = 8;
const HEARD_WORDS_SHOWN = 3;
const VOICE_DRAIN_POLL_MS = 60;
// A command ran but the item never changed (scroll never landed): free the gate
const VOICE_DISPATCH_FAILSAFE_MS = 1500;
const VOICE_WATCHDOG_MS = 3000;
// Consecutive idle polls before the watchdog restarts the engine: a task the iOS
// engine has just re-armed reads as idle until Apple marks it running
const WATCHDOG_IDLE_TICKS = 2;
// Engine event trace for the Metro console; silent in release builds
const traceVoice = (...args: unknown[]) => {
  if (__DEV__) console.log('[VoiceIt]', ...args);
};
const VOICE_LEVEL_MIN_INTERVAL_MS = 40;
// Give a just-torn-down audio session a moment to release before starting again
const ENGINE_RESTART_GAP_MS = 300;
// Android's recognizer has no ready event: assume it is live after this long
const ENGINE_READY_FALLBACK_MS = 2000;
const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const MediaViewer: React.FC<MediaViewerProps> = ({
  items: initialItems,
  initialIndex,
  onClose,
  onViewProgress,
  monthKey,
  monthName,
  mediaType,
  totalCount = 0,
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
  // Mirror for callbacks that must not wait for a render (the voice queue)
  const isFlickTransitioningRef = useRef(false);
  // True from the moment a flick starts until its list rebuild has settled
  const trashInFlightRef = useRef(false);
  // Deferred steps of the flick, cleared if the viewer goes away mid-flick
  const trashScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const trashSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const initialScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const setFlickTransitioning = useCallback((value: boolean) => {
    isFlickTransitioningRef.current = value;
    setIsFlickTransitioning(value);
  }, []);
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
  const [voiceState, setVoiceState] = useState<VoiceState>('off');
  const [heardWords, setHeardWords] = useState<string[]>([]);
  const isListening = voiceState !== 'off';
  const [showVoiceTutorial, setShowVoiceTutorial] = useState(false);
  const [hasSeenVoiceTutorial, setHasSeenVoiceTutorial] = useState(false);
  const [upgradeSheetVisible, setUpgradeSheetVisible] = useState(false);

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
  const isInitialMountRef = useRef<boolean>(true); // Track if this is the initial mount
  const previousIndexRef = useRef<number>(initialIndex); // Track previous index to detect actual navigation

  // ===== VOICE: EVERY WORD IS A COMMAND, ONE IN FLIGHT AT A TIME =====
  // Commands heard but not yet executed, in the order they were spoken
  const voiceQueueRef = useRef<VoiceCommand[]>([]);
  // Words of the utterance in progress and how many already became commands
  const voiceUtteranceRef = useRef<VoiceUtteranceState>(EMPTY_VOICE_UTTERANCE);
  const pendingNavRef = useRef<boolean>(false); // a command ran; blocks until the item actually changes
  const voiceDrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceDispatchFailsafeRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const drainVoiceQueueRef = useRef<() => void>(() => {});
  const heardWordsRef = useRef<string[]>([]);

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

  // ===== VOICE GATE RELEASE: the item changed, so the next queued word may run =====
  useEffect(() => {
    // A flick trashes through the shared month content, so the viewer re-renders
    // one item shorter while the flick animation is still running. Releasing the
    // gate on that early render would start the next word on top of the flick;
    // the flick releases it itself once the list has settled.
    if (trashInFlightRef.current) return;
    pendingNavRef.current = false;
    if (voiceDispatchFailsafeRef.current) {
      clearTimeout(voiceDispatchFailsafeRef.current);
      voiceDispatchFailsafeRef.current = null;
    }
    drainVoiceQueueRef.current();
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

      // Clear voice queue/timers safety
      if (voiceDrainTimerRef.current) {
        clearTimeout(voiceDrainTimerRef.current);
        voiceDrainTimerRef.current = null;
      }
      if (voiceDispatchFailsafeRef.current) {
        clearTimeout(voiceDispatchFailsafeRef.current);
        voiceDispatchFailsafeRef.current = null;
      }
      voiceQueueRef.current = [];
      pendingNavRef.current = false;

      // Stop the deferred steps of a flick that never finished
      for (const timer of [
        trashScrollTimerRef,
        trashSettleTimerRef,
        initialScrollTimerRef,
      ]) {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      }
      trashInFlightRef.current = false;

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

  // Called when a programmatic scroll settles (momentum end) and by the failsafe timer
  const finishNavigation = useCallback((fromFailsafe: boolean) => {
    isNavigatingRef.current = false;
    if (!fromFailsafe) return;
    navigationFailsafeRef.current = null;
    // If the page never changed, free the voice gate so the next word is not stuck
    if (
      navigationStartIndexRef.current !== null &&
      currentIndexRef.current === navigationStartIndexRef.current
    ) {
      pendingNavRef.current = false;
      drainVoiceQueueRef.current();
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

  // FlatList throws when the index is past the end, and the list can shrink while
  // a scroll waits behind a timer, so clamp against the live list at call time
  const scrollToIndexSafely = useCallback((index: number) => {
    const list = flatListRef.current;
    const count = itemsRef.current.length;
    if (!list || count === 0) return;
    list.scrollToIndex({
      index: Math.max(0, Math.min(index, count - 1)),
      animated: false,
    });
  }, []);

  // The flick is over: drop the overlay and let the next queued word run
  const finishTrash = useCallback(() => {
    if (!trashInFlightRef.current) return;
    trashInFlightRef.current = false;
    setFlickTransitioning(false);
    // The gate-release effect sat this flick out, so retire its failsafe here
    if (voiceDispatchFailsafeRef.current) {
      clearTimeout(voiceDispatchFailsafeRef.current);
      voiceDispatchFailsafeRef.current = null;
    }
    pendingNavRef.current = false;
    drainVoiceQueueRef.current();
  }, [setFlickTransitioning]);

  const handleTrash = useCallback((): boolean => {
    // One flick at a time: a second one starting mid-animation would trash from a
    // list that is already a render behind and scroll past its end
    if (trashInFlightRef.current) return false;
    if (endOfMonthDrawerVisibleRef.current) return false;

    const startIndex = currentIndexRef.current;
    const itemToTrash = itemsRef.current[startIndex];
    if (!itemToTrash) return false;

    // Flicking the last item of a finished month leaves nothing left to do
    const wasLastItem = startIndex === itemsRef.current.length - 1;

    trashInFlightRef.current = true;

    // A flicked item is done with, so it counts as seen for month progress
    recordItemViewed(itemToTrash.id);

    // Add to trash. This also removes it from the shared month content, so the
    // viewer may re-render without it before the animation below finishes.
    addToTrash(itemToTrash);

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
      setFlickTransitioning(true);

      // Reset animations
      translateY.setValue(0);
      opacity.setValue(1);

      // Drop the flicked item from the live list, which the context may already
      // have shortened; filtering by id is right either way
      const newItems = itemsRef.current.filter(
        item => item.id !== itemToTrash.id,
      );

      if (newItems.length === 0) {
        finishTrash();
        // Nothing left to show: the parent runs the final scan, so skip the fallback
        closedViaButtonRef.current = true;
        onClose();
        return;
      }

      // Hold the position the flicked item occupied, or the new last item
      const targetIdx = Math.min(startIndex, newItems.length - 1);

      // Update state behind the overlay, keeping the ref in step so a queued
      // scroll clamps against the list that is really there
      setItems(newItems);
      itemsRef.current = newItems;
      setCurrentIndex(targetIdx);

      // Wait for FlatList to settle, then scroll and hide overlay
      trashScrollTimerRef.current = setTimeout(() => {
        trashScrollTimerRef.current = null;
        scrollToIndexSafely(targetIdx);
        // Give FlatList one more frame to finish layout
        trashSettleTimerRef.current = setTimeout(() => {
          trashSettleTimerRef.current = null;
          finishTrash();
          if (wasLastItem && isAtEndOfMonth()) {
            openEndOfMonthDrawer();
          }
        }, 150);
      }, 150);
    });
    return true;
  }, [
    addToTrash,
    onClose,
    recordItemViewed,
    isAtEndOfMonth,
    openEndOfMonthDrawer,
    setFlickTransitioning,
    finishTrash,
    scrollToIndexSafely,
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
  const voiceStateRef = useRef<VoiceState>('off');
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const engineFailuresRef = useRef(0);
  const lastEngineStopAtRef = useRef(0);
  const startEngineRef = useRef<() => Promise<void>>(async () => {});
  // Microphone level 0..1 fed straight into the indicator animation, no re-render
  const voiceLevel = useRef(new Animated.Value(0)).current;
  const voiceLevelRef = useRef({ value: 0, at: 0 });

  const updateVoiceState = useCallback((next: VoiceState) => {
    if (voiceStateRef.current === next) return;
    voiceStateRef.current = next;
    setVoiceState(next);
  }, []);

  const clearVoiceTimers = useCallback(() => {
    for (const ref of [
      restartTimerRef,
      readyFallbackTimerRef,
      voiceDrainTimerRef,
      voiceDispatchFailsafeRef,
    ]) {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    }
  }, []);

  const showHeardWords = useCallback((words: string[]) => {
    const tail = words.slice(-HEARD_WORDS_SHOWN);
    if (tail.join(' ') === heardWordsRef.current.join(' ')) return;
    heardWordsRef.current = tail;
    setHeardWords(tail);
  }, []);

  // The engine is really hearing audio: first start, volume or result event after a start
  const markEngineLive = useCallback(() => {
    if (readyFallbackTimerRef.current) {
      clearTimeout(readyFallbackTimerRef.current);
      readyFallbackTimerRef.current = null;
    }
    if (wantsListeningRef.current) updateVoiceState('listening');
  }, [updateVoiceState]);

  // Idle polls in a row seen by the watchdog
  const watchdogIdleTicksRef = useRef(0);
  // A real event from the engine (start, volume, transcript): it is alive, so any
  // restart attempts counted so far are forgiven
  const noteEngineAlive = useCallback(() => {
    engineFailuresRef.current = 0;
    watchdogIdleTicksRef.current = 0;
    markEngineLive();
  }, [markEngineLive]);

  // Runs the next queued word once the viewer has settled; polls while it is moving
  const drainVoiceQueue = useCallback(() => {
    if (voiceDrainTimerRef.current) {
      clearTimeout(voiceDrainTimerRef.current);
      voiceDrainTimerRef.current = null;
    }
    if (!wantsListeningRef.current || endOfMonthDrawerVisibleRef.current) {
      voiceQueueRef.current = [];
      return;
    }
    if (voiceQueueRef.current.length === 0) return;
    if (
      pendingNavRef.current ||
      isNavigatingRef.current ||
      isFlickTransitioningRef.current ||
      trashInFlightRef.current
    ) {
      voiceDrainTimerRef.current = setTimeout(
        () => drainVoiceQueueRef.current(),
        VOICE_DRAIN_POLL_MS,
      );
      return;
    }

    const command = voiceQueueRef.current.shift();
    if (!command || !itemsRef.current[currentIndexRef.current]) {
      voiceQueueRef.current = [];
      return;
    }
    pendingNavRef.current = true;
    const executed =
      command === 'trash'
        ? handleTrashRef.current?.() === true
        : handleNextRef.current?.() === true;
    if (!executed) {
      // Nothing moved (single item, drawer opened...): free the gate and drop the
      // rest so stale words never fire later
      pendingNavRef.current = false;
      voiceQueueRef.current = [];
      return;
    }
    if (command === 'trash') {
      hapticFlick();
    } else {
      hapticKeep();
    }
    // The item-change effect releases the gate; this covers a scroll that never lands
    voiceDispatchFailsafeRef.current = setTimeout(() => {
      voiceDispatchFailsafeRef.current = null;
      pendingNavRef.current = false;
      drainVoiceQueueRef.current();
    }, VOICE_DISPATCH_FAILSAFE_MS);
  }, []);
  drainVoiceQueueRef.current = drainVoiceQueue;

  const enqueueVoiceCommands = useCallback(
    (commands: VoiceCommand[]) => {
      if (commands.length === 0) return;
      voiceQueueRef.current = [...voiceQueueRef.current, ...commands].slice(
        -MAX_QUEUED_VOICE_COMMANDS,
      );
      drainVoiceQueue();
    },
    [drainVoiceQueue],
  );

  // Every partial carries the whole transcript so far; only the new words become commands
  const handleTranscript = useCallback(
    (transcript: unknown, isFinal: boolean) => {
      if (!wantsListeningRef.current) return;
      noteEngineAlive();
      if (typeof transcript !== 'string' || !transcript) return;
      traceVoice(isFinal ? 'final:' : 'partial:', transcript);
      // The helper closes the utterance on a final result and ignores the echo a
      // re-arming engine sends straight after it
      const { next, commands, words } = advanceVoiceUtterance(
        voiceUtteranceRef.current,
        transcript,
        isFinal,
      );
      voiceUtteranceRef.current = next;
      if (commands.length > 0) traceVoice('commands:', commands.join(', '));
      showHeardWords(words);
      enqueueVoiceCommands(commands);
    },
    [noteEngineAlive, showHeardWords, enqueueVoiceCommands],
  );

  const handleVolume = useCallback(
    (e: any) => {
      if (!wantsListeningRef.current) return;
      noteEngineAlive();
      const raw = typeof e?.value === 'number' ? e.value : 0;
      // Android reports dB (about -2..10); anything already in 0..1 is taken as a ratio
      const ratio =
        raw < 0 || raw > 1 ? Math.min(1, Math.max(0, (raw + 2) / 12)) : raw;
      const smoothed = voiceLevelRef.current.value * 0.5 + ratio * 0.5;
      const now = Date.now();
      if (now - voiceLevelRef.current.at < VOICE_LEVEL_MIN_INTERVAL_MS) {
        voiceLevelRef.current.value = smoothed;
        return;
      }
      voiceLevelRef.current = { value: smoothed, at: now };
      voiceLevel.setValue(smoothed);
    },
    [noteEngineAlive, voiceLevel],
  );

  // Tears everything down. destroy(), not stop(): the Android engine re-arms itself
  // after a plain stop and would keep the microphone open.
  const stopVoiceRecognition = useCallback(async () => {
    wantsListeningRef.current = false;
    clearVoiceTimers();
    voiceQueueRef.current = [];
    voiceUtteranceRef.current = EMPTY_VOICE_UTTERANCE;
    pendingNavRef.current = false;
    updateVoiceState('off');
    showHeardWords([]);
    voiceLevelRef.current = { value: 0, at: 0 };
    voiceLevel.setValue(0);
    lastEngineStopAtRef.current = Date.now();
    stopPrompt();
    try {
      await STT.destroy();
    } catch {
      // Engine was already gone
    }
  }, [clearVoiceTimers, updateVoiceState, showHeardWords, voiceLevel]);

  // Both engines re-arm themselves after a final result or an error, so this only
  // runs for an engine that really died: confirm twice that it is idle, then start
  // it again. Attempts are counted until the engine shows life, then forgiven.
  const scheduleEngineRestartIfNeeded = useCallback(
    (reason: string) => {
      if (!wantsListeningRef.current || restartTimerRef.current) return;

      const isEngineIdle = async (): Promise<boolean> => {
        try {
          return (await STT.isRecognizing()) === 0;
        } catch {
          return true;
        }
      };

      restartTimerRef.current = setTimeout(async () => {
        restartTimerRef.current = null;
        if (!wantsListeningRef.current) return;
        if (!(await isEngineIdle())) return;
        await sleep(500);
        if (!wantsListeningRef.current) return;
        if (!(await isEngineIdle())) return;

        if (engineFailuresRef.current >= MAX_ENGINE_FAILURES) {
          console.warn(
            `[VoiceIt] giving up: the engine stayed dead through ${engineFailuresRef.current} restarts (${reason})`,
          );
          stopVoiceRecognition();
          return;
        }
        engineFailuresRef.current += 1;
        traceVoice(
          'restarting engine:',
          reason,
          'attempt',
          engineFailuresRef.current,
        );
        try {
          await startEngineRef.current();
        } catch (error) {
          console.warn('[VoiceIt] engine restart failed', error);
          // The retry gets a fresh native instance, the way every start used to
          try {
            await STT.destroy();
          } catch {
            // Nothing to destroy
          }
          lastEngineStopAtRef.current = Date.now();
          scheduleEngineRestartIfNeeded('restart failed');
        }
      }, 400);
    },
    [stopVoiceRecognition],
  );

  const handleSpeechError = useCallback((e: any) => {
    if (!wantsListeningRef.current) return;
    // Close the utterance rather than forget it. Apple reports a benign error on
    // every pause, and the session carries its transcript across that, so a reset
    // here would make the words already acted on look new and run them again.
    voiceUtteranceRef.current = closeVoiceUtterance(voiceUtteranceRef.current);
    const description = `${e?.error?.message ?? ''} ${
      e?.error?.code ?? ''
    }`.trim();
    // Silence, session caps and cancellations are normal; anything else is worth a log
    const isBenign =
      /no speech|no match|retry|cancel|timeout|\b(216|203|1110)\b/i.test(
        description,
      );
    if (isBenign) {
      traceVoice('benign error:', description);
    } else {
      console.warn('[VoiceIt] speech error:', description);
    }
    // Both engines re-arm themselves after an error (iOS rearmTask, Android
    // rearmContinuousAuto); a restart from here would race that and drop audio.
    // The watchdog covers an engine that stays dead.
  }, []);

  // The STT wrapper binds native listeners to whatever functions are set the first
  // time start() runs, so register stable delegates once and route them through
  // this ref, which always holds the latest handlers.
  const voiceHandlersRef = useRef({
    onStart: () => {},
    onEnd: () => {},
    onError: (_e: any) => {},
    onResults: (_e: any) => {},
    onPartialResults: (_e: any) => {},
    onVolume: (_e: any) => {},
  });
  voiceHandlersRef.current = {
    onStart: () => {
      traceVoice('engine start');
      noteEngineAlive();
    },
    // Fired after every final result, right before the engine re-arms itself
    onEnd: () => traceVoice('speech end'),
    onError: handleSpeechError,
    onResults: (e: any) => handleTranscript(e?.value?.[0], true),
    onPartialResults: (e: any) => handleTranscript(e?.value?.[0], false),
    onVolume: handleVolume,
  };
  useEffect(() => {
    STT.onSpeechStart = () => voiceHandlersRef.current.onStart();
    STT.onSpeechRecognized = () => {};
    STT.onSpeechEnd = () => voiceHandlersRef.current.onEnd();
    STT.onSpeechError = (e: any) => voiceHandlersRef.current.onError(e);
    STT.onSpeechResults = (e: any) => voiceHandlersRef.current.onResults(e);
    STT.onSpeechPartialResults = (e: any) =>
      voiceHandlersRef.current.onPartialResults(e);
    STT.onSpeechVolumeChanged = (e: any) =>
      voiceHandlersRef.current.onVolume(e);
  }, []);

  // Apply the license and start the engine. No teardown first: the engine is
  // destroyed on Stop, so a tap goes straight to listening instead of paying a
  // full rebuild every time.
  const startEngine = useCallback(async () => {
    const sinceStop = Date.now() - lastEngineStopAtRef.current;
    if (sinceStop < ENGINE_RESTART_GAP_MS) {
      await sleep(ENGINE_RESTART_GAP_MS - sinceStop);
    }
    if (!wantsListeningRef.current) return;

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
    if (!wantsListeningRef.current) return;

    await STT.start('en-US');
    if (!wantsListeningRef.current) {
      // Stop was tapped while the start was in flight: do not leave the microphone open
      STT.destroy().catch(() => {});
      return;
    }
    // Android's recognizer has no ready event; if nothing is heard for a while, assume it is live
    if (readyFallbackTimerRef.current) {
      clearTimeout(readyFallbackTimerRef.current);
    }
    readyFallbackTimerRef.current = setTimeout(() => {
      readyFallbackTimerRef.current = null;
      markEngineLive();
    }, ENGINE_READY_FALLBACK_MS);
  }, [markEngineLive]);
  startEngineRef.current = startEngine;

  const startVoiceRecognitionInternal = async () => {
    if (wantsListeningRef.current) return;
    voiceQueueRef.current = [];
    voiceUtteranceRef.current = EMPTY_VOICE_UTTERANCE;
    pendingNavRef.current = false;
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
    updateVoiceState('starting');
    showHeardWords([]);
    // Hanna confirms the mode out loud before the microphone opens, so the
    // recognizer never hears the prompt itself
    await speakPrompt('Hands free');
    if (!wantsListeningRef.current) return; // Stop or close during the prompt
    try {
      await startEngine();
    } catch (error) {
      console.warn('[VoiceIt] failed to start speech recognition', error);
      wantsListeningRef.current = false;
      updateVoiceState('off');
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

  // Safety net: an engine that silently died (its own re-arm failed) is started
  // again, but only once it has read as idle on consecutive polls, so a task the
  // engine has just re-armed is left alone
  useEffect(() => {
    if (!isListening) return;
    watchdogIdleTicksRef.current = 0;
    const watchdog = setInterval(async () => {
      if (!wantsListeningRef.current || restartTimerRef.current) return;
      if (voiceStateRef.current !== 'listening') return;
      let idle = false;
      try {
        idle = (await STT.isRecognizing()) === 0;
      } catch {
        idle = false;
      }
      if (!idle) {
        watchdogIdleTicksRef.current = 0;
        return;
      }
      watchdogIdleTicksRef.current += 1;
      traceVoice('watchdog: engine idle', watchdogIdleTicksRef.current);
      if (watchdogIdleTicksRef.current >= WATCHDOG_IDLE_TICKS) {
        watchdogIdleTicksRef.current = 0;
        scheduleEngineRestartIfNeeded('watchdog');
      }
    }, VOICE_WATCHDOG_MS);
    return () => clearInterval(watchdog);
  }, [isListening, scheduleEngineRestartIfNeeded]);

  // Stop the engine when the viewer goes away
  useEffect(() => {
    return () => {
      wantsListeningRef.current = false;
      clearVoiceTimers();
      voiceQueueRef.current = [];
      stopPrompt();
      STT.destroy().catch(() => {
        // Engine was not running
      });
    };
  }, [clearVoiceTimers]);

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
        // Small delay to ensure FlatList is ready. A flick can land inside that
        // delay and shorten the list, so the scroll clamps when it actually runs.
        initialScrollTimerRef.current = setTimeout(() => {
          initialScrollTimerRef.current = null;
          scrollToIndexSafely(targetIndex);
        }, 100);
      }
    }
  }, [hasScrolledToInitial, items.length, scrollToIndexSafely]);

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
          <View style={styles.blockedIconWrap}>
            <Text style={styles.blockedIcon}>⏳</Text>
          </View>
          <Text style={styles.blockedTitle}>You've used your free views</Text>
          <Text style={styles.blockedTimer}>
            {formatCountdown(remainingTime)}
          </Text>
          <Text style={styles.blockedSubtitle}>until they refill</Text>
          <TouchableOpacity
            style={styles.blockedPrimary}
            onPress={() => setUpgradeSheetVisible(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.blockedPrimaryText}>Go unlimited</Text>
            <Text style={styles.blockedPrimarySub}>
              Premium · one-time purchase
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.blockedSecondary}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.blockedSecondaryText}>Close</Text>
          </TouchableOpacity>
        </View>
        <UpgradeSheet
          visible={upgradeSheetVisible}
          onClose={() => setUpgradeSheetVisible(false)}
        />
      </View>
    );
  }

  // Render loading view if no item
  if (hasNoItem) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.teal} />
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
          <ActivityIndicator size="large" color={colors.teal} />
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
                              <View style={styles.videoErrorIconWrap}>
                                <Ionicons
                                  name="videocam-off-outline"
                                  size={36}
                                  color={colors.coral}
                                />
                              </View>
                              <Text style={styles.videoErrorTitle}>
                                Video unavailable
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
                        <View
                          style={[styles.viewedBadge, { top: insets.top + 64 }]}
                          pointerEvents="none"
                        >
                          <Ionicons
                            name="checkmark-circle"
                            size={14}
                            color={colors.teal}
                          />
                          <Text style={styles.viewedBadgeText}>Seen</Text>
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
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.voiceTutorialIconWrap}>
              <Ionicons name="mic" size={28} color={colors.teal} />
            </View>
            <Text style={styles.voiceTutorialTitle}>Voice commands</Text>
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
          <View style={[styles.topControls, { top: insets.top + 8 }]}>
            <TouchableOpacity
              onPress={handleClosePress}
              style={styles.glassCircle}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
            {isListening ? (
              <VoiceListeningIndicator
                state={voiceState === 'listening' ? 'listening' : 'starting'}
                words={heardWords}
                level={voiceLevel}
              />
            ) : (
              <View style={styles.positionWrap} pointerEvents="none">
                <View style={styles.positionChip}>
                  <Text style={styles.positionText}>
                    {currentIndex + 1}
                    <Text style={styles.positionTotal}>
                      {' '}
                      / {Math.max(totalCount, items.length).toLocaleString()}
                    </Text>
                  </Text>
                </View>
              </View>
            )}
            <TouchableOpacity
              onPress={
                // Debounce press: prevent double taps
                isListening ? stopVoiceRecognition : startVoiceRecognition
              }
              activeOpacity={0.6}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              accessibilityRole="button"
              accessibilityLabel={
                isListening ? 'Stop voice commands' : 'Start voice commands'
              }
              style={[
                styles.glassCircle,
                isListening && styles.voiceButtonActive,
              ]}
            >
              <Ionicons
                name={isListening ? 'stop' : 'mic-outline'}
                size={22}
                color={isListening ? colors.ink : colors.text}
              />
            </TouchableOpacity>
          </View>

          {/* Biggest wins first: why this item came up now, and what it costs */}
          {!!currentItem.junkReason && (
            <View
              style={[styles.junkBadgeWrap, { top: insets.top + 64 }]}
              pointerEvents="none"
            >
              <View style={styles.junkBadge}>
                <Ionicons name="flash" size={13} color={colors.amber} />
                <Text style={styles.junkBadgeText}>
                  {currentItem.junkReason}
                  {formatBytes(currentItem.size)
                    ? ` · ${formatBytes(currentItem.size)}`
                    : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            <TouchableOpacity
              style={styles.actionCircle}
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <Ionicons name="share-outline" size={24} color={colors.text} />
            </TouchableOpacity>
            {currentItem.type === 'video' && (
              <TouchableOpacity
                style={styles.actionCircle}
                accessibilityRole="button"
                accessibilityLabel={
                  videoPaused[currentItem.id] !== false ? 'Play' : 'Pause'
                }
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
                <Ionicons
                  name={
                    videoPaused[currentItem.id] !== false ? 'play' : 'pause'
                  }
                  size={24}
                  color={colors.text}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Gesture Instructions */}
          <View style={styles.instructionsContainer} pointerEvents="none">
            <View style={[styles.hintPill, styles.hintPillKeep]}>
              <Ionicons name="arrow-back" size={20} color={colors.teal} />
              <Text style={[styles.hintText, styles.hintKeep]}>Keep</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.teal} />
            </View>
            <View style={[styles.hintPill, styles.hintPillFlick]}>
              <Ionicons name="arrow-up" size={18} color={colors.coral} />
              <Text style={[styles.hintText, styles.hintFlick]}>
                Flick to trash
              </Text>
            </View>
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

/** Translucent dark surface for chrome floating over media */
const GLASS = 'rgba(20, 26, 42, 0.78)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.16)';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.ink,
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
    backgroundColor: 'rgba(11, 16, 32, 0.5)',
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
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 1,
  },
  glassCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButtonActive: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  positionWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  positionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  positionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  positionTotal: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  junkBadgeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  junkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  junkBadgeText: {
    color: colors.amber,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 5,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 120,
    right: 16,
    alignItems: 'center',
  },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: 64,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  hintPillKeep: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderColor: 'rgba(78, 205, 196, 0.45)',
  },
  hintPillFlick: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 10,
    borderColor: 'rgba(255, 122, 138, 0.45)',
  },
  hintText: {
    fontWeight: '800',
    letterSpacing: 0.3,
    marginHorizontal: 8,
  },
  hintKeep: {
    color: colors.teal,
    fontSize: 19,
  },
  hintFlick: {
    color: colors.coral,
    fontSize: 16,
  },
  blockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.ink,
    paddingHorizontal: 28,
  },
  blockedIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255, 122, 138, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 138, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  blockedSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 32,
  },
  blockedPrimary: {
    alignSelf: 'stretch',
    minHeight: 60,
    borderRadius: 16,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  blockedPrimaryText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  blockedPrimarySub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(11, 16, 32, 0.7)',
    marginTop: 2,
  },
  blockedSecondary: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  blockedSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  blockedIcon: {
    fontSize: 40,
  },
  blockedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 18,
  },
  blockedTimer: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.coral,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  videoErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.ink,
    paddingHorizontal: 32,
  },
  videoErrorIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 122, 138, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 138, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  videoErrorTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  videoErrorText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  onlyOneMessageContainer: {
    position: 'absolute',
    top: '50%',
    left: 24,
    right: 24,
    transform: [{ translateY: -28 }],
    backgroundColor: 'rgba(20, 26, 42, 0.94)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1001,
  },
  onlyOneMessageText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  viewedBadge: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(78, 205, 196, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.45)',
    zIndex: 10,
  },
  viewedBadgeText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 5,
  },
  voiceTutorialOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 8, 20, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  voiceTutorialContainer: {
    backgroundColor: colors.sheet,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 24,
    paddingTop: 28,
    marginHorizontal: 20,
    maxWidth: width * 0.88,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  voiceTutorialCloseButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  voiceTutorialIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(78, 205, 196, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  voiceTutorialTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 14,
  },
  voiceTutorialContent: {
    alignSelf: 'stretch',
  },
  voiceTutorialText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 12,
  },
  voiceTutorialHighlight: {
    fontWeight: '800',
    color: colors.teal,
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
    backgroundColor: 'rgba(5, 8, 20, 0.6)',
  },
  endOfMonthSheet: {
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 24,
  },
  endOfMonthHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: 18,
  },
  endOfMonthTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  endOfMonthBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
  },
  endOfMonthPrimaryButton: {
    backgroundColor: colors.teal,
    borderRadius: 16,
    minHeight: 60,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  endOfMonthPrimaryText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  endOfMonthPrimaryHint: {
    color: 'rgba(11, 16, 32, 0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  endOfMonthNote: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  endOfMonthSecondaryButton: {
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  endOfMonthSecondaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default MediaViewer;
