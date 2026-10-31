import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import RNFS from 'react-native-fs';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMedia } from '../context/MediaContext';
import {
  requestMediaPermissions,
  checkMediaPermissionsWithRetry,
  requestMicrophonePermission,
} from '../utils/permissions';
import { APP_CONFIG } from '../constants/app';
import ScreenBackground from '../components/ScreenBackground';
import {
  colors,
  getSkinTheme,
  radius,
  Skin,
  SkinTheme,
  skinThemes,
} from '../theme';
import { hapticTap } from '../utils/haptics';

/**
 * Onboarding - the first-run walkthrough, drawn with the same dark gradient,
 * glass cards and accent buttons as the rest of the app. Picking a theme on
 * the theme step recolours the whole screen live so the choice is a preview.
 */

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

const isSmallScreen = height < 700;
const isMediumScreen = height >= 700 && height < 800;
const getResponsiveSize = (small: number, medium: number, large: number) => {
  if (isSmallScreen) return small;
  if (isMediumScreen) return medium;
  return large;
};

const HERO_SIZE = getResponsiveSize(84, 96, 108);
const HERO_ICON_SIZE = Math.round(HERO_SIZE * 0.44);
const TITLE_SIZE = getResponsiveSize(26, 28, 30);
const BODY_SIZE = getResponsiveSize(15, 15, 16);

type StepType =
  | 'privacy'
  | 'theme_selection'
  | 'whisper_download'
  | 'microphone_permission'
  | 'interactive_swipe';

interface Highlight {
  /** Ionicons glyph */
  icon: string;
  text: string;
}

interface OnboardingStep {
  type?: StepType;
  /** Ionicons glyph for the hero ring; the welcome step shows the brand mark instead */
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  highlights?: Highlight[];
}

const onboardingSteps: OnboardingStep[] = [
  {
    icon: 'sparkles-outline',
    title: 'Welcome to KeepFlick',
    subtitle: 'Your smart media cleanup companion',
    description:
      'Turn a cluttered gallery into an organized one. Flick through your memories and keep only what matters.',
    highlights: [
      { icon: 'hand-left-outline', text: 'Swipe to keep or flick away' },
      { icon: 'calendar-outline', text: 'Everything grouped by month' },
      { icon: 'lock-closed-outline', text: 'Private, and on your device' },
    ],
  },
  {
    icon: 'calendar-outline',
    title: 'Smart organization',
    subtitle: 'Photos grouped by month and source',
    description:
      'Your library is sorted by month and by where each photo came from, so the right ones are always easy to find.',
    highlights: [
      { icon: 'logo-whatsapp', text: 'WhatsApp photos and videos' },
      { icon: 'camera-outline', text: 'Camera roll' },
      { icon: 'phone-portrait-outline', text: 'Screenshots' },
    ],
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Safe & secure',
    subtitle: 'Nothing is deleted immediately',
    description:
      "Flicked photos go to KeepFlick's trash first. Restore them any time, or empty the trash once you're sure.",
    highlights: [
      { icon: 'trash-outline', text: 'Flicked items wait in the trash' },
      { icon: 'refresh-outline', text: 'Restore them with one tap' },
      {
        icon: 'checkmark-circle-outline',
        text: 'Delete for good only when you say so',
      },
    ],
  },
  {
    type: 'privacy',
    icon: 'document-text-outline',
    title: 'Privacy & usage',
    subtitle: 'Please review and accept our terms',
    description:
      'Before we can help organize your photos, please review our privacy policy and usage agreement.',
  },
  {
    type: 'theme_selection',
    icon: 'color-palette-outline',
    title: 'Choose your look',
    subtitle: 'Pick an accent colour',
    description: 'You can change this any time from the home screen.',
  },
  // // NEW STEP (Whisper download)
  // {
  //   type: 'whisper_download',
  //   icon: 'cloud-download-outline',
  //   title: 'Download transcription model',
  //   subtitle: 'Enables on-device voice-to-text',
  //   description: '',
  // },
  // // NEW STEP (Microphone permission)
  // {
  //   type: 'microphone_permission',
  //   icon: 'mic-outline',
  //   title: 'Microphone permission',
  //   subtitle: 'Required for voice transcription',
  //   description:
  //     'We only use the mic locally on your device for voice-to-text. Nothing is uploaded.',
  // },
  {
    icon: 'images-outline',
    title: 'Ready to start?',
    subtitle: 'KeepFlick needs access to your photos',
    description:
      'Allow photo access so KeepFlick can organize your library month by month. Your photos never leave your device.',
    highlights: [
      { icon: 'cloud-offline-outline', text: 'No uploads, ever' },
      { icon: 'eye-off-outline', text: 'Nothing is shared or tracked' },
      { icon: 'settings-outline', text: 'Change access any time in Settings' },
    ],
  },
];

