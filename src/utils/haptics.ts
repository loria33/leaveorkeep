import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const OPTIONS = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

const trigger = (type: 'impactLight' | 'impactHeavy') => {
  try {
    ReactNativeHapticFeedback.trigger(type, OPTIONS);
  } catch {
    // Haptics are best-effort; never let them break the command flow
  }
};

/** Light tap confirming a "keep" voice command */
export const hapticKeep = () => trigger('impactLight');

/** Heavier thud confirming a "flick" (trash) voice command */
export const hapticFlick = () => trigger('impactHeavy');
