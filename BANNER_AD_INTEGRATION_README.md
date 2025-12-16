# Banner Ad Integration Guide

This guide explains how to use the new BannerAdManager system that replaces the old InterstitialAdManager.

## Overview

The app now shows **banner ads** instead of **interstitial ads**. Banner ads appear every **7 swipes** and are less intrusive than full-screen interstitial ads.

## Key Changes

### 1. BannerAdManager Class

- **File**: `src/utils/BannerAdManager.ts`
- **Ad Unit ID**: `ca-app-pub-5483809755530109/7907237492` (production)
- **Test ID**: `ca-app-pub-3940256099942544/6300978111` (development)
- **Frequency**: Shows banner ad every 7 swipes

### 2. How It Works

1. **Swipe Counting**: The manager counts swipes in the MediaViewer
2. **Ad Trigger**: After 7 swipes, it triggers a callback to show a banner ad
3. **Ad Display**: The BannerAdComponent listens for this callback and displays the ad
4. **Ad Management**: When the ad is closed or fails to load, it marks the ad as hidden

### 3. Integration Points

#### MediaViewer.tsx

- Uses `BannerAdManager.getInstance().handleSwipe()` to track swipes
- Prevents navigation while ads are showing
- Calls the manager after each swipe to check if an ad should be shown

#### BannerAdComponent.tsx

- Listens for ad display callbacks from BannerAdManager
- Renders the actual banner ad using react-native-google-mobile-ads
- Handles ad lifecycle events (loaded, failed, opened, closed)

## Usage Example

### Basic Integration

```tsx
import BannerAdComponent from '../components/BannerAdComponent';

// In your component's render method
<BannerAdComponent style={styles.adContainer} />;
```

### Custom Ad Placement

```tsx
// Place banner ad at the bottom of the screen
<BannerAdComponent
  style={{
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  }}
/>
```

## Configuration

### Ad Unit IDs

- **Development**: `ca-app-pub-3940256099942544/6300978111`
- **Production**: `ca-app-pub-5483809755530109/7907237492`

### Swipe Frequency

To change how often ads appear, modify the `SWIPES_BEFORE_AD` constant in `BannerAdManager.ts`:

```typescript
private readonly SWIPES_BEFORE_AD = 10; // Show ad every 10 swipes instead of 7
```

### Premium User Handling

Premium users automatically skip all ads:

```typescript
// Check if user is premium
const isPremium = BannerAdManager.getInstance().getPremiumStatus();

// Set premium status
await BannerAdManager.getInstance().setPremiumStatus(true);
```

## Ad Lifecycle

1. **Swipe Detection**: User swipes through media
2. **Counter Increment**: BannerAdManager increments swipe counter
3. **Threshold Check**: When counter reaches 7, triggers ad display
4. **Ad Rendering**: BannerAdComponent renders the banner ad
5. **Ad Events**: Handle ad loaded, failed, opened, closed events
6. **Cleanup**: Mark ad as hidden when done

## Benefits of Banner Ads

- **Less Intrusive**: Don't block the entire screen
- **Better UX**: Users can continue browsing while ads are visible
- **Higher Engagement**: Less likely to be dismissed immediately
- **Better Performance**: No full-screen transitions or loading delays

## Troubleshooting

### Ad Not Showing

1. Check if user is premium (`getPremiumStatus()`)
2. Verify swipe counter is incrementing (`getSwipeCount()`)
3. Ensure BannerAdComponent is properly mounted
4. Check ad unit ID configuration

### Ad Loading Issues

1. Verify network connectivity
2. Check ad unit ID is correct
3. Ensure Google Mobile Ads SDK is properly configured
4. Check console for error messages

### Performance Issues

1. Banner ads are lightweight and shouldn't cause performance issues
2. If problems occur, check ad event handlers for heavy operations
3. Ensure proper cleanup in component unmount

## Migration Notes

- **Old System**: InterstitialAdManager with full-screen ads
- **New System**: BannerAdManager with banner ads
- **Frequency**: Changed from "every 5 swipes" to "every 7 swipes"
- **Ad Type**: Changed from interstitial to banner
- **User Experience**: Less disruptive, more user-friendly

## Testing

### Development Testing

- Use test ad unit ID: `ca-app-pub-3940256099942544/6300978111`
- Test swipe counting and ad display timing
- Verify premium user ad skipping

### Production Testing

- Use production ad unit ID: `ca-app-pub-5483809755530109/7907237492`
- Test with real ad content
- Monitor ad performance and user engagement

## Support

For issues or questions about the banner ad integration:

1. Check the console logs for error messages
2. Verify BannerAdManager configuration
3. Test with different swipe patterns
4. Ensure proper component mounting/unmounting
