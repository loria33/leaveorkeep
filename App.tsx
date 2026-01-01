import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';

// Context
import { MediaProvider, useMedia } from './src/context/MediaContext';
import { AdminProvider } from './src/context/adminContext';
import { triggerHomeTabPress } from './src/context/TabPressContext';

// Utils
import InAppPurchaseManager from './src/utils/InAppPurchaseManager';

// Screens
import Onboarding from './src/screens/Onboarding';
import Home from './src/screens/Home';
import Trash from './src/screens/Trash';
import About from './src/screens/About';
import MediaViewerScreen, { MediaViewerScreenParams } from './src/screens/MediaViewerScreen';
import MonthSelectionScreen, { MonthSelectionScreenParams } from './src/screens/MonthSelectionScreen';

// Navigation Types
type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
};

type MainTabParamList = {
  About: undefined;
  HomeStack: undefined;
  Trash: undefined;
};

type HomeStackParamList = {
  Home: undefined;
  MonthSelectionScreen: MonthSelectionScreenParams;
  MediaViewerScreen: MediaViewerScreenParams;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createStackNavigator<HomeStackParamList>();

// Home Stack Navigator (nested inside Home tab)
const HomeStackNavigator: React.FC = () => {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={Home} />
      <HomeStack.Screen 
        name="MonthSelectionScreen" 
        component={MonthSelectionScreen}
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <HomeStack.Screen 
        name="MediaViewerScreen" 
        component={MediaViewerScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_right',
        }}
      />
    </HomeStack.Navigator>
  );
};

// Tab Navigator
const MainTabs: React.FC = () => {
  const { trashedItems } = useMedia();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="HomeStack"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007bff',
        tabBarInactiveTintColor: '#6c757d',
        tabBarStyle: [
          styles.tabBar,
          {
            paddingBottom: Math.max(insets.bottom, 4),
            height: 60 + Math.max(insets.bottom - 4, 0),
          },
        ],
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen
        name="About"
        component={About}
        options={{
          tabBarLabel: 'About',
          tabBarIcon: ({ color, size }) => (
            <Text style={[styles.tabIcon, { color, fontSize: size }]}>ℹ️</Text>
          ),
        }}
      />
      <Tab.Screen
        name="HomeStack"
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Text style={[styles.tabIcon, { color, fontSize: size }]}>🏠</Text>
          ),
        }}
        listeners={{
          tabPress: () => {
            triggerHomeTabPress();
          },
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

    // Initialize IAP manager and check premium status
    const initIAP = async () => {
      const iapManager = InAppPurchaseManager.getInstance();
      await iapManager.initialize();
      await iapManager.checkPremiumStatus();
    };
    initIAP();
  }, []);

  return (
    <SafeAreaProvider>
      <AdminProvider>
        <MediaProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </MediaProvider>
      </AdminProvider>
    </SafeAreaProvider>
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
