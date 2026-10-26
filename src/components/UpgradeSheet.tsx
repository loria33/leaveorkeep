import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMedia } from '../context/MediaContext';
import InAppPurchaseManager from '../utils/InAppPurchaseManager';
import { getViewingConfig } from '../constants/app';
import { formatCountdown, getViewBudget } from '../utils/viewBudget';
import { hapticSuccess } from '../utils/haptics';
import { colors } from '../theme';

/**
 * UpgradeSheet - bottom sheet opened from the "views left" badge, the About
 * tab and the viewer's limit screen.
 *
 * Tells the user where they stand (views left, or a live refill countdown once
 * they've run out), explains what Premium changes, and runs the purchase and
 * restore flows inline with their loading, error and success states. Dismiss
 * by dragging the sheet down, tapping the backdrop or "Not now".
 */

interface UpgradeSheetProps {
  visible: boolean;
  onClose: () => void;
}

type Phase = 'idle' | 'purchasing' | 'restoring' | 'success';

const STORE = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
const SCREEN_HEIGHT = Dimensions.get('window').height;
const TEAL = colors.teal;
const INK = colors.ink;

/** Drag further than this, or flick faster, and the sheet closes */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.9;

const BENEFITS = [
  { icon: '∞', title: 'Unlimited views', detail: 'No counter, no waiting.' },
  { icon: '🚫', title: 'No ads', detail: 'A clean, uninterrupted gallery.' },
  {
    icon: '💎',
    title: 'Pay once',
    detail: 'One-time purchase. Yours forever.',
  },
];

const wait = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/** Store-localised price from whichever field this react-native-iap version uses */
const readDisplayPrice = (product: unknown): string | null => {
  const p = product as {
    displayPrice?: unknown;
    localizedPrice?: unknown;
  } | null;
  const price = p?.displayPrice ?? p?.localizedPrice;
  return typeof price === 'string' && price.length > 0 ? price : null;
};

