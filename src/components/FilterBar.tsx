import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useMedia } from '../context/MediaContext';

interface FilterBarProps {
  style?: any;
}

const FilterBar: React.FC<FilterBarProps> = ({ style }) => {
  const { selectedSources, availableSources, setSelectedSources } = useMedia();

  const handleSourceToggle = (source: string) => {
    if (source === 'All') {
      setSelectedSources(['All']);
    } else {
      const newSources = selectedSources.includes('All')
        ? [source]
        : selectedSources.includes(source)
        ? selectedSources.filter(s => s !== source)
        : [...selectedSources.filter(s => s !== 'All'), source];

      setSelectedSources(newSources.length === 0 ? ['All'] : newSources);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {availableSources.map(source => {
          const isSelected =
            selectedSources.includes(source) ||
            (source === 'All' && selectedSources.includes('All'));

          return (
            <TouchableOpacity
              key={source}
              style={[styles.filterPill, isSelected && styles.selectedPill]}
              onPress={() => handleSourceToggle(source)}
            >
              <Text
                style={[styles.filterText, isSelected && styles.selectedText]}
              >
                {source}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e9ecef',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  selectedPill: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  selectedText: {
    color: '#ffffff',
  },
});

export default FilterBar;
