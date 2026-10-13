import type { PlayerLevel } from '../profile/types';
import type { SessionType } from '../training/types';

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

/**
 * Every constant behind a session's effort level and calories burned (src/features/intensity).
 * None of these come from the UEFA statement, so none is `sourced`: each is either a published
 * formula (`standard_formula`, with its citation) or our own assumption (`estimate`).
 */
export const EFFORT_RULES = {
  // DESIGN DECISION, not from a source. The heart rates a player may type in for a session.
  heartRateRangeBpm: {
    value: { min: 40, max: 230 },
    sourceType: 'estimate',
    reference: null,
  },

  // DESIGN DECISION, not from a source. The session calories a player may type in.
  caloriesBurnedRangeKcal: {
    value: { min: 0, max: 3000 },
    sourceType: 'estimate',
    reference: null,
  },

  // DESIGN DECISION, not from a source. Entered calories above this rate for the session's length
  // are treated as a typing mistake (e.g. 3000 kcal in 20 minutes is 150 kcal a minute).
  maxKcalPerMinute: {
    value: 30,
    sourceType: 'estimate',
    reference: null,
  },

  // Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited. J Am Coll Cardiol
  // 2001;37(1):153–156. Max heart rate = 208 − 0.7 × age. Used only when the player hasn't entered
  // a measured max heart rate.
  estimatedMaxHeartRate: {
    value: { base: 208, perYear: -0.7 },
    sourceType: 'standard_formula',
    reference: 'Tanaka et al., J Am Coll Cardiol 2001;37(1):153–156',
  },

  // The widely used five heart-rate zones, as fractions of max heart rate: 50–60%, 60–70%,
  // 70–80%, 80–90%, 90–100%. A convention, not checked against a publication here.
  heartRateZoneBounds: {
    value: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    sourceType: 'estimate',
    reference: null,
  },

  // DESIGN DECISION, not from a source. The 1–10 effort level at each zone bound above: zone 1
  // spans 1–3, zone 2 3–5, zone 3 5–7, zone 4 7–9, zone 5 9–10. Effort is interpolated inside a zone.
  effortAtZoneBounds: {
    value: [1, 3, 5, 7, 9, 10],
    sourceType: 'estimate',
    reference: null,
  },

  // DESIGN DECISION, not from a source. Anchor points turning the MET implied by entered calories
  // (kcal ÷ (kg × hours)) into a 1–10 effort level, interpolated in between; 12 MET or more is 10.
  effortFromMet: {
    value: [
      { met: 2, effort: 2 },
      { met: 3, effort: 4 },
      { met: 6, effort: 7 },
      { met: 9, effort: 9 },
      { met: 12, effort: 10 },
    ],
    sourceType: 'estimate',
    reference: null,
  },

  // Foster C, Florhaug JA, Franklin J, et al. A new approach to monitoring exercise training.
  // J Strength Cond Res 2001;15(1):109–115. Session RPE: training load = the player's 1–10 rating
  // × the session's minutes.
  sessionLoad: {
    value: 'rating × minutes',
    sourceType: 'standard_formula',
    reference: 'Foster et al., J Strength Cond Res 2001;15(1):109–115',
  },

  // Keytel LR, Goedecke JH, Noakes TD, et al. Prediction of energy expenditure from heart rate
  // monitoring during submaximal exercise. J Sports Sci 2005;23(3):289–297. The model without
  // VO2max: kJ per minute = intercept + perBpm × heart rate + perKg × weight + perYear × age, with
  // separate coefficients for men and women. The coefficients were taken from secondary sources
  // that reproduce the equation, not read from the paper itself.
  caloriesFromHeartRate: {
    value: {
      male: { intercept: -55.0969, perBpm: 0.6309, perKg: 0.1988, perYear: 0.2017 },
      female: { intercept: -20.4022, perBpm: 0.4472, perKg: -0.1263, perYear: 0.074 },
      kjPerKcal: 4.184,
    },
    sourceType: 'standard_formula',
    reference: 'Keytel et al., J Sports Sci 2005;23(3):289–297',
  },

  // 2024 Adult Compendium of Physical Activities (pacompendium.com), code 15605, "Soccer,
  // competitive": 9.5 MET. Calories = MET × weight (kg) × hours.
  matchMet: {
    value: 9.5,
    sourceType: 'standard_formula',
    reference: '2024 Adult Compendium of Physical Activities, code 15605',
  },

  // DESIGN DECISION. The Compendium has no entry for football conditioning; its nearest are
  // circuit training at vigorous intensity (7.5) and high-intensity interval exercise (7.0–11.0).
  conditioningMet: {
    value: 8,
    sourceType: 'estimate',
    reference: null,
  },

  // DESIGN DECISION. The Compendium's resistance-training entries run from 3.5 to 6.0 depending
  // on the kind of lifting; 5 is our middle value for a gym session.
  gymStrengthMet: {
    value: 5,
    sourceType: 'estimate',
    reference: null,
  },

  // DESIGN DECISION. The Compendium has no entry for technical or tactical football practice
  // (casual soccer is 7.0); 5 assumes drills with frequent stops.
  technicalMet: {
    value: 5,
    sourceType: 'estimate',
    reference: null,
  },

  // DESIGN DECISION. A rest day has no session, so no session calories.
  restMet: {
    value: 0,
    sourceType: 'estimate',
    reference: null,
  },
} as const satisfies Record<string, Rule<unknown>>;

export type EffortRuleName = keyof typeof EFFORT_RULES;

/** The MET rule for each session type. */
export const SESSION_MET_RULE = {
  match: 'matchMet',
  hiit_conditioning: 'conditioningMet',
  gym_strength: 'gymStrengthMet',
  technical_tactical: 'technicalMet',
  rest_day: 'restMet',
} as const satisfies Record<SessionType, EffortRuleName>;
