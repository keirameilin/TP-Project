import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

/** Solid pitch green behind the whole screen. */
export const PITCH = '#1e7b3c';
/** Darker pitch green for selected chips and buttons on the white cards. */
export const ACCENT = '#14602c';
export const ON_PITCH = '#ffffff';
export const ON_PITCH_MUTED = 'rgba(255, 255, 255, 0.8)';
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

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** Optional second line explaining the option. */
  hint?: string;
}

/** A one-line picker that expands into its options when tapped. */
export function Dropdown<T extends string>(props: {
  label: string;
  value: T | null;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
}) {
  const { label, value, options } = props;
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? 'not set'}`}
        accessibilityHint="Opens the list of options"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [
          styles.dropdown,
          open && styles.dropdownOpen,
          !open && props.error && styles.inputError,
          pressed && styles.dropdownPressed,
        ]}
      >
        <Text style={styles.dropdownLabel}>{label}</Text>
        <Text style={[styles.dropdownValue, !selected && styles.dropdownPlaceholder]}>
          {selected?.label ?? props.placeholder ?? 'Select'}
        </Text>
        <Text style={styles.dropdownCaret}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.dropdownList}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: option.value === value }}
              onPress={() => {
                props.onChange(option.value);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.dropdownOption, pressed && styles.dropdownOptionPressed]}
            >
              <View style={styles.dropdownOptionBody}>
                <Text style={[styles.dropdownOptionText, option.value === value && styles.dropdownOptionSelected]}>
                  {option.label}
                </Text>
                {option.hint ? <Text style={styles.dropdownOptionHint}>{option.hint}</Text> : null}
              </View>
              {option.value === value ? <Text style={styles.dropdownCheck}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <FieldError message={props.error} />
    </View>
  );
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
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    gap: 8,
  },
  dropdownOpen: { borderColor: ACCENT, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  dropdownPressed: { opacity: 0.6 },
  dropdownLabel: { fontSize: 14, color: '#5f6368' },
  dropdownValue: { flex: 1, fontSize: 16, color: '#111', fontWeight: '600' },
  dropdownPlaceholder: { color: '#9aa0a6', fontWeight: '400' },
  dropdownCaret: { fontSize: 16, color: ACCENT },
  dropdownList: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: ACCENT,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  dropdownOptionPressed: { backgroundColor: '#eef7f1' },
  dropdownOptionBody: { flex: 1, gap: 2 },
  dropdownOptionText: { fontSize: 16, color: '#202124' },
  dropdownOptionHint: { fontSize: 12, color: '#5f6368' },
  dropdownOptionSelected: { color: ACCENT, fontWeight: '700' },
  dropdownCheck: { fontSize: 16, color: ACCENT, fontWeight: '700' },
});
