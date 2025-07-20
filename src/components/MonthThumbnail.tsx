import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import { useMedia, MediaItem } from '../context/MediaContext';

interface MonthThumbnailProps {
  monthKey: string;
  items: MediaItem[];
  onPress: (monthKey: string, items: MediaItem[]) => void;
}

const { width } = Dimensions.get('window');

const MonthThumbnail: React.FC<MonthThumbnailProps> = ({
  monthKey,
  items,
  onPress,
}) => {
  const { selectedSources } = useMedia();
  const [imageError, setImageError] = React.useState(false);
  const [imageLoaded, setImageLoaded] = React.useState(false);

  // Filter items based on selected sources
  const filteredItems = React.useMemo(() => {
    if (selectedSources.includes('All')) {
      return items;
    }
    return items.filter(item => selectedSources.includes(item.source));
  }, [items, selectedSources]);

  const monthName = React.useMemo(() => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [monthKey]);

  const thumbnailItem = filteredItems[0];

  // Reset state when thumbnail item changes
  React.useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [thumbnailItem?.uri]);

  if (!thumbnailItem || filteredItems.length === 0) {
    return null;
  }

  const handleImageError = () => {
    setImageError(true);
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(monthKey, filteredItems)}
    >
      {/* Try FastImage first, fallback to regular Image if it fails */}
      {!imageError ? (
        <FastImage
          source={{ uri: thumbnailItem.uri }}
          style={styles.thumbnail}
          resizeMode={FastImage.resizeMode.cover}
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      ) : (
        <Image
          source={{ uri: thumbnailItem.uri }}
          style={styles.thumbnail}
          resizeMode="cover"
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      )}

      {/* Loading indicator */}
      {!imageLoaded && !imageError && (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </View>
      )}

      {/* Error state */}
      {imageError && (
        <View style={styles.errorContainer}>
          <View style={styles.errorContent}>
            <Text style={styles.errorIcon}>📸</Text>
            <Text style={styles.errorText}>Preview unavailable</Text>
          </View>
        </View>
      )}

      {/* Gradient overlay with month info */}
      <LinearGradient
        colors={['transparent', 'rgba(173, 216, 230, 0.9)']}
        style={styles.gradientOverlay}
        locations={[0, 0.7]}
      >
        <View style={styles.monthBannerContent}>
          <Text style={styles.monthText}>{monthName}</Text>
          <Text style={styles.countText}>{filteredItems.length} items</Text>
        </View>
      </LinearGradient>

      {/* Source indicators with enhanced styling */}
      <View style={styles.sourcesContainer}>
        {Array.from(new Set(filteredItems.map(item => item.source)))
          .slice(0, 3)
          .map(source => (
            <View key={source} style={styles.sourceTag}>
              <Text style={styles.sourceText}>{source}</Text>
            </View>
          ))}
        {Array.from(new Set(filteredItems.map(item => item.source))).length >
          3 && (
          <View style={styles.sourceTag}>
            <Text style={styles.sourceText}>
              +
              {Array.from(new Set(filteredItems.map(item => item.source)))
                .length - 3}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width - 32,
    height: 240,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    backgroundColor: 'rgba(248, 249, 250, 0.95)',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
  },
  loadingText: {
    color: '#495057',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContent: {
    backgroundColor: 'rgba(248, 249, 250, 0.95)',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
    opacity: 0.7,
  },
  errorText: {
    color: '#6c757d',
    fontSize: 12,
    fontWeight: '600',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    justifyContent: 'flex-end',
  },
  monthBannerContent: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
  },
  monthText: {
    color: '#1a1a1a',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  countText: {
    color: '#2c2c2c',
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.9,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  sourcesContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sourceTag: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  sourceText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default MonthThumbnail;
