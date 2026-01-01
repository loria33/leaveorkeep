import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Efficient tracking system for viewed media items and completed months
 * 
 * Architecture:
 * - Uses Set<string> for O(1) lookups of viewed image IDs
 * - Batches writes to AsyncStorage to minimize I/O
 * - Tracks both individual images and month completion status
 */

const STORAGE_KEYS = {
  VIEWED_ITEMS: 'viewedMediaItems',
  COMPLETED_MONTHS: 'completedMonths',
  LAST_VIEWED_ITEM_ID: 'lastViewedItemId', // Simple: single last viewed item ID
} as const;

// In-memory cache for fast lookups
let viewedItemsCache: Set<string> | null = null;
let completedMonthsCache: Set<string> | null = null;

// Debounce timer for batched writes
let saveTimer: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 2000; // Save 2 seconds after last update

/**
 * Load viewed items from storage (called on app start)
 */
export const loadViewedItems = async (): Promise<Set<string>> => {
  if (viewedItemsCache !== null) {
    return viewedItemsCache;
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.VIEWED_ITEMS);
    if (stored) {
      const items = JSON.parse(stored) as string[];
      viewedItemsCache = new Set(items);
      return viewedItemsCache;
    }
  } catch (error) {
    // Error loading viewed items
  }

  viewedItemsCache = new Set<string>();
  return viewedItemsCache;
};

/**
 * Load completed months from storage
 */
export const loadCompletedMonths = async (): Promise<Set<string>> => {
  if (completedMonthsCache !== null) {
    return completedMonthsCache;
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.COMPLETED_MONTHS);
    if (stored) {
      const months = JSON.parse(stored) as string[];
      completedMonthsCache = new Set(months);
      return completedMonthsCache;
    }
  } catch (error) {
    // Error loading completed months
  }

  completedMonthsCache = new Set<string>();
  return completedMonthsCache;
};

/**
 * Check if a media item has been viewed
 */
export const isItemViewed = async (itemId: string): Promise<boolean> => {
  const viewedItems = await loadViewedItems();
  return viewedItems.has(itemId);
};

/**
 * Mark a media item as viewed
 * Uses debounced batching for efficient storage writes
 */
export const markItemAsViewed = async (itemId: string): Promise<void> => {
  const viewedItems = await loadViewedItems();
  
  // Only add if not already viewed (avoid unnecessary writes)
  if (!viewedItems.has(itemId)) {
    viewedItems.add(itemId);
    
    // Debounce the save operation
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    
    saveTimer = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEYS.VIEWED_ITEMS,
          JSON.stringify(Array.from(viewedItems)),
        );
      } catch (error) {
        // Error saving viewed items
      }
      saveTimer = null;
    }, SAVE_DEBOUNCE_MS);
  }
};

/**
 * Mark multiple items as viewed (batch operation)
 */
export const markItemsAsViewed = async (itemIds: string[]): Promise<void> => {
  const viewedItems = await loadViewedItems();
  let hasNewItems = false;

  for (const itemId of itemIds) {
    if (!viewedItems.has(itemId)) {
      viewedItems.add(itemId);
      hasNewItems = true;
    }
  }

  if (hasNewItems) {
    // Debounce the save operation
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEYS.VIEWED_ITEMS,
          JSON.stringify(Array.from(viewedItems)),
        );
      } catch (error) {
        // Error saving viewed items
      }
      saveTimer = null;
    }, SAVE_DEBOUNCE_MS);
  }
};

/**
 * Force immediate save (call on app close or viewer close)
 */
export const saveViewedItemsImmediately = async (): Promise<void> => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  if (viewedItemsCache) {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.VIEWED_ITEMS,
        JSON.stringify(Array.from(viewedItemsCache)),
      );
    } catch (error) {
      // Error saving viewed items
    }
  }
};

/**
 * Check if a month is completed (all items viewed)
 */
export const isMonthCompleted = async (monthKey: string): Promise<boolean> => {
  const completedMonths = await loadCompletedMonths();
  return completedMonths.has(monthKey);
};

/**
 * Mark a month as completed
 */
export const markMonthAsCompleted = async (monthKey: string): Promise<void> => {
  const completedMonths = await loadCompletedMonths();
  
  if (!completedMonths.has(monthKey)) {
    completedMonths.add(monthKey);
    
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.COMPLETED_MONTHS,
        JSON.stringify(Array.from(completedMonths)),
      );
    } catch (error) {
      // Error saving completed months
    }
  }
};

