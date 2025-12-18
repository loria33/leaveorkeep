import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import InAppPurchaseManager from '../utils/InAppPurchaseManager';
import { useMedia } from '../context/MediaContext';

const backgroundImagePink = require('../assets/bg.png');
const backgroundImageBlue = require('../assets/bg2.jpg');

interface AboutProps {
  onClose?: () => void;
  onPreferencesChanged?: () => void;
}

const About: React.FC<AboutProps> = ({ onClose, onPreferencesChanged }) => {
  const { setPremiumStatus: setMediaPremiumStatus } = useMedia();
  const [hideTimeFilters, setHideTimeFilters] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [skin, setSkin] = useState<'pink' | 'blue'>('blue');

  const toggleHideTimeFilters = async (value: boolean) => {
    setHideTimeFilters(value);
    await AsyncStorage.setItem('hideTimeFilters', JSON.stringify(value));
    onPreferencesChanged?.();
  };

  const handleSkinChange = async (newSkin: 'pink' | 'blue') => {
    setSkin(newSkin);
    await AsyncStorage.setItem('skin', newSkin);
    onPreferencesChanged?.();
  };

  React.useEffect(() => {
    // Load saved preferences and premium status
    const loadPreferences = async () => {
      try {
        const timeFiltersHidden = await AsyncStorage.getItem('hideTimeFilters');

        if (timeFiltersHidden) {
          setHideTimeFilters(JSON.parse(timeFiltersHidden));
        }

        const savedSkin = await AsyncStorage.getItem('skin');
        if (savedSkin === 'pink' || savedSkin === 'blue') {
          setSkin(savedSkin);
        }

        // Initialize IAP and check premium status
        const iapManager = InAppPurchaseManager.getInstance();
        await iapManager.initialize();
        const premiumStatus = await iapManager.checkPremiumStatus();
        setIsPremium(premiumStatus);
        // Sync with MediaContext
        await setMediaPremiumStatus(premiumStatus);
        setIsInitializing(false);
      } catch (error) {
        setIsInitializing(false);
      }
    };

    loadPreferences();
  }, []);

  const handlePurchaseRemoveAds = async () => {
    if (isPremium) {
      Alert.alert(
        'Already Premium',
        'You already have Premium features enabled. Enjoy your unlimited, ad-free experience!',
      );
      return;
    }

    setIsLoadingPurchase(true);
    try {
      const iapManager = InAppPurchaseManager.getInstance();
      const success = await iapManager.purchaseRemoveAds();

      if (success) {
        // Purchase will be handled by the purchase listener
        // Check status after a short delay
        setTimeout(async () => {
          const premiumStatus = await iapManager.checkPremiumStatus();
          setIsPremium(premiumStatus);
          // Sync with MediaContext
          await setMediaPremiumStatus(premiumStatus);
          setIsLoadingPurchase(false);
          if (premiumStatus) {
            Alert.alert(
              'Success',
              'Premium activated! Enjoy unlimited views and an ad-free experience.',
            );
          }
        }, 1000);
      } else {
        setIsLoadingPurchase(false);
      }
    } catch (error: any) {
      setIsLoadingPurchase(false);
      Alert.alert(
        'Purchase Failed',
        error.message || 'Unable to complete the purchase. Please try again.',
      );
    }
  };

  const handleRestorePurchases = async () => {
    setIsLoadingPurchase(true);
    try {
      const iapManager = InAppPurchaseManager.getInstance();
      const restored = await iapManager.restorePurchases();

      if (restored) {
        const premiumStatus = await iapManager.checkPremiumStatus();
        setIsPremium(premiumStatus);
        // Sync with MediaContext
        await setMediaPremiumStatus(premiumStatus);
        Alert.alert('Success', 'Your purchases have been restored.');
      } else {
        Alert.alert(
          'No Purchases Found',
          'No previous purchases were found to restore.',
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Restore Failed',
        error.message || 'Unable to restore purchases. Please try again.',
      );
    } finally {
      setIsLoadingPurchase(false);
    }
  };

  const backgroundImage =
    skin === 'blue' ? backgroundImageBlue : backgroundImagePink;

  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      {skin === 'blue' && <View style={styles.blueTintOverlay} />}
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        {/* Header */}
        <View style={styles.header}>
          <Text
            style={[
              styles.headerTitle,
              skin === 'blue' && { color: '#ffffff' },
            ]}
          >
            About
          </Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          bounces={true}
          scrollEnabled={true}
          nestedScrollEnabled={true}
        >
          {/* Premium Section */}
          <View style={styles.section}>
            <View style={styles.premiumHeaderRow}>
              <Text
                style={[
                  styles.premiumTitle,
                  skin === 'blue' && { color: '#ffffff' },
                ]}
              >
                Go Premium
              </Text>
              {!isPremium && (
                <TouchableOpacity
                  style={[
                    styles.purchaseButton,
                    isLoadingPurchase && styles.purchaseButtonDisabled,
                  ]}
                  onPress={handlePurchaseRemoveAds}
                  disabled={isLoadingPurchase || isInitializing}
                >
                  {isLoadingPurchase ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.purchaseButtonText}>
                      Upgrade to Premium
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
            <Text
              style={[
                styles.sectionText,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
              ]}
            >
              Unlock unlimited views and remove all advertisements. Browse your
              photos and videos without any interruptions or restrictions.
            </Text>

            {isPremium ? (
              <View style={styles.premiumBadge}>
                <Text style={styles.premiumBadgeText}>✓ Premium Active</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={handleRestorePurchases}
                disabled={isLoadingPurchase || isInitializing}
              >
                <Text style={styles.restoreButtonText}>Restore Purchases</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Settings Section */}
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                skin === 'blue' && { color: '#ffffff' },
              ]}
            >
              Display Settings
            </Text>

            {/* Hide Time Filters Toggle */}
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text
                  style={[
                    styles.settingTitle,
                    skin === 'blue' && { color: '#ffffff' },
                  ]}
                >
                  Hide Time Filters
                </Text>
                <Text
                  style={[
                    styles.settingDescription,
                    skin === 'blue' && { color: 'rgba(255, 255, 255, 0.8)' },
                  ]}
                >
                  Hide the time filter buttons (Today, Yesterday, This Week,
                  This Month)
                </Text>
              </View>
              <Switch
                value={hideTimeFilters}
                onValueChange={toggleHideTimeFilters}
                trackColor={{ false: '#e0e0e0', true: '#4ECDC4' }}
                thumbColor={hideTimeFilters ? '#ffffff' : '#f4f3f4'}
              />
            </View>

            {/* Skin Selection */}
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text
                  style={[
                    styles.settingTitle,
                    skin === 'blue' && { color: '#ffffff' },
                  ]}
                >
                  Theme
                </Text>
                <Text
                  style={[
                    styles.settingDescription,
                    skin === 'blue' && { color: 'rgba(255, 255, 255, 0.8)' },
                  ]}
                >
                  Choose between pink or blue background theme
                </Text>
              </View>
              <View style={styles.skinSelector}>
                <TouchableOpacity
                  style={[
                    styles.skinOption,
                    skin === 'pink' && styles.skinOptionActive,
                  ]}
                  onPress={() => handleSkinChange('pink')}
                >
                  <Text
                    style={[
                      styles.skinOptionText,
                      skin === 'pink' && styles.skinOptionTextActive,
                    ]}
                  >
                    Pink
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.skinOption,
                    skin === 'blue' && styles.skinOptionActive,
                  ]}
                  onPress={() => handleSkinChange('blue')}
                >
                  <Text
                    style={[
                      styles.skinOptionText,
                      skin === 'blue' && styles.skinOptionTextActive,
                    ]}
                  >
                    Blue
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* About Section */}
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                skin === 'blue' && { color: '#ffffff' },
              ]}
            >
              About KeepFlick
            </Text>
            <Text
              style={[
                styles.sectionText,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
              ]}
            >
              KeepFlick is a powerful photo and video management app designed to
              help you organize and clean up your media library.
            </Text>
            <Text
              style={[
                styles.sectionText,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
              ]}
            >
              Features include:
            </Text>
            <Text
              style={[
                styles.bulletPoint,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
              ]}
            >
              • Month-based organization
            </Text>
            <Text
              style={[
                styles.bulletPoint,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
              ]}
            >
              • Time-based filtering
            </Text>
            <Text
              style={[
                styles.bulletPoint,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
              ]}
            >
              • Trash management
            </Text>
            <Text
              style={[
                styles.bulletPoint,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
              ]}
            >
              • Media viewer with swipe navigation
            </Text>
          </View>

          {/* Version Info */}
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                skin === 'blue' && { color: '#ffffff' },
              ]}
            >
              App Information
            </Text>
            <Text
              style={[
                styles.versionText,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.9)' },
              ]}
            >
              Version 1.1.0
            </Text>
            <Text
              style={[
                styles.copyrightText,
                skin === 'blue' && { color: 'rgba(255, 255, 255, 0.7)' },
              ]}
            >
              © 2026 KeepFlick
            </Text>
          </View>
        </ScrollView>
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
    paddingVertical: 16,
    borderTopWidth: 12,
    borderTopColor: '#00D9FF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00D9FF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  section: {
    marginVertical: 24,
  },
  premiumHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  premiumTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
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
  purchaseButton: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 0,
    flexShrink: 0,
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  restoreButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  restoreButtonText: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  premiumBadge: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  premiumBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  benefitsContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  benefitItem: {
    fontSize: 15,
    lineHeight: 24,
    color: 'rgba(26, 26, 26, 0.8)',
    marginBottom: 8,
    paddingLeft: 4,
  },
  skinSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  skinOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(26, 26, 26, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  skinOptionActive: {
    borderColor: '#4ECDC4',
    backgroundColor: '#4ECDC4',
  },
  skinOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(26, 26, 26, 0.8)',
  },
  skinOptionTextActive: {
    color: '#ffffff',
  },
  blueTintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(230, 240, 248, 0.22)',
  },
});

export default About;
