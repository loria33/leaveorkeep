import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { MonthSelectionData } from '../utils/mediaScanner';

interface MonthSelectionProps {
  monthData: MonthSelectionData;
  onSelectPhotos: () => void;
  onSelectVideos: () => void;
  onSelectAllMedia: () => void;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

const MonthSelection: React.FC<MonthSelectionProps> = ({
  monthData,
  onSelectPhotos,
  onSelectVideos,
  onSelectAllMedia,
  onClose,
}) => {
  // New responsive sizing for vertical action cards
  const isShortHeight = height < 700;
  const cardHeight = Math.max(74, Math.min(110, Math.floor(height * 0.12)));
  const iconCircleSize = Math.round(cardHeight * 0.56);
  const iconFontSize = Math.max(18, Math.round(iconCircleSize * 0.5));
  const iconLineHeight = iconFontSize;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{monthData.monthName}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <View style={[styles.content, isShortHeight && { paddingTop: 16 }]}>
        <Text style={[styles.title, isShortHeight && { fontSize: 24 }]}>
          Choose what to view
        </Text>
        <Text
          style={[
            styles.subtitle,
            isShortHeight && { fontSize: 14, marginBottom: 28 },
          ]}
        >
          {monthData.totalCount} total items in {monthData.monthName}
        </Text>

        {/* Vertical action cards */}
        <View style={styles.actionsContainer}>
          {/* All Media (primary) */}
          <TouchableOpacity
            onPress={onSelectAllMedia}
            activeOpacity={0.9}
            style={{ marginBottom: 12 }}
          >
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
                      { fontSize: iconFontSize, lineHeight: iconLineHeight },
                    ]}
                  >
                    📱
                  </Text>
                </View>
                <View style={styles.actionTexts}>
                  <Text style={styles.actionTitle}>All Media</Text>
                  <Text style={styles.actionCount}>
                    {monthData.totalCount}{' '}
                    {monthData.totalCount === 1 ? 'item' : 'items'}
                  </Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Photos */}
          <TouchableOpacity
            onPress={onSelectPhotos}
            disabled={monthData.photoCount === 0}
            activeOpacity={0.9}
            style={{
              marginBottom: 12,
              opacity: monthData.photoCount === 0 ? 0.5 : 1,
            }}
          >
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
                      { fontSize: iconFontSize, lineHeight: iconLineHeight },
                    ]}
                  >
                    📸
                  </Text>
                </View>
                <View style={styles.actionTexts}>
                  <Text style={styles.actionTitle}>Photos</Text>
                  <Text style={styles.actionCount}>
                    {monthData.photoCount}{' '}
                    {monthData.photoCount === 1 ? 'photo' : 'photos'}
                  </Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Videos */}
          <TouchableOpacity
            onPress={onSelectVideos}
            disabled={monthData.videoCount === 0}
            activeOpacity={0.9}
            style={{ opacity: monthData.videoCount === 0 ? 0.5 : 1 }}
          >
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
                      { fontSize: iconFontSize, lineHeight: iconLineHeight },
                    ]}
                  >
                    🎥
                  </Text>
                </View>
                <View style={styles.actionTexts}>
                  <Text style={styles.actionTitle}>Videos</Text>
                  <Text style={styles.actionCount}>
                    {monthData.videoCount}{' '}
                    {monthData.videoCount === 1 ? 'video' : 'videos'}
                  </Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    elevation: 24,
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
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
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
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
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
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  actionArrow: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 8,
  },
  mediaButton: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonGradient: {
    padding: 20,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  buttonCount: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonArrow: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '300',
  },
});

export default MonthSelection;
