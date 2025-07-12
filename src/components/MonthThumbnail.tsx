import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import FastImage from 'react-native-fast-image';
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

  if (!thumbnailItem || filteredItems.length === 0) {
    return null;
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(monthKey, filteredItems)}
    >
      <FastImage
        source={{ uri: thumbnailItem.uri }}
        style={styles.thumbnail}
        resizeMode={FastImage.resizeMode.cover}
      />
      <View style={styles.overlay}>
        <Text style={styles.monthText}>{monthName}</Text>
        <Text style={styles.countText}>{filteredItems.length} items</Text>
      </View>

      {/* Source indicators */}
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
    height: 200,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
  },
  monthText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  countText: {
    color: '#ffffff',
    fontSize: 14,
    opacity: 0.9,
  },
  sourcesContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sourceTag: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 4,
    marginBottom: 4,
  },
  sourceText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
});

export default MonthThumbnail;
