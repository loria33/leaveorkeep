import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  purchaseUpdatedListener,
  purchaseErrorListener,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  Product,
  Purchase,
} from 'react-native-iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BannerAdManager from './BannerAdManager';

/**
 * InAppPurchaseManager - Handles in-app purchases for removing ads
 *
 * Features:
 * - Manages remove ads purchase
 * - Syncs premium status with BannerAdManager
 * - Handles purchase restoration
 * - Validates purchases
 */
class InAppPurchaseManager {
  private static instance: InAppPurchaseManager;
  private purchaseUpdateSubscription: any = null;
  private purchaseErrorSubscription: any = null;
  private isInitialized = false;

  // Product ID for remove ads (you'll need to set this in App Store Connect / Google Play Console)
  // For testing, use: 'android.test.purchased' (Android) or a test product ID (iOS)
  private readonly REMOVE_ADS_PRODUCT_ID = Platform.select({
    ios: 'leavem.keepem', // Replace with your actual iOS product ID
    android: 'com.keepflick.removeads', // Replace with your actual Android product ID
  });

  private constructor() {}

  public static getInstance(): InAppPurchaseManager {
    if (!InAppPurchaseManager.instance) {
      InAppPurchaseManager.instance = new InAppPurchaseManager();
    }
    return InAppPurchaseManager.instance;
  }

  /**
   * Initialize the IAP connection
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      await initConnection();
      this.setupPurchaseListeners();
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize IAP:', error);
      return false;
    }
  }

  /**
   * Setup purchase update and error listeners
   */
  private setupPurchaseListeners(): void {
    // Listen for successful purchases
    this.purchaseUpdateSubscription = purchaseUpdatedListener(
      async (purchase: Purchase) => {
        try {
          // Verify and process the purchase
          await this.handlePurchase(purchase);
          // Finish the transaction
          await finishTransaction({ purchase, isConsumable: false });
        } catch (error) {
          console.error('Error processing purchase:', error);
        }
      },
    );

    // Listen for purchase errors
    this.purchaseErrorSubscription = purchaseErrorListener(error => {
      console.error('Purchase error:', error);
    });
  }

  /**
   * Handle a successful purchase
   */
  private async handlePurchase(purchase: Purchase): Promise<void> {
    if (purchase.productId === this.REMOVE_ADS_PRODUCT_ID) {
      // Set premium status
      await this.setPremiumStatus(true);
    }
  }

  /**
   * Get available products
   */
  public async getProducts(): Promise<Product[]> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const productIds = [this.REMOVE_ADS_PRODUCT_ID].filter(
        Boolean,
      ) as string[];
      const result = await fetchProducts({ skus: productIds });
      // Handle different return types
      if (Array.isArray(result)) {
        return result as Product[];
      }
      return [];
    } catch (error) {
      console.error('Error getting products:', error);
      return [];
    }
  }

  /**
   * Request purchase for remove ads
   */
  public async purchaseRemoveAds(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // First, fetch products to ensure they're available
      const products = await this.getProducts();
      if (products.length === 0) {
        throw new Error(
          'Product not available. Please check your App Store/Play Store configuration.',
        );
      }

      // Check if product exists (handle both iOS and Android product types)
      // In react-native-iap v14, Product type uses 'id' field, not 'productId'
      const product = products.find(p => {
        // Try multiple possible field names for product ID
        const productId =
          (p as any).id || (p as any).productId || (p as any).sku;
        const matches = productId === this.REMOVE_ADS_PRODUCT_ID;
        return matches;
      });

      if (!product) {
        console.error('[IAP] Product not found. Available products:', products);
        throw new Error('Premium product not found. Please try again later.');
      }

      // Request purchase with proper configuration for react-native-iap v14
      // The API expects { request: { ios: { sku } } or { android: { skus: [] } } }
      const productId = this.REMOVE_ADS_PRODUCT_ID;
      if (!productId) {
        throw new Error('Product ID is not configured.');
      }

      if (Platform.OS === 'ios') {
        await requestPurchase({
          request: {
            ios: { sku: productId },
          },
          type: 'in-app',
        });
      } else {
        // Android
        await requestPurchase({
          request: {
            android: { skus: [productId] },
          },
          type: 'in-app',
        });
      }

      return true;
    } catch (error: any) {
      console.error('Error requesting purchase:', error);
      if (error.code === 'E_USER_CANCELLED') {
        // User cancelled - not an error
        return false;
      }
      throw error;
    }
  }

  /**
   * Restore previous purchases
   */
  public async restorePurchases(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const purchases = await getAvailablePurchases();
      let hasRemoveAds = false;

      for (const purchase of purchases) {
        if (purchase.productId === this.REMOVE_ADS_PRODUCT_ID) {
          await this.handlePurchase(purchase);
          hasRemoveAds = true;
        }
      }

      return hasRemoveAds;
    } catch (error) {
      console.error('Error restoring purchases:', error);
      return false;
    }
  }

  /**
   * Set premium status and sync with BannerAdManager
   */
  private async setPremiumStatus(isPremium: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem('isPremiumUser', isPremium.toString());
      await BannerAdManager.getInstance().setPremiumStatus(isPremium);
      // Reload to ensure it's synced
      await BannerAdManager.getInstance().reloadPremiumStatus();
    } catch (error) {
      console.error('Error setting premium status:', error);
    }
  }

  /**
   * Check if user has premium (remove ads)
   * First checks local storage, then queries Apple/Google servers to verify
   */
  public async checkPremiumStatus(): Promise<boolean> {
    try {
      // First check local storage for quick response
      const localPremiumStatus = await AsyncStorage.getItem('isPremiumUser');
      const isLocalPremium = localPremiumStatus === 'true';

      // Also verify with Apple/Google servers to ensure accuracy
      // This handles cases where user reinstalled app or is on a new device
      if (!this.isInitialized) {
        await this.initialize();
      }

      try {
        const purchases = await getAvailablePurchases();
        const hasValidPurchase = purchases.some(
          purchase => purchase.productId === this.REMOVE_ADS_PRODUCT_ID,
        );

        // If server says they have premium but local doesn't, update local
        if (hasValidPurchase && !isLocalPremium) {
          await this.setPremiumStatus(true);
          return true;
        }

        // If local says premium but server doesn't, trust the server (purchase might have been refunded)
        if (isLocalPremium && !hasValidPurchase) {
          await this.setPremiumStatus(false);
          return false;
        }

        // Both agree, use the value
        await BannerAdManager.getInstance().setPremiumStatus(isLocalPremium);
        return isLocalPremium;
      } catch (serverError) {
        // If server query fails, fall back to local storage
        console.warn(
          'Failed to verify purchase with server, using local status:',
          serverError,
        );
        await BannerAdManager.getInstance().setPremiumStatus(isLocalPremium);
        return isLocalPremium;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Clean up connections
   */
  public async endConnection(): Promise<void> {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
      this.purchaseUpdateSubscription = null;
    }

    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
      this.purchaseErrorSubscription = null;
    }

    if (this.isInitialized) {
      await endConnection();
      this.isInitialized = false;
    }
  }
}

export default InAppPurchaseManager;
