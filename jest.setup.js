/* eslint-env jest */
// Mock NavigationContainer to a simple View
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ...jest.requireActual('@react-navigation/native'),
    NavigationContainer: ({ children }) =>
      React.createElement(View, null, children),
  };
});

// Mock navigators
jest.mock('@react-navigation/stack', () => {
  const React = require('react');
  return {
    createStackNavigator: () => ({
      Navigator: ({ children }) =>
        React.createElement(React.Fragment, null, children),
      Screen: ({ children }) =>
        React.createElement(React.Fragment, null, children),
    }),
  };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }) =>
        React.createElement(React.Fragment, null, children),
      Screen: ({ children }) =>
        React.createElement(React.Fragment, null, children),
    }),
  };
});

// Mock google mobile ads
jest.mock('react-native-google-mobile-ads', () => {
  return {
    __esModule: true,
    default: () => ({
      initialize: () => Promise.resolve(),
      setRequestConfiguration: () => Promise.resolve(),
    }),
    MaxAdContentRating: { G: 'G' },
  };
});

// Mock react-native-permissions used in App.tsx
jest.mock('react-native-permissions', () => {
  return {
    __esModule: true,
    request: () => Promise.resolve('unavailable'),
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      UNAVAILABLE: 'unavailable',
      BLOCKED: 'blocked',
    },
    check: () => Promise.resolve('unavailable'),
    requestMultiple: () => Promise.resolve({}),
    PERMISSIONS: {
      IOS: {
        APP_TRACKING_TRANSPARENCY: 'ios.permission.ATT',
        PHOTO_LIBRARY: 'ios.permission.PHOTO_LIBRARY',
        MICROPHONE: 'ios.permission.MICROPHONE',
      },
      ANDROID: {
        READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
        READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
        READ_MEDIA_VIDEO: 'android.permission.READ_MEDIA_VIDEO',
        RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
      },
    },
  };
});

// Mock react-native-device-info with the mock it ships
jest.mock('react-native-device-info', () =>
  require('react-native-device-info/jest/react-native-device-info-mock'),
);

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async key =>
        Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
      ),
      setItem: jest.fn(async (key, value) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async key => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
    },
  };
});

// Mock CameraRoll
jest.mock('@react-native-camera-roll/camera-roll', () => {
  return {
    CameraRoll: {
      deletePhotos: jest.fn(async () => true),
    },
  };
});

// Silence react-native-gesture-handler warnings in tests
jest.mock('react-native-gesture-handler', () => {
  return {
    PanGestureHandler: ({ children }) => children,
    State: { END: 'END' },
  };
});

// Mock react-native-iap (Nitro-backed; needs a native binary otherwise)
jest.mock('react-native-iap', () => ({
  __esModule: true,
  initConnection: jest.fn(async () => true),
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async () => []),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  requestPurchase: jest.fn(async () => undefined),
  finishTransaction: jest.fn(async () => undefined),
  getAvailablePurchases: jest.fn(async () => []),
}));

// Mock @callstack/liquid-glass (iOS-only native view)
jest.mock('@callstack/liquid-glass', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    LiquidGlassView: ({ children, ...props }) =>
      React.createElement(View, props, children),
    isLiquidGlassSupported: false,
  };
});

// Mock react-native-davoice-tts speech-to-text (native module)
jest.mock('react-native-davoice-tts/stt', () => ({
  __esModule: true,
  default: {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    destroy: jest.fn(async () => undefined),
    isRecognizing: jest.fn(async () => 0),
    setLicense: jest.fn(async () => true),
    removeAllListeners: jest.fn(),
  },
}));

// Mock react-native-fs (constructs a NativeEventEmitter at import time)
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/mock/documents',
    ExternalStorageDirectoryPath: '/mock/storage',
    exists: jest.fn(async () => false),
    readDir: jest.fn(async () => []),
    mkdir: jest.fn(async () => undefined),
    unlink: jest.fn(async () => undefined),
    downloadFile: jest.fn(() => ({ jobId: 1, promise: Promise.resolve({ statusCode: 200 }) })),
  },
}));

// Mocks shipped by the libraries themselves
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
// The shipped mock is a CommonJS default export, so unwrap it for named imports
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// Mock react-native-share
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn(async () => ({ success: true })) },
}));

// Mock react-native-video as a plain View
jest.mock('react-native-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Video = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));
  return { __esModule: true, default: Video };
});

// Mock react-native-fast-image as a plain Image with its static helpers
jest.mock('react-native-fast-image', () => {
  const React = require('react');
  const { Image } = require('react-native');
  const FastImage = props => React.createElement(Image, props);
  FastImage.resizeMode = { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' };
  FastImage.priority = { low: 'low', normal: 'normal', high: 'high' };
  FastImage.cacheControl = { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' };
  FastImage.preload = jest.fn();
  FastImage.clearMemoryCache = jest.fn(async () => undefined);
  FastImage.clearDiskCache = jest.fn(async () => undefined);
  return { __esModule: true, default: FastImage };
});

// Mock react-native-haptic-feedback (native module)
jest.mock('react-native-haptic-feedback', () => ({
  __esModule: true,
  default: {
    trigger: jest.fn(),
    impact: jest.fn(),
    stop: jest.fn(),
    isSupported: jest.fn(() => true),
    setEnabled: jest.fn(),
    isEnabled: jest.fn(() => true),
  },
}));
