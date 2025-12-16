# Viewed Media Tracking System

## Overview

This document describes the efficient tracking system for monitoring which images/videos have been viewed across sessions and identifying months that have been fully reviewed.

## Architecture

### Data Structure

The system uses two main data structures:

1. **Viewed Items**: A `Set<string>` storing media item IDs that have been viewed
   - O(1) lookup time for checking if an item is viewed
   - Stored in AsyncStorage as a JSON array (converted to/from Set)

2. **Completed Months**: A `Set<string>` storing month keys (format: "YYYY-MM") that are fully reviewed
   - All items in the month must be viewed for it to be marked as completed

### Storage Strategy

- **In-Memory Cache**: Fast lookups using `Set<string>` data structures
- **AsyncStorage Persistence**: Batched writes with 2-second debounce to minimize I/O
- **Immediate Save**: Force save on viewer close or app backgrounding

### Key Files

1. **`src/utils/viewedMediaTracker.ts`**: Core tracking utility
   - Handles all storage operations
   - Provides efficient lookup methods
   - Manages batching and debouncing

2. **`src/context/MediaContext.tsx`**: Context integration
   - Exposes tracking methods to components
   - Loads cached data on app start
   - Provides month-level statistics

3. **`src/components/MediaViewer.tsx`**: Automatic tracking
   - Marks items as viewed when displayed (1.5s delay)
   - Checks month completion after each view
   - Saves on component unmount

## Usage

### Marking Items as Viewed

```typescript
import { useMedia } from '../context/MediaContext';

const { markMediaItemAsViewed } = useMedia();

// Mark a single item
await markMediaItemAsViewed(itemId);

// Mark multiple items (batch operation)
await markMediaItemsAsViewed([itemId1, itemId2, itemId3]);
```

### Checking View Status

```typescript
const { isMediaItemViewed } = useMedia();

const isViewed = await isMediaItemViewed(itemId);
```

### Getting Month Statistics

```typescript
const { getMonthViewedStats } = useMedia();

const stats = await getMonthViewedStats(monthKey);
// Returns: { viewedCount, totalCount, percentage, isCompleted }
```

### Checking Month Completion

```typescript
const { checkAndMarkMonthCompleted } = useMedia();

const isCompleted = await checkAndMarkMonthCompleted(monthKey);
// Automatically marks month as completed if all items are viewed
```

### Getting Overall Statistics

```typescript
const { getViewingStats } = useMedia();

const stats = await getViewingStats();
// Returns: { totalViewed, completedMonths }
```

## Automatic Tracking

The system automatically tracks viewed items when:

1. **Image/Video Display**: When an item is displayed in `MediaViewer` for 1.5 seconds
   - Ensures the user actually saw the item (not just a quick swipe)
   - Prevents accidental marking during fast navigation

2. **Month Completion Check**: After marking an item as viewed
   - Automatically checks if all items in the month are now viewed
   - Marks the month as completed if all items are viewed

3. **Data Persistence**: 
   - Batched saves every 2 seconds (debounced)
   - Immediate save on viewer close
   - Immediate save on app backgrounding

## Performance Considerations

### Efficiency Features

1. **Set-based Lookups**: O(1) time complexity for checking view status
2. **In-Memory Cache**: Fast access without AsyncStorage reads
3. **Batched Writes**: Debounced saves reduce I/O operations
4. **Lazy Loading**: Data loaded only when needed

### Storage Size

- Each viewed item ID: ~20-50 bytes (depends on URI length)
- 10,000 viewed items: ~200-500 KB
- Completed months: ~10 bytes per month
- Total storage: Typically < 1 MB for most users

### Optimization Tips

1. **Batch Operations**: Use `markMediaItemsAsViewed` for multiple items
2. **Check Before Marking**: Use `isMediaItemViewed` to avoid duplicate writes
3. **Periodic Cleanup**: Consider clearing old data if storage becomes large

## Integration Points

### MediaViewer Component

The `MediaViewer` component automatically:
- Tracks items when displayed (1.5s delay)
- Checks month completion
- Saves data on close

### Home Screen

You can display completion status:
```typescript
const { getMonthViewedStats } = useMedia();

// In your month card component
const stats = await getMonthViewedStats(monthKey);
// Show: `${stats.percentage}% viewed` or `✓ Complete`
```

## Data Migration

If you need to reset tracking data:

```typescript
import { clearViewedItems } from '../utils/viewedMediaTracker';

await clearViewedItems();
```

## Future Enhancements

Potential improvements:
1. View timestamps (when was it viewed)
2. View count (how many times viewed)
3. Last viewed date per month
4. Export/import viewing history
5. Cloud sync for cross-device tracking

## Troubleshooting

### Items Not Being Tracked

1. Check that `markMediaItemAsViewed` is being called
2. Verify item IDs are consistent (same ID for same item)
3. Check AsyncStorage permissions

### Month Not Marking as Completed

1. Ensure all items in the month are loaded
2. Check that `checkAndMarkMonthCompleted` is called
3. Verify month key format is "YYYY-MM"

### Performance Issues

1. Check AsyncStorage size
2. Consider periodic cleanup of old data
3. Monitor batch write frequency

