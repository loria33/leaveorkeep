// App Configuration Constants
export const APP_CONFIG = {
  // Viewing Limits
  MAX_VIEWS: 55, // Maximum number of pictures that can be viewed per hour
  HOURLY_RESET: true, // Reset views every hour

  // Whisper model configuration
  WHISPER: {
    name: 'Whisper Base English',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    fileName: 'ggml-small.en.bin',
    size: '500MB',
    description: 'Whisper transcription model for voice-to-text conversion',
  },

  // Get Whisper model URL
  getWhisperModelUrl() {
    return this.WHISPER.url;
  },

  // Get Whisper model file name
  getWhisperModelFileName() {
    return this.WHISPER.fileName;
  },

  // Get Whisper model size
  getWhisperModelSize() {
    return this.WHISPER.size;
  },

  // Get Whisper model name
  getWhisperModelName() {
    return this.WHISPER.name;
  },

  // Get Whisper model description
  getWhisperModelDescription() {
    return this.WHISPER.description;
  },
};

// Get current configuration
export const getViewingConfig = () => {
  return {
    maxViews: APP_CONFIG.MAX_VIEWS,
    hourlyReset: APP_CONFIG.HOURLY_RESET,
  };
};

// Convert hours to milliseconds
export const hoursToMs = (hours: number): number => hours * 60 * 60 * 1000;

// Get the start of the current day in milliseconds
export const getStartOfDay = (): number => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return startOfDay.getTime();
};

// Get the start of the current hour in milliseconds
export const getStartOfHour = (): number => {
  const now = new Date();
  const startOfHour = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
  );
  return startOfHour.getTime();
};

// Check if a timestamp is from today
export const isToday = (timestamp: number): boolean => {
  const today = getStartOfDay();
  const tomorrow = today + 24 * 60 * 60 * 1000;
  return timestamp >= today && timestamp < tomorrow;
};
