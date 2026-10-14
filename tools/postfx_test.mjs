import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { build } from 'esbuild';

const compiled = await build({entryPoints:['src/components/realtimeLook.ts'],bundle:true,format:'esm',platform:'node',write:false});
const { FILM_LOOK } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const grade=fs.readFileSync('src/components/RealtimeGrade.tsx','utf8');
const fog=fs.readFileSync('src/components/RealtimeFog.tsx','utf8');
const scene=fs.readFileSync('src/components/RealtimePreview.tsx','utf8');
test('filmic parameters remain restrained and finite',()=>{
  for(const [key,value] of Object.entries(FILM_LOOK)) assert(Number.isFinite(value),key);
  assert(FILM_LOOK.halationThreshold>=1.5,'only very bright light produces halation');
  assert(FILM_LOOK.halationSoftEnd>FILM_LOOK.halationThreshold);
  assert(FILM_LOOK.halationStrengthCinema<=.075 && FILM_LOOK.halationStrengthCinema>0);
  assert(FILM_LOOK.halationStrengthBalanced>0 && FILM_LOOK.halationStrengthBalanced<FILM_LOOK.halationStrengthCinema);
  assert(FILM_LOOK.halationRadiusFar>FILM_LOOK.halationRadiusNear && FILM_LOOK.halationRadiusFar<=8);
  assert(FILM_LOOK.vignetteStrength>0 && FILM_LOOK.vignetteStrength<=.08);
  assert(FILM_LOOK.shadowTintStrength<.5 && FILM_LOOK.highlightTintStrength<.5);
  assert(FILM_LOOK.fogDistanceNear>=2 && FILM_LOOK.fogDistanceFar>FILM_LOOK.fogDistanceNear);
  assert(FILM_LOOK.fogNearWeight>=.65 && FILM_LOOK.fogNearWeight<1);
  assert(FILM_LOOK.fogFarWeight>1 && FILM_LOOK.fogFarWeight<=1.10);
});
test('original LUT, fog volume, and pass sequence are preserved',()=>{
  assert(grade.includes('48.0*48.0') && grade.includes('gradeSlice(p,slice)'));
  assert(grade.includes('if (uFilmEnabled>.5)') && grade.includes('texture2D(inputBuffer,uv)'));
  assert(grade.includes('uHalationCinema') && grade.includes('uFilmTexel'));
  assert(fog.includes('precision highp sampler3D') && fog.includes('readDepth(uv)'));
  assert(fog.includes('transmission *= 1.0-loss') && fog.includes('uDistanceTreatment'));
  assert(scene.includes('const tunedPostFx = params.get(\'postfx\') !== \'0\''),'testable comparison path');
  const order=['<RealtimeFog','<Bloom','<RealtimeGrade','<SMAA','<StaticSceneCache','<Noise'];
  let previous=-1;for(const item of order){const position=scene.indexOf(item);assert(position>previous,'original pass order: '+item);previous=position;}
  assert.equal((scene.match(/<EffectComposer/g)||[]).length,1,'no extra compositor');
});
test('vignette preserves optical center and attenuates only frame edge',()=>{
  const weight=(x,y)=>{
    const qx=(x-.5)*2,qy=(y-.5)*2;
    const v=qx*qx*.53+qy*qy*.47;
    const k=Math.max(0,Math.min(1,(v-.28)/(.98-.28)));
    const smooth=k*k*(3-2*k);
    return 1-FILM_LOOK.vignetteStrength*smooth;
  };
  assert.equal(weight(.5,.5),1);
  assert(weight(.05,.5)>.96,'horizontal edge remains readable');
  assert(weight(.02,.02)>.92 && weight(.02,.02)<.96,'corner stays subtle');
});
test('near and far fog emphasis preserves clear reading distance',()=>{
  const get=(d)=>{const t=Math.max(0,Math.min(1,(d-FILM_LOOK.fogDistanceNear)/(FILM_LOOK.fogDistanceFar-FILM_LOOK.fogDistanceNear)));const smooth=t*t*(3-2*t);return FILM_LOOK.fogNearWeight*(1-smooth)+FILM_LOOK.fogFarWeight*smooth};
  assert(get(1)<get(8) && get(8)<get(30));
  assert.equal(get(1),FILM_LOOK.fogNearWeight);
  assert.equal(get(30),FILM_LOOK.fogFarWeight);
});
