import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Alert,
  ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useMedia } from '../context/MediaContext';
import { requestMediaPermissions } from '../utils/permissions';

const { width, height } = Dimensions.get('window');

// Responsive calculations based on screen height
const isSmallScreen = height < 700;
const isMediumScreen = height >= 700 && height < 800;
const isLargeScreen = height >= 800;

const getResponsiveSize = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

const responsiveValues = {
  // Vertical spacing
  topPadding: getResponsiveSize(height * 0.03, height * 0.05, height * 0.06),
  bottomPadding: getResponsiveSize(height * 0.03, height * 0.04, height * 0.05),
  progressMargin: getResponsiveSize(
    height * 0.03,
    height * 0.05,
    height * 0.06,
  ),

  // Icon and text sizes
  iconSize: getResponsiveSize(60, 70, 80),
  titleSize: getResponsiveSize(24, 26, 28),
  subtitleSize: getResponsiveSize(16, 17, 18),
  descriptionSize: getResponsiveSize(14, 15, 16),

  // Content spacing
  iconMargin: getResponsiveSize(height * 0.02, height * 0.03, height * 0.04),
  titleMargin: getResponsiveSize(8, 10, 12),
  subtitleMargin: getResponsiveSize(12, 16, 20),

  // Button sizing
  buttonPadding: getResponsiveSize(10, 12, 14),
  buttonText: getResponsiveSize(14, 15, 16),
};

const onboardingSteps = [
  {
    title: 'Welcome to LeaveMKeepM! 🎉',
    subtitle: 'Your smart media cleanup companion',
    description:
      'Transform your cluttered photo gallery into a organized masterpiece. Clean up your memories with style!',
    icon: '📱',
  },
  {
    title: 'Smart Organization 🗂️',
    subtitle: 'Photos grouped by month and source',
    description:
      'We organize your photos by month and source (WhatsApp, Camera, Screenshots, etc.) making it super easy to find what you need.',
    icon: '📅',
  },
  {
    title: 'Safe & Secure 🔒',
    subtitle: 'Nothing is deleted immediately',
    description:
      'When you choose to "trash" a photo, it goes to our safe trash can. You can restore it anytime or delete it permanently later.',
    icon: '🗑️',
  },
  {
    title: 'Ready to Start? 🚀',
    subtitle: 'We need permission to access your photos',
    description:
      'To organize your photos, we need permission to access your media library. Your photos stay private and secure on your device.',
    icon: '🔐',
  },
];

const Onboarding: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const { setHasPermission, setOnboardingComplete, scanMedia } = useMedia();

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handlePermissionRequest();
    }
  };

  const handlePermissionRequest = async () => {
    setIsRequestingPermission(true);
    try {
      const hasPermission = await requestMediaPermissions();

      if (hasPermission) {
        setHasPermission(true);
        setOnboardingComplete(true);
        // Start scanning media in the background
        scanMedia();
      } else {
        Alert.alert(
          'Permission Required',
          'We need access to your photos to help organize them. Please enable permissions in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                // TODO: Open app settings
                console.log('Open app settings');
              },
            },
          ],
        );
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request permissions. Please try again.');
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const step = onboardingSteps[currentStep];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
            {onboardingSteps.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  index <= currentStep && styles.activeProgressDot,
                ]}
              />
            ))}
          </View>

          {/* Content */}
          <View style={styles.contentContainer}>
            <Text style={styles.icon}>{step.icon}</Text>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.subtitle}>{step.subtitle}</Text>
            <Text style={styles.description}>{step.description}</Text>
          </View>

          {/* Bottom Actions */}
          <View style={styles.bottomContainer}>
            {currentStep > 0 && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setCurrentStep(currentStep - 1)}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.nextButton,
                currentStep === 0 && styles.singleButton,
              ]}
              onPress={handleNext}
              disabled={isRequestingPermission}
            >
              <Text style={styles.nextButtonText}>
                {isRequestingPermission
                  ? 'Requesting...'
                  : currentStep === onboardingSteps.length - 1
                  ? 'Grant Permission'
                  : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: responsiveValues.topPadding,
    paddingBottom: responsiveValues.bottomPadding,
    justifyContent: 'space-between',
    minHeight: height - 100, // Ensure minimum height for proper spacing
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: responsiveValues.progressMargin,
  },
  progressDot: {
    width: getResponsiveSize(10, 12, 12),
    height: getResponsiveSize(10, 12, 12),
    borderRadius: getResponsiveSize(5, 6, 6),
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 6,
  },
  activeProgressDot: {
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  icon: {
    fontSize: responsiveValues.iconSize,
    marginBottom: responsiveValues.iconMargin,
    textAlign: 'center',
  },
  title: {
    fontSize: responsiveValues.titleSize,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: responsiveValues.titleMargin,
  },
  subtitle: {
    fontSize: responsiveValues.subtitleSize,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: responsiveValues.subtitleMargin,
    opacity: 0.9,
  },
  description: {
    fontSize: responsiveValues.descriptionSize,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: responsiveValues.descriptionSize * 1.5,
    opacity: 0.8,
    paddingHorizontal: isSmallScreen ? 10 : 0,
  },
  bottomContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: height * 0.02,
    marginTop: 20,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: responsiveValues.buttonPadding,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    flex: 1,
    marginRight: 12,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: responsiveValues.buttonText,
    fontWeight: '600',
    textAlign: 'center',
  },
  nextButton: {
    paddingHorizontal: 24,
    paddingVertical: responsiveValues.buttonPadding,
    borderRadius: 25,
    backgroundColor: '#ffffff',
    flex: 1,
    marginLeft: 12,
  },
  singleButton: {
    marginLeft: 0,
  },
  nextButtonText: {
    color: '#667eea',
    fontSize: responsiveValues.buttonText,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default Onboarding;
