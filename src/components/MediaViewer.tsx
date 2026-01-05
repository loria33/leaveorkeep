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
} from 'react-native';
import FastImage from 'react-native-fast-image';
import Video from 'react-native-video';
import Share from 'react-native-share';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Voice from '@dev-amirzubair/react-native-voice';
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

interface MediaViewerProps {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
  onViewProgress?: (viewedCount: number) => void;
  monthKey?: string;
  totalCount: number;
}

const { width, height } = Dimensions.get('window');

const MediaViewer: React.FC<MediaViewerProps> = ({
  items: initialItems,
  initialIndex,
  onClose,
  onViewProgress,
  monthKey,
  totalCount,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const [showControls, setShowControls] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [videoError, setVideoError] = useState<{ [key: string]: boolean }>({});
  const [videoPaused, setVideoPaused] = useState<{ [key: string]: boolean }>(
    {},
  );
  const [isLoading, setIsLoading] = useState(false);
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
  const voiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isStoppingRef = useRef<boolean>(false); // Flag to prevent processing commands when stopping
  const isInitialMountRef = useRef<boolean>(true); // Track if this is the initial mount
  const previousIndexRef = useRef<number>(initialIndex); // Track previous index to detect actual navigation

  // ===== VOICE: ONE COMMAND PER ITEM (HARD GATE) =====
  const commandConsumedForItemRef = useRef<string | null>(null); // item.id that already consumed a command
  const pendingNavRef = useRef<boolean>(false); // blocks until FlatList actually changes item (currentIndex changes)
  const partialCommitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPartialRef = useRef<string>('');
  const lastProcessedTranscriptRef = useRef<string>(''); // global, not per-item
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

  // Filter items based on media type of the source items (not current state)
  const filterItems = (allItems: MediaItem[]): MediaItem[] => {
    // Use the source items to determine filter, not current state
    const filterType = getMediaTypeFilter(allItems);
    if (filterType === 'photo') {
      return allItems.filter(item => item.type === 'photo');
    } else if (filterType === 'video') {
      return allItems.filter(item => item.type === 'video');
    }
    return allItems;
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

  // Track viewed items and increment view count when index changes
  useEffect(() => {
    // Skip on initial mount - don't mark the first image until user navigates away
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      previousIndexRef.current = currentIndex;
      return;
    }

    // Only mark items as viewed when the index actually changes (user navigated)
    const previousIndex = previousIndexRef.current;
    const hasNavigated = previousIndex !== currentIndex;

    if (!hasNavigated) {
      return; // Index didn't change, don't mark anything
    }

    // Update previous index for next time
    previousIndexRef.current = currentIndex;

    // Mark the PREVIOUS item as viewed (the one we navigated away from)
    const itemToMark = items[previousIndex];

    if (canViewMedia()) {
      incrementViewCount();
    }
    // Video error and pause state are now per-item, no need to reset here

    // Mark the previous item as viewed (the one we navigated away from)
    if (itemToMark && !viewedItemsRef.current.has(itemToMark.id)) {
      viewedItemsRef.current.add(itemToMark.id);
      // Mark in storage, but don't update viewedItemsSet state immediately
      // The checkmark will show next time when the item is loaded from storage
      markMediaItemAsViewed(itemToMark.id).then(async () => {
        // Check if month is completed after marking item as viewed
        if (
          monthKey &&
          monthKey !== 'DUPLICATES' &&
          !monthKey.startsWith('TIME_FILTER_') &&
          !monthKey.startsWith('SOURCE_FILTER_')
        ) {
          // Check completion every 3 items or on last item
          if (currentIndex % 3 === 0 || currentIndex === items.length - 1) {
            checkAndMarkMonthCompleted(monthKey).catch(() => {
              // Error checking completion
            });
          }

          // Notify parent of progress update AFTER marking is complete
          // Get the actual count from storage (cache is updated immediately, save is debounced)
          if (onViewProgress) {
            try {
              // Small delay to ensure cache is updated
              await new Promise(resolve => setTimeout(resolve, 100));
              const stats = await getMonthViewedStats(monthKey);
              onViewProgress(stats.viewedCount);
            } catch (error) {
              // Error getting stats, skip progress update
            }
          }
        }
      });
    }
  }, [currentIndex, items]);

  // Keep refs for cleanup function to access latest values without dependencies
  const currentIndexRef = useRef(currentIndex);
  const monthKeyRef = useRef(monthKey);
  const itemsRefForCallback = useRef(items);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    monthKeyRef.current = monthKey;
    itemsRefForCallback.current = items;
  }, [currentIndex, monthKey, items]);

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

      // Mark the current item as viewed when closing (if not already marked)
      const currentItemOnClose = currentItems[currentIndexOnClose];
      if (
        currentItemOnClose &&
        !viewedItemsRef.current.has(currentItemOnClose.id)
      ) {
        viewedItemsRef.current.add(currentItemOnClose.id);
        markMediaItemAsViewed(currentItemOnClose.id).catch(() => {
          // Error marking
        });
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

      // Check month completion when viewer closes
      if (
        currentMonthKey &&
        currentMonthKey !== 'DUPLICATES' &&
        !currentMonthKey.startsWith('TIME_FILTER_') &&
        !currentMonthKey.startsWith('SOURCE_FILTER_')
      ) {
        // Wait a bit for storage to be saved, then check completion
        setTimeout(() => {
          checkAndMarkMonthCompleted(currentMonthKey).catch(() => {
            // Error checking completion
          });
        }, 2000);
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
        await new Promise(resolve => setTimeout(resolve, 1000));

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

  // Navigate using FlatList scrollToIndex for smooth native scrolling
  const smoothNavigate = useCallback(
    (direction: 'next' | 'prev') => {
      if (isNavigating) return;

      // Use ref to get latest items length
      const currentItemsLength = itemsRef.current.length;

      // If only one item, show message and return
      if (currentItemsLength === 1) {
        setShowOnlyOneMessage(true);
        setTimeout(() => setShowOnlyOneMessage(false), 2000);
        return;
      }

      setIsNavigating(true);

      setCurrentIndex(prevIndex => {
        const targetIndex =
          direction === 'next' ? prevIndex + 1 : prevIndex - 1;

        // Handle endless loop navigation - use ref for latest length
        const currentItemsLength = itemsRef.current.length;
        let finalTargetIndex = targetIndex;
        if (targetIndex < 0) {
          finalTargetIndex = currentItemsLength - 1;
        } else if (targetIndex >= currentItemsLength) {
          finalTargetIndex = 0;
        }

        // Use FlatList's native scrollToIndex for smooth scrolling
        if (flatListRef.current) {
          flatListRef.current.scrollToIndex({
            index: finalTargetIndex,
            animated: true,
          });
        }

        // Track swipe for banner ads (only count forward swipes, not backward)
        if (direction === 'next') {
          // Await handleSwipe to ensure it processes correctly
          BannerAdManager.getInstance()
            .handleSwipe()
            .catch(() => {
              // Silently handle any errors
            });
        }

        setIsNavigating(false);
        return finalTargetIndex;
      });
    },
    [isNavigating],
  );

  const handleNext = useCallback(() => {
    // Voice command gating is handled centrally; do not reset here.
    smoothNavigate('next');
  }, [smoothNavigate]);

  const handlePrevious = useCallback(() => {
    smoothNavigate('prev');
  }, [smoothNavigate]);

  const handleTrash = useCallback(() => {
    if (!currentItem) return;

    // Voice command gating is handled centrally; do not reset here.

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
      // Remove item from local items array
      const newItems = items.filter((_, index) => index !== currentIndex);
      setItems(newItems);

      // Reset animations
      translateY.setValue(0);
      opacity.setValue(1);

      if (currentIndex < newItems.length) {
        // Stay at same index (which now points to next item)
        setCurrentIndex(currentIndex);
      } else if (newItems.length > 0) {
        // Move to last item
        setCurrentIndex(newItems.length - 1);
      } else {
        // No more items, close viewer
        onClose();
      }
    });
  }, [currentItem, currentIndex, items, addToTrash, onClose]);

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

  // Use refs to store the latest functions to avoid dependency issues
  const handleNextRef = useRef<(() => void) | undefined>(undefined);
  const handleTrashRef = useRef<(() => void) | undefined>(undefined);
  const stopVoiceRecognitionRef = useRef<(() => Promise<void>) | undefined>(
    undefined,
  );

  // Update refs immediately when component renders
  handleNextRef.current = handleNext;
  handleTrashRef.current = handleTrash;

  const stopVoiceRecognition = useCallback(async () => {
    try {
      // Set stopping flag to prevent any final results from being processed
      isStoppingRef.current = true;

      // Stop any pending partial commit
    if (partialCommitTimerRef.current) {
      clearTimeout(partialCommitTimerRef.current);
      partialCommitTimerRef.current = null;
    }
    lastPartialRef.current = '';
    lastProcessedTranscriptRef.current = '';

    await Voice.stop();
    setIsListening(false);
    setVoiceTranscript('');
    pendingNavRef.current = false;
      commandConsumedForItemRef.current = null;

      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }

      // Reset stopping flag after a short delay to ensure all events have been processed
      setTimeout(() => {
        isStoppingRef.current = false;
      }, 1000);
    } catch (error) {
      setIsListening(false);
      isStoppingRef.current = false; // Reset stopping flag on error
      pendingNavRef.current = false;
      commandConsumedForItemRef.current = null;
    }
  }, []);

  stopVoiceRecognitionRef.current = stopVoiceRecognition;

  const commitVoiceCommandOncePerItem = useCallback((transcript: string) => {
    if (isStoppingRef.current) return;

    const normalized = transcript.toLowerCase().trim();
    if (!normalized) return;

    // 1) Ignore duplicate callbacks with same transcript payload
    if (normalized === lastProcessedTranscriptRef.current) return;
    lastProcessedTranscriptRef.current = normalized;

    const item = itemsRef.current[currentIndexRef.current];
    if (!item) return;

    // per-item hard gate
    if (commandConsumedForItemRef.current === item.id) return;
    if (pendingNavRef.current) return;

    // 2) Determine the MOST RECENT command word in the transcript
    //    (not "does it contain flick anywhere")
    const cmdRegex =
      /\b(keep|swipe|next|continue|trash|flick|delete|remove)\b/g;

    let match: RegExpExecArray | null;
    let lastCmd: string | null = null;

    while ((match = cmdRegex.exec(normalized)) !== null) {
      lastCmd = match[1];
    }

    if (!lastCmd) return;

    const isTrash = ['trash', 'flick', 'delete', 'remove'].includes(lastCmd);
    const isNext = ['keep', 'swipe', 'next', 'continue'].includes(lastCmd);

    if (!isTrash && !isNext) return;

    // consume immediately
    commandConsumedForItemRef.current = item.id;
    pendingNavRef.current = true;
    setVoiceTranscript('');

    if (isTrash) handleTrashRef.current?.();
    else handleNextRef.current?.();
  }, []);

  // Voice recognition setup and cleanup
  useEffect(() => {
    Voice.onSpeechStart = () => {
      setIsListening(true);
    };

    Voice.onSpeechEnd = () => {
      setIsListening(false);
    };

    Voice.onSpeechError = (e: any) => {
      setIsListening(false);
      setVoiceTranscript('');
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }
      lastProcessedTranscriptRef.current = '';
      if (partialCommitTimerRef.current) {
        clearTimeout(partialCommitTimerRef.current);
        partialCommitTimerRef.current = null;
      }
      lastPartialRef.current = '';
      pendingNavRef.current = false;
      // Do not clear commandConsumedForItemRef here; it should remain consumed for this item
      // until item changes. But if speech errors mid-item, allow retry by clearing consume.
      commandConsumedForItemRef.current = null;
    };

    Voice.onSpeechResults = (e: any) => {
      // Don't process if we're stopping
      if (isStoppingRef.current) {
        return;
      }
      if (partialCommitTimerRef.current) {
        clearTimeout(partialCommitTimerRef.current);
        partialCommitTimerRef.current = null;
      }

      if (e.value && e.value.length > 0) {
        const transcript = e.value[0].toLowerCase();
        setVoiceTranscript(transcript);

        // Backup commit on final (won't double fire because of gate)
        commitVoiceCommandOncePerItem(transcript);
      }
    };

    Voice.onSpeechPartialResults = (e: any) => {
      // Don't process if we're stopping
      if (isStoppingRef.current) {
        return;
      }
      if (e.value && e.value.length > 0) {
        const partialTranscript = e.value[0].toLowerCase();
        setVoiceTranscript(partialTranscript);

        lastPartialRef.current = partialTranscript;

        // Debounce: commit only after stable partial (responsive, no waiting for speech end)
        if (partialCommitTimerRef.current) {
          clearTimeout(partialCommitTimerRef.current);
        }
        partialCommitTimerRef.current = setTimeout(() => {
          commitVoiceCommandOncePerItem(lastPartialRef.current);
        }, PARTIAL_STABLE_MS);
      }
    };

    Voice.onSpeechVolumeChanged = (e: any) => {
      // Handle volume changes (silence the warning)
      // Volume data available in e.value if needed
    };

    return () => {
      Voice.destroy().then(() => {
        Voice.removeAllListeners();
      });
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
      }
      if (partialCommitTimerRef.current) {
        clearTimeout(partialCommitTimerRef.current);
        partialCommitTimerRef.current = null;
      }
      lastPartialRef.current = '';
      pendingNavRef.current = false;
      commandConsumedForItemRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVoiceRecognitionInternal = async () => {
    try {
      // Reset stopping flag when starting
      isStoppingRef.current = false;

      // Reset per-item gates for current item when starting fresh
      pendingNavRef.current = false;
      commandConsumedForItemRef.current = null;
      lastProcessedTranscriptRef.current = '';

      // Clear any pending partial debounce
      if (partialCommitTimerRef.current) {
        clearTimeout(partialCommitTimerRef.current);
        partialCommitTimerRef.current = null;
      }
      lastPartialRef.current = '';

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

      // Check speech recognition permission (iOS only)
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

        // If current item is a video, pause it (video won't interfere with audio session anymore)
        const currentItemForVoice = items[currentIndex];
        if (
          currentItemForVoice?.type === 'video' &&
          !videoPaused[currentItemForVoice.id]
        ) {
          setVideoPaused(prev => ({
            ...prev,
            [currentItemForVoice.id]: true,
          }));
        }
      }

      // Start voice recognition - voice library will handle audio session itself
      // Since video has disableAudioSessionManagement, there's no conflict
      try {
        await Voice.start('en-US');
        setIsListening(true);
      } catch (startError) {
        setIsListening(false);
        throw startError;
      }
      setVoiceTranscript('');

      // Set 50 second timeout
      voiceTimeoutRef.current = setTimeout(() => {
        stopVoiceRecognition();
      }, 50000);
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to start voice recognition. Please try again.',
      );
      setIsListening(false);
    }
  };

  const startVoiceRecognition = async () => {
    // Check if this is the first time using VoiceIT
    if (!hasSeenVoiceTutorial) {
      setShowVoiceTutorial(true);
      return; // Don't start voice recognition yet, wait for user to close tutorial
    }
    // Start voice recognition
    await startVoiceRecognitionInternal();
  };

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
      {(isLoading || isCheckingLoadMore) && (
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
                const wait = new Promise(resolve => setTimeout(resolve, 500));
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
                // Mark that user has started scrolling, so we don't reset position
                if (!hasScrolledToInitial) {
                  setHasScrolledToInitial(true);
                }
              }}
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
                                videoPaused[item.id] ||
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
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={
                isListening ? stopVoiceRecognition : startVoiceRecognition
              }
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
                  setVideoPaused(prev => ({
                    ...prev,
                    [currentItem.id]: !prev[currentItem.id],
                  }));
                }}
              >
                <Text style={styles.videoControlIcon}>
                  {videoPaused[currentItem.id] ? '▶️' : '⏸️'}
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
});

export default MediaViewer;
