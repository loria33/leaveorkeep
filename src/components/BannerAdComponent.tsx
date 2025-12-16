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

  useEffect(() => {
    // Listen for when the BannerAdManager indicates an ad should be shown
    const adManager = BannerAdManager.getInstance();

    const handleAdShouldShow = () => {
      setShouldShowAd(true);
      // Force re-render of the ad component
      setAdKey(prev => prev + 1);
    };

    // Set up the callback
    adManager.setAdShownCallback(handleAdShouldShow);

    return () => {
      // Clean up callback when component unmounts
      adManager.setAdShownCallback(() => {});
    };
  }, []);

  const handleAdLoaded = () => {
    console.log('Banner ad loaded successfully');
  };

  const handleAdFailedToLoad = (error: any) => {
    console.log('Banner ad failed to load:', error);
    // Mark ad as hidden so user can continue
    BannerAdManager.getInstance().markAdAsHidden();
  };

  const handleAdOpened = () => {
    console.log('Banner ad opened');
  };

  const handleAdClosed = () => {
    console.log('Banner ad closed');
    // Mark ad as hidden so user can continue
    BannerAdManager.getInstance().markAdAsHidden();
  };

  if (!shouldShowAd) {
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
