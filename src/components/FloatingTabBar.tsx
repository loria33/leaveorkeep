import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors, TAB_BAR_BOTTOM_GAP, TAB_BAR_HEIGHT } from '../theme';
import { hapticTap } from '../utils/haptics';

/**
 * FloatingTabBar - a rounded glass pill that floats above the content instead
 * of a full-width bar stuck to the bottom edge. Each tab shows its icon
 * (filled when active) and label inside a soft accent pill, with the trash
 * count as a badge. Hidden on immersive screens such as the media viewer.
 */

/** Nested stack screens that take the whole display */
const IMMERSIVE_ROUTES = new Set(['MediaViewerScreen']);

/**
 * iOS: register the glyph font at runtime from the ttf the pod bundles, so the
 * icons also work in a build whose Info.plist predates the UIAppFonts entry.
 * Resolves true once the font is usable (registered here, or already by the
 * plist) and false if loading failed. Android registers fonts at build time
 * via fonts.gradle, so there is nothing to do there.
 */
const iconFontReady: Promise<boolean> =
  Platform.OS === 'ios'
    ? Ionicons.loadFont().then(
        () => true,
        () => false,
      )
    : Promise.resolve(false);

type TabRoute = BottomTabBarProps['state']['routes'][number];

const focusedNestedRouteName = (route: TabRoute): string | undefined => {
  const nested = route.state;
  if (!nested || typeof nested.index !== 'number') {
    return undefined;
  }
  return nested.routes[nested.index]?.name;
};

const formatBadge = (badge: number | string | undefined): string | null => {
  if (badge === undefined || badge === null || badge === '') {
    return null;
  }
  if (typeof badge === 'number') {
    return badge > 99 ? '99+' : String(badge);
  }
  return badge;
};

interface TabButtonProps {
  focused: boolean;
  label: string;
  color: string;
  icon: React.ReactNode;
  badge: string | null;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

const TabButton: React.FC<TabButtonProps> = ({
  focused,
  label,
  color,
  icon,
  badge,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}) => {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.92)).current;

  // A small pop as a tab becomes active
  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1 : 0.92,
      damping: 14,
      stiffness: 220,
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.tabInner,
          focused && styles.tabInnerActive,
          { transform: [{ scale }] },
        ]}
      >
        <View style={styles.iconWrap}>
          {icon}
          {badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText} numberOfLines={1}>
                {badge}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const FloatingTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  // Bumped once the font is usable so icons that rendered before it remount with it
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    let alive = true;
    iconFontReady.then(ready => {
      if (alive && ready) {
        setFontEpoch(epoch => epoch + 1);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key].options;
  const hiddenByOptions =
    StyleSheet.flatten(focusedOptions.tabBarStyle as StyleProp<ViewStyle>)
      ?.display === 'none';
  const immersive = IMMERSIVE_ROUTES.has(
    focusedNestedRouteName(focusedRoute) ?? '',
  );

  if (hiddenByOptions || immersive) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom: Math.max(insets.bottom, 16) + TAB_BAR_BOTTOM_GAP },
      ]}
    >
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title ?? route.name;
          const color = focused ? colors.teal : colors.textMuted;
          const icon = options.tabBarIcon?.({ focused, color, size: 22 });

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              hapticTap();
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <TabButton
              key={`${route.key}-${fontEpoch}`}
              focused={focused}
              label={label}
              color={color}
              icon={icon}
              badge={formatBadge(options.tabBarBadge)}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    paddingHorizontal: 8,
    // Android paints elevation on translucent views as a solid fill, so it gets an opaque surface
    backgroundColor:
      Platform.OS === 'android' ? colors.sheet : 'rgba(20, 26, 42, 0.94)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  tab: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 22,
  },
  tabInnerActive: {
    backgroundColor: 'rgba(78, 205, 196, 0.14)',
  },
  iconWrap: {
    width: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.2,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -11,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.coral,
    borderWidth: 2,
    borderColor: colors.sheet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.ink,
  },
});

export default FloatingTabBar;
