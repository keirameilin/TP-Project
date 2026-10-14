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

// ---- Colours. "Sporty & Bold": deep forest green behind everything, dark cards with a green
// edge, electric lime for actions and selected states, and a few pale "paper" cards for highlights. ----
/** Deep forest green behind every screen. */
export const PITCH = '#051f15';
/** Dark card surface and its green edge. */
export const CARD = '#0a3222';
export const CARD_BORDER = '#1e8a52';
/** Electric lime: main buttons, selected states, accent text and icons on dark surfaces. */
export const ACCENT = '#a3e635';
/** Text and icons that sit on lime. */
export const ON_ACCENT = '#052e16';
/** Solid green for buttons and accents on pale paper cards. */
export const ACCENT_DEEP = '#15803d';
/** Faint lime wash for highlighted areas inside a dark card. */
export const ACCENT_TINT = 'rgba(163, 230, 53, 0.13)';
export const ON_PITCH = '#ffffff';
export const ON_PITCH_MUTED = 'rgba(255, 255, 255, 0.72)';
/** Translucent white for controls that sit directly on the pitch. */
export const ON_PITCH_FAINT = 'rgba(255, 255, 255, 0.08)';
/** Text on dark cards, from strongest to faintest. */
export const INK = '#f0fdf4';
export const INK_SOFT = '#d3efdd';
export const MUTED = '#93c7a8';
export const FAINT = '#5d9478';
export const BORDER = '#1a6a43';
/** Raised areas inside a dark card: tiles, unselected chips, number buttons. */
export const SURFACE_ALT = '#10422d';
export const INPUT_BG = '#06271a';
export const ERROR = '#f87171';
/** Pale "paper" cards and the dark text that sits on them. */
export const PAPER = '#f6fcf8';
export const PAPER_INK = '#0b2e1f';
export const PAPER_MUTED = '#4d6f5d';
export const PAPER_BORDER = '#d3e9db';
/** One colour per macro, used wherever protein, carbs and fat appear side by side. */
export const MACRO_COLORS = { protein: '#2f7cf6', carbs: '#f08c1a', fat: '#e11d74' } as const;

/** A soft green glow around dark cards, as if lit from the edge. */
const cardShadow = Platform.select<ViewStyle>({
  ios: { shadowColor: '#22c55e', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  android: { elevation: 2 },
  default: {},
});

/** The frame every screen shares: forest background, a title row, and a keyboard-aware scroll area. */
export function Screen(props: {
  title: string;
  /** Shown before the title, e.g. the calendar on the Plan tab. */
  icon?: IconName;
  /** Shows a back arrow before the title. */
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.screenContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.screenHeader}>
            {props.onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={props.onBack}
                hitSlop={10}
                style={({ pressed }) => pressed && styles.dimmed}
              >
                <Ionicons name="arrow-back" size={26} color={ACCENT} />
              </Pressable>
            ) : null}
            {props.icon ? <Ionicons name={props.icon} size={26} color={ACCENT} /> : null}
            <Text style={styles.screenTitle} accessibilityRole="header">
              {props.title}
            </Text>
            {props.right}
          </View>
          {props.children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * A card with a title row. Dark with a green edge by default; `tone="paper"` gives the pale card
 * used for highlights, where text must use the PAPER_* colours.
 */
export function Section(props: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  tone?: 'dark' | 'paper';
  /** Sits at the right of the title row, e.g. a pill or a link. */
  right?: ReactNode;
  children: ReactNode;
}) {
  const paper = props.tone === 'paper';
  return (
    <View style={[styles.section, paper && styles.sectionPaper]}>
      <View style={styles.sectionHeader}>
        {props.icon ? <Ionicons name={props.icon} size={20} color={paper ? ACCENT_DEEP : ACCENT} /> : null}
        <Text style={[styles.sectionTitle, paper && styles.sectionTitlePaper]}>{props.title}</Text>
        {props.subtitle ? (
          <Text style={[styles.sectionSubtitle, paper && styles.sectionSubtitlePaper]}>{props.subtitle}</Text>
        ) : null}
        {props.right}
      </View>
      {props.children}
    </View>
  );
}

/** One mountain: a triangle drawn with borders, sitting on the bottom edge of its container. */
function Peak(props: { left: `${number}%`; halfWidth: number; height: number; color: string; snow?: boolean }) {
  const triangle = (halfWidth: number, height: number, color: string): ViewStyle => ({
    width: 0,
    height: 0,
    borderLeftWidth: halfWidth,
    borderRightWidth: halfWidth,
    borderBottomWidth: height,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: color,
  });
  return (
    <View style={{ position: 'absolute', bottom: 0, left: props.left, marginLeft: -props.halfWidth, alignItems: 'center' }}>
      <View style={triangle(props.halfWidth, props.height, props.color)} />
      {props.snow ? (
        <View style={[triangle(props.halfWidth * 0.22, props.height * 0.22, '#e7f9c9'), { position: 'absolute', top: 0 }]} />
      ) : null}
    </View>
  );
}

/** A band of green mountains with a line or two of text over it. Purely decorative. */
export function MountainBanner(props: { title: string; subtitle?: string; height?: number; centered?: boolean }) {
  return (
    <View style={[styles.banner, { height: props.height ?? 130 }, props.centered && styles.bannerCentered]}>
      <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Peak left="78%" halfWidth={120} height={78} color="#0f5132" />
        <Peak left="22%" halfWidth={110} height={62} color="#126239" />
        <Peak left="52%" halfWidth={90} height={96} color="#1c8a4b" snow />
        <Peak left="88%" halfWidth={70} height={54} color="#2aa35c" />
        <Peak left="8%" halfWidth={60} height={40} color="#1c8a4b" />
        {props.centered ? null : <View style={styles.bannerFade} />}
      </View>
      <View style={[styles.bannerText, props.centered && styles.bannerTextCentered]}>
        <Text style={[styles.bannerTitle, props.centered && styles.bannerTitleCentered]}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.bannerSubtitle}>{props.subtitle}</Text> : null}
      </View>
    </View>
  );
}

