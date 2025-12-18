import React, { useState, useRef, useEffect } from 'react';
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
  Image,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useMedia } from '../context/MediaContext';
import {
  requestMediaPermissions,
  checkMediaPermissionsWithRetry,
  requestMicrophonePermission,
} from '../utils/permissions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// NEW: add these imports
import RNFS from 'react-native-fs';
import NetInfo from '@react-native-community/netinfo';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { APP_CONFIG } from '../constants/app'; // make sure path matches your project
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// --- minimal rotating phrase list (first three only) ---

const PHRASES = [
  'Grabbing a fresh notebook',
  'Unpacking digital suitcases',
  'Fluffing the data pillows',
  'Mixing bits and bytes',
  'Sipping virtual lemonade',
  'Organizing our toolbox',
  'Polishing the code gears',
  'Syncing friendly vibes',
  'Stirring the logic soup',
  'Counting happy photons',
  'Stretching neural muscles',
  'Heating up inspiration',
  'Sharpening pencils of thought',
  'Aligning tiny magnets',
  'Loading gentle whispers',
  'Collecting cozy moments',
  'Dusting off metadata',
  'Filling jars with ideas',
  'Painting pixels calmly',
  'Humming a hopeful tune',
  'Tuning the memory strings',
  'Planting seeds of knowledge',
  'Tickling the algorithm',
  'Checking compass bearings',
  'Straightening virtual frames',
  'Flipping through storybooks',
  'Brewing a calm breeze',
  'Gathering morning sunshine',
  'Building paper airplanes',
  'Stacking rainbow blocks',
  'Sorting candy-colored bytes',
  'Smoothing silk threads',
  'Tracing friendly footprints',
  'Popping bubble wrap of joy',
  'Charting starlit maps',
  'Holding doors for packets',
  'Rolling out welcome mats',
  'Measuring teaspoons of code',
  'Setting up campfires',
  'Ordering extra sprinkles',
  'Calibrating curiosity meters',
  'Baking binary cupcakes',
  'Folding origami cranes',
  'Teaching zeros to dance',
  'Untangling headphone cords',
  'Watering pixel plants',
  'Polishing friendly robots',
  'Fanning creative sparks',
  'Catching cloud daydreams',
  'Wrapping ideas in bows',
  'Lining up shiny marbles',
  'Refilling positivity jars',
  'Adjusting comfy armchairs',
  'Writing upbeat postcards',
  'Bundling fresh insights',
  'Whistling while we work',
  'Inflating imagination balloons',
  'Adding glitter to graphs',
  'Organizing sticker albums',
  'Labeling treasure chests',
  'Herding playful kittens',
  'Filling sails with breeze',
  'Lighting lanterns of hope',
  'Planting window gardens',
  'Sewing quilted patterns',
  'Skipping stones of thought',
  'Mapping secret passages',
  'Placing bookmarks gently',
  'Gifting virtual high‑fives',
  'Composing warm melodies',
  'Harvesting idea berries',
  'Bouncing rubber duckies',
  'Pressing subtle pause',
  'Sweeping porch steps',
  'Recharging kindness batteries',
  'Stacking library books',
  'Sorting postcards by color',
  'Arranging puzzle pieces',
  'Flipping pancakes of code',
  'Carving wooden whistles',
  'Spinning tiny windmills',
  'Plaiting friendship bracelets',
  'Wrapping up loose ends',
  'Coloring inside lines',
  'Collecting lost buttons',
  'Sanding smooth surfaces',
  'Gluing googly eyes',
  'Mapping rainbow arcs',
  'Selecting comfy pillows',
  'Baking cinnamon smiles',
  'Snapping happy photos',
  'Beaming friendly signals',
  'Raking autumn leaves',
  'Drawing chalk doodles',
  'Sniffing fresh bread',
  'Hanging string lights',
  'Pruning bonsai trees',
  'Picking blueberries',
  'Stocking lemonade stand',
  'Opening storybook gates',
  'Crocheting cozy scarves',
  'Lighting birthday candles',
  'Filling piñatas with laughs',
  'Turning pages softly',
  'Kneading pizza dough',
  'Skipping rope rhythms',
  'Floating paper boats',
  'Blowing cotton clouds',
  'Catching ladybugs',
  'Balancing smooth stones',
  'Tracing shooting stars',
  'Pouring honey thoughts',
  'Splashing paint playfully',
  'Juggling colorful scarves',
  'Tuning toy ukuleles',
  'Counting fireflies',
  'Flipping calendar pages',
  'Folding paper hearts',
  'Gathering seashells',
  'Sipping cocoa carefully',
  'Threading magic beads',
  'Sharing umbrella shade',
  'Baking gingerbread code',
  'Combing sandy beaches',
  'Installing happy updates',
  'Refining sunrise gradients',
  'Filling bird feeders',
  'Tossing confetti gently',
  'Spreading picnic blankets',
  'Lighting sparklers',
  'Whittling soft whistles',
  'Grazing fluffy clouds',
  'Cherishing warm mittens',
  'Scaling candy mountains',
  'Scooping ice cream bytes',
  'Paddling calm rivers',
  'Capturing moonbeams',
  'Applying gentle polish',
  'Bundling starlight packets',
  'Creating chalk rainbows',
  'Stringing popcorn garlands',
  'Pressing flower petals',
  'Clipping paper coupons',
  'Spooling cotton reels',
  'Braiding bright ribbons',
  'Planting story seeds',
  'Surfing easy breezes',
  'Drizzling caramel thoughts',
  'Whisking marshmallow fluff',
  'Squeezing citrus smiles',
  'Placing stepping stones',
  'Rolling snowball ideas',
  'Carving pumpkin grins',
  'Frothing latte letters',
  'Waving friendly pennants',
  'Twirling maple leaves',
  'Opening treasure maps',
  'Unfolding paper fans',
  'Arranging pebbled paths',
  'Fueling rocket dreams',
  'Sweeping stargazer decks',
  'Curing stage jitters',
  'Refilling ink wells',
  'Sculpting sandcastles',
  'Aligning domino trails',
  'Stacking waffle towers',
  'Listening for echoes',
  'Twisting balloon animals',
  'Drawing treasure X',
  'Cleaning kaleidoscopes',
  'Stacking card houses',
  'Sketching gentle swirls',
  'Clicking castanets softly',
  'Launching kite strings',
  'Meandering garden paths',
  'Penciling soft outlines',
  'Tracing gentle curves',
  'Seeding galaxy gardens',
  'Ticking pocket watches',
  'Tuning wind chimes',
  'Prepping snow‑cone syrup',
  'Spreading warm butter',
  'Gathering dandelion fluff',
  'Feathering nest pillows',
  'Hanging paper lanterns',
  'Arranging sunflower bouquets',
  'Mending patchwork quilts',
  'Gilding picture frames',
  'Smoothing beach towels',
  'Gathering pinecones',
  'Copying soft lullabies',
  'Buttoning cozy coats',
  'Splashing puddles lightly',
  'Wrapping winter scarves',
  'Threading popcorn chains',
  'Arranging tea biscuits',
  'Catching morning dew',
  'Stretching rainbow bridges',
  'Lining cupcake pans',
  'Knotting friendship cords',
  'Quieting library whispers',
  'Muffling snow footsteps',
  'Doodling sunny faces',
  'Updating kindness logs',
  'Lighting porch lanterns',
  'Weaving hammock ropes',
  'Stringing fairy lights',
  'Canning sweet preserves',
  'Stamping travel passports',
  'Refilling soap bubbles',
  'Cruising gentle waves',
  'Pairing mismatched socks',
  'Clipping garden herbs',
  'Coiling jump ropes',
  'Arranging chess pieces',
  'Flipping storytime tabs',
  'Porting picnic baskets',
  'Inflating beach balls',
  'Measuring tiny footprints',
  'Hammering toy nails',
  'Guiding paper airplanes',
  'Tracing gentle ripples',
  'Frosting birthday cakes',
  'Mirroring moonlit ponds',
  'Drifting cotton swirls',
  'Sprinkling powdered sugar',
  'Ringing bicycle bells',
  'Floating feather wishes',
  'Thawing frozen smiles',
  'Collecting lucky pennies',
  'Aligning stepping stools',
  'Kicking autumn acorns',
  'Whirling pinwheels',
  'Rhyming silly poems',
  'Sprouting bean sprouts',
  'Lacing sneaker strings',
  'Nesting tiny sparrows',
  'Chalking hopscotch squares',
  'Bundling yarn skeins',
  'Jotting sweet doodles',
  'Hopping pebble trails',
  'Stitching secret pockets',
  'Backspacing typos',
  'Holding golden bookmarks',
  'Cheering gentle victories',
  'Rinsing paintbrush tips',
  'Fanning paper notes',
  'Flipping library tabs',
  'Sailing gentle breezes',
  'Counting soft heartbeats',
  'Peeling citrus slices',
  'Threading soft melodies',
  'Balancing toy blocks',
  'Lulling sleepy dragons',
  'Nibbling ginger snaps',
  'Polishing marble tops',
  'Harvesting honeycomb',
  'Whispering bedtime tales',
  'Hugging teddy bears',
  'Catching soap bubbles',
  'Stirring cocoa swirls',
  'Ticking gentle timers',
  'Collecting star stickers',
  'Floating dandelion seeds',
  'Juggling soft pillows',
  'Stacking donut rings',
  'Planting lily bulbs',
  'Kissing boo‑boos better',
  'Guarding secret gardens',
  'Reeling kite spools',
  'Guiding gentle raindrops',
  'Seasoning noodle soups',
  'Arranging pastel crayons',
  'Singing shower songs',
  'Feeding rubber ducks',
  'Blending berry smoothies',
  'Folding pajamas neatly',
  'Cropping photo corners',
];