const PRIVACY_STEP = onboardingSteps.findIndex(s => s.type === 'privacy');
const LAST_STEP = onboardingSteps.length - 1;

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

const BRAND_MARK = require('../assets/kf-mark.png');
const LOGO_IMAGE = require('../assets/logoinApp.png');

// --- Shared building blocks -------------------------------------------------

/** Thin accent segments, one per step, with a "current / total" counter */
const StepProgress: React.FC<{ current: number; accent: string }> = ({
  current,
  accent,
}) => (
  <View style={styles.progressRow}>
    <View style={styles.progressTrack}>
      {onboardingSteps.map((_, index) => (
        <View
          key={index}
          style={[
            styles.progressSegment,
            index <= current && { backgroundColor: accent },
          ]}
        />
      ))}
    </View>
    <Text style={styles.progressLabel}>
      {current + 1}/{onboardingSteps.length}
    </Text>
  </View>
);

/** Glass ring holding either an accent-coloured glyph or the brand mark */
const StepHero: React.FC<{
  icon: string;
  theme: SkinTheme;
  brand?: boolean;
}> = ({ icon, theme, brand }) => (
  <View
    style={[
      styles.heroRing,
      { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder },
    ]}
  >
    {brand ? (
      <Image source={BRAND_MARK} style={styles.heroMark} resizeMode="contain" />
    ) : (
      <Ionicons name={icon} size={HERO_ICON_SIZE} color={theme.accent} />
    )}
  </View>
);

const StepCopy: React.FC<{ step: OnboardingStep; theme: SkinTheme }> = ({
  step,
  theme,
}) => (
  <>
    <Text style={styles.title}>{step.title}</Text>
    <Text style={[styles.subtitle, { color: theme.accent }]}>
      {step.subtitle}
    </Text>
    {step.description.length > 0 && (
      <Text style={styles.description}>{step.description}</Text>
    )}
  </>
);

const HighlightCard: React.FC<{
  highlights: Highlight[];
  theme: SkinTheme;
}> = ({ highlights, theme }) => (
  <View style={styles.highlightCard}>
    {highlights.map((item, index) => (
      <View
        key={item.text}
        style={[
          styles.highlightRow,
          index < highlights.length - 1 && styles.highlightRowDivider,
        ]}
      >
        <View
          style={[
            styles.highlightIconWrap,
            { backgroundColor: theme.accentSoft },
          ]}
        >
          <Ionicons name={item.icon} size={18} color={theme.accent} />
        </View>
        <Text style={styles.highlightText}>{item.text}</Text>
      </View>
    ))}
  </View>
);

interface FooterProps {
  theme: SkinTheme;
  bottomInset: number;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  onBack?: () => void;
  backDisabled?: boolean;
}

