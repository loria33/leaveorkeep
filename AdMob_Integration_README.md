# AdMob Integration Guide for LeaveOrKeep

## Overview

This document explains how AdMob has been integrated into the LeaveOrKeep React Native app to show interstitial ads after every 5 swipes.

## Setup Complete ✅

### 1. Package Installation

- ✅ `react-native-google-mobile-ads` installed
- ✅ iOS pods installed (`pod install`)

### 2. iOS Configuration

- ✅ **Info.plist** updated with:
  - AdMob App ID: `ca-app-pub-3940256099942544~1458002511` (Google's test App ID)
  - App Tracking Transparency permission description
  - SKAdNetworkItems for iOS 14.5+ attribution

### 3. Code Implementation

- ✅ **InterstitialAdManager** singleton class created
- ✅ **MediaViewer** component updated to track swipes
- ✅ **MediaContext** updated with premium user support
- ✅ **App.tsx** updated with AdMob initialization

## How It Works

### Ad Display Logic

1. **Swipe Tracking**: Every horizontal swipe (left/right) in the MediaViewer is tracked
2. **Ad Frequency**: After every 5 swipes, an interstitial ad is shown
3. **Premium Users**: Premium users never see ads
4. **Ad Loading**: Ads are preloaded in the background for smooth experience
5. **Smart Ad Behavior**:
   - Ads automatically close and navigate to the next item
   - Swipes are not counted while an ad is showing
   - No manual interaction needed - seamless navigation continues
   - Gestures are ignored while ads are displayed

### Premium User System

- Premium status is stored in AsyncStorage
- Use `setPremiumStatus(true)` to make a user premium
- Premium users bypass all ad displays

## Testing vs Production

### Current Setup (Smart Auto-Switching)

The app is configured to **automatically** switch between test and production IDs:

```typescript
// In src/utils/InterstitialAdManager.ts
private readonly AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL // Test ID for development
  : 'your-production-ad-unit-id'; // Production ID for release
```

**Benefits:**

- ✅ Test ads in development builds
- ✅ Production ads in release builds
- ✅ No manual switching required
- ✅ No risk of accidentally shipping test IDs

### Test IDs Reference

For development, the app uses these official Google test IDs:

**Test App ID (in Info.plist):**

- iOS: `ca-app-pub-3940256099942544~1458002511`

**Test Ad Unit IDs (in code):**

| Ad Type          | Platform | Test Ad Unit ID                          |
| ---------------- | -------- | ---------------------------------------- |
| **Interstitial** | iOS      | `ca-app-pub-3940256099942544/4411468910` |
| **Banner**       | iOS      | `ca-app-pub-3940256099942544/2934735716` |
| **Rewarded**     | iOS      | `ca-app-pub-3940256099942544/1712485313` |

**Important Distinction:**

- **App ID** (~xxxxxx): Goes in Info.plist, identifies your entire app to AdMob
- **Ad Unit ID** (/xxxxxx): Goes in code, identifies specific ad placements

_Note: `TestIds.INTERSTITIAL` automatically maps to the iOS interstitial test ID above._

### Switching to Production

1. **Get your AdMob App ID**:

   - Go to AdMob console
   - Create an app (if not already created)
   - Get your App ID (format: `ca-app-pub-xxxxxxxxxxxxxxxxxx~yyyyyyyyyy`)

2. **Update Info.plist** with your App ID (note the ~ character):

   ```xml
   <key>GADApplicationIdentifier</key>
   <string>ca-app-pub-xxxxxxxxxxxxxxxxxx~yyyyyyyyyy</string>
   ```

3. **Create Ad Unit**:

   - In AdMob console, create an Interstitial ad unit
   - Get the Ad Unit ID (format: `ca-app-pub-xxxxxxxxxxxxxxxxxx/yyyyyyyyyy`)

4. **Update InterstitialAdManager** with your Ad Unit ID (note the / character):
   ```typescript
   // Simply replace the production ID string
   private readonly AD_UNIT_ID = __DEV__
     ? TestIds.INTERSTITIAL
     : 'ca-app-pub-xxxxxxxxxxxxxxxxxx/yyyyyyyyyy'; // Your actual production Ad Unit ID
   ```

## Usage Examples

### Check Premium Status

```typescript
import { useMedia } from '../context/MediaContext';

const { isPremiumUser, setPremiumStatus } = useMedia();

// Check if user is premium
if (isPremiumUser) {
  // Show premium features
}

// Make user premium
await setPremiumStatus(true);
```

### Ad Manager Direct Access

```typescript
import InterstitialAdManager from '../utils/InterstitialAdManager';

const adManager = InterstitialAdManager.getInstance();

// Check if ad is ready
const isReady = adManager.isAdReady();

// Get current swipe count
const swipeCount = adManager.getSwipeCount();

// Force load ad (for debugging)
adManager.forceLoadAd();
```

## Key Features

### 🎯 Smart Ad Timing

- Ads only show after navigation swipes (not trash swipes)
- 5-swipe threshold prevents ad fatigue
- Ads are preloaded for instant display

### 🔒 Premium User Support

- Easy premium user system
- Ads completely disabled for premium users
- Premium status persists across app restarts

### 📱 iOS 14.5+ Compliance

- App Tracking Transparency properly implemented
- SKAdNetwork identifiers included
- IDFA permission handled gracefully

### 🐛 Debug-Friendly

- Comprehensive logging for ad events
- Test IDs for safe development
- Easy debugging methods

## File Structure

```
src/
├── utils/
│   └── InterstitialAdManager.ts    # Main ad management
├── context/
│   └── MediaContext.tsx            # Premium user state
├── components/
│   └── MediaViewer.tsx             # Swipe tracking
└── screens/
    └── ...
```

## Troubleshooting

### Common Issues

1. **Ads not showing**:

   - Check if user is premium: `isPremiumUser`
   - Verify 5 swipes have occurred
   - Check console logs for ad loading errors

2. **Test ads not loading**:

   - Ensure you're running a development build (`__DEV__ = true`)
   - Check internet connection
   - Verify AdMob SDK initialization
   - Confirm `TestIds.INTERSTITIAL` is being used in dev mode

3. **"SDK was initialized without an application ID" error**:

   - Verify Info.plist has correct App ID format: `ca-app-pub-xxxxxxxxx~yyyyy`
   - For testing, use: `ca-app-pub-3940256099942544~1458002511`
   - App ID (with ~) goes in Info.plist, Ad Unit ID (with /) goes in code

4. **iOS build errors**:
   - Run `cd ios && pod install`
   - Clean build: `cd ios && rm -rf build && cd ..`

### Console Logs

Look for these log prefixes:

- `[AdMob]` - SDK initialization
- `[InterstitialAdManager]` - Ad loading/showing events

## Performance Notes

- Ads are loaded asynchronously
- No impact on image swiping performance
- Premium users have zero ad-related overhead

## Next Steps

1. Test thoroughly with `TestIds.INTERSTITIAL`
2. Create AdMob account and get production IDs
3. Update configuration for production
4. Test with real ads before app store submission

---

**Note**: For production, replace the test App ID `ca-app-pub-3940256099942544~1458002511` in Info.plist and test Ad Unit ID in code with your actual AdMob IDs!
