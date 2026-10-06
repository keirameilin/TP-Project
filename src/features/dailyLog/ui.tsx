import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type IconName = keyof typeof Ionicons.glyphMap;

// ---- Colours. One solid pitch green behind everything; white cards carry the content. ----
/** Solid pitch green behind every screen. */
export const PITCH = '#14653a';
/** Buttons, selected states and accent text on white cards. */
export const ACCENT = '#15803d';
/** Pale green wash for highlighted areas inside a card. */
export const ACCENT_TINT = '#e9f7ef';
export const ON_PITCH = '#ffffff';
export const ON_PITCH_MUTED = 'rgba(255, 255, 255, 0.78)';
/** Translucent white for controls that sit directly on the pitch. */
export const ON_PITCH_FAINT = 'rgba(255, 255, 255, 0.16)';
export const INK = '#0f172a';
export const INK_SOFT = '#334155';
export const MUTED = '#64748b';
export const FAINT = '#94a3b8';
export const BORDER = '#e2e8f0';
export const SURFACE_ALT = '#f1f5f9';
export const INPUT_BG = '#f8fafc';
export const ERROR = '#dc2626';
/** One colour per macro, used wherever protein, carbs and fat appear side by side. */
export const MACRO_COLORS = { protein: '#2563eb', carbs: '#d97706', fat: '#db2777' } as const;

const cardShadow = Platform.select<ViewStyle>({
  ios: { shadowColor: '#052e16', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 3 },
  default: {},
});

/** The frame every tab shares: pitch background, a large title, and a keyboard-aware scroll area. */
export function Screen({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.screenContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.screenHeader}>
            <Text style={styles.screenTitle} accessibilityRole="header">
              {title}
            </Text>
            {right}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A white card with an icon, a title and an optional note on the right. */
export function Section(props: { title: string; subtitle?: string; icon?: IconName; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {props.icon ? (
          <View style={styles.sectionIcon}>
            <Ionicons name={props.icon} size={18} color={ACCENT} />
          </View>
        ) : null}
        <Text style={styles.sectionTitle}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.sectionSubtitle}>{props.subtitle}</Text> : null}
      </View>
      {props.children}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'onPitch';

const BUTTON_TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: '#ffffff',
  secondary: ACCENT,
  quiet: INK_SOFT,
  danger: ERROR,
  onPitch: ACCENT,
};

