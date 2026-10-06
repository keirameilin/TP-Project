import type { PlayerLevel } from '../profile/types';

/**
 * Where a rule's value comes from:
 * - `sourced`: an exact quote was found in the UEFA statement (page number in the rule's comment)
 * - `standard_formula`: an established method from another publication (citation in the comment)
 * - `estimate`: our own assumption, a design decision with no source behind the number
 */
export const SOURCE_TYPES = ['sourced', 'standard_formula', 'estimate'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface Rule<T> {
  value: T;
  sourceType: SourceType;
  /** Page of the UEFA statement, or the citation for a standard formula. Null for estimates. */
  reference: string | null;
}

/**
 * The paper behind every `sourced` rule: Collins J, et al. UEFA expert group statement on
 * nutrition in elite football. Br J Sports Med 2021;55:416–442 (docs/sources/uefa-nutrition-statement.pdf).
 * Its recommendations "are aimed at both male and female professional players, the majority of
 * whom will be training and playing full time" (p. 418).
 */
export const UEFA_STATEMENT = 'Collins et al., Br J Sports Med 2021;55:416–442';

/**
 * Every constant behind the baseline calorie and macro targets.
 *
 * Not here yet: rules that differ by day type. The UEFA statement gives carbohydrate ranges for
 * match-related days and for "typical training days", but none for rest days and none that
 * separate conditioning, technical and gym sessions (pp. 418–421). When those rules are added,
 * any difference between conditioning, technical and gym days must be `estimate`.
 */
export const TARGET_RULES = {
  // Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for
  // resting energy expenditure in healthy individuals. Am J Clin Nutr 1990;51(2):241–247.
  // kcal/day = 10 × weight (kg) + 6.25 × height (cm) − 5 × age (years) + 5 (male) or − 161 (female).
  // Not in the UEFA statement, which contains no resting-calorie equation.
  restingCalories: {
    value: { perKg: 10, perCm: 6.25, perYear: -5, male: 5, female: -161 },
    sourceType: 'standard_formula',
    reference: 'Mifflin et al., Am J Clin Nutr 1990;51(2):241–247',
  },

  // The Atwater general factors: 4 kcal per gram of protein and carbohydrate, 9 per gram of fat.
  // Merrill AL, Watt BK. Energy Value of Foods: Basis and Derivation. USDA Agriculture Handbook
  // No. 74, 1973. Not addressed by the UEFA statement.
  kcalPerGram: {
    value: { protein: 4, carbs: 4, fat: 9 },
    sourceType: 'standard_formula',
    reference: 'Atwater general factors (Merrill & Watt, USDA Agriculture Handbook No. 74, 1973)',
  },

  // DESIGN DECISION, not from a source. Multiplies resting calories up to a full day's burn by
  // playing level. The UEFA statement gives no activity multipliers and covers professionals only;
  // the nearest figure is a measured "~3500 kcal/day" for Premier League outfield players (p. 420).
  activityFactor: {
    value: { recreational: 1.55, competitive: 1.725, professional: 1.9 } satisfies Record<PlayerLevel, number>,
    sourceType: 'estimate',
    reference: null,
  },

  // UEFA statement p. 421 (PDF p. 6), "Protein recommendations for training": "higher intakes up
  // to 1.6–2.2 g/kg BM/day appear to enhance training adaptation." The paper gives the range;
  // 1.8 is the point we use within it.
  proteinGPerKg: {
    value: 1.8,
    sourceType: 'sourced',
    reference: 'UEFA statement p. 421',
  },

  // UEFA statement p. 433 (PDF p. 18), junior players: "a daily intake of up to 1.6 g/kg BM for
  // junior players would be appropriate."
  juniorProteinGPerKg: {
    value: 1.6,
    sourceType: 'sourced',
    reference: 'UEFA statement p. 433',
  },

  // UEFA statement p. 418 (PDF p. 3): "elite junior players (ie, players aged under 18 years and
  // belonging to a professional football academy and training full-time)". Players below this
  // age get the junior protein rule.
  juniorAgeLimit: {
    value: 18,
    sourceType: 'sourced',
    reference: 'UEFA statement p. 418',
  },

  // UEFA statement p. 422 (PDF p. 7), "Fat requirements for training": "This typically leads to a
  // fat intake of 20%–35% of total dietary energy." For juniors, p. 433: "Daily energy intake from
  // fat should be 25%–35% of total energy intake". 25% satisfies both.
  fatEnergyFraction: {
    value: 0.25,
    sourceType: 'sourced',
    reference: 'UEFA statement p. 422',
  },

  // DESIGN DECISION, not from a source. Carbohydrate takes whatever calories protein and fat leave.
  // The UEFA statement works the other way round: it sets carbohydrate in g/kg by day type
  // ("a sliding scale of 3–8 g/kg BM/day", p. 421) and lets fat flex to fit the energy target.
  carbohydrate: {
    value: 'remainder',
    sourceType: 'estimate',
    reference: null,
  },
} as const satisfies Record<string, Rule<unknown>>;

export type TargetRuleName = keyof typeof TARGET_RULES;
