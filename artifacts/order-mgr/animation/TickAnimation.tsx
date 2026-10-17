import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from "react-native-reanimated";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CHECKMARK_LENGTH = 75;

export interface TickAnimationProps {
  /** Size of the tick mark in the center (default: 80) */
  tickSize?: number;
  /** Size of the expanding circle (default: 360 to fully cover the 200x272 card) */
  circleSize?: number;
  /** Legacy size prop for backwards compatibility */
  size?: number;
  /** Background primary color (defaults to brand rose #C06070) */
  backgroundColor?: string;
  /** Custom stroke width for the white tick (default: scales proportionally to tickSize) */
  strokeWidth?: number;
  /** Milliseconds before animation starts (default: 0) */
  delay?: number;
  /** Pause after circle covers card before tick starts drawing in ms (default: 400ms = 0.4s) */
  pauseBeforeTick?: number;
  /** Callback fired when tick finishes drawing */
  onAlmostDone?: () => void;
  /** Callback fired when the checkmark animation fully finishes */
  onFullyDone?: () => void;
  /** Alias for onFullyDone */
  onComplete?: () => void;
}

/**
 * Animated checkmark overlay:
 * 1. Primary circle expands from center until it completely covers the card.
 * 2. 0.4s (400ms) delay after the card is covered.
 * 3. White rounded checkmark draws itself in the center.
 * 4. Stays visible until the card disappears with it.
 */
export default function TickAnimation({
  tickSize = 80,
  circleSize = 360,
  size,
  backgroundColor = "#C06070",
  strokeWidth,
  delay = 0,
  pauseBeforeTick = 5,
  onAlmostDone,
  onFullyDone,
  onComplete,
}: TickAnimationProps) {
  // Shared animation values (0 -> 1)
  const circleScale = useSharedValue(0);
  const tickProgress = useSharedValue(0);

  // If legacy size is passed and small, adapt tickSize
  const resolvedTickSize = size && size <= 120 ? size : tickSize;
  const actualStrokeWidth =
    strokeWidth ?? Math.max(4.5, resolvedTickSize * 0.08);

  const circleExpandDuration = 580;
  const tickDrawDuration = 480;

  useEffect(() => {
    // Reset
    circleScale.value = 0;
    tickProgress.value = 0;

    // 1. Circle expands from center to cover the entire card
    circleScale.value = withDelay(
      delay,
      withTiming(1, {
        duration: circleExpandDuration,
        easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      }),
    );

    // 2. Draw the rounded white checkmark 0.4s (400ms) AFTER circle fully covers card
    const tickStartTime = delay + circleExpandDuration + pauseBeforeTick;
    tickProgress.value = withDelay(
      tickStartTime,
      withTiming(1, {
        duration: tickDrawDuration,
        easing: Easing.bezier(0.2, 0.65, 0.4, 1),
      }),
    );

    // Fire onAlmostDone when checkmark finishes drawing
    const almostDoneTime = tickStartTime + tickDrawDuration;
    const almostTimer = setTimeout(() => {
      onAlmostDone?.();
    }, almostDoneTime);

    // Fire onFullyDone / onComplete after a brief hold
    const totalDuration = almostDoneTime + 120;
    const doneTimer = setTimeout(() => {
      onFullyDone?.();
      onComplete?.();
    }, totalDuration);

    return () => {
      clearTimeout(almostTimer);
      clearTimeout(doneTimer);
    };
  }, [delay, pauseBeforeTick]);

  // Animated checkmark stroke drawing
  const animatedTickProps = useAnimatedProps(() => {
    const strokeDashoffset = interpolate(
      tickProgress.value,
      [0, 1],
      [CHECKMARK_LENGTH, 0],
    );
    return {
      strokeDashoffset,
      opacity: tickProgress.value > 0.02 ? 1 : 0,
    };
  });

  // Animated circle expansion style
  const circleAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: circleScale.value }],
    };
  });

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Expanding Primary Circle that covers the entire card */}
      <Animated.View
        style={[
          styles.expandingCircle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            backgroundColor,
          },
          circleAnimatedStyle,
        ]}
      />

      {/* Centered White Rounded Checkmark */}
      <View style={styles.tickWrapper}>
        <Svg
          width={resolvedTickSize}
          height={resolvedTickSize}
          viewBox="0 0 100 100"
        >
          <AnimatedPath
            animatedProps={animatedTickProps}
            d="M 26 52 L 43 68 L 74 36"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={actualStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={CHECKMARK_LENGTH}
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  expandingCircle: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  tickWrapper: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
});