/** A small rounded label, e.g. "Planned" or "from heart rate". */
export function Pill({ label, tone = 'lime' }: { label: string; tone?: 'lime' | 'paper' }) {
  return (
    <View style={[styles.pill, tone === 'paper' && styles.pillPaper]}>
      <Text style={[styles.pillText, tone === 'paper' && styles.pillTextPaper]}>{label}</Text>
    </View>
  );
}

/** A pale card for a highlighted item inside a dark card or on the pitch. */
export function PaperCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.paperCard, style]}>{children}</View>;
}

/**
 * A 1–10 scale as a row of round buttons with a caption at each end. `describe` names a value for
 * screen readers, e.g. "Effort 7, Hard".
 */
export function ScaleRow(props: {
  value: number | null;
  onChange: (value: number) => void;
  lowLabel: string;
  highLabel: string;
  describe: (value: number) => string;
}) {
  return (
    <View style={styles.scale}>
      <View style={styles.scaleRow}>
        {SCALE_VALUES.map((n) => {
          const selected = props.value === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={props.describe(n)}
              onPress={() => props.onChange(n)}
              hitSlop={2}
              style={({ pressed }) => [styles.scaleDot, selected && styles.scaleDotSelected, pressed && styles.dimmed]}
            >
              <Text style={[styles.scaleText, selected && styles.selectedText]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.scaleEnds}>
        <Text style={styles.scaleEnd}>{props.lowLabel}</Text>
        <Text style={styles.scaleEnd}>{props.highLabel}</Text>
      </View>
    </View>
  );
}

const SCALE_VALUES = Array.from({ length: 10 }, (_, i) => i + 1);

/**
 * A solid block in a macro's colour: its name, the amount, and a bar when there is a target.
 * `tone="paper"` is the pale tinted version for paper cards.
 */
export function MacroTile(props: {
  macro: keyof typeof MACRO_COLORS;
  label: string;
  /** e.g. "131 / 140g" or "135 g". */
  value: string;
  detail?: string;
  /** Eaten ÷ target; omit for no bar. */
  progress?: number;
  tone?: 'solid' | 'paper';
}) {
  const color = MACRO_COLORS[props.macro];
  const paper = props.tone === 'paper';
  return (
    <View
      style={[styles.macroTile, paper ? { backgroundColor: `${color}22` } : { backgroundColor: color }]}
      accessible
      accessibilityLabel={`${props.label}: ${props.value}${props.detail ? `, ${props.detail}` : ''}`}
    >
      <Text style={[styles.macroTileLabel, paper && { color }]}>{props.label}</Text>
      <Text style={[styles.macroTileValue, paper && styles.macroTileValuePaper]}>{props.value}</Text>
      {props.detail ? <Text style={[styles.macroTileDetail, paper && styles.macroTileDetailPaper]}>{props.detail}</Text> : null}
      {props.progress !== undefined ? (
        <View style={[styles.macroTileTrack, paper && { backgroundColor: `${color}33` }]}>
          <View
            style={{
              width: `${Math.max(0, Math.min(1, Number.isFinite(props.progress) ? props.progress : 0)) * 100}%`,
              height: '100%',
              borderRadius: 3,
              backgroundColor: paper ? color : '#ffffff',
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * primary and onPitch: lime. secondary: lime outline. quiet: dark fill. danger: red tint.
 * onPaper: solid green, for buttons inside pale paper cards.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'onPitch' | 'onPaper';

const BUTTON_TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: ON_ACCENT,
  secondary: ACCENT,
  quiet: INK_SOFT,
  danger: ERROR,
  onPitch: ON_ACCENT,
  onPaper: '#ffffff',
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
  /** Helper text under the input. */
  hint?: string;
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
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
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
export function ProgressBar(props: {
  progress: number;
  color?: string;
  /** The unfilled part; defaults to the dark track used on dark cards. */
  trackColor?: string;
  height?: number;
  label?: string;
  max?: number;
  now?: number;
}) {
  const progress = Math.max(0, Math.min(1, Number.isFinite(props.progress) ? props.progress : 0));
  const height = props.height ?? 8;
  return (
    <View
      style={[
        styles.progressTrack,
        { height, borderRadius: height / 2 },
        props.trackColor ? { backgroundColor: props.trackColor } : null,
      ]}
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
  secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: ACCENT },
  quiet: { backgroundColor: SURFACE_ALT },
  danger: { backgroundColor: 'rgba(248, 113, 113, 0.14)' },
  onPitch: { backgroundColor: ACCENT },
  onPaper: { backgroundColor: ACCENT_DEEP },
});

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  dimmed: { opacity: 0.6 },
  invisible: { opacity: 0 },
  screen: { flex: 1, backgroundColor: PITCH },
  screenContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 14 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  screenTitle: { flex: 1, fontSize: 28, fontWeight: '800', letterSpacing: -0.3, color: ON_PITCH },
  onPitchText: { color: ON_PITCH_MUTED, fontSize: 15 },
  section: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    gap: 10,
    ...cardShadow,
  },
  sectionPaper: { backgroundColor: PAPER, borderColor: PAPER_BORDER },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  sectionTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: INK },
  sectionTitlePaper: { color: PAPER_INK },
  sectionSubtitle: { fontSize: 13, color: MUTED },
  sectionSubtitlePaper: { color: PAPER_MUTED },
  subheading: { fontSize: 15, fontWeight: '700', color: INK },
  banner: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: '#072a1c',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  // Darkens the foot of the mountains so the text over them stays readable.
  bannerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 46, backgroundColor: 'rgba(5, 31, 21, 0.72)' },
  bannerText: { padding: 12, gap: 2 },
  // Centred banners put the words in the sky above the peaks.
  bannerCentered: { justifyContent: 'flex-start' },
  bannerTextCentered: { alignItems: 'center', paddingTop: 18 },
  bannerTitle: { fontSize: 18, fontWeight: '800', color: ON_PITCH },
  bannerTitleCentered: { fontSize: 22, textAlign: 'center' },
  bannerSubtitle: { fontSize: 13, color: ON_PITCH_MUTED },
  pill: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: ACCENT },
  pillPaper: { backgroundColor: '#dbeafe' },
  pillText: { fontSize: 11, fontWeight: '700', color: ON_ACCENT },
  pillTextPaper: { color: '#1d4ed8' },
  paperCard: { backgroundColor: PAPER, borderRadius: 12, padding: 12, gap: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: SURFACE_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipText: { fontSize: 14, fontWeight: '500', color: INK_SOFT },
  selected: { backgroundColor: ACCENT, borderColor: ACCENT },
  selectedText: { color: ON_ACCENT, fontWeight: '800' },
  scale: { gap: 4 },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  scaleDotSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  scaleText: { fontSize: 13, fontWeight: '600', color: INK_SOFT },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleEnd: { fontSize: 11, color: MUTED },
  macroTile: { flex: 1, gap: 3, borderRadius: 12, padding: 10 },
  macroTileLabel: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  macroTileValue: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  macroTileValuePaper: { color: PAPER_INK },
  macroTileDetail: { fontSize: 11, color: 'rgba(255, 255, 255, 0.85)' },
  macroTileDetailPaper: { color: PAPER_MUTED },
  macroTileTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.3)', overflow: 'hidden', marginTop: 4 },
  hint: { fontSize: 13, lineHeight: 18, color: MUTED },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  field: { flexGrow: 1, flexBasis: '45%' },
  // Width, not flex-basis: a full-width field is often a direct child of a column, where a
  // percentage basis would be read as a share of the card's height.
  fullWidth: { flexGrow: 0, flexBasis: 'auto', width: '100%' },
  label: { fontSize: 13, fontWeight: '600', color: INK_SOFT, marginBottom: 6, marginTop: 6 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: INK,
    backgroundColor: INPUT_BG,
  },
  inputFocused: { borderColor: ACCENT },
  inputError: { borderColor: ERROR },
  fieldError: { fontSize: 13, color: ERROR, marginTop: 4 },
  errorText: { fontSize: 14, color: ERROR },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: INPUT_BG,
    gap: 8,
  },
  dropdownOpen: { borderColor: ACCENT, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  dropdownValue: { flex: 1, fontSize: 16, color: INK },
  dropdownPlaceholder: { color: FAINT },
  dropdownList: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: ACCENT,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: INPUT_BG,
    overflow: 'hidden',
  },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  dropdownDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  dropdownOptionPressed: { backgroundColor: ACCENT_TINT },
  dropdownOptionBody: { flex: 1, gap: 2 },
  dropdownOptionText: { fontSize: 16, color: INK },
  dropdownOptionHint: { fontSize: 12, color: MUTED },
  dropdownOptionSelected: { color: ACCENT, fontWeight: '700' },
  progressTrack: { backgroundColor: SURFACE_ALT, overflow: 'hidden' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  stepperArrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepperText: { flex: 1, alignItems: 'center' },
  stepperTitle: { fontSize: 16, fontWeight: '700', color: ON_PITCH },
  stepperSubtitle: { fontSize: 12, color: ON_PITCH_MUTED },
  pitchLink: { alignSelf: 'center' },
  pitchLinkText: { color: ACCENT, fontSize: 14, fontWeight: '600' },
});
