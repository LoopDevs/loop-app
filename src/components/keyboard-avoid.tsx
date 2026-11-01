import { KeyboardAvoidingView, StyleSheet, type KeyboardAvoidingViewProps } from 'react-native';

export function KeyboardAvoid({ style, ...props }: KeyboardAvoidingViewProps) {
  return <KeyboardAvoidingView behavior="padding" style={[styles.fill, style]} {...props} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
