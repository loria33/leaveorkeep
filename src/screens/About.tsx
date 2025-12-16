import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Switch,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AboutProps {
  onClose: () => void;
  onPreferencesChanged?: () => void;
}

const About: React.FC<AboutProps> = ({ onClose, onPreferencesChanged }) => {
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [hideTimeFilters, setHideTimeFilters] = useState(false);

  const toggleHideDuplicates = async (value: boolean) => {
    setHideDuplicates(value);
    await AsyncStorage.setItem('hideDuplicates', JSON.stringify(value));
    onPreferencesChanged?.();
  };

  const toggleHideTimeFilters = async (value: boolean) => {
    setHideTimeFilters(value);
    await AsyncStorage.setItem('hideTimeFilters', JSON.stringify(value));
    onPreferencesChanged?.();
  };

  React.useEffect(() => {
    // Load saved preferences
    const loadPreferences = async () => {
      try {
        const [duplicatesHidden, timeFiltersHidden] = await Promise.all([
          AsyncStorage.getItem('hideDuplicates'),
          AsyncStorage.getItem('hideTimeFilters'),
        ]);

        if (duplicatesHidden) {
          setHideDuplicates(JSON.parse(duplicatesHidden));
        }
        if (timeFiltersHidden) {
          setHideTimeFilters(JSON.parse(timeFiltersHidden));
        }
      } catch (error) {
        console.log('Error loading preferences:', error);
      }
    };

    loadPreferences();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5dc" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>About</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display Settings</Text>

          {/* Hide Duplicates Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Hide Duplicate Filters</Text>
              <Text style={styles.settingDescription}>
                Hide the duplicate photos and videos cards from the main screen
              </Text>
            </View>
            <Switch
              value={hideDuplicates}
              onValueChange={toggleHideDuplicates}
              trackColor={{ false: '#e0e0e0', true: '#4ECDC4' }}
              thumbColor={hideDuplicates ? '#ffffff' : '#f4f3f4'}
            />
          </View>

          {/* Hide Time Filters Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Hide Time Filters</Text>
              <Text style={styles.settingDescription}>
                Hide the time filter buttons (Today, Yesterday, This Week, This
                Month)
              </Text>
            </View>
            <Switch
              value={hideTimeFilters}
              onValueChange={toggleHideTimeFilters}
              trackColor={{ false: '#e0e0e0', true: '#4ECDC4' }}
              thumbColor={hideTimeFilters ? '#ffffff' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About KeepFlick</Text>
          <Text style={styles.sectionText}>
            KeepFlick is a powerful photo and video management app designed to
            help you organize and clean up your media library.
          </Text>
          <Text style={styles.sectionText}>Features include:</Text>
          <Text style={styles.bulletPoint}>• Month-based organization</Text>
          <Text style={styles.bulletPoint}>
            • Duplicate detection for photos and videos
          </Text>
          <Text style={styles.bulletPoint}>• Time-based filtering</Text>
          <Text style={styles.bulletPoint}>• Trash management</Text>
          <Text style={styles.bulletPoint}>
            • Media viewer with swipe navigation
          </Text>
        </View>

        {/* Version Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Information</Text>
          <Text style={styles.versionText}>Version 1.1.0</Text>
          <Text style={styles.copyrightText}>© 2024 KeepFlick</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5dc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26, 26, 26, 0.1)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(26, 26, 26, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginVertical: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(26, 26, 26, 0.8)',
    marginBottom: 8,
  },
  bulletPoint: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(26, 26, 26, 0.8)',
    marginLeft: 16,
    marginBottom: 4,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26, 26, 26, 0.1)',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: 'rgba(26, 26, 26, 0.7)',
    lineHeight: 20,
  },
  versionText: {
    fontSize: 16,
    color: 'rgba(26, 26, 26, 0.8)',
    marginBottom: 4,
  },
  copyrightText: {
    fontSize: 14,
    color: 'rgba(26, 26, 26, 0.6)',
  },
});

export default About;
