import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { useMedia, MediaItem } from '../context/MediaContext';
import FilterBar from '../components/FilterBar';
import MonthThumbnail from '../components/MonthThumbnail';
import MediaViewer from '../components/MediaViewer';

const Home: React.FC = () => {
  const {
    groupedMedia,
    selectedSources,
    isLoading,
    scanMedia,
    hasPermission,
    canViewMedia,
    viewingLimits,
    getRemainingCooldownTime,
  } = useMedia();

  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerItems, setViewerItems] = useState<MediaItem[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  // Filter grouped media based on selected sources
  const filteredGroupedMedia = React.useMemo(() => {
    const filtered: { [key: string]: MediaItem[] } = {};

    Object.entries(groupedMedia).forEach(([monthKey, sourceGroups]) => {
      let monthItems: MediaItem[] = [];

      if (selectedSources.includes('All')) {
        monthItems = Object.values(sourceGroups).flat();
      } else {
        selectedSources.forEach(source => {
          if (sourceGroups[source]) {
            monthItems = [...monthItems, ...sourceGroups[source]];
          }
        });
      }

      if (monthItems.length > 0) {
        filtered[monthKey] = monthItems.sort(
          (a, b) => b.timestamp - a.timestamp,
        );
      }
    });

    return filtered;
  }, [groupedMedia, selectedSources]);

  // Sort months by date (newest first)
  const sortedMonths = React.useMemo(() => {
    return Object.keys(filteredGroupedMedia).sort((a, b) => {
      const dateA = new Date(a + '-01').getTime();
      const dateB = new Date(b + '-01').getTime();
      return dateB - dateA;
    });
  }, [filteredGroupedMedia]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await scanMedia();
    setRefreshing(false);
  };

  const handleMonthPress = (monthKey: string, items: MediaItem[]) => {
    setViewerItems(items);
    setViewerInitialIndex(0);
    setViewerVisible(true);
  };

  const handleCloseViewer = () => {
    setViewerVisible(false);
    setViewerItems([]);
  };

  useEffect(() => {
    if (hasPermission && Object.keys(groupedMedia).length === 0) {
      scanMedia();
    }
  }, [hasPermission]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionIcon}>📱</Text>
          <Text style={styles.permissionTitle}>Media Access Required</Text>
          <Text style={styles.permissionText}>
            Please grant media permissions to start organizing your photos.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>LeaveMKeepM</Text>
          <Text style={styles.headerSubtitle}>
            {sortedMonths.length} months •{' '}
            {Object.values(filteredGroupedMedia).flat().length} items
          </Text>
        </View>
        <View style={styles.viewingLimitsContainer}>
          <Text style={styles.viewingLimitsText}>
            {viewingLimits.remainingViews} views left
          </Text>
        </View>
      </View>

      {/* Filter Bar */}
      <FilterBar />

      {/* Content */}
      {isLoading && Object.keys(groupedMedia).length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Scanning your media...</Text>
        </View>
      ) : sortedMonths.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📸</Text>
          <Text style={styles.emptyTitle}>No Media Found</Text>
          <Text style={styles.emptyText}>
            {selectedSources.includes('All')
              ? 'No media found on your device'
              : 'No media found for selected sources'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {sortedMonths.map(monthKey => (
            <MonthThumbnail
              key={monthKey}
              monthKey={monthKey}
              items={filteredGroupedMedia[monthKey]}
              onPress={handleMonthPress}
            />
          ))}
          <View style={styles.bottomSpacing} />
        </ScrollView>
      )}

      {/* Media Viewer Modal */}
      {viewerVisible && (
        <MediaViewer
          items={viewerItems}
          initialIndex={viewerInitialIndex}
          onClose={handleCloseViewer}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#212529',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '500',
  },
  viewingLimitsContainer: {
    backgroundColor: '#e9ecef',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  viewingLimitsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#343a40',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomSpacing: {
    height: 32,
  },
});

export default Home;
