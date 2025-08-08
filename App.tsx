import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet, Platform } from 'react-native';
import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';

// Context
import { MediaProvider, useMedia } from './src/context/MediaContext';
import { AdminProvider } from './src/context/adminContext';

// Screens
import Onboarding from './src/screens/Onboarding';
import Home from './src/screens/Home';
import Trash from './src/screens/Trash';

// Navigation Types
type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
};

type MainTabParamList = {
  Home: undefined;
  Trash: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Tab Navigator
const MainTabs: React.FC = () => {
  const { trashedItems } = useMedia();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007bff',
        tabBarInactiveTintColor: '#6c757d',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen
        name="Home"
        component={Home}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Text style={[styles.tabIcon, { color, fontSize: size }]}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Trash"
        component={Trash}
        options={{
          tabBarLabel: 'Trash',
          tabBarIcon: ({ color, size }) => (
            <Text style={[styles.tabIcon, { color, fontSize: size }]}>🗑️</Text>
          ),
          tabBarBadge:
            trashedItems.length > 0 ? trashedItems.length : undefined,
        }}
      />
    </Tab.Navigator>
  );
};

// Main App Navigator
const AppNavigator: React.FC = () => {
  const { onboardingComplete } = useMedia();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!onboardingComplete ? (
        <Stack.Screen name="Onboarding" component={Onboarding} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
};

// AdMob Initialization Function
const initializeAdMob = async () => {
  try {
    // Initialize Mobile Ads SDK
    await mobileAds().initialize();

    // For iOS, request App Tracking Transparency permission
    if (Platform.OS === 'ios') {
      const trackingStatus = await request(
        PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY,
      );

      switch (trackingStatus) {
        case RESULTS.GRANTED:
          // App Tracking Transparency granted
          break;
        case RESULTS.DENIED:
          // App Tracking Transparency denied
          break;
        case RESULTS.UNAVAILABLE:
          // App Tracking Transparency unavailable
          break;
        case RESULTS.BLOCKED:
          // App Tracking Transparency blocked
          break;
      }
    }

    // Set ad serving options
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.G, // General audiences
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
  } catch (error) {
    // Failed to initialize Mobile Ads SDK
  }
};

// App Root Component
const App: React.FC = () => {
  useEffect(() => {
    initializeAdMob();
  }, []);

  return (
    <AdminProvider>
      <MediaProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </MediaProvider>
    </AdminProvider>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    paddingBottom: 4,
    paddingTop: 4,
    height: 60,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  tabIcon: {
    marginBottom: 4,
  },
});

export default App;
