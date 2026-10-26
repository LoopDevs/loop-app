import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const rollDuration = 900;
const penceDelay = 260;

type OdometerProps = {
  value: string;
  style: TextStyle & { fontSize: number; lineHeight: number };
  accessibilityLabel?: string;
};

export function Odometer({ value, style, accessibilityLabel }: OdometerProps) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const scale = fitScale(availableWidth, naturalWidth);
  const fitted = {
    ...style,
    fontSize: style.fontSize * scale,
    lineHeight: style.lineHeight * scale,
    letterSpacing: style.letterSpacing === undefined ? undefined : style.letterSpacing * scale,
  };
  const keys = columnKeys(value);
  const decimalIndex = value.search(/[.,]\d{1,2}\D*$/);
  let digitOrder = 0;
  return (
    <View
      style={styles.frame}
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? value}>
      <View
        style={styles.row}
        onLayout={(event) => setNaturalWidth(event.nativeEvent.layout.width / scale)}>
        {[...value].map((character, index) => {
          if (!/\d/.test(character)) {
            return (
              <Text key={keys[index]} style={fitted} allowFontScaling={false}>
                {character}
              </Text>
            );
          }
          const isPence = decimalIndex >= 0 && index > decimalIndex;
          const delay = digitOrder * Motion.stagger + (isPence ? penceDelay : 0);
          digitOrder += 1;
          return <DigitColumn key={keys[index]} digit={Number(character)} delay={delay} style={fitted} />;
        })}
      </View>
    </View>
  );
}

function fitScale(availableWidth: number, naturalWidth: number): number {
  if (availableWidth <= 0 || naturalWidth <= availableWidth) {
    return 1;
  }
  return Math.floor((availableWidth / naturalWidth) * 100) / 100;
}

function columnKeys(value: string): string[] {
  const characters = [...value];
  const decimalIndex = value.search(/[.,]\d{1,2}\D*$/);
  const integerEnd = decimalIndex >= 0 ? decimalIndex : characters.length;
  return characters.map((character, index) => {
    if (index === decimalIndex) {
      return 'point';
    }
    if (index > integerEnd) {
      const fromPoint = characters.slice(integerEnd + 1, index).filter(isDigit).length;
      return isDigit(character) ? `frac-${fromPoint}` : `frac-${index - integerEnd}-${character}`;
    }
    const toPoint = characters.slice(index + 1, integerEnd).filter(isDigit).length;
    return isDigit(character) ? `int-${toPoint}` : `int-${toPoint}-${index}-${character}`;
  });
}

function isDigit(character: string): boolean {
  return /\d/.test(character);
}

type DigitColumnProps = {
  digit: number;
  delay: number;
  style: OdometerProps['style'];
};

function DigitColumn({ digit, delay, style }: DigitColumnProps) {
  const reduceMotion = useReducedMotion();
  const position = useSharedValue(reduceMotion ? digit : 0);
  useEffect(() => {
    if (reduceMotion) {
      position.value = digit;
      return;
    }
    position.value = withDelay(
      delay,
      withTiming(digit, { duration: rollDuration, easing: Motion.easeOut }),
    );
  }, [digit, delay, reduceMotion, position]);
  const rolling = useAnimatedStyle(() => ({
    transform: [{ translateY: -position.value * style.lineHeight }],
  }));
  return (
    <View style={{ height: style.lineHeight, overflow: 'hidden' }}>
      <Text style={[style, styles.sizer]} allowFontScaling={false}>
        0
      </Text>
      <Animated.View style={[styles.column, rolling]}>
        {digits.map((face) => (
          <Text key={face} style={style} allowFontScaling={false}>
            {face}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sizer: {
    opacity: 0,
  },
  column: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
