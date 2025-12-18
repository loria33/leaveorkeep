import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import BannerAdManager from '../utils/BannerAdManager';

interface BannerAdComponentProps {
  style?: any;
}

const BannerAdComponent: React.FC<BannerAdComponentProps> = ({ style }) => {
  const [shouldShowAd, setShouldShowAd] = useState(false);
  const [adKey, setAdKey] = useState(0);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    // Check premium status on mount and when it changes
    const checkPremiumStatus = async () => {
      // Reload premium status to ensure it's up to date
      await BannerAdManager.getInstance().reloadPremiumStatus();
      const premiumStatus = BannerAdManager.getInstance().getPremiumStatus();
      setIsPremium(premiumStatus);
      // If user is premium, don't show ads
      if (premiumStatus) {
        setShouldShowAd(false);
      }
    };
    
    checkPremiumStatus();
    
    // Listen for when the BannerAdManager indicates an ad should be shown or hidden
    const adManager = BannerAdManager.getInstance();

    const handleAdShouldShow = async () => {
      // Double-check premium status before showing ad
      await adManager.reloadPremiumStatus();
      const premiumStatus = adManager.getPremiumStatus();
      if (!premiumStatus) {
        setShouldShowAd(true);
        // Force re-render of the ad component
        setAdKey(prev => prev + 1);
      }
    };

    const handleAdShouldHide = () => {
      setShouldShowAd(false);
      // Re-register callbacks after hiding to ensure they stay registered
      // This handles cases where callbacks might be cleared
      setTimeout(() => {
        adManager.setAdShownCallback(handleAdShouldShow);
        adManager.setAdHiddenCallback(handleAdShouldHide);
      }, 50);
    };

    // Set up the callbacks - always register them to ensure they're set
    adManager.setAdShownCallback(handleAdShouldShow);
    adManager.setAdHiddenCallback(handleAdShouldHide);

    // Re-register callbacks when ad is hidden to ensure they stay registered
    // This handles edge cases where callbacks might be cleared
    const checkAndReRegister = () => {
      // Re-register callbacks to ensure they're always set
      adManager.setAdShownCallback(handleAdShouldShow);
      adManager.setAdHiddenCallback(handleAdShouldHide);
    };

    // Re-register after a short delay to handle any timing issues
    const reRegisterTimeout = setTimeout(checkAndReRegister, 100);

    return () => {
      // Clean up callbacks when component unmounts
      clearTimeout(reRegisterTimeout);
      adManager.setAdShownCallback(() => {});
      adManager.setAdHiddenCallback(() => {});
    };
  }, []);

  const handleAdLoaded = () => {
    // Banner ad loaded successfully
  };

  const handleAdFailedToLoad = (error: any) => {
    // Mark ad as hidden and hide the component
    BannerAdManager.getInstance().markAdAsHidden();
    setShouldShowAd(false);
  };

  const handleAdOpened = () => {
    // Banner ad opened
  };

  const handleAdClosed = () => {
    // Mark ad as hidden and hide the component
    BannerAdManager.getInstance().markAdAsHidden();
    setShouldShowAd(false);
  };

  // Don't show ads to premium users
  if (!shouldShowAd || isPremium) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <BannerAd
        key={adKey}
        unitId={BannerAdManager.getInstance().getAdUnitId()}
        size={BannerAdSize.BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: false,
        }}
        onAdLoaded={handleAdLoaded}
        onAdFailedToLoad={handleAdFailedToLoad}
        onAdOpened={handleAdOpened}
        onAdClosed={handleAdClosed}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});

export default BannerAdComponent;