export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  /** Stretch to fill the row it's in. */
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const variant = props.variant ?? 'primary';
  const color = BUTTON_TEXT_COLOR[variant];
  const inactive = props.busy || props.disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!props.busy }}
      onPress={props.onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        buttonStyles[variant],
        props.grow && styles.flex,
        (pressed || inactive) && styles.dimmed,
        props.style,
      ]}
    >
      {props.busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {props.icon ? <Ionicons name={props.icon} size={18} color={color} /> : null}
          <Text style={[styles.buttonText, { color }]}>{props.label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.dimmed]}
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
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, props.fullWidth && styles.fullWidth]}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? 'decimal-pad'}
        placeholder={props.placeholder}
        placeholderTextColor={FAINT}
        accessibilityLabel={props.label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocused, props.error && styles.inputError]}
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
      <Text style={styles.label}>{label}</Text>
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
          pressed && styles.dimmed,
        ]}
      >
        <Text style={[styles.dropdownValue, !selected && styles.dropdownPlaceholder]}>
          {selected?.label ?? props.placeholder ?? 'Select'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
      </Pressable>
      {open ? (
        <View style={styles.dropdownList}>
          {options.map((option, i) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: option.value === value }}
              onPress={() => {
                props.onChange(option.value);
                setOpen(false);
              }}
              style={({ pressed }) => [
                styles.dropdownOption,
                i > 0 && styles.dropdownDivider,
                pressed && styles.dropdownOptionPressed,
              ]}
            >
              <View style={styles.dropdownOptionBody}>
                <Text style={[styles.dropdownOptionText, option.value === value && styles.dropdownOptionSelected]}>
                  {option.label}
                </Text>
                {option.hint ? <Text style={styles.dropdownOptionHint}>{option.hint}</Text> : null}
              </View>
              {option.value === value ? <Ionicons name="checkmark" size={18} color={ACCENT} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <FieldError message={props.error} />
    </View>
  );
}

/** A thin progress bar; `progress` is clamped to 0–1. */
export function ProgressBar(props: { progress: number; color?: string; height?: number; label?: string; max?: number; now?: number }) {
  const progress = Math.max(0, Math.min(1, Number.isFinite(props.progress) ? props.progress : 0));
  const height = props.height ?? 8;
  return (
    <View
      style={[styles.progressTrack, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityLabel={props.label}
      accessibilityValue={{ min: 0, max: props.max ?? 100, now: props.now ?? Math.round(progress * 100) }}
    >
      <View
        style={{
          width: `${progress * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: props.color ?? ACCENT,
        }}
      />
    </View>
  );
}

/**
 * A previous / next bar that sits on the pitch, e.g. for stepping through days or weeks.
 * A hidden arrow keeps its space so the label stays centred.
 */
export function Stepper(props: {
  title: string;
  subtitle: string;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  nextHidden?: boolean;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.previousLabel}
        onPress={props.onPrevious}
        hitSlop={8}
        style={({ pressed }) => [styles.stepperArrow, pressed && styles.dimmed]}
      >
        <Ionicons name="chevron-back" size={22} color={ON_PITCH} />
      </Pressable>
      <View style={styles.stepperText}>
        <Text style={styles.stepperTitle}>{props.title}</Text>
        <Text style={styles.stepperSubtitle}>{props.subtitle}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.nextLabel}
        accessibilityState={{ disabled: !!props.nextHidden }}
        onPress={props.onNext}
        disabled={props.nextHidden}
        hitSlop={8}
        style={({ pressed }) => [styles.stepperArrow, pressed && styles.dimmed, props.nextHidden && styles.invisible]}
      >
        <Ionicons name="chevron-forward" size={22} color={ON_PITCH} />
      </Pressable>
    </View>
  );
}

/** An underlined text link that sits directly on the pitch. */
export function PitchLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={styles.pitchLink}>
      <Text style={styles.pitchLinkText}>{label}</Text>
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: ACCENT },
  secondary: { backgroundColor: ACCENT_TINT },
  quiet: { backgroundColor: SURFACE_ALT },
  danger: { backgroundColor: '#fef2f2' },
  // White on the pitch, so the screen's main action stands out.
  onPitch: { backgroundColor: '#ffffff', ...cardShadow },
});

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  dimmed: { opacity: 0.6 },
  invisible: { opacity: 0 },
  screen: { flex: 1, backgroundColor: PITCH },
  screenContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 16 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  screenTitle: { flexShrink: 1, fontSize: 32, fontWeight: '800', letterSpacing: -0.5, color: ON_PITCH },
  onPitchText: { color: ON_PITCH, fontSize: 15 },
  section: { backgroundColor: '#fff', borderRadius: 20, padding: 18, gap: 10, ...cardShadow },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_TINT,
  },
  sectionTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: INK },
  sectionSubtitle: { fontSize: 13, color: MUTED },
  subheading: { fontSize: 15, fontWeight: '700', color: INK },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, backgroundColor: SURFACE_ALT },
  chipText: { fontSize: 15, fontWeight: '500', color: INK_SOFT },
  selected: { backgroundColor: ACCENT, borderColor: ACCENT },
  selectedText: { color: '#fff', fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 18, color: MUTED },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  field: { flexGrow: 1, flexBasis: '45%' },
  fullWidth: { flexBasis: '100%' },
  label: { fontSize: 13, fontWeight: '600', color: INK_SOFT, marginBottom: 6, marginTop: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: INK,
    backgroundColor: INPUT_BG,
  },
  inputFocused: { borderColor: ACCENT, backgroundColor: '#fff' },
  inputError: { borderColor: ERROR },
  fieldError: { fontSize: 13, color: ERROR, marginTop: 4 },
  errorText: { fontSize: 14, color: ERROR },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: INPUT_BG,
    gap: 8,
  },
  dropdownOpen: { borderColor: ACCENT, backgroundColor: '#fff', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  dropdownValue: { flex: 1, fontSize: 16, color: INK },
  dropdownPlaceholder: { color: FAINT },
  dropdownList: {
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: ACCENT,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  dropdownDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  dropdownOptionPressed: { backgroundColor: ACCENT_TINT },
  dropdownOptionBody: { flex: 1, gap: 2 },
  dropdownOptionText: { fontSize: 16, color: INK },
  dropdownOptionHint: { fontSize: 12, color: MUTED },
  dropdownOptionSelected: { color: ACCENT, fontWeight: '700' },
  progressTrack: { backgroundColor: BORDER, overflow: 'hidden' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ON_PITCH_FAINT,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  stepperArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ON_PITCH_FAINT,
  },
  stepperText: { flex: 1, alignItems: 'center' },
  stepperTitle: { fontSize: 17, fontWeight: '700', color: ON_PITCH },
  stepperSubtitle: { fontSize: 13, color: ON_PITCH_MUTED },
  pitchLink: { alignSelf: 'center' },
  pitchLinkText: { color: ON_PITCH, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
