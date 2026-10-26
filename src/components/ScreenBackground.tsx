import React from 'react';
import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { getSkinTheme, Skin } from '../theme';

/**
 * Full-screen dark gradient with two soft pools of accent light, shared by
 * screens that use the modern look.
 */

interface ScreenBackgroundProps {
  skin: Skin;
  children: React.ReactNode;
}

const GLOW_SIZE = 480;
/** Concentric discs, each faint, stack into a soft falloff with no visible edge */
const GLOW_RINGS = [1, 0.86, 0.72, 0.58, 0.44, 0.3];
const RING_ALPHA = 0.022;

/** "rgba(r, g, b, a)" or "rgb(r, g, b)" -> same colour at the given alpha */
const withAlpha = (color: string, alpha: number): string => {
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) {
    return color;
  }
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
};

const Glow: React.FC<{ color: string; style: object }> = ({ color, style }) => (
  <View pointerEvents="none" style={[styles.glow, style]}>
    {GLOW_RINGS.map(scale => (
      <View
        key={scale}
        style={[
          styles.glowRing,
          {
            width: GLOW_SIZE * scale,
            height: GLOW_SIZE * scale,
            backgroundColor: withAlpha(color, RING_ALPHA),
          },
        ]}
      />
    ))}
  </View>
);

const ScreenBackground: React.FC<ScreenBackgroundProps> = ({
  skin,
  children,
}) => {
  const theme = getSkinTheme(skin);
  return (
    <LinearGradient
      colors={theme.background}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.fill}
    >
      <Glow color={theme.glowA} style={styles.glowTopRight} />
      <Glow color={theme.glowB} style={styles.glowBottomLeft} />
      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowTopRight: {
    top: -GLOW_SIZE * 0.45,
    right: -GLOW_SIZE * 0.35,
  },
  glowBottomLeft: {
    bottom: -GLOW_SIZE * 0.5,
    left: -GLOW_SIZE * 0.4,
  },
  glowRing: {
    position: 'absolute',
    borderRadius: GLOW_SIZE,
  },
});

export default ScreenBackground;
