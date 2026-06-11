import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, Animated } from 'react-native';
import { Theme } from './themes';

// The app's signature pill toggle (the one in the global sticky header): a bordered
// bg2 housing, 40 tall / radius 20, with an accent "thumb" that slides under the
// active segment. Pass `width` to stretch the housing to an exact pixel width with
// equal cells (the header's measured-column math), or `cellWidth` for fixed-size
// cells when the toggle should size itself (settings rows).
export default function SlidingToggle({
  segments, activeIndex, onPressSegment, t, width, cellWidth = 30,
}: {
  segments: React.ReactNode[];
  activeIndex: number;
  onPressSegment: (index: number) => void;
  t: Theme;
  width?: number;
  cellWidth?: number;
}) {
  const anim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: activeIndex,
      useNativeDriver: true,
      bounciness: 4,
      speed: 16
    }).start();
  }, [activeIndex]);

  const PADDING = 4;
  const BORDER = 1; // housing borderWidth — counts toward the border-box width, so the
                    // real per-cell width is (width − padding − border) on each side.
  // An explicit width (from the header's measured equal-column math) makes the toggle
  // exactly match the tempo pill; without one it falls back to fixed-width cells.
  const stretch = width != null && width > 0;
  // Subtract BOTH the padding and the border from each side so the highlight is exactly
  // one flex cell wide and slides exactly one cell — otherwise it's a couple px too wide
  // and overshoots, squishing the right-hand gap when the right option is selected.
  const buttonWidth = stretch
    ? Math.max(0, (width - PADDING * 2 - BORDER * 2) / segments.length)
    : cellWidth;
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, buttonWidth]
  });
  const cellStyle = stretch
    ? { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 1 }
    : { width: cellWidth, alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 1 };

  return (
    <View
      style={{ flexDirection: 'row', backgroundColor: t.bg2, borderRadius: 20, padding: PADDING, borderWidth: BORDER, borderColor: t.border, position: 'relative', height: 40, ...(stretch ? { width } : null) }}
    >
      <Animated.View style={{
        position: 'absolute', left: PADDING, top: PADDING, bottom: PADDING,
        width: buttonWidth, backgroundColor: t.accent, borderRadius: 16,
        transform: [{ translateX }]
      }} />
      {segments.map((seg, i) => (
        <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => onPressSegment(i)} style={cellStyle}>
          {seg}
        </TouchableOpacity>
      ))}
    </View>
  );
}