/**
 * Get the count of viewed items for a given set of items
 */
export const getViewedCount = async (
  items: Array<{ id: string }>,
): Promise<number> => {
  const viewedItems = await loadViewedItems();
  return items.filter(item => viewedItems.has(item.id)).length;
};

/**
 * Get the percentage of viewed items for a given set of items
 */
export const getViewedPercentage = async (
  items: Array<{ id: string }>,
): Promise<number> => {
  if (items.length === 0) return 0;
  const viewedCount = await getViewedCount(items);
  return Math.round((viewedCount / items.length) * 100);
};

/**
 * Check if all items in a month have been viewed
 * This is used to determine if a month should be marked as completed
 */
export const checkMonthCompletion = async (
  monthKey: string,
  allItems: Array<{ id: string }>,
): Promise<boolean> => {
  if (allItems.length === 0) {
    return false;
  }
  
  const viewedItems = await loadViewedItems();
  
  // Check each item
  const missingItems: string[] = [];
  const viewedItemIds: string[] = [];
  
  for (const item of allItems) {
    if (viewedItems.has(item.id)) {
      viewedItemIds.push(item.id);
    } else {
      missingItems.push(item.id);
    }
  }
  
  const allViewed = missingItems.length === 0;
  
  if (allViewed && allItems.length > 0) {
    await markMonthAsCompleted(monthKey);
    return true;
  } else {
    return false;
  }
};

/**
 * Force check completion for a month by loading all items
 * This is useful when you want to verify completion after viewing items
 */
export const forceCheckMonthCompletion = async (
  monthKey: string,
  fetchAllItems: () => Promise<Array<{ id: string }>>,
): Promise<boolean> => {
  try {
    const allItems = await fetchAllItems();
    return await checkMonthCompletion(monthKey, allItems);
  } catch (error) {
    return false;
  }
};

/**
 * Clear all viewed items (for testing/reset)
 */
export const clearViewedItems = async (): Promise<void> => {
  viewedItemsCache = new Set<string>();
  completedMonthsCache = new Set<string>();
  
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.VIEWED_ITEMS);
    await AsyncStorage.removeItem(STORAGE_KEYS.COMPLETED_MONTHS);
  } catch (error) {
    // Error clearing viewed items
  }
};

/**
 * Get statistics about viewed items
 */
export const getViewingStats = async (): Promise<{
  totalViewed: number;
  completedMonths: number;
}> => {
  const viewedItems = await loadViewedItems();
  const completedMonths = await loadCompletedMonths();
  
  return {
    totalViewed: viewedItems.size,
    completedMonths: completedMonths.size,
  };
};

/**
 * Debug function to check completion status for a month
 * Returns detailed information about viewed items
 */
export const debugMonthCompletion = async (
  monthKey: string,
  allItems: Array<{ id: string }>,
): Promise<{
  totalItems: number;
  viewedItems: number;
  missingItems: string[];
  isCompleted: boolean;
}> => {
  const viewedItems = await loadViewedItems();
  const viewedCount = allItems.filter(item => viewedItems.has(item.id)).length;
  const missingItems = allItems
    .filter(item => !viewedItems.has(item.id))
    .map(item => item.id);
  const isCompleted = missingItems.length === 0 && allItems.length > 0;
  
  return {
    totalItems: allItems.length,
    viewedItems: viewedCount,
    missingItems,
    isCompleted,
  };
};

/**
 * Store the last viewed item ID for a month (single map persistence)
 * This allows users to resume from where they left off in each month
 */
export const setLastViewedItemId = async (
  monthKey: string,
  itemId: string,
): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.LAST_VIEWED_ITEM_ID);
    const lastItemMap: { [monthKey: string]: string } = stored
      ? JSON.parse(stored)
      : {};
    
    lastItemMap[monthKey] = itemId;
    
    await AsyncStorage.setItem(
      STORAGE_KEYS.LAST_VIEWED_ITEM_ID,
      JSON.stringify(lastItemMap),
    );
  } catch (error) {
    // Error saving last viewed item ID
  }
};

/**
 * Get the last viewed item ID for a month
 * Returns the item ID if found, or null if not found
 */
export const getLastViewedItemId = async (
  monthKey: string,
): Promise<string | null> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.LAST_VIEWED_ITEM_ID);
    if (stored) {
      const lastItemMap: { [monthKey: string]: string } = JSON.parse(stored);
      return lastItemMap[monthKey] || null;
    }
  } catch (error) {
    // Error loading last viewed item ID
  }
  
  return null;
};