const PHRASE_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#FFD93D', // Yellow
  '#1A535C', // Dark teal
  '#FFB6B9', // Pink
  '#6A89CC', // Blue
  '#38ADA9', // Green
  '#F8A5C2', // Light pink
  '#60A3D9', // Sky blue
  '#F6D365', // Light yellow
  '#B8E994', // Light green
  '#F3A683', // Orange
  '#786FA6', // Purple
  '#574B90', // Deep purple
  '#3DC1D3', // Cyan
  '#E17055', // Coral
  '#00B894', // Emerald
  '#00B8D4', // Bright blue
  '#F9CA24', // Gold
  '#EA8685', // Soft red
];

const isSmallScreen = height < 700;
const isMediumScreen = height >= 700 && height < 800;
const getResponsiveSize = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

const responsiveValues = {
  topPadding: getResponsiveSize(height * 0.03, height * 0.05, height * 0.06),
  bottomPadding: getResponsiveSize(height * 0.03, height * 0.04, height * 0.05),
  progressMargin: getResponsiveSize(
    height * 0.03,
    height * 0.05,
    height * 0.06,
  ),
  iconSize: getResponsiveSize(60, 70, 80),
  titleSize: getResponsiveSize(24, 26, 28),
  subtitleSize: getResponsiveSize(16, 17, 18),
  descriptionSize: getResponsiveSize(14, 15, 16),
  iconMargin: getResponsiveSize(height * 0.02, height * 0.03, height * 0.04),
  titleMargin: getResponsiveSize(8, 10, 12),
  subtitleMargin: getResponsiveSize(12, 16, 20),
  buttonPadding: getResponsiveSize(10, 12, 14),
  buttonText: getResponsiveSize(14, 15, 16),
};

