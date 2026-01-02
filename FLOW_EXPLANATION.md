# App Flow Explanation: iOS Native ↔ JavaScript

## Overview

This app uses a **lazy-loading architecture** where months are discovered first (without loading photos), and photos are only loaded when a user opens a specific month.

---

## 1. APP STARTUP - Month Discovery

### JavaScript Side (`MediaContext.tsx` → `scanMonthSummariesMethod`)

```
App Starts
  ↓
MediaContext loads
  ↓
scanMonthSummaries() called
  ↓
Calls: fetchMonthsNative() from PhotoMonths.ts
  ↓
Bridge: NativeModules.PhotoMonths.fetchMonths()
```

### iOS Native Side (`PhotoMonths.m` → `fetchMonths`)

```
fetchMonths called
  ↓
1. Creates NSCalendar for date parsing
2. Creates PHFetchOptions with sort by creationDate
3. Fetches ALL assets: PHAsset.fetchAssetsWithOptions()
4. Samples first 500 assets (newest) to find unique months
5. Samples last 500 assets (oldest) to catch older months
6. Extracts year/month from each asset's creationDate
7. Creates monthKey format: "YYYY-MM" (e.g., "2016-11")
8. Builds month summaries with:
   - monthKey: "2016-11"
   - year: 2016
   - month: 11
   - monthName: "November 2016"
   - totalCount: 0 (LAZY - will count later)
   - photoCount: 0 (LAZY)
   - videoCount: 0 (LAZY)
9. Sorts by year/month (newest first)
10. Returns array of month summaries
```

### JavaScript Side (Receives Results)

```
Receives month summaries
  ↓
Removes duplicates by monthKey
  ↓
Sets counts to 0 (lazy loading)
  ↓
Updates monthSummaries state
  ↓
Home.tsx displays month cards (showing "0 items" initially)
```

**Key Point**: No photos are loaded at this stage - only month metadata!

---

## 2. USER PRESSES A MONTH

### JavaScript Side (`Home.tsx` → `handleMonthPress`)

```
User taps month card
  ↓
handleMonthPress(monthKey: "2016-11") called
  ↓
Finds monthSummary from monthSummaries array
  ↓
Creates MonthSelectionData:
  - monthKey: "2016-11"
  - monthName: "November 2016"
  - photoCount: 0 (still lazy)
  - videoCount: 0
  - totalCount: 0
  ↓
Shows MonthSelection modal
```

**MonthSelection Component** displays:

- "0 total items" (because counts are still 0)
- Options: All Media / Photos / Videos

---

## 3. USER SELECTS MEDIA TYPE (e.g., "All Media")

### JavaScript Side (`Home.tsx` → `handleSelectAllMedia`)

```
User taps "All Media"
  ↓
handleSelectAllMedia() called
  ↓
Calls: loadMonthContent(monthKey: "2016-11", limit: 20)
  ↓
MediaContext.loadMonthContentMethod() executes
```

### MediaContext Flow (`MediaContext.tsx` → `loadMonthContentMethod`)

```
1. Validates limit (max 50 items)
2. Updates monthAccessOrder (LRU cache management)
3. Cleans up old months from memory
4. Sets monthContent[monthKey] to loading state
5. Calls: fetchMonthPhotosNative(monthKey, offset: 0, limit: 20)
```

### JavaScript Bridge (`PhotoMonths.ts` → `fetchMonthPhotosNative`)

```
Checks if PhotoMonths module exists
  ↓
Calls: PhotoMonths.fetchMonthPhotos(monthKey, 0, 20)
  ↓
Waits for native promise
```

### iOS Native Side (`PhotoMonths.m` → `fetchMonthPhotos`)

```
fetchMonthPhotos called with:
  - monthKey: "2016-11"
  - offset: 0
  - limit: 20
  ↓
1. Parses monthKey: year=2016, month=11
2. Creates date range:
   - startDate: 2016-11-01 00:00:00
   - endDate: 2016-12-01 00:00:00
3. Creates NSPredicate: "creationDate >= startDate AND creationDate < endDate"
4. Fetches assets in date range: PHAsset.fetchAssetsWithOptions(predicate)
5. Finds 47 assets in this month
6. Iterates from offset (0) up to limit (20):
   - Gets PHAsset at index i
   - Extracts: localIdentifier, creationDate, mediaType
   - Creates MediaItem object:
     {
       id: "DC5954BB-CF62-4497-928A-1C3BBBAA62DD/L0/001",
       uri: "ph://DC5954BB-CF62-4497-928A-1C3BBBAA62DD/L0/001",
       type: "photo" or "video",
       timestamp: 1480230431000,
       source: "Gallery",
       filename: "photo_DC5954BB..."
     }
7. Returns array of 20 MediaItems (or less if fewer available)
```

### JavaScript Side (Receives Results)

```
Receives 20 MediaItems
  ↓
Limits to MAX_ITEMS_PER_MONTH (50)
  ↓
Checks if month summary has totalCount === 0 (lazy loaded)
  ↓
If yes, calls fetchMonthCountNative(monthKey) to get actual counts
```

### iOS Native Side (`PhotoMonths.m` → `fetchMonthCount`)

```
fetchMonthCount called
  ↓
1. Parses monthKey
2. Creates same date range predicate
3. Counts photos: PHAsset.fetchAssetsWithMediaType(PHAssetMediaTypeImage)
4. Counts videos: PHAsset.fetchAssetsWithMediaType(PHAssetMediaTypeVideo)
5. Returns: { totalCount: 47, photoCount: 45, videoCount: 2 }
```

### JavaScript Side (Updates Counts)

