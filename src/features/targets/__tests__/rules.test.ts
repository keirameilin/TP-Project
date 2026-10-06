import { baselineTargets, type BaselineInput } from '../baseline';
import { ESTIMATE_NOTE, explainTargets } from '../explain';
import { SOURCE_TYPES, TARGET_RULES, type Rule, type TargetRuleName } from '../rules';

const rules = Object.entries(TARGET_RULES) as [TargetRuleName, Rule<unknown>][];
const adult: BaselineInput = { sex: 'male', age: 25, heightCm: 180, weightKg: 75, level: 'professional' };

describe('TARGET_RULES', () => {
  it.each(rules)('%s has a valid source type', (_name, rule) => {
    expect(SOURCE_TYPES).toContain(rule.sourceType);
  });

  it('gives a page of the UEFA statement for every sourced rule', () => {
    for (const [name, rule] of rules.filter(([, r]) => r.sourceType === 'sourced')) {
      expect([name, rule.reference]).toEqual([name, expect.stringMatching(/^UEFA statement p\. \d+$/)]);
    }
  });

  it('gives a citation for every standard formula and none for estimates', () => {
    for (const [name, rule] of rules) {
      if (rule.sourceType === 'standard_formula') expect([name, rule.reference]).toEqual([name, expect.any(String)]);
      if (rule.sourceType === 'estimate') expect([name, rule.reference]).toEqual([name, null]);
    }
  });

  it('classifies each rule as agreed', () => {
    const byType = (type: string) => rules.filter(([, r]) => r.sourceType === type).map(([name]) => name);
    expect(byType('sourced')).toEqual([
      'proteinGPerKg',
      'juniorProteinGPerKg',
      'juniorAgeLimit',
      'fatEnergyFraction',
    ]);
    expect(byType('standard_formula')).toEqual(['restingCalories', 'kcalPerGram']);
    expect(byType('estimate')).toEqual(['activityFactor', 'carbohydrate']);
  });

  it('holds the values the paper and the formulas give', () => {
    expect(TARGET_RULES.proteinGPerKg.value).toBe(1.8);
    expect(TARGET_RULES.juniorProteinGPerKg.value).toBe(1.6);
    expect(TARGET_RULES.juniorAgeLimit.value).toBe(18);
    expect(TARGET_RULES.fatEnergyFraction.value).toBe(0.25);
    expect(TARGET_RULES.restingCalories.value).toEqual({ perKg: 10, perCm: 6.25, perYear: -5, male: 5, female: -161 });
    expect(TARGET_RULES.kcalPerGram.value).toEqual({ protein: 4, carbs: 4, fat: 9 });
  });
});

describe('explainTargets', () => {
  const lines = explainTargets(baselineTargets(adult));

  it('explains one line per rule used, each tagged with its source type', () => {
    expect(lines.map((l) => [l.rule, l.sourceType])).toEqual([
      ['restingCalories', 'standard_formula'],
      ['activityFactor', 'estimate'],
      ['proteinGPerKg', 'sourced'],
      ['fatEnergyFraction', 'sourced'],
      ['carbohydrate', 'estimate'],
    ]);
  });

  it('says so on every line that rests on an estimate, and on no other line', () => {
    for (const line of lines) {
      expect([line.rule, line.text.endsWith(ESTIMATE_NOTE)]).toEqual([line.rule, line.sourceType === 'estimate']);
      expect([line.rule, /estimate/i.test(line.text)]).toEqual([line.rule, line.sourceType === 'estimate']);
    }
  });

  it('follows the source type in the config rather than hard-coded wording', () => {
    // Every rule's explanation carries the note exactly when the config marks it an estimate.
    for (const line of lines) {
      expect(line.sourceType).toBe(TARGET_RULES[line.rule].sourceType);
    }
  });

  it('quotes the numbers that were used', () => {
    const text = lines.map((l) => l.text).join('\n');
    expect(text).toContain('× 1.9 for professional training');
    expect(text).toContain('1.8 g per kg');
    expect(text).toContain('25% of calories');
  });

  it('explains the under-18 protein rule for a junior player', () => {
    const junior = explainTargets(baselineTargets({ ...adult, age: 16 }));
    const protein = junior.find((l) => l.rule === 'juniorProteinGPerKg');
    expect(protein).toMatchObject({ sourceType: 'sourced' });
    expect(protein?.text).toContain('1.6 g per kg');
    expect(protein?.text).toContain('players under 18');
    expect(junior.some((l) => l.rule === 'proteinGPerKg')).toBe(false);
  });
});