const UpgradeSheet: React.FC<UpgradeSheetProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const {
    viewingLimits,
    isPremiumUser,
    getRemainingCooldownTime,
    setPremiumStatus,
  } = useMedia();
  const { maxViews, cooldownMinutes } = getViewingConfig();

  // The modal stays mounted while the exit animation plays
  const [mounted, setMounted] = useState(visible);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [cooldownMs, setCooldownMs] = useState(0);

  const progress = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const priceRequested = useRef(false);
  const celebrated = useRef(false);
  const cooldownRef = useRef(getRemainingCooldownTime);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(false);

  useEffect(() => {
    cooldownRef.current = getRemainingCooldownTime;
  }, [getRemainingCooldownTime]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const budget = getViewBudget(
    viewingLimits.remainingViews,
    maxViews,
    viewingLimits.isBlocked,
  );
  const isBlocked = budget.tone === 'blocked';
  const busy = phase === 'purchasing' || phase === 'restoring';

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // Slide in when asked to show; slide out, then unmount, when asked to hide
  useEffect(() => {
    if (visible) {
      setMounted(true);
      setError(null);
      celebrated.current = false;
      dragY.setValue(0);
      Animated.spring(progress, {
        toValue: 1,
        damping: 22,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }
  }, [visible, mounted, progress, dragY]);

  // Drag the sheet down to dismiss; a short drag springs back
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        !busyRef.current &&
        gesture.dy > 6 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
      onPanResponderMove: (_event, gesture) => {
        dragY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          onCloseRef.current();
          return;
        }
        Animated.spring(dragY, {
          toValue: 0,
          damping: 20,
          stiffness: 260,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, {
          toValue: 0,
          damping: 20,
          stiffness: 260,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const celebrate = useCallback(() => {
    if (!celebrated.current) {
      celebrated.current = true;
      hapticSuccess();
    }
    setPhase('success');
  }, []);

  // Premium can also land via the store's purchase listener; reflect it either way
  useEffect(() => {
    if (mounted && isPremiumUser && phase !== 'success') {
      celebrate();
    }
  }, [mounted, isPremiumUser, phase, celebrate]);

  // Fetch the localised price once; the button works without it
  useEffect(() => {
    if (!visible || isPremiumUser || priceRequested.current) {
      return;
    }
    priceRequested.current = true;
    InAppPurchaseManager.getInstance()
      .getProducts()
      .then(products => {
        const found = products.map(readDisplayPrice).find(Boolean) ?? null;
        setPrice(found);
      })
      .catch(() => {
        priceRequested.current = false;
      });
  }, [visible, isPremiumUser]);

  // Live refill countdown while the sheet is open and the limit is hit
  useEffect(() => {
    if (!mounted || !isBlocked) {
      setCooldownMs(0);
      return;
    }
    const tick = () => setCooldownMs(cooldownRef.current());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mounted, isBlocked]);

  const requestClose = useCallback(() => {
    if (!busy) {
      onClose();
    }
  }, [busy, onClose]);

  const handleUpgrade = useCallback(async () => {
    if (busy) {
      return;
    }
    setPhase('purchasing');
    setError(null);
    try {
      const iap = InAppPurchaseManager.getInstance();
      const requested = await iap.purchaseRemoveAds();
      if (!requested) {
        // Backed out of the store sheet; nothing to report
        setPhase('idle');
        return;
      }

      // The store confirms asynchronously: give the purchase listener a moment, then verify
      let premium = false;
      for (const delay of [1000, 2000]) {
        await wait(delay);
        premium = await iap.checkPremiumStatus();
        if (premium) {
          break;
        }
      }

      if (premium) {
        await setPremiumStatus(true);
        celebrate();
      } else {
        setPhase('idle');
        setError(
          `${STORE} is still confirming your purchase. If it doesn't unlock in a moment, tap Restore Purchases.`,
        );
      }
    } catch (e) {
      setPhase('idle');
      const { code, message } = (e ?? {}) as {
        code?: string;
        message?: string;
      };
      if (code !== 'E_USER_CANCELLED') {
        setError(
          message || "Couldn't complete the purchase. Please try again.",
        );
      }
    }
  }, [busy, celebrate, setPremiumStatus]);

  const handleRestore = useCallback(async () => {
    if (busy) {
      return;
    }
    setPhase('restoring');
    setError(null);
    try {
      const iap = InAppPurchaseManager.getInstance();
      const restored = await iap.restorePurchases();
      const premium = restored && (await iap.checkPremiumStatus());
      if (premium) {
        await setPremiumStatus(true);
        celebrate();
      } else {
        setPhase('idle');
        setError(`No previous purchase was found on ${STORE}.`);
      }
    } catch (e) {
      setPhase('idle');
      const { message } = (e ?? {}) as { message?: string };
      setError(message || "Couldn't restore purchases. Please try again.");
    }
  }, [busy, celebrate, setPremiumStatus]);

  if (!mounted) {
    return null;
  }

  const slideY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });
  const translateY = Animated.add(slideY, dragY);
  const backdropOpacity = Animated.multiply(
    progress,
    dragY.interpolate({
      inputRange: [0, 320],
      outputRange: [1, 0.35],
      extrapolate: 'clamp',
    }),
  );
  const fillWidth = `${Math.round(budget.fraction * 100)}%` as const;

  const renderOffer = () => (
    <>
      {/* Where you stand */}
      <View
        style={[
          styles.statusCard,
          { borderColor: budget.border, backgroundColor: budget.background },
        ]}
      >
        <View style={styles.statusHero}>
          <Text
            style={[styles.statusNumber, { color: budget.color }]}
            testID="upgrade-status-number"
          >
            {isBlocked ? formatCountdown(cooldownMs) : budget.remaining}
          </Text>
          <Text style={styles.statusLabel}>
            {isBlocked
              ? 'until your free views refill'
              : `of ${maxViews} free views left`}
          </Text>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: fillWidth, backgroundColor: budget.color },
            ]}
          />
        </View>
        <Text style={styles.statusHint}>
          {isBlocked
            ? `All ${maxViews} free views used. Wait it out, or go unlimited below.`
            : `Free views refill ${cooldownMinutes} minutes after they run out.`}
        </Text>
      </View>

      {/* What Premium changes */}
      <Text style={styles.pitchTitle}>Go unlimited with Premium</Text>
      {BENEFITS.map(benefit => (
        <View key={benefit.title} style={styles.benefitRow}>
          <View style={styles.benefitIconWrap}>
            <Text style={styles.benefitIcon}>{benefit.icon}</Text>
          </View>
          <View style={styles.benefitText}>
            <Text style={styles.benefitTitle}>{benefit.title}</Text>
            <Text style={styles.benefitDetail}>{benefit.detail}</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={[styles.cta, busy && styles.ctaDisabled]}
        onPress={handleUpgrade}
        disabled={busy}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy: phase === 'purchasing' }}
        testID="upgrade-cta"
      >
        {phase === 'purchasing' ? (
          <ActivityIndicator color={INK} />
        ) : (
          <>
            <Text style={styles.ctaText}>Upgrade to Premium</Text>
            <Text style={styles.ctaSub}>
              {price ? `${price} · one-time purchase` : 'One-time purchase'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {error && (
        <Text
          style={styles.errorText}
          accessibilityLiveRegion="polite"
          testID="upgrade-error"
        >
          {error}
        </Text>
      )}

      <View style={styles.footerRow}>
        <TouchableOpacity
          onPress={handleRestore}
          disabled={busy}
          hitSlop={styles.hitSlop}
          accessibilityRole="button"
          testID="upgrade-restore"
        >
          {phase === 'restoring' ? (
            <ActivityIndicator size="small" color={TEAL} />
          ) : (
            <Text style={styles.linkText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={requestClose}
          disabled={busy}
          hitSlop={styles.hitSlop}
          accessibilityRole="button"
          testID="upgrade-dismiss"
        >
          <Text style={styles.dismissText}>Not now</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.finePrint}>
        Billed once through {STORE}. No subscription.
      </Text>
    </>
  );

  const renderSuccess = () => (
    <View style={styles.successWrap} testID="upgrade-success">
      <View style={styles.successBadge}>
        <Text style={styles.successCheck}>✓</Text>
      </View>
      <Text style={styles.successTitle}>You're Premium</Text>
      <Text style={styles.successBody}>
        Unlimited views unlocked. No counter, no ads, no waiting.
      </Text>
      <TouchableOpacity
        style={[styles.cta, styles.ctaStretch]}
        onPress={onClose}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>Start browsing</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 16,
              transform: [{ translateY }],
            },
          ]}
          accessibilityViewIsModal
          testID="upgrade-sheet"
          {...panResponder.panHandlers}
        >
          <View style={styles.handle} />
          {phase === 'success' ? renderSuccess() : renderOffer()}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 8, 20, 0.6)',
  },
  sheet: {
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: 18,
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 22,
  },
  statusHero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  statusNumber: {
    fontSize: 40,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginRight: 10,
  },
  statusLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    marginBottom: 12,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  statusHint: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  pitchTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(78, 205, 196, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  benefitIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: TEAL,
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  benefitDetail: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 1,
  },
  cta: {
    marginTop: 10,
    minHeight: 60,
    backgroundColor: TEAL,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaStretch: {
    alignSelf: 'stretch',
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '800',
    color: INK,
  },
  ctaSub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(11, 16, 32, 0.7)',
    marginTop: 2,
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: colors.coral,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  hitSlop: {
    top: 10,
    bottom: 10,
    left: 10,
    right: 10,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: TEAL,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  finePrint: {
    marginTop: 14,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(78, 205, 196, 0.18)',
    borderWidth: 2,
    borderColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successCheck: {
    fontSize: 34,
    fontWeight: '800',
    color: TEAL,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  successBody: {
    fontSize: 15,
    lineHeight: 21,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 12,
  },
});

export default UpgradeSheet;
