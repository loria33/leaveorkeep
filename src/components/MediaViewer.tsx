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

        const minutes = Math.floor(timeLeft / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        setRemainingTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      };

      updateTimer(); // Update immediately
      const interval = setInterval(updateTimer, 1000); // Update every second

      return () => clearInterval(interval);
    }
  }, [canViewMedia, getRemainingCooldownTime]);

  // Debug: Log current item
  React.useEffect(() => {
    console.log('=== MediaViewer Debug ===');
    console.log('Current item:', currentItem);
    console.log('Current item URI:', currentItem?.uri);
    console.log('Current item type:', currentItem?.type);
    console.log('Current item filename:', currentItem?.filename);
    console.log('Items length:', items.length);
    console.log('Current index:', currentIndex);
    console.log('=========================');
  }, [currentItem]);

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
          <TouchableOpacity style={styles.blockedButton} onPress={onClose}>
            <Text style={styles.blockedButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
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
    try {
      const shareOptions = {
        url: currentItem.uri,
        type: currentItem.type === 'video' ? 'video/*' : 'image/*',
      };

      await Share.open(shareOptions);
    } catch (error) {
      console.error('Error sharing media:', error);
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
      const { translationX, translationY, velocityX, velocityY } =
        event.nativeEvent;

      // Check for vertical swipe up (trash)
      if (translationY < -100 || velocityY < -1000) {
        handleTrash();
        return;
      }

      // Check for horizontal swipes (navigation)
      if (translationX > 100 || velocityX > 1000) {
        // Swipe right - previous image
        handlePrevious();
      } else if (translationX < -100 || velocityX < -1000) {
        // Swipe left - next image
        handleNext();
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
                onError={(error: any) => {
                  console.error('Video error:', error);
                  Alert.alert('Error', 'Failed to load video');
                }}
              />
            ) : (
              <Image
                source={{ uri: currentItem.uri }}
                style={styles.media}
                resizeMode="contain"
                onError={() => {
                  console.error('Image error for URI:', currentItem.uri);
                  Alert.alert('Error', 'Failed to load image');
                }}
                onLoad={() => {
                  console.log('Image loaded successfully');
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
});

export default MediaViewer;
