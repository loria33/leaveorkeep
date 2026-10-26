import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Platform } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import GhostAlbum from './src/screens/GhostAlbum';
import About from './src/screens/About';
import MediaViewerScreen, {
  MediaViewerScreenParams,
} from './src/screens/MediaViewerScreen';
import MonthSelectionScreen, {
  MonthSelectionScreenParams,
} from './src/screens/MonthSelectionScreen';
import { colors } from './src/theme';
import FloatingTabBar from './src/components/FloatingTabBar';

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

type TrashStackParamList = {
  Trash: undefined;
  GhostAlbum: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createStackNavigator<HomeStackParamList>();
const TrashStack = createStackNavigator<TrashStackParamList>();

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
          presentation: 'modal',
          animation: 'slide_from_right',
        }}
      />
    </HomeStack.Navigator>
  );
};

// Trash Stack Navigator (Trash plus its Ghost Album)
const TrashStackNavigator: React.FC = () => {
  return (
    <TrashStack.Navigator screenOptions={{ headerShown: false }}>
      <TrashStack.Screen name="Trash" component={Trash} />
      <TrashStack.Screen
        name="GhostAlbum"
        component={GhostAlbum}
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
    </TrashStack.Navigator>
  );
};

// Tab Navigator
const MainTabs: React.FC = () => {
  const { trashedItems } = useMedia();

  return (
    <Tab.Navigator
      initialRouteName="HomeStack"
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
      }}
    >
      <Tab.Screen
        name="About"
        component={About}
        options={{
          tabBarLabel: 'About',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={
                focused ? 'information-circle' : 'information-circle-outline'
              }
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="HomeStack"
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={color}
            />
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
        component={TrashStackNavigator}
        options={{
          tabBarLabel: 'Trash',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'trash' : 'trash-outline'}
              size={size}
              color={color}
            />
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
  // Screens fill the whole height behind the floating tab bar
  scene: {
    backgroundColor: colors.ink,
  },
});

export default App;