// ⚠️ We inserted two new steps: Whisper download & Microphone permission
const onboardingSteps = [
  {
    title: 'Welcome to KeepFlick! 🎉',
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
    type: 'theme_selection',
    title: 'Choose Your Theme 🎨',
    subtitle: 'Pick your favorite color',
    description: 'Select a theme that matches your style',
    icon: '🎨',
  },
  // // NEW STEP (Whisper download)
  // {
  //   type: 'whisper_download',
  //   title: 'Download Transcription Model',
  //   subtitle: 'Enables on-device voice-to-text',
  //   description: '',
  //   icon: '🎤',
  // },
  // // NEW STEP (Microphone permission)
  // {
  //   type: 'microphone_permission',
  //   title: 'Microphone Permission',
  //   subtitle: 'Required for voice transcription',
  //   description:
  //     'We only use the mic locally on your device for voice-to-text. Nothing is uploaded.',
  //   icon: '🎙️',
  // },
  {
    type: 'interactive_swipe',
    title: 'Learn the Gestures',
    subtitle: 'Try the swipe gestures',
    description: 'Swipe left, then right, then up to continue',
    image: require('../assets/logoinApp.png'),
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

const LOGO_IMAGE = require('../assets/logoinApp.png');

const Onboarding: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  // Interactive swipe state (unchanged)
  const [swipePhase, setSwipePhase] = useState<'right' | 'left' | 'up'>(
    'right',
  );
  const [logoVisible, setLogoVisible] = useState(true);
  const logoOpacity = useRef(new Animated.Value(1)).current;

  const { setHasPermission, setOnboardingComplete, scanMedia } = useMedia();
  const insets = useSafeAreaInsets();

  // --- NEW: whisper download state ---
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const lastProgressUpdate = useRef(Date.now());
  const [currentPhrase, setCurrentPhrase] = useState(
    PHRASES[Math.floor(Math.random() * PHRASES.length)],
  );
  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Theme selection state
  const [selectedTheme, setSelectedTheme] = useState<'pink' | 'blue'>('pink');

  useEffect(() => {
    if (isDownloading) {
      phraseIntervalRef.current = setInterval(() => {
        setCurrentPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
      }, 5000);
    } else {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    }
    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [isDownloading]);

  // --- handlers: step navigation ---
  const handleNext = () => {
    const stepDef = onboardingSteps[currentStep];

    // Route special steps
    if (stepDef?.type === 'whisper_download') {
      startWhisperDownload();
      return;
    }
    if (stepDef?.type === 'microphone_permission') {
      handleMicrophonePermission();
      return;
    }
    if (stepDef?.type === 'theme_selection') {
      handleThemeSelection();
      return;
    }

    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
      if (currentStep === 3) setHasScrolledToBottom(false); // reset after privacy step
    } else {
      handlePermissionRequest(); // media library permission (existing final step)
    }
  };

  // --- SWIPE helpers (unchanged logic) ---
  const goToPrevSwipePhase = () => {
    if (swipePhase === 'left') {
      setSwipePhase('right');
      setLogoVisible(true);
      logoOpacity.setValue(1);
    } else if (swipePhase === 'up') {
      setSwipePhase('left');
      setLogoVisible(true);
      logoOpacity.setValue(1);
    } else {
      setCurrentStep(currentStep - 1);
      setSwipePhase('right');
      setLogoVisible(true);
      logoOpacity.setValue(1);
    }
  };
  const handleSkipSwipe = () => {
    setCurrentStep(currentStep + 1);
    setSwipePhase('right');
    setLogoVisible(true);
    logoOpacity.setValue(1);
  };
  const handleSwipeGesture = (event: any) => {
    if (
      currentStep !==
        onboardingSteps.findIndex(s => s.type === 'interactive_swipe') ||
      !logoVisible
    )
      return;
    if (event.nativeEvent.state !== State.END) return;
    const { translationX, translationY, velocityX, velocityY } =
      event.nativeEvent;
    const goNextPhase = () => {
      Animated.timing(logoOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setLogoVisible(false);
        setTimeout(() => {
          if (swipePhase === 'right') setSwipePhase('left');
          else if (swipePhase === 'left') setSwipePhase('up');
          else {
            setCurrentStep(currentStep + 1);
            setSwipePhase('right');
          }
          setLogoVisible(true);
          logoOpacity.setValue(1);
        }, 200);
      });
    };
    if (swipePhase === 'right' && (translationX > 100 || velocityX > 1000))
      goNextPhase();
    if (swipePhase === 'left' && (translationX < -100 || velocityX < -1000))
      goNextPhase();
    if (swipePhase === 'up' && (translationY < -100 || velocityY < -1000))
      goNextPhase();
  };

  // --- media (photos) permission step (existing) ---
  const handlePermissionRequest = async () => {
    setIsRequestingPermission(true);
    try {
      const hasPermission = await requestMediaPermissions();
      if (hasPermission) {
        await completeOnboarding();
      } else {
        const recheck = await checkMediaPermissionsWithRetry();
        if (recheck) {
          await completeOnboarding();
        } else {
          Alert.alert(
            'Permission Required',
            'We need access to your photos to help organize them. Please enable permissions in your device settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
              { text: 'Try Again', onPress: handlePermissionRequest },
            ],
          );
        }
      }
    } catch {
      Alert.alert(
        'Permission Error',
        'There was an issue requesting permissions. Please try again or check your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try Again', onPress: handlePermissionRequest },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const completeOnboarding = async () => {
    setHasPermission(true);
    setOnboardingComplete(true);
    await new Promise(r => setTimeout(r, 500));
    scanMedia();
  };

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const isCloseToBottom =
      layoutMeasurement.height + contentOffset.y >=
      contentSize.height - paddingToBottom;
    if (isCloseToBottom && !hasScrolledToBottom) setHasScrolledToBottom(true);
  };

  // --- NEW: Whisper download implementation ---
  const startWhisperDownload = async () => {
    try {
      const net = await NetInfo.fetch();
      const onWifi = net.type === 'wifi' && net.isConnected;
      const proceed = async () => {
        setIsDownloading(true);
        setDownloadProgress(0);
        const fromUrl = APP_CONFIG.getWhisperModelUrl();
        const fileName = APP_CONFIG.getWhisperModelFileName();
        const localPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

        const exists = await RNFS.exists(localPath);
        if (!exists) {
          const job = RNFS.downloadFile({
            fromUrl,
            toFile: localPath,
            progress: res => {
              const now = Date.now();
              if (now - lastProgressUpdate.current > 100) {
                if (res.contentLength && res.bytesWritten) {
                  setDownloadProgress(
                    (res.bytesWritten / res.contentLength) * 100,
                  );
                }
                lastProgressUpdate.current = now;
              }
            },
            progressDivider: 1,
            headers: { 'User-Agent': 'KeepFlick/1.0' },
          });
          await job.promise;
        } else {
          setDownloadProgress(100);
        }

        setIsDownloading(false);
        setDownloadProgress(100);
        setCurrentStep(currentStep + 1);
      };

      if (!onWifi) {
        Alert.alert(
          'Mobile Data Warning',
          'You are not on Wi-Fi. Downloading the Whisper model (~190MB) may incur carrier charges. Continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Download Anyway', onPress: proceed },
          ],
        );
      } else {
        await proceed();
      }
    } catch (e) {
      setIsDownloading(false);
      setDownloadProgress(0);
      Alert.alert(
        'Download Error',
        'Failed to download the Whisper model. Please try again.',
      );
    }
  };

  // --- NEW: Microphone permission implementation ---
  const handleMicrophonePermission = async () => {
    try {
      const hasPermission = await requestMicrophonePermission();
      if (hasPermission) {
        setCurrentStep(currentStep + 1);
      } else {
        Alert.alert(
          'Microphone Permission',
          'You can enable microphone access later in Settings.',
          [
            {
              text: 'Continue Anyway',
              onPress: () => setCurrentStep(currentStep + 1),
            },
          ],
        );
      }
    } catch {
      Alert.alert(
        'Permission Error',
        'Failed to request microphone permission.',
        [
          {
            text: 'Continue Anyway',
            onPress: () => setCurrentStep(currentStep + 1),
          },
        ],
      );
    }
  };

  // --- NEW: Theme selection implementation ---
  const handleThemeSelection = async () => {
    try {
      await AsyncStorage.setItem('skin', selectedTheme);
      setCurrentStep(currentStep + 1);
    } catch (error) {
      // Continue even if saving fails
      setCurrentStep(currentStep + 1);
    }
  };

  const step = onboardingSteps[currentStep];

  // --- Render Privacy step (unchanged) ---
  if (currentStep === 3) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
          <View style={styles.privacyContainer}>
            <View style={styles.privacyHeader}>
              <Text style={styles.icon}>{step.icon}</Text>
              <Text style={styles.title}>{step.title}</Text>
              <Text style={styles.subtitle}>{step.subtitle}</Text>
            </View>
            <View style={styles.agreementContainer}>
              <ScrollView
                style={styles.agreementScroll}
                contentContainerStyle={styles.agreementContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator
              >
                <Text style={styles.agreementText}>{privacyAgreementText}</Text>
              </ScrollView>
            </View>
            <View
              style={[
                styles.bottomContainer,
                { paddingBottom: insets.bottom || 16 },
              ]}
            >
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

  // --- NEW: Render Whisper Download step ---
  if (step?.type === 'whisper_download') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
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

            <View style={styles.contentContainer}>
              <Text style={styles.icon}>{isDownloading ? '📥' : '🎤'}</Text>
              <Text style={styles.title}>
                {isDownloading
                  ? 'Downloading Whisper Model…'
                  : 'Download Transcription Model'}
              </Text>
              <Text style={styles.subtitle}>
                Enables on-device voice-to-text
              </Text>
              <Text style={styles.description}>
                {isDownloading
                  ? `Downloading ${APP_CONFIG.getWhisperModelName()} (${APP_CONFIG.getWhisperModelSize()}).`
                  : `Model: ${APP_CONFIG.getWhisperModelName()}\nSize: ${APP_CONFIG.getWhisperModelSize()}\n\nWi-Fi recommended.`}
              </Text>

              {isDownloading && (
                <View style={{ marginTop: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" />
                  <Text style={{ color: '#fff', marginTop: 16 }}>
                    {currentPhrase}
                  </Text>
                  <Text style={{ color: '#fff', marginTop: 8 }}>
                    {`${Math.min(100, Math.max(0, downloadProgress)).toFixed(
                      0,
                    )}%`}
                  </Text>
                </View>
              )}
            </View>

            <View
              style={[
                styles.bottomContainer,
                { paddingBottom: insets.bottom || 16 },
              ]}
            >
              {currentStep > 0 && (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setCurrentStep(currentStep - 1)}
                  disabled={isDownloading}
                >
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              )}
              {!isDownloading && (
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={handleNext}
                >
                  <Text style={styles.nextButtonText}>Start Download</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // --- NEW: Render Microphone Permission step ---
  if (step?.type === 'microphone_permission') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
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

            <View style={styles.contentContainer}>
              <Text style={styles.icon}>🎙️</Text>
              <Text style={styles.title}>Microphone Permission</Text>
              <Text style={styles.subtitle}>
                Required for voice transcription
              </Text>
              <Text style={styles.description}>
                Your voice stays on device. We never upload audio.
              </Text>
            </View>

            <View
              style={[
                styles.bottomContainer,
                { paddingBottom: insets.bottom || 16 },
              ]}
            >
              {currentStep > 0 && (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setCurrentStep(currentStep - 1)}
                >
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                <Text style={styles.nextButtonText}>Grant Access</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // --- NEW: Render Theme Selection step ---
  if (step?.type === 'theme_selection') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
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

            <View style={styles.contentContainer}>
              <Text style={styles.icon}>🎨</Text>
              <Text style={styles.title}>Choose Your Theme</Text>
              <Text style={styles.subtitle}>Pick your favorite color</Text>
              <Text style={styles.description}>
                Select a theme that matches your style. You can change this
                later in settings.
              </Text>

              <View style={styles.themeSelectorContainer}>
                <TouchableOpacity
                  style={[
                    styles.themeOption,
                    selectedTheme === 'pink' && styles.themeOptionActive,
                  ]}
                  onPress={() => setSelectedTheme('pink')}
                >
                  <LinearGradient
                    colors={['#FFB3C1', '#FFD6E0']}
                    style={styles.themeGradient}
                  >
                    <Text style={styles.themeEmoji}>🌸</Text>
                    <Text
                      style={[
                        styles.themeOptionText,
                        selectedTheme === 'pink' &&
                          styles.themeOptionTextActive,
                      ]}
                    >
                      Pink
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.themeOption,
                    selectedTheme === 'blue' && styles.themeOptionActive,
                  ]}
                  onPress={() => setSelectedTheme('blue')}
                >
                  <LinearGradient
                    colors={['#9FD3FF', '#CBE7FF']}
                    style={styles.themeGradient}
                  >
                    <Text style={styles.themeEmoji}>💙</Text>
                    <Text
                      style={[
                        styles.themeOptionText,
                        selectedTheme === 'blue' &&
                          styles.themeOptionTextActive,
                      ]}
                    >
                      Blue
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

            <View
              style={[
                styles.bottomContainer,
                { paddingBottom: insets.bottom || 16 },
              ]}
            >
              {currentStep > 0 && (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setCurrentStep(currentStep - 1)}
                >
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                <Text style={styles.nextButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // --- Render Interactive Swipe step (unchanged appearance) ---
  if (step?.type === 'interactive_swipe') {
    const phaseLabel =
      swipePhase === 'right'
        ? 'Swipe Right'
        : swipePhase === 'left'
        ? 'Swipe Left'
        : 'Swipe Up';
    const phaseArrow =
      swipePhase === 'right' ? '➡️' : swipePhase === 'left' ? '⬅️' : '⬆️';
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
          <PanGestureHandler onHandlerStateChange={handleSwipeGesture}>
            <View style={styles.interactiveContainer}>
              <View>
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
              </View>
              <View style={styles.contentContainer}>
                <View style={styles.interactiveArea}>
                  {swipePhase === 'up' && (
                    <View style={styles.trashContainer}>
                      <Text style={styles.trashIcon}>🗑️</Text>
                    </View>
                  )}
                  {logoVisible && (
                    <Animated.View
                      style={[styles.animatedImage, { opacity: logoOpacity }]}
                    >
                      <Image
                        source={LOGO_IMAGE}
                        style={styles.onboardingImage}
                        resizeMode="contain"
                      />
                    </Animated.View>
                  )}
                  <View style={styles.arrowLabelContainer}>
                    <Text style={styles.arrowText}>{phaseArrow}</Text>
                    <Text style={styles.arrowLabelBig}>{phaseLabel}</Text>
                  </View>
                </View>
              </View>
              <View
                style={[
                  styles.bottomContainer,
                  { paddingBottom: insets.bottom || 16 },
                ]}
              >
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={goToPrevSwipePhase}
                >
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={handleSkipSwipe}
                >
                  <Text style={styles.nextButtonText}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </PanGestureHandler>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // --- Default generic steps (welcome/smart/safe + final photos permission) ---
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
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
          <View style={styles.contentContainer}>
            <Text style={styles.icon}>{step.icon}</Text>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.subtitle}>{step.subtitle}</Text>
            <Text style={styles.description}>{step.description}</Text>
          </View>
          <View
            style={[
              styles.bottomContainer,
              { paddingBottom: insets.bottom || 16 },
            ]}
          >
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
                  ? 'Continue'
                  : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

// --- styles (unchanged from your file) ---
const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: responsiveValues.topPadding,
    paddingBottom: responsiveValues.bottomPadding,
    justifyContent: 'space-between',
    minHeight: height - 100,
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
  activeProgressDot: { backgroundColor: '#ffffff' },
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
  singleButton: { marginLeft: 0 },
  nextButtonText: {
    color: '#667eea',
    fontSize: responsiveValues.buttonText,
    fontWeight: '700',
    textAlign: 'center',
  },

  // privacy styles
  privacyContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: responsiveValues.topPadding,
    paddingBottom: responsiveValues.bottomPadding,
  },
  privacyHeader: { alignItems: 'center', marginBottom: 20 },
  agreementContainer: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    marginBottom: 20,
  },
  agreementScroll: { flex: 1 },
  agreementContent: { padding: 20 },
  agreementText: {
    fontSize: responsiveValues.descriptionSize - 1,
    color: '#ffffff',
    lineHeight: (responsiveValues.descriptionSize - 1) * 1.4,
    opacity: 0.9,
  },
  disabledButton: { backgroundColor: 'rgba(255, 255, 255, 0.3)' },
  disabledButtonText: { color: 'rgba(255, 255, 255, 0.6)' },

  // interactive swipe
  interactiveContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: responsiveValues.topPadding,
    paddingBottom: responsiveValues.bottomPadding,
  },
  onboardingImage: { width: '100%', height: '100%', borderRadius: 24 },
  interactiveArea: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 40,
  },
  trashContainer: {
    width: width * 0.1,
    height: width * 0.1,
    borderRadius: width * 0.05,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  trashIcon: { fontSize: width * 0.05 },
  animatedImage: {
    width: width * 0.7,
    height: height * 0.35,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  arrowText: { fontSize: width * 0.1, color: '#ffffff', fontWeight: 'bold' },
  arrowLabelBig: {
    fontSize: responsiveValues.subtitleSize + 2,
    color: '#ffffff',
    marginTop: 8,
    textAlign: 'center',
  },
  arrowLabelContainer: {
    position: 'absolute',
    bottom: -height * 0.15,
    alignItems: 'center',
  },

  // Theme selection styles
  themeSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 40,
    paddingHorizontal: 20,
  },
  themeOption: {
    width: width * 0.35,
    height: width * 0.35,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  themeOptionActive: {
    borderColor: '#ffffff',
    borderWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  themeGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  themeEmoji: {
    fontSize: 50,
    marginBottom: 10,
  },
  themeOptionText: {
    fontSize: responsiveValues.subtitleSize,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  themeOptionTextActive: {
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});

export default Onboarding;
