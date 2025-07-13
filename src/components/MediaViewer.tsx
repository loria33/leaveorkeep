import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Animated,
  Alert,
  Image,
} from 'react-native';
import Video from 'react-native-video';
import Share from 'react-native-share';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useMedia, MediaItem } from '../context/MediaContext';
import InterstitialAdManager from '../utils/InterstitialAdManager';

// Import the share icon
const shareIcon = require('../assets/share.png');

interface MediaViewerProps {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

const MediaViewer: React.FC<MediaViewerProps> = ({
  items,
  initialIndex,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showControls, setShowControls] = useState(true);
  const [remainingTime, setRemainingTime] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const {
    addToTrash,
    canViewMedia,
    incrementViewCount,
    viewingLimits,
    getRemainingCooldownTime,
  } = useMedia();

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const currentItem = items[currentIndex];

  // Update countdown timer
  React.useEffect(() => {
    if (!canViewMedia()) {
      const updateTimer = () => {
        const timeLeft = getRemainingCooldownTime();
        if (timeLeft <= 0) {
          setRemainingTime('Ready!');
          return;
        }

        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        setRemainingTime(
          `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
            .toString()
            .padStart(2, '0')}`,
        );
      };

      updateTimer(); // Update immediately
      const interval = setInterval(updateTimer, 1000); // Update every second

      return () => clearInterval(interval);
    }
  }, [canViewMedia, getRemainingCooldownTime]);

  // Increment view count when component mounts or index changes
  React.useEffect(() => {
    if (canViewMedia()) {
      incrementViewCount();
    }
  }, [currentIndex]);

  // Check if viewing is blocked
  if (!canViewMedia()) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.blockedContainer}>
          <Text style={styles.blockedIcon}>⏳</Text>
          <Text style={styles.blockedTitle}>Viewing Limit Reached</Text>
          <Text style={styles.blockedText}>
            You've reached your viewing limit of {viewingLimits.viewCount}{' '}
            pictures.
          </Text>
          <Text style={styles.timerText}>{remainingTime}</Text>
          <Text style={styles.blockedSubtext}>
            Time remaining until you can view more pictures
          </Text>

          {/* Premium Subscription Options 
          
          <View style={styles.premiumContainer}>
            <Text style={styles.premiumTitle}>Upgrade to Premium</Text>

            <TouchableOpacity style={styles.premiumOption}>
              <View style={styles.premiumOptionHeader}>
                <Text style={styles.premiumOptionTitle}>👑 King User</Text>
                <Text style={styles.premiumOptionPrice}>$2/month</Text>
              </View>
              <Text style={styles.premiumOptionDescription}>
                • No ads{'\n'}• No lockout time{'\n'}• Unlimited viewing
              </Text>
              <TouchableOpacity style={styles.premiumButton}>
                <Text style={styles.premiumButtonText}>Become King</Text>
              </TouchableOpacity>
            </TouchableOpacity>

            <TouchableOpacity style={styles.premiumOption}>
              <View style={styles.premiumOptionHeader}>
                <Text style={styles.premiumOptionTitle}>
                  ⚡ Ultra King User
                </Text>
                <Text style={styles.premiumOptionPrice}>$1/month</Text>
              </View>
              <Text style={styles.premiumOptionDescription}>
                • No ads{'\n'}• Keep timer (viewing limits){'\n'}• Ad-free
                experience
              </Text>
              <TouchableOpacity style={styles.premiumButton}>
                <Text style={styles.premiumButtonText}>Become Ultra King</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>*/}

          <TouchableOpacity style={styles.blockedButton} onPress={onClose}>
            <Text style={styles.blockedButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const smoothNavigate = (direction: 'next' | 'prev') => {
    if (isNavigating) return;

    setIsNavigating(true);

    const targetIndex =
      direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    // Check bounds
    if (targetIndex < 0 || targetIndex >= items.length) {
      setIsNavigating(false);
      return;
    }

    // Don't navigate if ad is showing
    if (InterstitialAdManager.getInstance().isCurrentlyShowing()) {
      setIsNavigating(false);
      return;
    }

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
      // Update the index
      setCurrentIndex(targetIndex);
      incrementViewCount();

      // Reset animations for new item
      translateX.setValue(0);
      opacity.setValue(1);
      scale.setValue(1);

      // Handle ads after navigation and always reset navigation state
      InterstitialAdManager.getInstance().handleSwipe(() => {
        setIsNavigating(false);
      });

      // Also reset navigation state immediately if no ad is shown
      // This ensures we can swipe again even without ads
      setTimeout(() => {
        setIsNavigating(false);
      }, 100);
    });
  };

  const handleNext = () => {
    smoothNavigate('next');
  };

  const handlePrevious = () => {
    smoothNavigate('prev');
  };

  const handleTrash = () => {
    // Direct trash without confirmation
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
      // Reset animations
      translateY.setValue(0);
      opacity.setValue(1);

      if (currentIndex < items.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
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
      // Don't handle gestures while navigating or showing ads
      if (
        isNavigating ||
        InterstitialAdManager.getInstance().isCurrentlyShowing()
      ) {
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

      // Check for vertical swipe up (trash)
      if (translationY < -100 || velocityY < -1000) {
        handleTrash();
        return;
      }

      // Check for horizontal swipes (navigation) with improved thresholds
      const horizontalThreshold = 80; // Reduced from 100 for more responsive swipes
      const velocityThreshold = 800; // Reduced from 1000 for more responsive swipes

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

  if (!currentItem) {
    return null;
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Media Container - Separate from gesture handler for better performance */}
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
              <Video
                source={{ uri: currentItem.uri }}
                style={styles.media}
                resizeMode="contain"
                controls={showControls}
                paused={false}
                onError={error => {
                  // Video error
                }}
              />
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

      {/* Floating Controls */}
      {showControls && (
        <View style={styles.controlsOverlay}>
          {/* Top Controls */}
          <View style={styles.topControls}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.counterContainer}>
              <Text style={styles.counterText}>
                {currentIndex + 1} of {items.length}
              </Text>
              <Text style={styles.remainingText}>
                {viewingLimits.remainingViews} views left
              </Text>
            </View>
          </View>

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleShare}
            >
              <Image source={shareIcon} style={styles.controlButtonImage} />
            </TouchableOpacity>
          </View>

          {/* Gesture Instructions */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionText}>
              ← → Navigate • ↑ Trash • Tap to hide controls
            </Text>
            <Text style={styles.instructionSubText}>
              Ad every 5 swipes • Closes automatically to next item
            </Text>
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
  counterContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  counterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  remainingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  controlButtonImage: {
    width: 24,
    height: 24,
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  instructionText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  instructionSubText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '400',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
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
  blockedText: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  blockedSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 20,
    textAlign: 'center',
  },
  blockedButton: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  blockedButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  timerText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  premiumContainer: {
    marginTop: 20,
    width: '100%',
    paddingHorizontal: 20,
  },
  premiumTitle: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  premiumOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  premiumOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  premiumOptionTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  premiumOptionPrice: {
    fontSize: 16,
    color: '#007bff',
    fontWeight: 'bold',
  },
  premiumOptionDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 15,
  },
  premiumButton: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  premiumButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default MediaViewer;
