import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/components/realtimeFocus.ts'], bundle: true,
  format: 'esm', platform: 'node', write: false });
const { sampleCinematicFocus } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const keys = [
  { frame: 25, target: [0, 7, -5], range: 10, bokehScale: 1 },
  { frame: 109, target: [-2, 5, 1], range: 1.4, bokehScale: 2.4 },
  { frame: 205, target: [3, 3, -2], range: 1.4, bokehScale: 2.4 },
  { frame: 654, target: [0, 1, 0], range: 1.5, bokehScale: 2.4 },
];
const state = () => ({ target: [0, 0, 0], range: 0, bokehScale: 0 });

test('every stop focuses its exact subject after forward, reverse and instant navigation', () => {
  const actual = state();
  for (const key of [...keys, ...[...keys].reverse(), keys[1]]) {
    sampleCinematicFocus(keys, key.frame, actual);
    assert.deepEqual(actual.target, key.target);
    assert.equal(actual.range, key.range);
    assert.equal(actual.bokehScale, key.bokehScale);
  }
});

test('focus and blur remain finite and bounded between neighboring subjects', () => {
  const actual = state();
  for (let index = 1; index < keys.length; index++) {
    const from = keys[index - 1], to = keys[index];
    for (let frame = from.frame; frame <= to.frame; frame += .5) {
      sampleCinematicFocus(keys, frame, actual);
      for (let axis = 0; axis < 3; axis++) {
        assert(Number.isFinite(actual.target[axis]));
        assert(actual.target[axis] >= Math.min(from.target[axis], to.target[axis]) - 1e-12);
        assert(actual.target[axis] <= Math.max(from.target[axis], to.target[axis]) + 1e-12);
      }
      assert(actual.range >= Math.min(from.range, to.range) - 1e-12);
      assert(actual.range <= Math.max(from.range, to.range) + 1e-12);
      assert(actual.bokehScale >= 1 && actual.bokehScale <= 2.4);
    }
  }
});

test('focus approaches every interior stop without a position or blur jump', () => {
  for (const key of keys.slice(1, -1)) {
    for (const direction of [-1, 1]) {
      const actual = state();
      sampleCinematicFocus(keys, key.frame + direction * .001, actual);
      assert(Math.hypot(...actual.target.map((value, axis) => value - key.target[axis])) < 1e-8);
      assert(Math.abs(actual.range - key.range) < 1e-8);
      assert(Math.abs(actual.bokehScale - key.bokehScale) < 1e-8);
    }
  }
});

test('out-of-route and invalid frames clamp to a valid focus state', () => {
  const actual = state();
  for (const frame of [-100, NaN, Infinity]) {
    sampleCinematicFocus(keys, frame, actual);
    assert.deepEqual(actual.target, keys[0].target);
  }
  sampleCinematicFocus(keys, 9999, actual);
  assert.deepEqual(actual.target, keys.at(-1).target);
  assert.throws(() => sampleCinematicFocus([], 25, actual), /empty/);
});
