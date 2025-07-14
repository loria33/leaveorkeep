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
  Linking,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useMedia } from '../context/MediaContext';
import {
  requestMediaPermissions,
  checkMediaPermissionsWithRetry,
} from '../utils/permissions';

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
    title: 'Privacy & Usage Agreement 📋',
    subtitle: 'Please review and accept our terms',
    description:
      'Before we can help organize your photos, please review our privacy policy and usage agreement.',
    icon: '📋',
  },
  {
    title: 'Ready to Start? 🚀',
    subtitle: 'We need permission to access your photos',
    description:
      'To organize your photos, we need permission to access your media library. Your photos stay private and secure on your device.',
    icon: '🔐',
  },
];

const privacyAgreementText = `
PRIVACY POLICY AND USAGE AGREEMENT

Last Updated: ${new Date().toLocaleDateString()}

1. DATA COLLECTION AND STORAGE
   This application operates entirely on your device and does not transmit, store, or maintain any personal data, media files, or user information on external servers or cloud services. All processing occurs locally on your device.

2. MEDIA ACCESS AND PROCESSING
   The application requires access to your device's media library to provide organizational and management features. This access is limited to:
   - Reading media file metadata for organizational purposes
   - Displaying media content within the application interface
   - Managing media files according to your explicit actions

3. USER RESPONSIBILITY AND LIABILITY
   By using this application, you acknowledge and agree that:
   - You are solely responsible for backing up your media files before using this application
   - You understand that media management operations are performed at your own risk
   - You accept full responsibility for any data loss, corruption, or unintended changes to your media files
   - The application developer assumes no liability for any consequences arising from the use of this software
   - You will not hold the developer responsible for any loss of data, images, or other media files

4. APPLICATION FUNCTIONALITY
   This application provides media organization and management tools including:
   - Categorization of media by date and source
   - Temporary storage of selected media in a local trash/recycle bin
   - Preview and management interfaces for media files
   All operations are performed locally and do not involve external data transmission.

5. NO WARRANTIES
   THE APPLICATION IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. THE DEVELOPER DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

6. LIMITATION OF LIABILITY
   IN NO EVENT SHALL THE DEVELOPER BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR USE, ARISING OUT OF OR RELATING TO THE USE OF THIS APPLICATION.

7. USER ACKNOWLEDGMENT
   By accepting this agreement, you confirm that:
   - You have read and understood all terms and conditions
   - You accept full responsibility for your use of this application
   - You understand that no data is transmitted or stored externally
   - You acknowledge that you use this application at your own risk

8. AGREEMENT TO TERMS
   Your continued use of this application constitutes acceptance of these terms and conditions. If you do not agree to these terms, please discontinue use of the application immediately.

For questions regarding this agreement, please discontinue use of the application.
`;

const Onboarding: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const { setHasPermission, setOnboardingComplete, scanMedia } = useMedia();

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
      // Reset scroll state when moving to privacy step
      if (currentStep === 3) {
        // Privacy step
        setHasScrolledToBottom(false);
      }
    } else {
      handlePermissionRequest();
    }
  };

  const handlePermissionRequest = async () => {
    setIsRequestingPermission(true);
    try {
      const hasPermission = await requestMediaPermissions();

      if (hasPermission) {
        await completeOnboarding();
      } else {
        // If permission request failed, try checking again with retry logic
        // This handles cases where permission was granted but not detected
        const recheckPermission = await checkMediaPermissionsWithRetry();

        if (recheckPermission) {
          await completeOnboarding();
        } else {
          Alert.alert(
            'Permission Required',
            'We need access to your photos to help organize them. Please enable permissions in your device settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: handleOpenSettings,
              },
              {
                text: 'Try Again',
                onPress: handlePermissionRequest,
              },
            ],
          );
        }
      }
    } catch (error) {
      Alert.alert(
        'Permission Error',
        'There was an issue requesting permissions. Please try again or check your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Try Again',
            onPress: handlePermissionRequest,
          },
          {
            text: 'Open Settings',
            onPress: handleOpenSettings,
          },
        ],
      );
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  const completeOnboarding = async () => {
    setHasPermission(true);
    setOnboardingComplete(true);

    // Small delay to ensure state changes are processed properly on iPad
    await new Promise(resolve => setTimeout(resolve, 500));

    // Start scanning media in the background
    scanMedia();
  };

  const handleGetStarted = async () => {
    try {
      const granted = await requestMediaPermissions();
      if (granted) {
        await completeOnboarding();
      } else {
        // Try again with retry logic
        const recheckPermission = await checkMediaPermissionsWithRetry();
        if (recheckPermission) {
          await completeOnboarding();
        }
      }
    } catch (error) {
      // Error requesting permissions
    }
  };

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const isCloseToBottom =
      layoutMeasurement.height + contentOffset.y >=
      contentSize.height - paddingToBottom;

    if (isCloseToBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const step = onboardingSteps[currentStep];

  // Render privacy agreement step
  if (currentStep === 3) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
          <View style={styles.privacyContainer}>
            {/* Header */}
            <View style={styles.privacyHeader}>
              <Text style={styles.icon}>{step.icon}</Text>
              <Text style={styles.title}>{step.title}</Text>
              <Text style={styles.subtitle}>{step.subtitle}</Text>
            </View>

            {/* Agreement Text */}
            <View style={styles.agreementContainer}>
              <ScrollView
                style={styles.agreementScroll}
                contentContainerStyle={styles.agreementContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.agreementText}>{privacyAgreementText}</Text>
              </ScrollView>
            </View>

            {/* Bottom Actions */}
            <View style={styles.bottomContainer}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setCurrentStep(currentStep - 1)}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.nextButton,
                  !hasScrolledToBottom && styles.disabledButton,
                ]}
                onPress={handleNext}
                disabled={!hasScrolledToBottom}
              >
                <Text
                  style={[
                    styles.nextButtonText,
                    !hasScrolledToBottom && styles.disabledButtonText,
                  ]}
                >
                  {hasScrolledToBottom ? 'I Accept' : 'Scroll to Accept'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

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
  // Privacy agreement specific styles
  privacyContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: responsiveValues.topPadding,
    paddingBottom: responsiveValues.bottomPadding,
  },
  privacyHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  agreementContainer: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    marginBottom: 20,
  },
  agreementScroll: {
    flex: 1,
  },
  agreementContent: {
    padding: 20,
  },
  agreementText: {
    fontSize: responsiveValues.descriptionSize - 1,
    color: '#ffffff',
    lineHeight: (responsiveValues.descriptionSize - 1) * 1.4,
    opacity: 0.9,
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  disabledButtonText: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
});

export default Onboarding;
