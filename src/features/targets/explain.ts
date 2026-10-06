import type { BaselineTargets } from './baseline';
import { TARGET_RULES, type SourceType, type TargetRuleName } from './rules';

/** Added to the explanation of any rule whose value is our own assumption. */
export const ESTIMATE_NOTE = 'This is our own estimate, not a figure from the research.';

export interface ExplanationLine {
  rule: TargetRuleName;
  sourceType: SourceType;
  text: string;
}

/**
 * One line of explanation for a rule. The estimate note is added here, from the rule's source
 * type, so a rule can't be explained without it once it is marked `estimate`.
 */
function explain(rule: TargetRuleName, text: string): ExplanationLine {
  const { sourceType } = TARGET_RULES[rule];
  return { rule, sourceType, text: sourceType === 'estimate' ? `${text} ${ESTIMATE_NOTE}` : text };
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** Explains, rule by rule, how a set of baseline targets was calculated. */
export function explainTargets(t: BaselineTargets): ExplanationLine[] {
  const isJunior = t.proteinGPerKg === TARGET_RULES.juniorProteinGPerKg.value;
  return [
    explain('restingCalories', `Resting burn: ${t.bmr.toLocaleString()} kcal a day, from the Mifflin-St Jeor formula.`),
    explain('activityFactor', `Daily calories: resting burn × ${t.activityFactor} for ${t.level} training.`),
    isJunior
      ? explain(
          'juniorProteinGPerKg',
          `Protein: ${t.proteinGPerKg} g per kg of body weight, the level the UEFA nutrition statement gives for players under ${TARGET_RULES.juniorAgeLimit.value}.`,
        )
      : explain(
          'proteinGPerKg',
          `Protein: ${t.proteinGPerKg} g per kg of body weight, within the 1.6–2.2 g per kg in the UEFA nutrition statement.`,
        ),
    explain(
      'fatEnergyFraction',
      `Fat: ${percent(TARGET_RULES.fatEnergyFraction.value)} of calories, within the 20–35% in the UEFA nutrition statement.`,
    ),
    explain('carbohydrate', 'Carbs: the calories left after protein and fat.'),
  ];
}
