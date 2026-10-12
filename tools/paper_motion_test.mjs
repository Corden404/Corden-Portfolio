import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { build } from 'esbuild';

const helperPath = 'src/components/realtimePaperMotion.ts';
let motion = {};
if (fs.existsSync(helperPath)) {
  const compiled = await build({ entryPoints: [helperPath], bundle: true, write: false, format: 'esm', platform: 'node' });
  motion = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
}
const api = name => {
  assert.equal(typeof motion[name], 'function', name + ' behavior is missing');
  return motion[name];
};
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' != ' + expected);

test('padding covers worst tilt and drift using every real prototype and instance transform', () => {
  const limits = motion.PAPER_SWAY;
  assert.ok(limits, 'paper sway bounds are missing');
  assert.ok(limits.tiltX > 0 && limits.tiltX <= .018);
  assert.ok(limits.tiltY > 0 && limits.tiltY <= .012);
  assert.ok(limits.driftX > 0 && limits.driftX <= .008);
  assert.ok(limits.driftY > 0 && limits.driftY <= .004);
  assert.ok(limits.driftZ > 0 && limits.driftZ <= .004);
  assert.ok(limits.boundsPadding > 0 && limits.boundsPadding <= .04);
  const scene = JSON.parse(fs.readFileSync('public/assets/realtime/scene.json'));
  const records = fs.readFileSync('public/assets/realtime/papers.bin');
  const drift = Math.hypot(limits.driftX, limits.driftY, limits.driftZ);
  let airborne = 0, ground = 0, largestDisplacement = 0;
  for (const group of scene.groups) {
    if (group.prototype.ground) { ground += group.count; continue; }
    airborne += group.count;
    let localRadius = 0;
    for (const level of group.prototype.levels) for (let i = 0; i < level.positions.length; i += 3) {
      localRadius = Math.max(localRadius, Math.hypot(...level.positions.slice(i, i + 3)));
    }
    for (let instance = 0; instance < group.count; instance++) {
      const offset = group.offset + instance * scene.instanceStride * 4;
      // Frobenius norm bounds any transform's scale, including potential shear.
      const transformNorm = Math.sqrt([0,1,2,4,5,6,8,9,10].reduce((sum, index) =>
        sum + records.readFloatLE(offset + index * 4) ** 2, 0));
      // Rotation chord <= radius * angle. Summing axes is conservative for every phase.
      const displacement = localRadius * transformNorm * (limits.tiltX + limits.tiltY) + drift;
      largestDisplacement = Math.max(largestDisplacement, displacement);
      assert.ok(displacement <= limits.boundsPadding, group.name + ' instance ' + instance + ' exceeds culling padding');
    }
  }
  assert.equal(airborne, 9889);
  assert.equal(ground, 547);
  console.log('Real asset conservative displacement bound:', largestDisplacement);
});

test('paper clock starts with no displacement and fades in over active elapsed time', () => {
  const state = api('createPaperMotion')();
  assert.deepEqual(state, { time: 0, strength: 0 });
  const advance = api('advancePaperMotion');
  for (let frame = 0; frame < 6; frame++) advance(state, .1, true, true);
  near(state.time, .6);
  near(state.strength, .5);
  for (let frame = 0; frame < 12; frame++) advance(state, .1, true, true);
  near(state.time, 1.8);
  near(state.strength, 1);
});
test('inactive collection or hidden document freezes clock and fade without catch-up', () => {
  const state = api('createPaperMotion')(), advance = api('advancePaperMotion');
  advance(state, .1, true, true);
  const paused = { ...state };
  advance(state, 300, true, false);
  assert.deepEqual(state, paused);
  advance(state, .016, true, true);
  near(state.time, paused.time + .016);
  near(state.strength, paused.strength + .016 / 1.2);
});
test('motion reduction clears displacement while preserving phase and then fades on re-enable', () => {
  const state = api('createPaperMotion')(), advance = api('advancePaperMotion');
  for (let frame = 0; frame < 20; frame++) advance(state, .1, true, true);
  const phase = state.time;
  advance(state, .1, false, true);
  near(state.time, phase);
  near(state.strength, 0);
  advance(state, 50, false, false);
  near(state.time, phase);
  near(state.strength, 0);
  advance(state, .06, true, true);
  near(state.time, phase + .06);
  near(state.strength, .05);
});
test('paper clock ignores invalid and negative deltas and clamps long stalls', () => {
  const state = api('createPaperMotion')(), advance = api('advancePaperMotion');
  for (const delta of [-1, NaN, Infinity, -Infinity, 0]) advance(state, delta, true, true);
  assert.deepEqual(state, { time: 0, strength: 0 });
  advance(state, 600, true, true);
  near(state.time, .1);
  near(state.strength, .1 / 1.2);
});
test('global record seeds are deterministic, bounded and asynchronous across LOD groups', () => {
  const parameters = api('paperSwayParameters'), seen = new Set();
  const records = Array.from({ length: 10436 }, (_, index) => index);
  for (const id of records) {
    const seed = parameters(id, false);
    assert.deepEqual(seed, parameters(id, false), 'stable record ' + id);
    const [phase, speed, amplitude] = seed;
    assert.ok(phase >= 0 && phase < Math.PI * 2, 'phase range ' + id);
    assert.ok(speed >= .45 && speed <= .8, 'frequency range ' + id);
    assert.ok(amplitude >= .65 && amplitude <= 1, 'amplitude range ' + id);
    seen.add(seed.join(':'));
    assert.equal(parameters(id, true)[2], 0, 'grounded record remains still ' + id);
  }
  assert.ok(seen.size > records.length * .99, 'instance phases avoid visibly synchronized batches');
});
test('ambient full renders observe cinema and balanced limits independently of cached presentations', () => {
  const due = api('paperMotionFrameDue');
  for (const [quality, hz] of [['cinema', 15], ['balanced', 10]]) {
    const interval = 1000 / hz, last = 1000;
    assert.equal(due(last, last, quality), false);
    assert.equal(due(last + interval - .01, last, quality), false);
    assert.equal(due(last + interval + .01, last, quality), true);
    assert.equal(due(last - 1, last, quality), false);
    let rendered = 0, previous = 0;
    for (let now = 0; now <= 10000; now += 1000 / 120) {
      if (due(now, previous, quality)) { previous = now; rendered++; }
    }
    assert.ok(rendered <= hz * 10, quality + ' render ceiling: ' + rendered);
    assert.ok(rendered >= hz * 8, quality + ' remains alive: ' + rendered);
  }
});
