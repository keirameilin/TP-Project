import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

export const ACCENT = '#1a7f4b';
export const ERROR = '#c5221f';

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.chipText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  placeholder?: string;
  /** Defaults to a decimal keypad, since most fields here are numbers. */
  keyboardType?: KeyboardTypeOptions;
  fullWidth?: boolean;
}) {
  return (
    <View style={[styles.field, props.fullWidth && styles.fullWidth]}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? 'decimal-pad'}
        placeholder={props.placeholder}
        placeholderTextColor="#9aa0a6"
        accessibilityLabel={props.label}
        style={[styles.input, props.error && styles.inputError]}
      />
      <FieldError message={props.error} />
    </View>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <Text style={styles.fieldError}>{message}</Text> : null;
}

export const styles = StyleSheet.create({
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111' },
  sectionSubtitle: { fontSize: 13, color: '#5f6368' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#fff',
  },
  chipText: { fontSize: 15, color: '#202124' },
  selected: { backgroundColor: ACCENT, borderColor: ACCENT },
  selectedText: { color: '#fff', fontWeight: '600' },
  hint: { fontSize: 13, color: '#5f6368' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  field: { flexGrow: 1, flexBasis: '45%', marginTop: 4 },
  fullWidth: { flexBasis: '100%' },
  label: { fontSize: 14, color: '#3c4043', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  inputError: { borderColor: ERROR },
  fieldError: { fontSize: 13, color: ERROR, marginTop: 4 },
  errorText: { color: ERROR },
});
