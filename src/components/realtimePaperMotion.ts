// Ambient motion is independent of the camera journey and its render cadence.
export const PAPER_SWAY = {
  tiltX: .018, tiltY: .012,
  driftX: .008, driftY: .004, driftZ: .004,
  boundsPadding: .04,
  fadeIn: 1.2,
} as const;

export type PaperMotionState = { time: number; strength: number };

export function createPaperMotion(): PaperMotionState {
  return { time: 0, strength: 0 };
}

export function advancePaperMotion(state: PaperMotionState, deltaSeconds: number,
  enabled: boolean, active: boolean): void {
  if (!enabled) { state.strength = 0; return; }
  if (!active) return;
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, .1)) : 0;
  state.time += delta;
  state.strength = Math.min(1, state.strength + delta / PAPER_SWAY.fadeIn);
}

// Seed by the original export record, so LOD regrouping cannot change a page's
// rhythm. Grounded sheets are identified by their authored group, not height.
export function paperSwayParameters(record: number, ground: boolean): [number, number, number] {
  const fraction = (value: number) => value - Math.floor(value);
  const seed = record + 1;
  return [
    fraction(seed * .618033988749895) * Math.PI * 2,
    .45 + fraction(seed * .7548776662466927) * .35,
    ground ? 0 : .65 + fraction(seed * .5698402909980532) * .35,
  ];
}

export function paperMotionFrameDue(nowMs: number, lastFullRenderMs: number,
  quality: 'cinema' | 'balanced'): boolean {
  return nowMs - lastFullRenderMs >= 1000 / (quality === 'cinema' ? 15 : 10);
}
