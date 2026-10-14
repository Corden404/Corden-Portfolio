// Conservative color and light adjustments layered over the original Cycles look.
// Values are deliberately bounded so print blacks and highlight strokes survive.
export const FILM_LOOK = {
  "bloomThreshold": 1.6,
  "bloomIntensityCinema": 0.32,
  "bloomIntensityBalanced": 0.22,
  "bloomRadius": 0.9,
  "halationThreshold": 1.55,
  "halationSoftEnd": 3.2,
  "halationRadiusNear": 2.75,
  "halationRadiusFar": 6,
  "halationStrengthCinema": 0.065,
  "halationStrengthBalanced": 0.045,
  "shadowTintStrength": 0.36,
  "highlightTintStrength": 0.38,
  "vignetteStrength": 0.055,
  "fogDistanceNear": 3,
  "fogDistanceFar": 18,
  "fogNearWeight": 0.66,
  "fogFarWeight": 1.1,
  "fogDensityFar": 1.45,
  "fogUpperDensity": 1.3,
  "fogHeightNear": 4,
  "fogHeightFar": 12
} as const;
