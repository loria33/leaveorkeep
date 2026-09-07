module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    // Transform every RN-ecosystem package (they ship untranspiled ESM/TS)
    "node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|@callstack)",
  ],
  setupFiles: [
    'react-native-gesture-handler/jestSetup',
    '<rootDir>/jest.setup.js',
  ],
};
