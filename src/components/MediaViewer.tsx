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
} from 'react-native';
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
  const [videoError, setVideoError] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<MediaItem[]>(initialItems);
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
  const spokenRef = useRef<string>(''); // Track what has already been processed
  const isProcessingCommandsRef = useRef<boolean>(false); // Flag to prevent reset during command processing
  const isStoppingRef = useRef<boolean>(false); // Flag to prevent processing commands when stopping
  const isInitialMountRef = useRef<boolean>(true); // Track if this is the initial mount
  const previousIndexRef = useRef<number>(initialIndex); // Track previous index to detect actual navigation

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

  // Update items when initialItems prop changes (when parent loads more)
  useEffect(() => {
    // Only update if initialItems has more items
    if (initialItems.length > items.length) {
      setItems(initialItems);
    }
  }, [initialItems.length]);

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

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  // Keep a ref to the latest items array to avoid closure issues
  const itemsRef = useRef<MediaItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const currentItem = items[currentIndex];

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

  // Determine media type filter based on current items
  const getMediaTypeFilter = (): 'photo' | 'video' | 'all' => {
    if (items.length === 0) return 'all';
    const hasPhotos = items.some(item => item.type === 'photo');
    const hasVideos = items.some(item => item.type === 'video');
    if (hasPhotos && !hasVideos) return 'photo';
    if (hasVideos && !hasPhotos) return 'video';
    return 'all';
  };

  // Filter items based on current media type
  const filterItems = (allItems: MediaItem[]): MediaItem[] => {
    const filterType = getMediaTypeFilter();
    if (filterType === 'photo') {
      return allItems.filter(item => item.type === 'photo');
    } else if (filterType === 'video') {
      return allItems.filter(item => item.type === 'video');
    }
    return allItems;
  };

  // Load first 40 items when component mounts if needed
  useEffect(() => {
    if (monthKey && items.length < 40) {
      const content = monthContent[monthKey];
      if (content && content.hasMore && !content.isLoading) {
        setIsLoading(true);
        loadMoreMonthContent(monthKey, 40).finally(() => {
          setIsLoading(false);
        });
      }
    }
  }, [monthKey]);

  // Load next 40 items when viewing item 10
  useEffect(() => {
    if (monthKey && currentIndex === 10 && items.length < 80) {
      const content = monthContent[monthKey];
      if (content && content.hasMore && !content.isLoading) {
        setIsLoading(true);
        loadMoreMonthContent(monthKey, 40)
          .then(() => {
            const updatedContent = monthContent[monthKey];
            if (updatedContent && updatedContent.items.length > items.length) {
              const filtered = filterItems(updatedContent.items);
              setItems(filtered);
            }
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }
  }, [currentIndex, monthKey]);

  // Update items when monthContent changes - filter based on current items type
  // This handles the case where loadMoreMonthContent updates monthContent
  useEffect(() => {
    if (monthKey) {
      const content = monthContent[monthKey];
      if (content && content.items.length > 0) {
        const filtered = filterItems(content.items);
        // Update if we have more items than current local state
        if (filtered.length >= items.length) {
          setItems(filtered);
        }
      }
    }
  }, [monthContent, monthKey, items.length]);

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
    setVideoError(false);
    setVideoPaused(false);

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

  // Save viewed items and check completion when component unmounts (viewer closes)
  useEffect(() => {
    return () => {
      // Mark the current item as viewed when closing (if not already marked)
      const currentItemOnClose = items[currentIndex];
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

      // Reload viewed items set when closing to refresh for next time
      loadViewedItems()
        .then(set => {
          setViewedItemsSet(set);
        })
        .catch(() => {
          // Error reloading
        });

      // Check month completion when viewer closes
      if (
        monthKey &&
        monthKey !== 'DUPLICATES' &&
        !monthKey.startsWith('TIME_FILTER_') &&
        !monthKey.startsWith('SOURCE_FILTER_')
      ) {
        // Wait a bit for storage to be saved, then check completion
        setTimeout(() => {
          checkAndMarkMonthCompleted(monthKey).catch(() => {
            // Error checking completion
          });
        }, 2000);
      }
    };
  }, [monthKey, currentIndex, items]);

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

  // All hooks must be called before any conditional returns
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
        let finalTargetIndex = targetIndex;
        if (targetIndex < 0) {
          finalTargetIndex = itemsRef.current.length - 1;
        } else if (targetIndex >= itemsRef.current.length) {
          finalTargetIndex = 0;
        }

        return finalTargetIndex;
      });

      // Animate the transition
      const slideDistance = direction === 'next' ? -width : width;

      Animated.parallel([
        Animated.timing(translateX, {
          toValue: slideDistance,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.95,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Reset animations for new item
        translateX.setValue(0);
        opacity.setValue(1);
        scale.setValue(1);
        setIsNavigating(false);

        // Track swipe for banner ads (only count forward swipes, not backward)
        if (direction === 'next') {
          BannerAdManager.getInstance().handleSwipe();
        }
      });
    },
    [isNavigating],
  );

  const handleNext = useCallback(() => {
    // Reset voice transcript and spoken when navigating (only if not processing commands)
    if (!isProcessingCommandsRef.current) {
      setVoiceTranscript('');
      spokenRef.current = '';
    }

    smoothNavigate('next');
  }, [smoothNavigate]);

  const handlePrevious = useCallback(() => {
    smoothNavigate('prev');
  }, [smoothNavigate]);

  const handleTrash = useCallback(() => {
    if (!currentItem) return;

    // Reset voice transcript and spoken when trashing (only if not processing commands)
    if (!isProcessingCommandsRef.current) {
      setVoiceTranscript('');
      spokenRef.current = '';
    }

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
  const processVoiceCommandRef = useRef<
    ((transcript: string) => void) | undefined
  >(undefined);

  // Update refs immediately when component renders
  handleNextRef.current = handleNext;
  handleTrashRef.current = handleTrash;

  const stopVoiceRecognition = useCallback(async () => {
    try {
      // Set stopping flag to prevent any final results from being processed
      isStoppingRef.current = true;

      // Clear processing flag to prevent any ongoing command processing
      isProcessingCommandsRef.current = false;

      await Voice.stop();
      setIsListening(false);
      setVoiceTranscript('');
      spokenRef.current = ''; // Reset spoken when stopping
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
      isProcessingCommandsRef.current = false; // Make sure flag is cleared even on error
      isStoppingRef.current = false; // Reset stopping flag on error
    }
  }, []);

  stopVoiceRecognitionRef.current = stopVoiceRecognition;

  // Define processVoiceCommand and store in ref
  useEffect(() => {
    processVoiceCommandRef.current = (transcript: string) => {
      // Prevent infinite loops - if already processing, skip
      if (isProcessingCommandsRef.current) {
        return;
      }

      const lowerTranscript = transcript.toLowerCase();

      // Remove already spoken text from the new transcript to get only new words
      let newWords = lowerTranscript;
      if (spokenRef.current) {
        const spokenLower = spokenRef.current.toLowerCase();
        // Remove the spoken part from the beginning of the transcript
        if (lowerTranscript.startsWith(spokenLower)) {
          newWords = lowerTranscript.substring(spokenLower.length).trim();
        } else {
          // If spoken text is in the middle or end, try to find and remove it
          const spokenIndex = lowerTranscript.indexOf(spokenLower);
          if (spokenIndex !== -1) {
            // Remove the spoken part
            newWords = (
              lowerTranscript.substring(0, spokenIndex) +
              lowerTranscript.substring(spokenIndex + spokenLower.length)
            ).trim();
          }
        }
      }

      if (!newWords) {
        return; // No new words to process
      }

      // Find ALL command words in new words, don't prioritize - process in order
      const processedUpTo = spokenRef.current
        ? spokenRef.current.toLowerCase().length
        : 0;
      const commands: Array<{ word: string; index: number; endIndex: number }> =
        [];

      // Find all "keep" positions
      let keepIndex = newWords.indexOf('keep', 0);
      while (keepIndex !== -1) {
        commands.push({
          word: 'keep',
          index: keepIndex,
          endIndex: keepIndex + 4,
        });
        keepIndex = newWords.indexOf('keep', keepIndex + 1);
      }

      // Find all "swipe" positions
      let swipeIndex = newWords.indexOf('swipe', 0);
      while (swipeIndex !== -1) {
        commands.push({
          word: 'swipe',
          index: swipeIndex,
          endIndex: swipeIndex + 5,
        });
        swipeIndex = newWords.indexOf('swipe', swipeIndex + 1);
      }

      // Find all "trash" positions
      let trashIndex = newWords.indexOf('trash', 0);
      while (trashIndex !== -1) {
        commands.push({
          word: 'trash',
          index: trashIndex,
          endIndex: trashIndex + 5,
        });
        trashIndex = newWords.indexOf('trash', trashIndex + 1);
      }

      // Find all "flick" positions
      let flickIndex = newWords.indexOf('flick', 0);
      while (flickIndex !== -1) {
        commands.push({
          word: 'flick',
          index: flickIndex,
          endIndex: flickIndex + 5,
        });
        flickIndex = newWords.indexOf('flick', flickIndex + 1);
      }

      // Sort commands by their position in new words (process in order)
      commands.sort((a, b) => a.index - b.index);

      if (commands.length === 0) {
        return; // No commands found
      }

      // Process the first command immediately
      const firstCmd = commands[0];

      // Calculate the position in the FULL transcript where this command ends
      // processedUpTo is the length of what we've already spoken (in the full transcript)
      // firstCmd.index is the position in newWords where this command starts
      // firstCmd.endIndex is where it ends in newWords
      // So in the full transcript, this command starts at: processedUpTo + firstCmd.index
      // And ends at: processedUpTo + firstCmd.endIndex
      const commandStartInFullTranscript = processedUpTo + firstCmd.index;
      const fullTranscriptEndPosition = processedUpTo + firstCmd.endIndex;

      // Calculate what spoken will be after processing this command
      const newSpoken = lowerTranscript.substring(0, fullTranscriptEndPosition);

      // Only process if this command hasn't been processed yet
      const currentSpoken = spokenRef.current.toLowerCase();
      const newSpokenLower = newSpoken.toLowerCase();

      // Check if we've already processed up to this point
      // We should only skip if currentSpoken is LONGER than newSpoken, not equal
      // If they're equal, we haven't processed this command yet
      if (
        currentSpoken.length > newSpokenLower.length &&
        currentSpoken.length > 0
      ) {
        // If there are more commands, try to process them with the remaining transcript
        if (commands.length > 1) {
          setTimeout(() => {
            // Use the full transcript so we can correctly calculate positions
            processVoiceCommandRef.current?.(lowerTranscript);
          }, 100);
        }
        return;
      }

      // Also check if currentSpoken already contains newSpoken (exact match means already processed)
      if (currentSpoken === newSpokenLower && currentSpoken.length > 0) {
        // If there are more commands, try to process them
        if (commands.length > 1) {
          setTimeout(() => {
            processVoiceCommandRef.current?.(lowerTranscript);
          }, 100);
        }
        return;
      }

      // Also check if newSpoken starts with currentSpoken (meaning we're adding new content)
      // If it doesn't, it might be a different transcript or a reset happened
      if (
        currentSpoken &&
        currentSpoken.length > 0 &&
        !newSpokenLower.startsWith(currentSpoken)
      ) {
        // This might be a new recognition session, reset spoken and process
        spokenRef.current = '';
      }

      // Set flag FIRST to prevent reset during processing
      isProcessingCommandsRef.current = true;

      // Update spoken to include everything up to and including this command
      // Do this BEFORE calling handleNext/handleTrash so the effect doesn't reset it
      spokenRef.current = newSpoken;

      // Process the command
      if (firstCmd.word === 'keep' || firstCmd.word === 'swipe') {
        setVoiceTranscript('');
        // Flag is already set, so handleNext won't reset spokenRef
        handleNextRef.current?.();
      } else if (firstCmd.word === 'trash' || firstCmd.word === 'flick') {
        setVoiceTranscript('');
        // Flag is already set, so handleTrash won't reset spokenRef
        if (handleTrashRef.current) {
          handleTrashRef.current();
        }
      }

      // If there are more commands, process them after a delay
      if (commands.length > 1) {
        setTimeout(() => {
          // Recursively process remaining commands with the SAME transcript
          // The spokenRef has been updated, so the next call will correctly
          // identify only the remaining unprocessed commands
          // Reset flag before recursive call to allow it to process
          isProcessingCommandsRef.current = false;
          // Use the same transcript - spokenRef will filter out what's already processed
          processVoiceCommandRef.current?.(lowerTranscript);
        }, 800); // Increased delay to ensure handleNext/handleTrash animation has completed
      } else {
        // No more commands, reset flag after a delay to allow animations to complete
        // Use longer delay to ensure currentIndex change effect has run and navigation is complete
        setTimeout(() => {
          isProcessingCommandsRef.current = false;
        }, 800);
      }
    };
  }, []); // Only set up once

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
    };

    Voice.onSpeechResults = (e: any) => {
      // Don't process if we're stopping
      if (isStoppingRef.current) {
        return;
      }
      if (e.value && e.value.length > 0) {
        const transcript = e.value[0].toLowerCase();
        setVoiceTranscript(transcript);
        processVoiceCommandRef.current?.(transcript);
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
        processVoiceCommandRef.current?.(partialTranscript);
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
    };
  }, []); // Empty dependency array - listeners should only be set up once

  // Reset transcript when navigating to a new item (but keep listening)
  useEffect(() => {
    if (isListening && !isProcessingCommandsRef.current) {
      // Reset transcript and spoken when navigating to new item
      // But don't reset if we're currently processing voice commands
      setVoiceTranscript('');
      spokenRef.current = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const startVoiceRecognitionInternal = async () => {
    try {
      // Reset stopping flag when starting
      isStoppingRef.current = false;

      // Check if Voice is available
      const isAvailable = await Voice.isAvailable();

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
      }

      // Start voice recognition
      try {
        await Voice.start('en-US');
      } catch (startError) {
        throw startError;
      }
      setIsListening(true);
      setVoiceTranscript('');
      spokenRef.current = ''; // Reset spoken when starting new session

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

  const onGestureEvent = Animated.event(
    [
      {
        nativeEvent: {
          translationX: translateX,
          translationY: translateY,
        },
      },
    ],
    { useNativeDriver: true },
  );

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      if (isNavigating) {
        // Reset position if we're in the middle of navigation
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }),
        ]).start();
        return;
      }

      const { translationX, translationY, velocityX, velocityY } =
        event.nativeEvent;

      // Check for vertical swipe up (trash) - drag up goes to trash
      if (translationY < -100 || velocityY < -1000) {
        handleTrash();
        return;
      }

      // If only one item, show message for horizontal swipes
      if (items.length === 1) {
        if (Math.abs(translationX) > 50 || Math.abs(velocityX) > 500) {
          setShowOnlyOneMessage(true);
          setTimeout(() => setShowOnlyOneMessage(false), 2000);
        }
        // Reset position
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }),
        ]).start();
        return;
      }

      // Check for horizontal swipes (navigation)
      const horizontalThreshold = 80;
      const velocityThreshold = 800;

      if (translationX > horizontalThreshold || velocityX > velocityThreshold) {
        // Swipe right - previous image
        handlePrevious();
      } else if (
        translationX < -horizontalThreshold ||
        velocityX < -velocityThreshold
      ) {
        // Swipe left - next image
        handleNext();
      } else {
        // Reset position for small swipes
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
  };

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
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Media Container */}
      <View style={styles.mediaContainer}>
        <TouchableOpacity
          style={styles.mediaTouch}
          onPress={toggleControls}
          activeOpacity={1}
        >
          <Animated.View
            style={[
              styles.mediaWrapper,
              {
                transform: [
                  { translateX: translateX },
                  { translateY: translateY },
                  { scale: scale },
                ],
                opacity: opacity,
              },
            ]}
          >
            {currentItem.type === 'video' ? (
              videoError ? (
                <View style={styles.videoErrorContainer}>
                  <Text style={styles.videoErrorIcon}>🎥</Text>
                  <Text style={styles.videoErrorTitle}>Video Unavailable</Text>
                  <Text style={styles.videoErrorText}>
                    This video cannot be played
                  </Text>
                </View>
              ) : (
                <Video
                  key={currentItem.id || currentItem.uri}
                  source={{ uri: currentItem.uri }}
                  style={styles.media}
                  resizeMode="contain"
                  controls={false}
                  paused={videoPaused}
                  repeat={false}
                  playInBackground={false}
                  playWhenInactive={false}
                  ignoreSilentSwitch="ignore"
                  fullscreen={false}
                  fullscreenAutorotate={true}
                  fullscreenOrientation="all"
                  onError={error => {
                    setVideoError(true);
                  }}
                  onLoad={data => {
                    setVideoError(false);
                  }}
                />
              )
            ) : (
              <Image
                key={currentItem.id || currentItem.uri}
                source={{ uri: currentItem.uri }}
                style={styles.media}
                resizeMode="contain"
                onError={() => {
                  // Image error
                }}
                onLoad={() => {
                  // Image loaded successfully
                }}
              />
            )}
          </Animated.View>

          {/* Viewed Checkmark Badge - positioned outside animated view to stay fixed */}
          {isCurrentItemViewed && (
            <View style={styles.viewedBadge}>
              <Text style={styles.viewedCheckmark}>✓</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Gesture Handler Overlay */}
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
      >
        <Animated.View style={styles.gestureOverlay} />
      </PanGestureHandler>

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
                  setVideoPaused(!videoPaused);
                }}
              >
                <Text style={styles.videoControlIcon}>
                  {videoPaused ? '▶️' : '⏸️'}
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
    justifyContent: 'center',
    alignItems: 'center',
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
