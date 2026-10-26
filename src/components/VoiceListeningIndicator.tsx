import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { classifyVoiceWord } from '../utils/voiceCommands';
import { colors } from '../theme';

interface VoiceListeningIndicatorProps {
  /** 'starting' from the tap until the engine really hears audio, then 'listening' */
  state: 'starting' | 'listening';
  /** Most recent words the engine heard, oldest first */
  words: string[];
  /** Microphone level 0..1, fed by the engine's volume events */
  level: Animated.Value;
}

const DOT_SIZE = 12;
const HALO_SIZE = 26;

// A coral dot with a glowing ring that pulses while the engine listens, next to what
// was heard so users learn to slow down or speak more clearly.
const VoiceListeningIndicator: React.FC<VoiceListeningIndicatorProps> = ({
  state,
  words,
  level,
}) => {
  const pulse = useRef(new Animated.Value(0)).current;
  const live = state === 'listening';

  useEffect(() => {
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: live ? 1100 : 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, live]);

  // The ring grows and fades on every pulse and swells further while the user speaks
  const ringScale = Animated.add(
    pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }),
    Animated.multiply(level, 1.2),
  );
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.55, 0.15, 0],
  });
  const dotScale = Animated.add(1, Animated.multiply(level, 0.5));

  const placeholder =
    words.length > 0 ? null : live ? 'Listening…' : 'Starting…';

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.dotWrap}>
        <View
          style={[styles.halo, live ? styles.haloLive : styles.haloStarting]}
        />
        <Animated.View
          style={[
            styles.ring,
            live ? styles.ringLive : styles.ringStarting,
            { opacity: ringOpacity, transform: [{ scale: ringScale }] },
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            live ? styles.dotLive : styles.dotStarting,
            { transform: [{ scale: dotScale }] },
          ]}
        />
      </View>
      <View style={styles.heard}>
        {placeholder ? (
          <Text style={styles.placeholder} numberOfLines={1}>
            {placeholder}
          </Text>
        ) : (
          words.map((word, index) => {
            const command = classifyVoiceWord(word);
            return (
              <Text
                key={`${index}-${word}`}
                style={[
                  styles.word,
                  command === 'keep' && styles.keepWord,
                  command === 'trash' && styles.trashWord,
                ]}
                numberOfLines={1}
              >
                {word}
              </Text>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  dotWrap: {
    width: HALO_SIZE,
    height: HALO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
  },
  haloLive: {
    backgroundColor: 'rgba(255, 122, 138, 0.28)',
  },
  haloStarting: {
    backgroundColor: 'rgba(255, 200, 87, 0.22)',
  },
  ring: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  ringLive: {
    backgroundColor: colors.coral,
  },
  ringStarting: {
    backgroundColor: colors.amber,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 6,
    elevation: 6,
  },
  dotLive: {
    backgroundColor: colors.coral,
    shadowColor: colors.coral,
  },
  dotStarting: {
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
  },
  heard: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(20, 26, 42, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  placeholder: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  word: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 6,
  },
  keepWord: {
    color: colors.teal,
  },
  trashWord: {
    color: colors.coral,
  },
});

export default VoiceListeningIndicator;
