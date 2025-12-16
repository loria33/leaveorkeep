import React from 'react';
import {
  BannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View } from 'react-native';

/**
 * BannerAdManager - Handles banner ad display every X clicks
 *
 * Features:
 * - Shows banner ad after every 7 swipes
 * - Respects premium user status
 * - Uses test IDs for development
 * - Handles ad events and errors
 * - Supports custom actions when ads are shown
 */
class BannerAdManager {
  private static instance: BannerAdManager;
  private swipeCount = 0;
  private readonly SWIPES_BEFORE_AD = 7;
  private isPremiumUser = false;
  private isAdCurrentlyShowing = false;
  private onAdShownCallback: (() => void) | null = null;

  // Automatically use test ID in development, production ID in release
  private readonly AD_UNIT_ID = __DEV__
    ? TestIds.BANNER
    : 'ca-app-pub-5483809755530109/7907237492';

  private constructor() {
    this.loadPremiumStatus();
  }

  public static getInstance(): BannerAdManager {
    if (!BannerAdManager.instance) {
      BannerAdManager.instance = new BannerAdManager();
    }
    return BannerAdManager.instance;
  }

  /**
   * Load premium status from AsyncStorage
   */
  private async loadPremiumStatus(): Promise<void> {
    try {
      const premiumStatus = await AsyncStorage.getItem('isPremiumUser');
      this.isPremiumUser = premiumStatus === 'true';
    } catch (error) {
      this.isPremiumUser = false;
    }
  }

  /**
   * Update premium status
   */
  public async setPremiumStatus(isPremium: boolean): Promise<void> {
    try {
      this.isPremiumUser = isPremium;
      await AsyncStorage.setItem('isPremiumUser', isPremium.toString());
    } catch (error) {
      // Failed to save premium status
    }
  }

  /**
   * Get current premium status
   */
  public getPremiumStatus(): boolean {
    return this.isPremiumUser;
  }

  /**
   * Check if an ad is currently showing
   */
  public isCurrentlyShowing(): boolean {
    return this.isAdCurrentlyShowing;
  }

  /**
   * Set the callback to be triggered when ad is shown
   */
  public setAdShownCallback(callback: () => void): void {
    this.onAdShownCallback = callback;
  }

  /**
   * Handle swipe event and show banner ad if conditions are met
   * Now accepts a callback for when the ad is shown
   */
  public async handleSwipe(onAdShown?: () => void): Promise<boolean> {
    // Don't count swipes while an ad is showing
    if (this.isAdCurrentlyShowing) {
      return false;
    }

    // Don't show ads to premium users
    if (this.isPremiumUser) {
      return false;
    }

    this.swipeCount++;

    // Show ad every 7 swipes
    if (this.swipeCount >= this.SWIPES_BEFORE_AD) {
      if (onAdShown) {
        this.setAdShownCallback(onAdShown);
      }
      this.isAdCurrentlyShowing = true;
      this.swipeCount = 0; // Reset counter

      // Trigger the callback to indicate ad should be shown
      if (this.onAdShownCallback) {
        this.onAdShownCallback();
        this.onAdShownCallback = null; // Reset callback
      }

      return true; // Indicate that banner ad should be shown
    }

    return false;
  }

  /**
   * Create a banner ad component
   */
  public createBannerAd(): React.JSX.Element {
    return (
      <BannerAd
        unitId={this.AD_UNIT_ID}
        size={BannerAdSize.BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: false,
        }}
        onAdLoaded={() => {
          // Banner ad loaded successfully
        }}
        onAdFailedToLoad={error => {
          // Banner ad failed to load
          this.isAdCurrentlyShowing = false;
        }}
        onAdOpened={() => {
          // Banner ad opened
        }}
        onAdClosed={() => {
          // Banner ad closed
          this.isAdCurrentlyShowing = false;
        }}
      />
    );
  }

  /**
   * Mark ad as no longer showing (call this when banner is removed from UI)
   */
  public markAdAsHidden(): void {
    this.isAdCurrentlyShowing = false;
  }

  /**
   * Get current swipe count (for debugging)
   */
  public getSwipeCount(): number {
    return this.swipeCount;
  }

  /**
   * Reset swipe count (for debugging)
   */
  public resetSwipeCount(): void {
    this.swipeCount = 0;
  }

  /**
   * Check if ad should be shown
   */
  public shouldShowAd(): boolean {
    return this.isAdCurrentlyShowing && !this.isPremiumUser;
  }
}

export default BannerAdManager;
