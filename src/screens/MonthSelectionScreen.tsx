import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Platform,
  PlatformColor,
  ImageBackground,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import LinearGradient from 'react-native-linear-gradient';
import {
  LiquidGlassView,
  isLiquidGlassSupported,
} from '@callstack/liquid-glass';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMedia } from '../context/MediaContext';
import { MediaViewerScreenParams } from './MediaViewerScreen';
import { resolveResumeStart } from '../utils/resumePosition';

const backgroundImagePink = require('../assets/bg.png');
const backgroundImageBlue = require('../assets/bg2.jpg');

// Define navigation params
export type MonthSelectionScreenParams = {
  monthKey: string;
  monthName: string;
};

type HomeStackParamList = {
  Home: undefined;
  MonthSelectionScreen: MonthSelectionScreenParams;
  MediaViewerScreen: MediaViewerScreenParams;
};

type MonthSelectionScreenRouteProp = RouteProp<HomeStackParamList, 'MonthSelectionScreen'>;
type MonthSelectionScreenNavigationProp = StackNavigationProp<HomeStackParamList, 'MonthSelectionScreen'>;

const { width, height } = Dimensions.get('window');

const MonthSelectionScreen: React.FC = () => {
  const navigation = useNavigation<MonthSelectionScreenNavigationProp>();
  const route = useRoute<MonthSelectionScreenRouteProp>();
  const { monthKey, monthName } = route.params;

  const {
    monthSummaries,
    loadMonthContent,
    canViewMedia,
  } = useMedia();

  const [skin, setSkin] = useState<'pink' | 'blue'>('blue');
  const [isLoading, setIsLoading] = useState(false);

  // Eagerly load month content on mount to populate photo/video counts
  // (monthSummaries start with counts=0 due to lazy loading)
  useEffect(() => {
    loadMonthContent(monthKey, 20);
  }, [monthKey]);

  // Find month summary to get counts
  const monthSummary = monthSummaries.find(m => m.monthKey === monthKey);
  const photoCount = monthSummary?.photoCount || 0;
  const videoCount = monthSummary?.videoCount || 0;
  const totalCount = monthSummary?.totalCount || 0;

  // Load skin preference on mount
  useEffect(() => {
    const loadSkinPreference = async () => {
      try {
        const savedSkin = await AsyncStorage.getItem('skin');
        if (savedSkin === 'pink' || savedSkin === 'blue') {
          setSkin(savedSkin);
        }
      } catch (error) {
        // Error loading skin preference
      }
    };

    loadSkinPreference();
  }, []);

  // New responsive sizing for vertical action cards
  const isShortHeight = height < 700;
  const cardHeight = Math.max(74, Math.min(110, Math.floor(height * 0.12)));
  const iconCircleSize = Math.round(cardHeight * 0.56);
  const iconFontSize = Math.max(18, Math.round(iconCircleSize * 0.5));
  const iconLineHeight = iconFontSize;

  const backgroundImage =
    skin === 'blue' ? backgroundImageBlue : backgroundImagePink;

  const handleSelectPhotos = async () => {
    if (photoCount === 0) return;

    setIsLoading(true);

    // Check viewing limits before fetching
    if (!canViewMedia()) {
      navigation.navigate('MediaViewerScreen', {
        monthKey,
        mediaType: 'photos',
        initialIndex: 0,
        items: [],
        totalCount: photoCount,
      });
      setIsLoading(false);
      return;
    }

    try {
      const monthItems = await loadMonthContent(monthKey, 20);
      // Resume where the user left off, loading further into the month if needed
      const { items: photoItems, index: startIndex } = await resolveResumeStart(
        monthKey,
        'photos',
        monthItems,
        loadMonthContent,
      );

      if (photoItems.length > 0) {
        navigation.navigate('MediaViewerScreen', {
          monthKey,
          mediaType: 'photos',
          initialIndex: startIndex,
          items: photoItems,
          totalCount: photoCount || photoItems.length,
        });
      } else {
        Alert.alert('No Photos', `No photos found for ${monthName}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load photos for this month');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectVideos = async () => {
    if (videoCount === 0) return;

    setIsLoading(true);

    // Check viewing limits before fetching
    if (!canViewMedia()) {
      navigation.navigate('MediaViewerScreen', {
        monthKey,
        mediaType: 'videos',
        initialIndex: 0,
        items: [],
        totalCount: videoCount,
      });
      setIsLoading(false);
      return;
    }

    try {
      const monthItems = await loadMonthContent(monthKey, 20);
      // Resume where the user left off, loading further into the month if needed
      const { items: videoItems, index: startIndex } = await resolveResumeStart(
        monthKey,
        'videos',
        monthItems,
        loadMonthContent,
      );

      if (videoItems.length > 0) {
        navigation.navigate('MediaViewerScreen', {
          monthKey,
          mediaType: 'videos',
          initialIndex: startIndex,
          items: videoItems,
          totalCount: videoCount || videoItems.length,
        });
      } else {
        Alert.alert('No Videos', `No videos found for ${monthName}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load videos for this month');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAllMedia = async () => {
    setIsLoading(true);

    // Check viewing limits before fetching
    if (!canViewMedia()) {
      navigation.navigate('MediaViewerScreen', {
        monthKey,
        mediaType: 'all',
        initialIndex: 0,
        items: [],
        totalCount: totalCount,
      });
      setIsLoading(false);
      return;
    }

    try {
      const loadedItems = await loadMonthContent(monthKey, 20);
      // Resume where the user left off, loading further into the month if needed
      const { items: monthItems, index: startIndex } = await resolveResumeStart(
        monthKey,
        'all',
        loadedItems,
        loadMonthContent,
      );

      if (monthItems.length > 0) {
        navigation.navigate('MediaViewerScreen', {
          monthKey,
          mediaType: 'all',
          initialIndex: startIndex,
          items: monthItems,
          totalCount: totalCount || monthItems.length,
        });
      } else {
        Alert.alert('No Media', `No media found for ${monthName}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load media for this month');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      {skin === 'blue' && <View style={styles.blueTintOverlay} pointerEvents="none" />}
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text
              style={[
                styles.closeText,
                skin === 'blue' && { color: '#ffffff' },
              ]}
            >
              ✕
            </Text>
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              skin === 'blue' && { color: '#ffffff' },
            ]}
          >
            {monthName}
          </Text>
          <View style={styles.placeholder} />
        </View>

        {/* Content */}
        <View style={[styles.content, isShortHeight && { paddingTop: 16 }]}>
          <Text
            style={[
              styles.title,
              isShortHeight && { fontSize: 24 },
              skin === 'blue' && { color: '#ffffff' },
            ]}
          >
            Choose what to view
          </Text>
          <Text
            style={[
              styles.subtitle,
              isShortHeight && { fontSize: 14, marginBottom: 28 },
              skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
            ]}
          >
            {totalCount} total items in {monthName}
          </Text>

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator
                size="large"
                color={skin === 'blue' ? '#ffffff' : '#1a1a1a'}
              />
            </View>
          )}

          {/* Vertical action cards */}
          <View style={styles.actionsContainer}>
            {/* All Media (primary) */}
            <TouchableOpacity
              onPress={handleSelectAllMedia}
              disabled={isLoading}
              activeOpacity={0.9}
              style={{ marginBottom: 12, opacity: isLoading ? 0.5 : 1 }}
            >
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={[styles.actionGradient, { height: cardHeight }]}
                  interactive
                  effect="clear"
                >
                  <View style={styles.actionContent}>
                    <View
                      style={[
                        styles.iconCircle,
                        { width: iconCircleSize, height: iconCircleSize },
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionIcon,
                          {
                            fontSize: iconFontSize,
                            lineHeight: iconLineHeight,
                          },
                        ]}
                      >
                        📱
                      </Text>
                    </View>
                    <View style={styles.actionTexts}>
                      <Text
                        style={[
                          styles.actionTitle,
                          Platform.OS === 'ios' && {
                            color: PlatformColor('labelColor'),
                          },
                          skin === 'blue' && { color: '#ffffff' },
                        ]}
                      >
                        All Media
                      </Text>
                      {totalCount > 0 && (
                        <Text
                          style={[
                            styles.actionCount,
                            skin === 'blue' && {
                              color: 'rgba(255, 255, 255, 0.9)',
                            },
                          ]}
                        >
                          {totalCount}{' '}
                          {totalCount === 1 ? 'item' : 'items'}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.actionArrow,
                        Platform.OS === 'ios' && {
                          color: PlatformColor('labelColor'),
                        },
                        skin === 'blue' && { color: '#ffffff' },
                      ]}
                    >
                      ›
                    </Text>
                  </View>
                </LiquidGlassView>
              ) : (
                <LinearGradient
                  colors={['#B9DEFF', '#D9EEFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.actionGradient, { height: cardHeight }]}
                >
                  <View style={styles.actionContent}>
                    <View
                      style={[
                        styles.iconCircle,
                        { width: iconCircleSize, height: iconCircleSize },
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionIcon,
                          {
                            fontSize: iconFontSize,
                            lineHeight: iconLineHeight,
                          },
                        ]}
                      >
                        📱
                      </Text>
                    </View>
                    <View style={styles.actionTexts}>
                      <Text
                        style={[
                          styles.actionTitle,
                          skin === 'blue' && { color: '#ffffff' },
                        ]}
                      >
                        All Media
                      </Text>
                      {totalCount > 0 && (
                        <Text
                          style={[
                            styles.actionCount,
                            skin === 'blue' && {
                              color: 'rgba(255, 255, 255, 0.9)',
                            },
                          ]}
                        >
                          {totalCount}{' '}
                          {totalCount === 1 ? 'item' : 'items'}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.actionArrow,
                        skin === 'blue' && { color: '#ffffff' },
                      ]}
                    >
                      ›
                    </Text>
                  </View>
                </LinearGradient>
              )}
            </TouchableOpacity>

            {/* Photos */}
            <TouchableOpacity
              onPress={handleSelectPhotos}
              disabled={photoCount === 0 || isLoading}
              activeOpacity={0.9}
              style={{
                marginBottom: 12,
                opacity: photoCount === 0 || isLoading ? 0.5 : 1,
              }}
            >
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={[styles.actionGradient, { height: cardHeight }]}
                  interactive
                  effect="clear"
                >
                  <View style={styles.actionContent}>
                    <View
                      style={[
                        styles.iconCircle,
                        { width: iconCircleSize, height: iconCircleSize },
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionIcon,
                          {
                            fontSize: iconFontSize,
                            lineHeight: iconLineHeight,
                          },
                        ]}
                      >
                        📸
                      </Text>
                    </View>
                    <View style={styles.actionTexts}>
                      <Text
                        style={[
                          styles.actionTitle,
                          Platform.OS === 'ios' && {
                            color: PlatformColor('labelColor'),
                          },
                          skin === 'blue' && { color: '#ffffff' },
                        ]}
                      >
                        Photos
                      </Text>
                      <Text
                        style={[
                          styles.actionCount,
                          skin === 'blue' && {
                            color: 'rgba(255, 255, 255, 0.9)',
                          },
                        ]}
                      >
                        {photoCount}{' '}
                        {photoCount === 1 ? 'photo' : 'photos'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.actionArrow,
                        Platform.OS === 'ios' && {
                          color: PlatformColor('labelColor'),
                        },
                        skin === 'blue' && { color: '#ffffff' },
                      ]}
                    >
                      ›
                    </Text>
                  </View>
                </LiquidGlassView>
              ) : (
                <LinearGradient
                  colors={['#FFC2CF', '#FFDDE6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.actionGradient, { height: cardHeight }]}
                >
                  <View style={styles.actionContent}>
                    <View
                      style={[
                        styles.iconCircle,
                        { width: iconCircleSize, height: iconCircleSize },
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionIcon,
                          {
                            fontSize: iconFontSize,
                            lineHeight: iconLineHeight,
                          },
                        ]}
                      >
                        📸
                      </Text>
                    </View>
                    <View style={styles.actionTexts}>
                      <Text
                        style={[
                          styles.actionTitle,
                          skin === 'blue' && { color: '#ffffff' },
                        ]}
                      >
                        Photos
                      </Text>
                      <Text
                        style={[
                          styles.actionCount,
                          skin === 'blue' && {
                            color: 'rgba(255, 255, 255, 0.9)',
                          },
                        ]}
                      >
                        {photoCount}{' '}
                        {photoCount === 1 ? 'photo' : 'photos'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.actionArrow,
                        skin === 'blue' && { color: '#ffffff' },
                      ]}
                    >
                      ›
                    </Text>
                  </View>
                </LinearGradient>
              )}
            </TouchableOpacity>

            {/* Videos */}
            <TouchableOpacity
              onPress={handleSelectVideos}
              disabled={videoCount === 0 || isLoading}
              activeOpacity={0.9}
              style={{ opacity: videoCount === 0 || isLoading ? 0.5 : 1 }}
            >
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={[styles.actionGradient, { height: cardHeight }]}
                  interactive
                  effect="clear"
                >
                  <View style={styles.actionContent}>
                    <View
                      style={[
                        styles.iconCircle,
                        { width: iconCircleSize, height: iconCircleSize },
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionIcon,
                          {
                            fontSize: iconFontSize,
                            lineHeight: iconLineHeight,
                          },
                        ]}
                      >
                        🎥
                      </Text>
                    </View>
                    <View style={styles.actionTexts}>
                      <Text
                        style={[
                          styles.actionTitle,
                          Platform.OS === 'ios' && {
                            color: PlatformColor('labelColor'),
                          },
                          skin === 'blue' && { color: '#ffffff' },
                        ]}
                      >
                        Videos
                      </Text>
                      <Text
                        style={[
                          styles.actionCount,
                          skin === 'blue' && {
                            color: 'rgba(255, 255, 255, 0.9)',
                          },
                        ]}
                      >
                        {videoCount}{' '}
                        {videoCount === 1 ? 'video' : 'videos'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.actionArrow,
                        Platform.OS === 'ios' && {
                          color: PlatformColor('labelColor'),
                        },
                        skin === 'blue' && { color: '#ffffff' },
                      ]}
                    >
                      ›
                    </Text>
                  </View>
                </LiquidGlassView>
              ) : (
                <LinearGradient
                  colors={['#D1C4FF', '#ECE6FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.actionGradient, { height: cardHeight }]}
                >
                  <View style={styles.actionContent}>
                    <View
                      style={[
                        styles.iconCircle,
                        { width: iconCircleSize, height: iconCircleSize },
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionIcon,
                          {
                            fontSize: iconFontSize,
                            lineHeight: iconLineHeight,
                          },
                        ]}
                      >
                        🎥
                      </Text>
                    </View>
                    <View style={styles.actionTexts}>
                      <Text
                        style={[
                          styles.actionTitle,
                          skin === 'blue' && { color: '#ffffff' },
                        ]}
                      >
                        Videos
                      </Text>
                      <Text
                        style={[
                          styles.actionCount,
                          skin === 'blue' && {
                            color: 'rgba(255, 255, 255, 0.9)',
                          },
                        ]}
                      >
                        {videoCount}{' '}
                        {videoCount === 1 ? 'video' : 'videos'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.actionArrow,
                        skin === 'blue' && { color: '#ffffff' },
                      ]}
                    >
                      ›
                    </Text>
                  </View>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#000',
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 80,
  },
  title: {
    color: '#000',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: 'rgba(0, 0, 0, 0.7)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  actionsContainer: {
    paddingHorizontal: 16,
  },
  actionGradient: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionIcon: {
    textAlign: 'center',
  },
  actionTexts: {
    flex: 1,
  },
  actionTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  actionCount: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  actionArrow: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 8,
  },
  blueTintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(230, 240, 248, 0.22)',
    zIndex: 1,
  },
});

export default MonthSelectionScreen;

