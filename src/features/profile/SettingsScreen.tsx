import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDatabase } from '../../db/database';
import { ValidationError } from '../../lib/validation';
import { ACCENT, Field, ON_PITCH, PITCH, Section, styles as ui } from '../dailyLog/ui';
import { PlayerProfileRepository } from './repository';

type Errors = Partial<Record<'age' | 'maxHeartRate' | 'form', string>>;

const LABELS = { age: 'Age', maxHeartRate: 'Max heart rate' } as const;

/** Blank → null; garbage → NaN for the validator to reject. */
const parseWhole = (text: string) => (text.trim() === '' ? null : Number(text.trim()));

export default function SettingsScreen() {
  const [repo, setRepo] = useState<PlayerProfileRepository | null>(null);
  const [age, setAge] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDatabase().then(
      async (db) => {
        const r = new PlayerProfileRepository(db);
        const profile = await r.get();
        if (cancelled) return;
        setAge(profile ? String(profile.age) : '');
        setMaxHr(profile?.maxHeartRate != null ? String(profile.maxHeartRate) : '');
        setRepo(r);
      },
      (e) => {
        if (!cancelled) setErrors({ form: `Couldn't open settings: ${e instanceof Error ? e.message : String(e)}` });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!repo || saving) return;
    const parsedAge = parseWhole(age);
    if (parsedAge === null) {
      setErrors({ age: 'Age is required' });
      return;
    }
    setSaving(true);
    try {
      await repo.save({ age: parsedAge, maxHeartRate: parseWhole(maxHr) });
      setErrors({});
      setSaved(true);
    } catch (e) {
      if (e instanceof ValidationError) {
        const next: Errors = {};
        for (const issue of e.issues) {
          const field = issue.field as keyof typeof LABELS;
          next[field] ??= `${LABELS[field]} ${issue.message}`;
        }
        setErrors(next);
      } else {
        setErrors({ form: `Couldn't save: ${e instanceof Error ? e.message : String(e)}` });
      }
    } finally {
      setSaving(false);
    }
  }

  const parsedAge = parseWhole(age);
  const estimatedMax =
    parsedAge !== null && Number.isInteger(parsedAge) && parsedAge > 0 ? 220 - parsedAge : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.back}>
            <Text style={styles.backText}>‹ Daily Log</Text>
          </Pressable>
          <Text style={styles.title}>Player settings</Text>

          {repo ? (
            <Section title="Heart-rate zones">
              <Text style={ui.hint}>
                Zones are based on your max heart rate. If you don’t know it, it’s estimated as 220 − your age.
              </Text>
              <Field
                label="Age"
                value={age}
                onChangeText={(t) => {
                  setAge(t);
                  setSaved(false);
                  setErrors((e) => ({ ...e, age: undefined }));
                }}
                error={errors.age}
                keyboardType="number-pad"
                placeholder="e.g. 17"
                fullWidth
              />
              <Field
                label="Max heart rate (optional)"
                value={maxHr}
                onChangeText={(t) => {
                  setMaxHr(t);
                  setSaved(false);
                  setErrors((e) => ({ ...e, maxHeartRate: undefined }));
                }}
                error={errors.maxHeartRate}
                keyboardType="number-pad"
                placeholder={estimatedMax ? `Estimated ${estimatedMax} bpm` : 'e.g. 198'}
                fullWidth
              />
              <Text style={ui.hint}>
                Only fill this in if you’ve measured it, e.g. the highest heart rate your watch has shown in an
                all-out sprint.
              </Text>
              {errors.form ? <Text style={ui.errorText}>{errors.form}</Text> : null}
              {saved ? <Text style={styles.savedText}>Saved.</Text> : null}
              <Pressable
                accessibilityRole="button"
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => [styles.saveButton, (pressed || saving) && styles.pressed]}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
              </Pressable>
            </Section>
          ) : errors.form ? (
            <Text style={styles.loadError}>{errors.form}</Text>
          ) : (
            <ActivityIndicator color={ON_PITCH} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: PITCH },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  back: { alignSelf: 'flex-start' },
  backText: { color: ON_PITCH, fontSize: 16, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: ON_PITCH, marginTop: -8 },
  loadError: { color: ON_PITCH, fontSize: 15 },
  savedText: { color: ACCENT, fontWeight: '600' },
  saveButton: { backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
