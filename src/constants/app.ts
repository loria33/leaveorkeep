// App Configuration Constants
export const APP_CONFIG = {
  // Viewing Limits
  MAX_VIEWS: 30, // Maximum number of pictures that can be viewed
  COOLDOWN_HOURS: 1, // Hours to wait before viewing again (6 minutes)
};

// Get current configuration
export const getViewingConfig = () => {
  return {
    maxViews: APP_CONFIG.MAX_VIEWS,
    cooldownHours: APP_CONFIG.COOLDOWN_HOURS,
  };
};

// Convert hours to milliseconds
export const hoursToMs = (hours: number): number => hours * 60 * 60 * 1000;
