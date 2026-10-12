import { useContext, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposerContext } from '@react-three/postprocessing';
import { EffectPass, Pass } from 'postprocessing';
import type { WebGLRenderer, WebGLRenderTarget } from 'three';
import { advancePaperMotion, createPaperMotion, paperMotionFrameDue } from './realtimePaperMotion';
import type { PaperMotionState } from './realtimePaperMotion';

export type RenderSchedule = {
  moving: boolean;
  warmFrames: number;
  renderCached: (() => boolean) | null;
  cachedFrames: number;
  presentedFrames: number;
  lastPresentation: number;
  lastSceneRender: number;
  paperMotion: PaperMotionState;
  fpsStart: number;
  fpsFrames: number;
  fps: number;
};

export function createRenderSchedule(): RenderSchedule {
  const now = performance.now();
  return { moving: false, warmFrames: 3, renderCached: null,
    cachedFrames: 0, presentedFrames: 0, lastPresentation: now,
    lastSceneRender: now, paperMotion: createPaperMotion(),
    fpsStart: now, fpsFrames: 0, fps: 0 };
}

function presentationDelta(schedule: RenderSchedule) {
  const now = performance.now();
  const delta = (now - schedule.lastPresentation) / 1000;
  schedule.lastPresentation = now;
  schedule.presentedFrames++;
  schedule.fpsFrames++;
  if (now - schedule.fpsStart >= 600) {
    schedule.fps = Math.round(schedule.fpsFrames * 1000 / (now - schedule.fpsStart));
    schedule.fpsFrames = 0;
    schedule.fpsStart = now;
  }
  return delta;
}

// Keep the composer's existing HDR buffer after SMAA. No extra texture,
// resampling or change to the effects is needed to reuse a stationary view.
class SceneCachePass extends Pass {
  input: WebGLRenderTarget | null = null;
  constructor() { super('StationarySceneCache'); this.needsSwap = false; }
  render(_renderer: WebGLRenderer, input: WebGLRenderTarget | null) { this.input = input; }
  setSize() { this.input = null; }
}

export function StaticSceneCache({ schedule }: { schedule: RenderSchedule }) {
  const { composer } = useContext(EffectComposerContext);
  const { gl, invalidate } = useThree();
  const cache = useMemo(() => new SceneCachePass(), []);

  useEffect(() => {
    schedule.warmFrames = 3;
    invalidate();
    schedule.renderCached = () => {
      const output = composer.passes[composer.passes.length - 1];
      // The cache must immediately precede the final screen effect.
      if (!cache.input || !(output instanceof EffectPass) || !output.renderToScreen ||
          composer.passes.indexOf(cache) !== composer.passes.length - 2) return false;
      const autoClear = gl.autoClear;
      gl.autoClear = true;
      gl.info.reset();
      try { output.render(gl, cache.input, composer.outputBuffer, presentationDelta(schedule), false); }
      finally { gl.autoClear = autoClear; }
      schedule.cachedFrames++;
      if (window.__PAPER_3D) Object.assign(window.__PAPER_3D, {
        cachedFrames: schedule.cachedFrames, presentedFrames: schedule.presentedFrames,
        fps: schedule.fps,
        triangles: gl.info.render.triangles, drawCalls: gl.info.render.calls,
      });
      return true;
    };
    return () => { schedule.renderCached = null; cache.input = null; };
  }, [cache, composer, gl, invalidate, schedule]);

  useFrame(() => {
    const autoClear = gl.autoClear;
    gl.autoClear = true;
    try {
      composer.render(presentationDelta(schedule));
      schedule.lastSceneRender = performance.now();
    } finally { gl.autoClear = autoClear; }
    schedule.warmFrames = Math.max(0, schedule.warmFrames - 1);
    if (window.__PAPER_3D) Object.assign(window.__PAPER_3D, {
      cachedFrames: schedule.cachedFrames, presentedFrames: schedule.presentedFrames,
      fps: schedule.fps,
      triangles: gl.info.render.triangles, drawCalls: gl.info.render.calls,
    });
  }, 1);

  return <primitive object={cache} dispose={null} />;
}

export function FrameSchedule({ active, motionEnabled, quality, schedule }: {
  active: boolean; motionEnabled: boolean; quality: 'cinema' | 'balanced'; schedule: RenderSchedule;
}) {
  const { invalidate, gl, size } = useThree();
  useEffect(() => {
    // A changed accessibility preference also resets the pose while paused.
    advancePaperMotion(schedule.paperMotion, 0, motionEnabled, false);
    if (!active) return;
    let frame = 0;
    let last = performance.now();
    let lastTick = last;
    const interval = 1000 / (quality === 'cinema' ? 60 : 30);
    const wake = () => { schedule.warmFrames = 3; };
    const tick = (now: number) => {
      const visible = document.visibilityState === 'visible';
      advancePaperMotion(schedule.paperMotion, (now - lastTick) / 1000, motionEnabled, visible);
      lastTick = now;
      if (visible && now - last >= interval) {
        last = now - (now - last) % interval;
        // Refresh the HDR scene for the slow sway; reuse its final presentation
        // between those frames. Camera travel retains its existing full cadence.
        const ambientDue = motionEnabled && paperMotionFrameDue(now, schedule.lastSceneRender, quality);
        if (schedule.moving || schedule.warmFrames > 0 || ambientDue || !schedule.renderCached?.()) invalidate();
      }
      frame = requestAnimationFrame(tick);
    };
    const visibilityChanged = () => {
      // Hidden time never becomes a large motion delta when the page returns.
      lastTick = performance.now();
      if (document.visibilityState === 'visible') { wake(); invalidate(); }
    };
    wake();
    if (document.visibilityState === 'visible') invalidate();
    gl.domElement.addEventListener('pointermove', wake);
    gl.domElement.addEventListener('pointerleave', wake);
    document.addEventListener('visibilitychange', visibilityChanged);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      gl.domElement.removeEventListener('pointermove', wake);
      gl.domElement.removeEventListener('pointerleave', wake);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [active, gl, invalidate, motionEnabled, quality, schedule, size]);
  return null;
}
