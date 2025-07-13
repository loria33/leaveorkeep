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
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { useMedia, MediaItem } from '../context/MediaContext';
import MediaViewer from '../components/MediaViewer';
import { checkMediaPermissionsWithRetry } from '../utils/permissions';
import { getViewingConfig } from '../constants/app';

const logoImage = require('../assets/logoinApp.png');

const Home: React.FC = () => {
  const {
    monthSummaries,
    monthContent,
    isLoading,
    scanProgress,
    hasPermission,
    setHasPermission,
    scanMonthSummaries,
    loadMonthContent,
    loadMoreMonthContent,
    getMonthItems,
    viewingLimits,
    canViewMedia,
    isPremiumUser,
  } = useMedia();

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerItems, setViewerItems] = useState<MediaItem[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await scanMonthSummaries();
    setRefreshing(false);
  };

  const handleMonthPress = async (monthKey: string) => {
    // Check viewing limits before fetching or showing images
    if (!canViewMedia()) {
      // Show image viewer with timer instead of alert
      setViewerItems([]);
      setViewerInitialIndex(0);
      setViewerVisible(true);
      return;
    }

    // Check if we already have content for this month
    const currentContent = monthContent[monthKey];

    if (currentContent && currentContent.items.length > 0) {
      // We already have content, use it immediately
      const monthItems = getMonthItems(monthKey);

      if (monthItems.length > 0) {
        setViewerItems(monthItems);
        setViewerInitialIndex(0);
        setViewerVisible(true);
      }
    } else {
      // Load month content first
      try {
        const monthItems = await loadMonthContent(monthKey);

        if (monthItems.length > 0) {
          setViewerItems(monthItems);
          setViewerInitialIndex(0);
          setViewerVisible(true);
        } else {
          Alert.alert(
            'No Photos',
            `No photos found for ${monthKey.replace('-', ' ')}`,
          );
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to load photos for this month');
      }
    }
  };

  const handleCloseViewer = () => {
    setViewerVisible(false);
    setViewerItems([]);
  };

  const handleRetryPermissions = async () => {
    try {
      const hasPermission = await checkMediaPermissionsWithRetry();
      if (hasPermission) {
        setHasPermission(true);
        await scanMonthSummaries();
      } else {
        Alert.alert(
          'Permission Required',
          'Unable to access your photos. Please check your device settings and ensure photo access is enabled.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                const { openSettings } = require('react-native-permissions');
                openSettings();
              },
            },
          ],
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        'There was an issue checking permissions. Please try again.',
        [{ text: 'OK' }],
      );
    }
  };

  useEffect(() => {
    if (hasPermission && monthSummaries.length === 0) {
      scanMonthSummaries();
    }
  }, [hasPermission]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.permissionContainer}>
          <View style={styles.permissionContent}>
            <Text style={styles.permissionIcon}>📱</Text>
            <Text style={styles.permissionTitle}>Media Access Required</Text>
            <Text style={styles.permissionText}>
              Please grant media permissions to start organizing your photos.
            </Text>
            {Platform.OS === 'ios' && (
              <Text style={styles.permissionSubtext}>
                On iPad, you may need to retry if you've already granted
                permission.
              </Text>
            )}
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetryPermissions}
            >
              <Text style={styles.retryButtonText}>Retry Permissions</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const renderScanProgress = () => {
    if (!scanProgress) return null;

    const { current, total, phase } = scanProgress;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

    let phaseText = '';
    switch (phase) {
      case 'fetching':
        phaseText = 'Finding months...';
        break;
      case 'processing':
        phaseText = 'Processing months...';
        break;
      case 'complete':
        phaseText = 'Complete!';
        break;
    }

    return (
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>{phaseText}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${percentage}%` }]} />
        </View>
        <Text style={styles.progressCounter}>
          {current} / {total} ({percentage}%)
        </Text>
      </View>
    );
  };

  // Calculate total photos from all months
  const getTotalPhotosCount = () => {
    return monthSummaries.reduce(
      (total, summary) => total + (summary.totalCount || 0),
      0,
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Enhanced Header */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Image
              source={logoImage}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <Text style={styles.headerSubtitle}>
              {monthSummaries.length} months • {getTotalPhotosCount()} photos
            </Text>
          </View>
          <View style={styles.rightSection}>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleRefresh}
              disabled={isLoading}
            >
              <Text style={styles.refreshButtonText}>
                {isLoading ? '⟳' : '↻'}
              </Text>
            </TouchableOpacity>
            <View style={styles.viewingLimitsBadge}>
              <Text style={styles.viewingLimitsText}>
                {viewingLimits.remainingViews} views left
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Scan Progress */}
      {renderScanProgress()}

      {/* Content */}
      {isLoading && monthSummaries.length === 0 ? (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color="#1a1a1a" />
            <Text style={styles.loadingText}>Scanning your photos...</Text>
          </View>
        </View>
      ) : monthSummaries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyContent}>
            <Text style={styles.emptyIcon}>📸</Text>
            <Text style={styles.emptyTitle}>No Media Found</Text>
            <Text style={styles.emptyText}>No media found on your device</Text>
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#1a1a1a"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {monthSummaries.map(summary => {
            const count = summary.totalCount || 0;

            return (
              <TouchableOpacity
                key={summary.monthKey}
                style={styles.monthCard}
                onPress={() => handleMonthPress(summary.monthKey)}
              >
                <View style={styles.monthCardContent}>
                  <View style={styles.monthInfo}>
                    <Text style={styles.monthTitle}>{summary.monthName}</Text>
                    <Text style={styles.monthCount}>
                      {count} {count === 1 ? 'item' : 'items'}
                    </Text>
                  </View>

                  <View style={styles.monthRight}>
                    <Text style={styles.monthChevron}>›</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

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
    backgroundColor: '#f0f8ff',
  },
  headerContainer: {
    backgroundColor: 'rgba(173, 216, 230, 0.3)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(173, 216, 230, 0.5)',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerLogo: {
    height: 50,
    width: 200,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(26, 26, 26, 0.7)',
    fontWeight: '600',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  refreshButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(173, 216, 230, 0.8)',
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  viewingLimitsBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(173, 216, 230, 0.8)',
  },
  viewingLimitsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#f0f8ff',
  },
  monthCard: {
    marginHorizontal: 20,
    marginVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(173, 216, 230, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  monthCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthInfo: {
    flex: 1,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  monthCount: {
    fontSize: 15,
    color: 'rgba(26, 26, 26, 0.7)',
    fontWeight: '500',
  },
  monthRight: {
    marginLeft: 16,
  },
  monthChevron: {
    fontSize: 28,
    color: 'rgba(26, 26, 26, 0.5)',
    fontWeight: '300',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#f0f8ff',
  },
  loadingContent: {
    backgroundColor: 'rgba(173, 216, 230, 0.4)',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(173, 216, 230, 0.6)',
  },
  loadingText: {
    fontSize: 16,
    color: '#1a1a1a',
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#f0f8ff',
  },
  emptyContent: {
    backgroundColor: 'rgba(173, 216, 230, 0.4)',
    paddingHorizontal: 32,
    paddingVertical: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(173, 216, 230, 0.6)',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 12,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(26, 26, 26, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#f0f8ff',
  },
  permissionContent: {
    backgroundColor: 'rgba(173, 216, 230, 0.4)',
    paddingHorizontal: 32,
    paddingVertical: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(173, 216, 230, 0.6)',
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: 20,
    opacity: 0.8,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 12,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  permissionText: {
    fontSize: 16,
    color: 'rgba(26, 26, 26, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  permissionSubtext: {
    fontSize: 14,
    color: 'rgba(26, 26, 26, 0.7)',
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: 'rgba(173, 216, 230, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(173, 216, 230, 1)',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  bottomSpacing: {
    height: 32,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(173, 216, 230, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(173, 216, 230, 0.8)',
    borderRadius: 4,
  },
  progressCounter: {
    fontSize: 14,
    color: 'rgba(26, 26, 26, 0.7)',
    marginTop: 8,
  },
});

export default Home;