/** Compact glass "Back" beside a full-width accent action */
const StepFooter: React.FC<FooterProps> = ({
  theme,
  bottomInset,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  onBack,
  backDisabled,
}) => (
  <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, 20) }]}>
    {onBack && (
      <TouchableOpacity
        style={[styles.backButton, backDisabled && styles.buttonDimmed]}
        onPress={onBack}
        disabled={backDisabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
    )}
    <TouchableOpacity
      style={[
        styles.primaryButton,
        { backgroundColor: theme.accent },
        primaryDisabled && styles.primaryButtonDisabled,
      ]}
      onPress={onPrimary}
      disabled={primaryDisabled || primaryLoading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!primaryDisabled }}
    >
      {primaryLoading ? (
        <ActivityIndicator color={theme.accentInk} />
      ) : (
        <Text
          style={[
            styles.primaryButtonText,
            { color: theme.accentInk },
            primaryDisabled && styles.primaryButtonTextDisabled,
          ]}
        >
          {primaryLabel}
        </Text>
      )}
    </TouchableOpacity>
  </View>
);

/** A theme card: the skin's real gradient with a tiny mock of the home screen on it */
const ThemeChoice: React.FC<{
  skin: Skin;
  label: string;
  selected: boolean;
  onPress: () => void;
}> = ({ skin, label, selected, onPress }) => {
  const theme = skinThemes[skin];
  return (
    <TouchableOpacity
      style={[styles.themeCard, selected && { borderColor: theme.accent }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} theme`}
    >
      <LinearGradient
        colors={theme.background}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.themePreview}
      >
        <View
          style={[styles.themePreviewPill, { backgroundColor: theme.accent }]}
        />
        <View style={styles.themePreviewLine} />
        <View style={[styles.themePreviewLine, styles.themePreviewLineShort]} />
      </LinearGradient>
      <View style={styles.themeCardFooter}>
        <View style={[styles.themeDot, { backgroundColor: theme.accent }]} />
        <Text style={styles.themeLabel}>{label}</Text>
        {selected && (
          <View style={[styles.themeCheck, { backgroundColor: theme.accent }]}>
            <Ionicons name="checkmark" size={14} color={theme.accentInk} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// --- Screen ------------------------------------------------------------------

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
  const phraseIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Theme selection state; the whole screen is drawn in this skin
  const [selectedTheme, setSelectedTheme] = useState<Skin>('blue');
  const theme = getSkinTheme(selectedTheme);

  // Each step's content fades and lifts into place
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [currentStep, enter]);
  const enterStyle = {
    opacity: enter,
    transform: [
      {
        translateY: enter.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

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

  const goToStep = (index: number) => {
    hapticTap();
    setCurrentStep(index);
  };
  const goBack = () => goToStep(currentStep - 1);

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

    if (currentStep < LAST_STEP) {
      goToStep(currentStep + 1);
      if (currentStep === PRIVACY_STEP) setHasScrolledToBottom(false); // reset after privacy step
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
    await new Promise<void>(r => setTimeout(r, 500));
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
    } catch {
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
      goToStep(currentStep + 1);
    } catch {
      // Continue even if saving fails
      goToStep(currentStep + 1);
    }
  };

  const step = onboardingSteps[currentStep];

  /** Every step shares the backdrop, safe area, progress strip and pinned footer */
  const renderFrame = (body: React.ReactNode, footer: React.ReactNode) => (
    <ScreenBackground skin={selectedTheme}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" />
        <StepProgress current={currentStep} accent={theme.accent} />
        {body}
        {footer}
      </SafeAreaView>
    </ScreenBackground>
  );

  // --- Render Privacy step ---
  if (step?.type === 'privacy') {
    return renderFrame(
      <Animated.View style={[styles.privacyBody, enterStyle]}>
        <View style={styles.privacyHeader}>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={[styles.subtitle, { color: theme.accent }]}>
            {step.subtitle}
          </Text>
        </View>
        <View style={styles.agreementCard}>
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
        {!hasScrolledToBottom && (
          <Text style={styles.agreementHint}>
            Scroll to the end of the agreement to continue
          </Text>
        )}
      </Animated.View>,
      <StepFooter
        theme={theme}
        bottomInset={insets.bottom}
        onBack={goBack}
        primaryLabel={hasScrolledToBottom ? 'I accept' : 'Scroll to accept'}
        onPrimary={handleNext}
        primaryDisabled={!hasScrolledToBottom}
      />,
    );
  }

  // --- Render Whisper Download step ---
  if (step?.type === 'whisper_download') {
    const percent = Math.min(100, Math.max(0, downloadProgress));
    return renderFrame(
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View style={[styles.content, enterStyle]}>
          <StepHero
            icon={isDownloading ? 'cloud-download-outline' : 'mic-outline'}
            theme={theme}
          />
          <Text style={styles.title}>
            {isDownloading
              ? 'Downloading Whisper model'
              : 'Download transcription model'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.accent }]}>
            Enables on-device voice-to-text
          </Text>
          <Text style={styles.description}>
            {isDownloading
              ? `Downloading ${APP_CONFIG.getWhisperModelName()} (${APP_CONFIG.getWhisperModelSize()}).`
              : `Model: ${APP_CONFIG.getWhisperModelName()}\nSize: ${APP_CONFIG.getWhisperModelSize()}\n\nWi-Fi recommended.`}
          </Text>

          {isDownloading && (
            <View style={styles.downloadCard}>
              <View style={styles.downloadTrack}>
                <View
                  style={[
                    styles.downloadFill,
                    { width: `${percent}%`, backgroundColor: theme.accent },
                  ]}
                />
              </View>
              <View style={styles.downloadRow}>
                <Text style={styles.downloadPhrase} numberOfLines={1}>
                  {currentPhrase}
                </Text>
                <Text style={styles.downloadPercent}>
                  {`${percent.toFixed(0)}%`}
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>,
      <StepFooter
        theme={theme}
        bottomInset={insets.bottom}
        onBack={currentStep > 0 ? goBack : undefined}
        backDisabled={isDownloading}
        primaryLabel="Start download"
        onPrimary={handleNext}
        primaryLoading={isDownloading}
      />,
    );
  }

  // --- Render Microphone Permission step ---
  if (step?.type === 'microphone_permission') {
    return renderFrame(
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View style={[styles.content, enterStyle]}>
          <StepHero icon="mic-outline" theme={theme} />
          <Text style={styles.title}>Microphone permission</Text>
          <Text style={[styles.subtitle, { color: theme.accent }]}>
            Required for voice transcription
          </Text>
          <Text style={styles.description}>
            Your voice stays on device. We never upload audio.
          </Text>
        </Animated.View>
      </ScrollView>,
      <StepFooter
        theme={theme}
        bottomInset={insets.bottom}
        onBack={currentStep > 0 ? goBack : undefined}
        primaryLabel="Grant access"
        onPrimary={handleNext}
      />,
    );
  }

  // --- Render Theme Selection step ---
  if (step?.type === 'theme_selection') {
    return renderFrame(
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View style={[styles.content, enterStyle]}>
          <StepHero icon={step.icon} theme={theme} />
          <StepCopy step={step} theme={theme} />
          <View style={styles.themeRow}>
            <ThemeChoice
              skin="blue"
              label="Teal"
              selected={selectedTheme === 'blue'}
              onPress={() => setSelectedTheme('blue')}
            />
            <ThemeChoice
              skin="pink"
              label="Pink"
              selected={selectedTheme === 'pink'}
              onPress={() => setSelectedTheme('pink')}
            />
          </View>
        </Animated.View>
      </ScrollView>,
      <StepFooter
        theme={theme}
        bottomInset={insets.bottom}
        onBack={currentStep > 0 ? goBack : undefined}
        primaryLabel="Continue"
        onPrimary={handleNext}
      />,
    );
  }

  // --- Render Interactive Swipe step ---
  if (step?.type === 'interactive_swipe') {
    const phaseLabel =
      swipePhase === 'right'
        ? 'Swipe right'
        : swipePhase === 'left'
        ? 'Swipe left'
        : 'Swipe up';
    const phaseArrow =
      swipePhase === 'right'
        ? 'arrow-forward'
        : swipePhase === 'left'
        ? 'arrow-back'
        : 'arrow-up';
    return renderFrame(
      <PanGestureHandler onHandlerStateChange={handleSwipeGesture}>
        <View style={styles.interactiveContainer}>
          {swipePhase === 'up' && (
            <View style={styles.trashRing}>
              <Ionicons name="trash-outline" size={22} color={colors.text} />
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
            <Ionicons name={phaseArrow} size={36} color={theme.accent} />
            <Text style={styles.arrowLabel}>{phaseLabel}</Text>
          </View>
        </View>
      </PanGestureHandler>,
      <StepFooter
        theme={theme}
        bottomInset={insets.bottom}
        onBack={goToPrevSwipePhase}
        primaryLabel="Skip"
        onPrimary={handleSkipSwipe}
      />,
    );
  }

  // --- Default generic steps (welcome/smart/safe + final photos permission) ---
  const isLast = currentStep === LAST_STEP;
  return renderFrame(
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <Animated.View style={[styles.content, enterStyle]}>
        <StepHero icon={step.icon} theme={theme} brand={currentStep === 0} />
        <StepCopy step={step} theme={theme} />
        {step.highlights && (
          <HighlightCard highlights={step.highlights} theme={theme} />
        )}
      </Animated.View>
    </ScrollView>,
    <StepFooter
      theme={theme}
      bottomInset={insets.bottom}
      onBack={currentStep > 0 ? goBack : undefined}
      primaryLabel={isLast ? 'Allow photo access' : 'Continue'}
      onPrimary={handleNext}
      primaryLoading={isRequestingPermission}
    />,
  );
};

// --- styles ------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 6,
  },
  progressTrack: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceRaised,
  },
  progressLabel: {
    marginLeft: 14,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: getResponsiveSize(12, 20, 28),
  },
  content: {
    alignItems: 'center',
  },
  heroRing: {
    width: HERO_SIZE,
    height: HERO_SIZE,
    borderRadius: HERO_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: getResponsiveSize(18, 22, 26),
  },
  heroMark: {
    width: HERO_SIZE * 0.6,
    height: HERO_SIZE * 0.6,
  },
  title: {
    fontSize: TITLE_SIZE,
    lineHeight: TITLE_SIZE * 1.2,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: BODY_SIZE,
    lineHeight: BODY_SIZE * 1.5,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  highlightCard: {
    alignSelf: 'stretch',
    marginTop: getResponsiveSize(20, 26, 32),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  highlightRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  highlightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  highlightText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingLeft: 12,
    paddingRight: 18,
    borderRadius: radius.md + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: 2,
  },
  buttonDimmed: {
    opacity: 0.4,
  },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: colors.surfaceRaised,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  primaryButtonTextDisabled: {
    color: colors.textMuted,
  },

  // privacy
  privacyBody: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: getResponsiveSize(8, 14, 20),
  },
  privacyHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  agreementCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  agreementScroll: {
    flex: 1,
  },
  agreementContent: {
    padding: 18,
  },
  agreementText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  agreementHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },

  // whisper download
  downloadCard: {
    alignSelf: 'stretch',
    marginTop: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  downloadTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    marginBottom: 12,
  },
  downloadFill: {
    height: '100%',
    borderRadius: 3,
  },
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  downloadPhrase: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    marginRight: 12,
  },
  downloadPercent: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },

  // interactive swipe
  interactiveContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  trashRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  animatedImage: {
    width: width * 0.7,
    height: height * 0.35,
    borderRadius: radius.xl,
    backgroundColor: colors.sheet,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  onboardingImage: {
    width: '100%',
    height: '100%',
  },
  arrowLabelContainer: {
    alignItems: 'center',
    marginTop: 28,
  },
  arrowLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 6,
  },

  // theme selection
  themeRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 14,
    marginTop: getResponsiveSize(22, 28, 34),
  },
  themeCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  themePreview: {
    height: getResponsiveSize(104, 120, 132),
    padding: 14,
    justifyContent: 'flex-end',
  },
  themePreviewPill: {
    width: 44,
    height: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  themePreviewLine: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 6,
  },
  themePreviewLineShort: {
    width: '60%',
    marginBottom: 0,
  },
  themeCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  themeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  themeLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  themeCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Onboarding;
