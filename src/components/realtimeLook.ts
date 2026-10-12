// Conservative color and light adjustments layered over the original Cycles look.
// Values are deliberately bounded so print blacks and highlight strokes survive.
export const FILM_LOOK = {
  "halationThreshold": 1.55,
  "halationSoftEnd": 3.2,
  "halationRadiusNear": 2.75,
  "halationRadiusFar": 6,
  "halationStrengthCinema": 0.065,
  "halationStrengthBalanced": 0.045,
  "shadowTintStrength": 0.36,
  "highlightTintStrength": 0.38,
  "vignetteStrength": 0.065,
  "fogDistanceNear": 3,
  "fogDistanceFar": 18,
  "fogNearWeight": 0.86,
  "fogFarWeight": 1.06
} as const;