```
Receives counts: { totalCount: 47, photoCount: 45, videoCount: 2 }
  ↓
Updates monthSummaries state:
  - Sets totalCount: 47
  - Sets photoCount: 45
  - Sets videoCount: 2
  ↓
Updates monthContent[monthKey]:
  - items: [20 MediaItems]
  - hasMore: true (47 > 20)
  - nextOffset: 20
  - isLoading: false
  ↓
Returns 20 MediaItems
```

### Home.tsx (Opens Viewer)

```
Receives 20 MediaItems
  ↓
Filters by selectedMediaType (if needed)
  ↓
Finds first unviewed item index
  ↓
Sets viewerVisible = true
  ↓
Passes items to MediaViewer component
```

---

## 4. IMAGE DISPLAY

### MediaViewer Component (`MediaViewer.tsx`)

```
MediaViewer receives:
  - items: [20 MediaItems]
  - initialIndex: 0
  - monthKey: "2016-11"
  ↓
Initializes state:
  - currentIndex: 0
  - items: [20 MediaItems]
  ↓
Gets currentItem = items[0]
  ↓
Renders image based on item.type
```

### For Photos (URIs starting with `ph://`)

```
currentItem.uri = "ph://DC5954BB-CF62-4497-928A-1C3BBBAA62DD/L0/001"
  ↓
Checks: uri.startsWith('ph://') ? true
  ↓
Uses React Native's Image component (NOT FastImage)
  ↓
<Image source={{ uri: "ph://..." }} />
  ↓
React Native's Image handles ph:// URIs natively
  ↓
iOS Photos framework resolves ph:// URI to actual image
  ↓
Image displays
```

### For Videos

```
currentItem.type = "video"
  ↓
Uses react-native-video component
  ↓
<Video source={{ uri: "ph://..." }} />
  ↓
Video player loads and displays
```

### Why `ph://` URIs?

- `ph://` is iOS Photos framework's URI scheme
- Format: `ph://{localIdentifier}`
- React Native's `Image` component supports `ph://` natively
- FastImage does NOT support `ph://` (that's why images were black!)
- The native iOS Photos framework resolves these URIs to actual image data

---

## 5. LOADING MORE ITEMS (When User Scrolls)

### MediaViewer (`MediaViewer.tsx`)

```
User swipes to item at index 5
  ↓
useEffect detects currentIndex === 5
  ↓
Checks: items.length < 50 && hasMore
  ↓
Calls: loadMoreMonthContent(monthKey, 10)
```

### MediaContext (`MediaContext.tsx` → `loadMoreMonthContentMethod`)

```
1. Gets current monthContent[monthKey]
2. Calculates offset = current.items.length (20)
3. Calls: fetchMonthPhotosNative(monthKey, offset: 20, limit: 10)
```

### iOS Native Side

```
Same fetchMonthPhotos process
  ↓
Starts from offset 20
  ↓
Returns next 10 items (items 20-29)
```

### JavaScript Side

```
Receives 10 more items
  ↓
Appends to existing items: [...currentItems, ...newItems]
  ↓
Limits to 50 total
  ↓
Updates monthContent[monthKey].items
  ↓
MediaViewer useEffect detects change
  ↓
Updates local items state
  ↓
User can now see items 0-29
```

---

## 6. MEMORY MANAGEMENT

### LRU Cache System

```
Only keeps 3 months in memory at a time
  ↓
When 4th month is opened:
  1. Removes least recently used month
  2. Keeps 3 most recently accessed months
  ↓
Prevents memory bloat
```

### Item Limits

```
- MAX_ITEMS_PER_MONTH: 50 items
- MAX_MONTHS_IN_MEMORY: 3 months
- MAX_ITEMS_IN_VIEWER: 50 items
```

---

## KEY ARCHITECTURAL DECISIONS

### 1. Lazy Loading

- Months discovered without loading photos
- Counts set to 0 initially
- Counts calculated when month is opened
- Prevents memory spike at startup

### 2. Native-First Approach

- Uses iOS Photos framework directly
- More efficient than JavaScript scanning
- Date range predicates for fast filtering
- Batch loading (20 items at a time)

### 3. Memory Optimization

- Limits items per month (50)
- Limits months in memory (3)
- LRU eviction of old months
- Clears FastImage cache on viewer close

### 4. URI Handling

- Uses `ph://` URIs for iOS Photos
- React Native Image for `ph://` URIs
- FastImage for file:// URIs (Android/other)

---

## DATA FLOW SUMMARY

```
iOS Photos Library
  ↓
PhotoMonths.m (Native Module)
  ↓
PhotoMonths.ts (TypeScript Bridge)
  ↓
MediaContext.tsx (State Management)
  ↓
Home.tsx (UI)
  ↓
MediaViewer.tsx (Image Display)
  ↓
React Native Image/Video Components
  ↓
iOS Photos Framework (resolves ph:// URIs)
  ↓
Displayed Image/Video
```

---

## DEBUGGING TIPS

### Check Native Logs (Xcode Console)

- Look for `[PhotoMonths]` prefix
- Shows: monthKey, offset, limit, asset counts

### Check JavaScript Logs (Metro/React Native Debugger)

- Look for `[MediaContext]`, `[Home]`, `[MediaViewer]` prefixes
- Shows: function calls, item counts, state changes

### Common Issues

1. **Items showing 0**: Counts not updated after lazy load
2. **Black images**: Using FastImage with `ph://` URIs (should use Image)
3. **Infinite loops**: useEffect dependencies causing re-renders
4. **Memory issues**: Too many items loaded at once





