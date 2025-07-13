import {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * InterstitialAdManager - Handles interstitial ad loading and display
 *
 * Features:
 * - Loads ad after every 5 swipes
 * - Respects premium user status
 * - Uses test IDs for development
 * - Handles ad events and errors
 * - Supports custom actions when ads are closed
 */
class InterstitialAdManager {
  private static instance: InterstitialAdManager;
  private interstitialAd: InterstitialAd | null = null;
  private swipeCount = 0;
  private readonly SWIPES_BEFORE_AD = 5;
  private isAdLoaded = false;
  private isAdLoading = false;
  private isPremiumUser = false;
  private isAdCurrentlyShowing = false;
  private onAdClosedCallback: (() => void) | null = null;

  // Automatically use test ID in development, production ID in release
  private readonly AD_UNIT_ID = 'ca-app-pub-5483809755530109/2090268216'; // Production Ad Unit ID

  private constructor() {
    this.initializeAd();
    this.loadPremiumStatus();
  }

  public static getInstance(): InterstitialAdManager {
    if (!InterstitialAdManager.instance) {
      InterstitialAdManager.instance = new InterstitialAdManager();
    }
    return InterstitialAdManager.instance;
  }

  /**
   * Initialize the interstitial ad
   */
  private initializeAd(): void {
    try {
      this.interstitialAd = InterstitialAd.createForAdRequest(this.AD_UNIT_ID, {
        requestNonPersonalizedAdsOnly: false,
      });

      this.setupAdEventListeners();
      this.loadAd();
    } catch (error) {
      // Ad initialization failed
    }
  }

  /**
   * Set up ad event listeners
   */
  private setupAdEventListeners(): void {
    if (!this.interstitialAd) return;

    this.interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
      this.isAdLoaded = true;
      this.isAdLoading = false;
    });

    this.interstitialAd.addAdEventListener(AdEventType.ERROR, error => {
      this.isAdLoaded = false;
      this.isAdLoading = false;
      this.isAdCurrentlyShowing = false;
    });

    this.interstitialAd.addAdEventListener(AdEventType.OPENED, () => {
      this.isAdCurrentlyShowing = true;
    });

    this.interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
      this.isAdLoaded = false;
      this.isAdCurrentlyShowing = false;

      // Trigger the callback to go to next item
      if (this.onAdClosedCallback) {
        this.onAdClosedCallback();
        this.onAdClosedCallback = null; // Reset callback
      }

      // Load next ad
      this.loadAd();
    });

    this.interstitialAd.addAdEventListener(AdEventType.CLICKED, () => {
      // Ad clicked
    });
  }

  /**
   * Load the interstitial ad
   */
  private loadAd(): void {
    if (!this.interstitialAd || this.isAdLoading || this.isAdLoaded) {
      return;
    }

    try {
      this.isAdLoading = true;
      this.interstitialAd.load();
    } catch (error) {
      this.isAdLoading = false;
    }
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
   * Set the callback to be triggered when ad is closed
   */
  public setAdClosedCallback(callback: () => void): void {
    this.onAdClosedCallback = callback;
  }

  /**
   * Handle swipe event and show ad if conditions are met
   * Now accepts a callback for when the ad is closed
   */
  public async handleSwipe(onAdClosed?: () => void): Promise<void> {
    // Don't count swipes while an ad is showing
    if (this.isAdCurrentlyShowing) {
      return;
    }

    // Don't show ads to premium users
    if (this.isPremiumUser) {
      return;
    }

    this.swipeCount++;

    // Show ad every 5 swipes
    if (this.swipeCount >= this.SWIPES_BEFORE_AD) {
      if (onAdClosed) {
        this.setAdClosedCallback(onAdClosed);
      }
      await this.showAd();
      this.swipeCount = 0; // Reset counter
    }
  }

  /**
   * Show the interstitial ad
   */
  private async showAd(): Promise<void> {
    if (!this.interstitialAd || !this.isAdLoaded) {
      return;
    }

    try {
      await this.interstitialAd.show();
    } catch (error) {
      this.isAdCurrentlyShowing = false;
    }
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
   * Force load ad (for debugging)
   */
  public forceLoadAd(): void {
    this.loadAd();
  }

  /**
   * Check if ad is ready
   */
  public isAdReady(): boolean {
    return this.isAdLoaded;
  }
}

export default InterstitialAdManager;
