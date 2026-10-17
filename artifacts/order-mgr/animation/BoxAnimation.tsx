import React, { useEffect } from "react";
import { StyleSheet, View, Pressable, Text } from "react-native";
import Svg, { G, Path, Rect, Line } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const CHECKMARK_PATH_LENGTH = 70;

export interface BoxDeliveryAnimationProps {
  /** Called at ~95% of animation (~2230ms) – triggers card fade-out */
  onAlmostDone?: () => void;
  /** Called when animation completes (~2350ms) */
  onFullyDone?: () => void;
  /** Custom size (defaults to 200) */
  size?: number;
  /** Whether to show the standalone "Replay Animation" button (defaults to false) */
  showReplayButton?: boolean;
}

export default function BoxDeliveryAnimation({
  onAlmostDone,
  onFullyDone,
  size = 200,
  showReplayButton = false,
}: BoxDeliveryAnimationProps = {}) {
  // Shared animation progress values (0 -> 1)
  const flapProgress = useSharedValue(0);
  const labelProgress = useSharedValue(0);
  const tickProgress = useSharedValue(0);
  const zoomProgress = useSharedValue(0);

  const runAnimation = () => {
    // Reset all states
    flapProgress.value = 0;
    labelProgress.value = 0;
    tickProgress.value = 0;
    zoomProgress.value = 0;

    // 1. Fold flaps closed (SlSocialDropbox -> BsBoxSeam look)
    flapProgress.value = withTiming(1, {
      duration: 650,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });

    // 2. Stamp / slide in the white label
    labelProgress.value = withDelay(
      650,
      withTiming(1, {
        duration: 450,
        easing: Easing.out(Easing.back(1.5)),
      }),
    );

    // 3. Draw tickmark on the right side of the label
    tickProgress.value = withDelay(
      1150,
      withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      }),
    );

    // 4. Smooth camera zoom centered on the checkmark
    zoomProgress.value = withDelay(
      1650,
      withTiming(1, {
        duration: 700,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }),
    );
  };

  useEffect(() => {
    runAnimation();

    const almostTimer = setTimeout(() => {
      onAlmostDone?.();
    }, 2230);

    const doneTimer = setTimeout(() => {
      onFullyDone?.();
    }, 2370);

    return () => {
      clearTimeout(almostTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  // Flap Path Morphing (Open -> Closed seam)
  // Left Flap
  const leftFlapProps = useAnimatedProps(() => {
    const peakY = interpolate(flapProgress.value, [0, 1], [40, 95]);
    const peakX = interpolate(flapProgress.value, [0, 1], [48, 100]);
    return {
      d: `M 100 115 L 40 85 L ${peakX} ${peakY} L 100 115 Z`,
    };
  });

  // Right Flap
  const rightFlapProps = useAnimatedProps(() => {
    const peakY = interpolate(flapProgress.value, [0, 1], [40, 95]);
    const peakX = interpolate(flapProgress.value, [0, 1], [152, 100]);
    return {
      d: `M 100 115 L 160 85 L ${peakX} ${peakY} L 100 115 Z`,
    };
  });

  // Seam visibility (taped BsBoxSeam central line)
  const seamProps = useAnimatedProps(() => {
    return {
      opacity: flapProgress.value,
    };
  });

  // Label group animation (drop in + scale)
  const animatedLabelProps = useAnimatedProps(() => {
    const scale = interpolate(labelProgress.value, [0, 1], [0.4, 1]);
    const opacity = interpolate(labelProgress.value, [0, 0.2, 1], [0, 1, 1]);
    const translateY = interpolate(labelProgress.value, [0, 1], [-18, 0]);

    return {
      opacity,
      transform: [
        { translateX: 100 },
        { translateY: 155 + translateY },
        { scale },
        { translateX: -100 },
        { translateY: -155 },
      ],
    };
  });

  // Checkmark stroke drawing
  const animatedTickProps = useAnimatedProps(() => {
    const strokeDashoffset = interpolate(
      tickProgress.value,
      [0, 1],
      [CHECKMARK_PATH_LENGTH, 0],
    );
    return {
      strokeDashoffset,
      opacity: tickProgress.value > 0.05 ? 1 : 0,
    };
  });

  // Camera zoom container style (targets the tick at x:112, y:155)
  const containerZoomStyle = useAnimatedStyle(() => {
    const scale = interpolate(zoomProgress.value, [0, 1], [1, 3.2]);
    // Coordinates offset to bring the tick mark to screen center
    const translateX = interpolate(zoomProgress.value, [0, 1], [0, -40]);
    const translateY = interpolate(zoomProgress.value, [0, 1], [0, -170]);

    return {
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  return (
    <View style={[styles.screen, !showReplayButton && styles.embeddedScreen]}>
      {/* Container with Zoom Transform */}
      <Animated.View
        style={[styles.canvasWrapper, { width: size, height: size }, containerZoomStyle]}
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          {/* ================= 1. THE BOX BODY ================= */}
          {/* Isometric Box Base (Fill is transparent, strokes are white) */}
          <Path
            d="M 40 85 L 100 115 L 100 180 L 40 150 Z"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <Path
            d="M 160 85 L 100 115 L 100 180 L 160 150 Z"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />

          {/* ================= 2. FOLDING FLAPS ================= */}
          {/* Left Flap */}
          <AnimatedPath
            animatedProps={leftFlapProps}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />

          {/* Right Flap */}
          <AnimatedPath
            animatedProps={rightFlapProps}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />

          {/* Sealed Central Seam (BsBoxSeam top line) */}
          <AnimatedPath
            animatedProps={seamProps}
            d="M 100 60 L 100 115"
            stroke="#FFFFFF"
            strokeWidth={2}
            strokeDasharray="4, 3"
          />

          {/* ================= 3. SOLID WHITE LABEL ================= */}
          {/* Label Group located on the front-right facet of the box */}
          <AnimatedG animatedProps={animatedLabelProps}>
            {/* Solid white card base */}
            <Rect
              x={72}
              y={140}
              width={56}
              height={30}
              rx={3}
              ry={3}
              fill="#FFFFFF"
              stroke="#D1D5DB"
              strokeWidth={0.8}
            />

            {/* --- LEFT SECTION: BARCODE (No overlap) --- */}
            <G>
              <Line
                x1={77}
                y1={145}
                x2={77}
                y2={165}
                stroke="#1F2937"
                strokeWidth={1.5}
              />
              <Line
                x1={81}
                y1={145}
                x2={81}
                y2={165}
                stroke="#1F2937"
                strokeWidth={1}
              />
              <Line
                x1={84}
                y1={145}
                x2={84}
                y2={165}
                stroke="#1F2937"
                strokeWidth={2.5}
              />
              <Line
                x1={88}
                y1={145}
                x2={88}
                y2={165}
                stroke="#1F2937"
                strokeWidth={1.2}
              />
              <Line
                x1={92}
                y1={145}
                x2={92}
                y2={165}
                stroke="#1F2937"
                strokeWidth={1.8}
              />
            </G>

            {/* Separator hint */}
            <Line
              x1={98}
              y1={146}
              x2={98}
              y2={164}
              stroke="#E5E7EB"
              strokeWidth={0.8}
            />

            {/* --- RIGHT SECTION: CHECKMARK ZONE --- */}
            <AnimatedPath
              animatedProps={animatedTickProps}
              d="M 104 155 L 109 161 L 120 148"
              fill="none"
              stroke="#10B981"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={CHECKMARK_PATH_LENGTH}
            />
          </AnimatedG>
        </Svg>
      </Animated.View>

      {/* Replay Button (shown when requested) */}
      {showReplayButton && (
        <Pressable style={styles.button} onPress={runAnimation}>
          <Text style={styles.buttonText}>Replay Animation</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
  },
  embeddedScreen: {
    flex: 0,
    backgroundColor: "transparent",
  },
  canvasWrapper: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  button: {
    position: "absolute",
    bottom: 50,
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
});
