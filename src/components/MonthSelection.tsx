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
      <View style={styles.content}>
        <Text style={styles.title}>Choose what to view</Text>
        <Text style={styles.subtitle}>
          {monthData.totalCount} total items in {monthData.monthName}
        </Text>

        {/* Buttons Grid */}
        <View style={styles.buttonsGrid}>
          {/* Photos Button */}
          <TouchableOpacity
            style={[
              styles.gridButton,
              monthData.photoCount === 0 && styles.disabledButton,
            ]}
            onPress={onSelectPhotos}
            disabled={monthData.photoCount === 0}
          >
            <LinearGradient
              colors={['#FF6B6B', '#FF8E8E']}
              style={styles.gridButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.gridButtonContent}>
                <Text style={styles.gridButtonIcon}>📸</Text>
                <Text style={styles.gridButtonTitle}>Photos</Text>
                <Text style={styles.gridButtonCount}>
                  {monthData.photoCount}{' '}
                  {monthData.photoCount === 1 ? 'photo' : 'photos'}
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Videos Button */}
          <TouchableOpacity
            style={[
              styles.gridButton,
              monthData.videoCount === 0 && styles.disabledButton,
            ]}
            onPress={onSelectVideos}
            disabled={monthData.videoCount === 0}
          >
            <LinearGradient
              colors={['#4ECDC4', '#44A08D']}
              style={styles.gridButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.gridButtonContent}>
                <Text style={styles.gridButtonIcon}>🎥</Text>
                <Text style={styles.gridButtonTitle}>Videos</Text>
                <Text style={styles.gridButtonCount}>
                  {monthData.videoCount}{' '}
                  {monthData.videoCount === 1 ? 'video' : 'videos'}
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* All Media Button */}
          <TouchableOpacity
            style={styles.gridButton}
            onPress={onSelectAllMedia}
          >
            <LinearGradient
              colors={['#A8E6CF', '#88D8C0']}
              style={styles.gridButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.gridButtonContent}>
                <Text style={styles.gridButtonIcon}>📱</Text>
                <Text style={styles.gridButtonTitle}>All Media</Text>
                <Text style={styles.gridButtonCount}>
                  {monthData.totalCount}{' '}
                  {monthData.totalCount === 1 ? 'item' : 'items'}
                </Text>
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
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
  },
  buttonsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  gridButton: {
    width: (width - 60) / 3,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    aspectRatio: 1,
  },
  disabledButton: {
    opacity: 0.5,
  },
  gridButtonGradient: {
    flex: 1,
    justifyContent: 'center',
    alignContent: 'center',
    margin: 16,
  },
  gridButtonContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  gridButtonIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  gridButtonTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
    width: '100%',
  },
  gridButtonCount: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
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
