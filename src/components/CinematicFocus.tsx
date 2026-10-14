import { useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { DepthOfField } from '@react-three/postprocessing';
import type { DepthOfFieldEffect } from 'postprocessing';
import { Box3, Vector3 } from 'three';
import type { Stage } from '../config/portfolio';
import { assetUrl } from '../utils/assetUrl';
import { FOCUS_LOOK, sampleCinematicFocus } from './realtimeFocus';
import type { FocusKeyframe, FocusState } from './realtimeFocus';

export default function CinematicFocus({ enabled, frame, stops, version }: {
  enabled: boolean; frame: MutableRefObject<number>; stops: Record<Stage, number>; version: string;
}) {
  const gltf = useGLTF(assetUrl(`/assets/realtime/room.glb?v=${version}`));
  const effect = useRef<DepthOfFieldEffect>(null);
  const keys = useMemo<FocusKeyframe[]>(() => {
    if (!enabled) return [];
    gltf.scene.updateMatrixWorld(true);
    // Camera travel still crosses native stops when the visible chapter list
    // is shortened; retain those physical focus anchors along the full route.
    return Object.entries(stops).sort((a, b) => a[1] - b[1]).map(([chapter, stopFrame]) => {
      // The establishing shot keeps the middle of the canopy in focus.
      if (chapter === 'intro') return { frame: stopFrame, target: [0, 7, -5], ...FOCUS_LOOK.intro };
      const wanted = chapter.startsWith('paper-') ? `Paper ${chapter.slice(-1).toUpperCase()} | hero surface` : 'Monitor warm display';
      const center = new Vector3();
      let found = false;
      gltf.scene.traverse(object => {
        if (object.name.replace(/_/g, ' ') !== wanted) return;
        new Box3().setFromObject(object).getCenter(center); found = true;
      });
      if (!found) throw new Error('A camera focus subject is missing.');
      return { frame: stopFrame, target: [center.x, center.y, center.z],
        ...FOCUS_LOOK[chapter === 'screen' ? 'screen' : 'paper'] };
    });
  }, [enabled, gltf.scene, stops]);
  const state = useMemo<FocusState>(() => ({ target: [0, 7, -5], ...FOCUS_LOOK.intro }), []);
  const target = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (!enabled || !effect.current) return;
    sampleCinematicFocus(keys, frame.current, state);
    target.fromArray(state.target);
    effect.current.target?.copy(target);
    effect.current.cocMaterial.focusRange = state.range;
    effect.current.bokehScale = state.bokehScale;
  }, -1);
  return enabled ? <DepthOfField ref={effect} target={target} focusRange={FOCUS_LOOK.paper.range}
    bokehScale={FOCUS_LOOK.paper.bokehScale} resolutionScale={1} /> : null;
}
