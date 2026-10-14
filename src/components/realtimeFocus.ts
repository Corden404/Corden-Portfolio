export type FocusKeyframe = {
  frame: number;
  target: [number, number, number];
  range: number;
  bokehScale: number;
};

export type FocusState = Omit<FocusKeyframe, 'frame'>;

// Sample focus from the same authored frame as the camera, so instant jumps,
// reverse travel and reduced motion never leave a separate focus tween behind.
export function sampleCinematicFocus(keys: readonly FocusKeyframe[], frame: number, state: FocusState): void {
  if (!keys.length) throw new Error('The camera focus route is empty.');
  const position = Number.isFinite(frame) ? frame : keys[0].frame;
  let from = keys[0], to = from;
  if (position >= keys[keys.length - 1].frame) from = to = keys[keys.length - 1];
  else if (position > from.frame) {
    for (let index = 1; index < keys.length; index++) {
      if (position === keys[index].frame) { from = to = keys[index]; break; }
      if (position <= keys[index].frame) {
        from = keys[index - 1]; to = keys[index]; break;
      }
    }
  }
  const fraction = from === to ? 0 : Math.max(0, Math.min(1, (position - from.frame) / (to.frame - from.frame)));
  const weight = fraction * fraction * (3 - 2 * fraction);
  for (let axis = 0; axis < 3; axis++) state.target[axis] = from.target[axis] + (to.target[axis] - from.target[axis]) * weight;
  state.range = from.range + (to.range - from.range) * weight;
  state.bokehScale = from.bokehScale + (to.bokehScale - from.bokehScale) * weight;
}
