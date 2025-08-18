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
    PERMISSIONS: { IOS: { APP_TRACKING_TRANSPARENCY: 'ios.permission.ATT' } },
  };
});

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
