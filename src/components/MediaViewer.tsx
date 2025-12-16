import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import Video from 'react-native-video';
import Share from 'react-native-share';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useMedia, MediaItem } from '../context/MediaContext';

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

  // Update items when initialItems prop changes (when parent loads more)
  useEffect(() => {
    // Always sync with props if they have more items
    if (initialItems.length >= items.length) {
      setItems(initialItems);
    }
  }, [initialItems]);

  const {
    addToTrash,
    canViewMedia,
    incrementViewCount,
    loadMoreMonthContent,
    monthContent,
    markMediaItemAsViewed,
    checkAndMarkMonthCompleted,
  } = useMedia();

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const currentItem = items[currentIndex];

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
        loadMoreMonthContent(monthKey, 40)
          .finally(() => {
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
    if (canViewMedia()) {
      incrementViewCount();
    }
    setVideoError(false);
    setVideoPaused(false);

    // Mark current item as viewed immediately when displayed
    if (currentItem && !viewedItemsRef.current.has(currentItem.id)) {
      viewedItemsRef.current.add(currentItem.id);
      // Mark immediately - if user is viewing it, they've seen it
      markMediaItemAsViewed(currentItem.id).then(() => {
        // Check if month is completed after marking item as viewed
        if (monthKey && 
            monthKey !== 'DUPLICATES' && 
            !monthKey.startsWith('TIME_FILTER_') && 
            !monthKey.startsWith('SOURCE_FILTER_')) {
          // Check completion every 3 items or on last item
          if (currentIndex % 3 === 0 || currentIndex === items.length - 1) {
            checkAndMarkMonthCompleted(monthKey).catch(() => {
              // Error checking completion
            });
          }
        }
      });
    }
  }, [currentIndex, currentItem]);

  // Save viewed items and check completion when component unmounts (viewer closes)
  useEffect(() => {
    return () => {
      // Mark all items that were displayed as viewed (in case any were missed)
      const itemsToMark = Array.from(viewedItemsRef.current);
      if (itemsToMark.length > 0) {
        import('../utils/viewedMediaTracker').then(({ markItemsAsViewed, saveViewedItemsImmediately }) => {
          markItemsAsViewed(itemsToMark).then(() => {
            saveViewedItemsImmediately().catch(() => {
              // Error saving
            });
          });
        });
      } else {
        import('../utils/viewedMediaTracker').then(({ saveViewedItemsImmediately }) => {
          saveViewedItemsImmediately().catch(() => {
            // Error saving
          });
        });
      }
      
      // Check month completion when viewer closes
      if (monthKey && 
          monthKey !== 'DUPLICATES' && 
          !monthKey.startsWith('TIME_FILTER_') && 
          !monthKey.startsWith('SOURCE_FILTER_')) {
        // Wait a bit for storage to be saved, then check completion
        setTimeout(() => {
          checkAndMarkMonthCompleted(monthKey).catch(() => {
            // Error checking completion
          });
        }, 2000);
      }
    };
  }, [monthKey]);

  // Check if viewing is blocked
  if (!canViewMedia()) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.blockedContainer}>
          <Text style={styles.blockedIcon}>⏳</Text>
          <Text style={styles.blockedTitle}>Viewing Limit Reached</Text>
          <TouchableOpacity style={styles.blockedButton} onPress={onClose}>
            <Text style={styles.blockedButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const smoothNavigate = (direction: 'next' | 'prev') => {
    if (isNavigating) return;

    // If only one item, show message and return
    if (items.length === 1) {
      setShowOnlyOneMessage(true);
      setTimeout(() => setShowOnlyOneMessage(false), 2000);
      return;
    }

    setIsNavigating(true);

    const targetIndex =
      direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    // Handle endless loop navigation
    let finalTargetIndex = targetIndex;
    if (targetIndex < 0) {
      finalTargetIndex = items.length - 1;
    } else if (targetIndex >= items.length) {
      finalTargetIndex = 0;
    }

    // Update the index immediately
    setCurrentIndex(finalTargetIndex);

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
    });
  };

  const handleNext = () => {
    smoothNavigate('next');
  };

  const handlePrevious = () => {
    smoothNavigate('prev');
  };

  const handleTrash = () => {
    if (!currentItem) return;

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
  };

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
        if (
          Math.abs(translationX) > 50 ||
          Math.abs(velocityX) > 500
        ) {
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

      if (
        translationX > horizontalThreshold ||
        velocityX > velocityThreshold
      ) {
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

  if (!currentItem) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

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

      {/* Floating Controls */}
      {showControls && (
        <View style={styles.controlsOverlay}>
          {/* Top Controls */}
          <View style={styles.topControls}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>✕</Text>
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
            <Text style={styles.instructionText}>← Swipe →</Text>
            <Text style={styles.instructionSubText}>↑ Drag up to trash</Text>
          </View>
        </View>
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 1,
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
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: '600',
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
  blockedButton: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
  },
  blockedButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
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
});

export default MediaViewer;
