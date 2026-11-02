import { describe, expect, it } from 'vitest';
import { WALK_LOOP_LENGTH, WALK_SPEED } from '../data/walk-routes';
import { advanceWalkClock, createWalkClock, type WalkClock } from './walk-clock';

const FRAME = 1 / 60;

/** Run the clock at 60 fps until `done` or `seconds` pass; returns the frames it took. */
function run(c: WalkClock, walkMode: boolean, seconds: number, done?: (c: WalkClock) => boolean) {
  const frames = Math.round(seconds / FRAME);
  for (let f = 0; f < frames; f++) {
    const before = c.dir;
    advanceWalkClock(c, FRAME, walkMode);
    // Direction only ever flips from a standstill, and a pause to turn round follows.
    if (c.dir !== before && c.phase !== 'home') {
      expect(c.speed).toBe(0);
      expect(c.hold).toBeGreaterThan(0);
    }
    if (done?.(c)) return f + 1;
  }
  return frames;
}

describe('walk clock', () => {
  it('rests at home until walk mode starts, then reaches walking pace', () => {
    const c = createWalkClock();
    run(c, false, 2);
    expect(c).toMatchObject({ d: 0, speed: 0, phase: 'home' });
    run(c, true, 1);
    expect(c.speed).toBe(WALK_SPEED);
    expect(c.phase).toBe('walking');
    expect(c.d).toBeGreaterThan(0);
  });

  it('turns back home when stopped before half a lap', () => {
    const c = createWalkClock();
    run(c, true, 10);
    const turned = { value: false };
    run(c, false, 60, (s) => {
      if (s.dir < 0) turned.value = true;
      return s.phase === 'home';
    });
    expect(turned.value).toBe(true);
    expect(c).toMatchObject({ d: 0, speed: 0, phase: 'home', dir: 1 });
  });

  it('walks on home when stopped past half a lap, never turning round', () => {
    const c = createWalkClock();
    run(c, true, (WALK_LOOP_LENGTH * 0.7) / WALK_SPEED);
    let reversed = false;
    run(c, false, 60, (s) => {
      if (s.dir < 0) reversed = true;
      return s.phase === 'home';
    });
    expect(reversed).toBe(false);
    expect(c).toMatchObject({ d: 0, speed: 0, phase: 'home' });
  });

  it('gets everyone home within half a lap plus the braking and turning time', () => {
    for (const walked of [1, 20, 38, 41, 60, 77]) {
      const c = createWalkClock();
      run(c, true, walked / WALK_SPEED);
      const frames = run(c, false, 120, (s) => s.phase === 'home');
      expect(c.phase, `after ${walked} s`).toBe('home');
      expect(frames * FRAME).toBeLessThan(WALK_LOOP_LENGTH / 2 / WALK_SPEED + 2);
    }
  });

  it('never brakes harder than it accelerates, however close to home it is stopped', () => {
    // Stopping 5 cm short of home cannot brake in time: it stops just past and walks back.
    for (const short of [3, 0.2, 0.05]) {
      const c = createWalkClock();
      run(c, true, (WALK_LOOP_LENGTH - short) / WALK_SPEED);
      let lastSpeed = c.speed;
      let maxDrop = 0;
      run(c, false, 30, (s) => {
        maxDrop = Math.max(maxDrop, lastSpeed - s.speed);
        lastSpeed = s.speed;
        return s.phase === 'home';
      });
      expect(c.phase, `${short} m short`).toBe('home');
      // One frame of braking at ACCEL is 0.028 m/s; the last few millimetres snap onto d = 0
      // from under 0.1 m/s. Stopped 5 cm short without room to brake, it used to drop 0.6.
      expect(maxDrop, `${short} m short`).toBeLessThan(0.1);
    }
  });

  it('walks forward again when re-enabled mid-return', () => {
    const c = createWalkClock();
    run(c, true, 8);
    run(c, false, 3);
    expect(c.dir).toBe(-1);
    run(c, true, 3);
    expect(c.dir).toBe(1);
    expect(c.speed).toBe(WALK_SPEED);
    expect(c.phase).toBe('walking');
  });

  it('clamps a huge frame delta so a backgrounded tab does not leap', () => {
    const c = createWalkClock();
    run(c, true, 2);
    const d = c.d;
    advanceWalkClock(c, 30, true);
    expect(c.d - d).toBeLessThanOrEqual(0.1 * WALK_SPEED + 1e-9);
  });

  it('keeps d within [0, loop) and speed within [0, WALK_SPEED] under toggle spam', () => {
    const c = createWalkClock();
    // Flip walk mode every frame for two minutes, checking the invariants every frame.
    const spamFrames = Math.round(120 / FRAME);
    for (let f = 0; f < spamFrames; f++) {
      advanceWalkClock(c, FRAME, f % 2 === 0);
      expect(c.d).toBeGreaterThanOrEqual(0);
      expect(c.d).toBeLessThan(WALK_LOOP_LENGTH + 1e-9);
      expect(c.speed).toBeGreaterThanOrEqual(0);
      expect(c.speed).toBeLessThanOrEqual(WALK_SPEED + 1e-9);
    }
  });

  it('settles straight back home when toggled off on the frame it left', () => {
    const c = createWalkClock();
    advanceWalkClock(c, FRAME, true);
    run(c, false, 5, (s) => s.phase === 'home');
    expect(c).toMatchObject({ d: 0, speed: 0, phase: 'home' });
  });

  it('handles toggle off right after motion starts', () => {
    const c = createWalkClock();
    run(c, true, 0.1); // 100 ms, just past acceleration start
    const distWalked = c.d;
    expect(distWalked).toBeGreaterThan(0);
    // Now toggle off and check it returns home
    run(c, false, 60, (s) => s.phase === 'home');
    expect(c).toMatchObject({ d: 0, speed: 0, phase: 'home' });
  });

  it('returns from just before half a lap by turning around', () => {
    const c = createWalkClock();
    const targetD = WALK_LOOP_LENGTH / 2 - 1; // 1 m before half-lap
    run(c, true, targetD / WALK_SPEED + 0.5);
    expect(c.d).toBeCloseTo(targetD, 0);
    let turnedAround = false;
    run(c, false, 60, (s) => {
      if (s.dir < 0) turnedAround = true;
      return s.phase === 'home';
    });
    expect(turnedAround).toBe(true);
    expect(c).toMatchObject({ d: 0, phase: 'home' });
  });

  it('returns from just after half a lap by walking forward', () => {
    const c = createWalkClock();
    const targetD = WALK_LOOP_LENGTH / 2 + 1; // 1 m past half-lap
    run(c, true, targetD / WALK_SPEED + 0.5);
    expect(c.d).toBeCloseTo(targetD, 0);
    let turnedAround = false;
    run(c, false, 60, (s) => {
      if (s.dir < 0) turnedAround = true;
      return s.phase === 'home';
    });
    expect(turnedAround).toBe(false);
    expect(c).toMatchObject({ d: 0, phase: 'home' });
  });

  it('handles re-enable during turn-round hold', () => {
    const c = createWalkClock();
    // Walk a bit, then toggle off to start turning around
    run(c, true, 5);
    run(c, false, 0.1); // Short run to start braking
    // Let it brake to a stop and start the hold
    run(c, false, 0.5, (s) => s.speed === 0 && s.hold > 0);
    expect(c.hold).toBeGreaterThan(0);
    expect(c.dir).not.toBe(1);
    const holdBefore = c.hold;
    // Re-enable mid-hold: everyone turns straight back, standing still for one turn only.
    advanceWalkClock(c, FRAME, true);
    expect(c.dir).toBe(1);
    expect(c.hold).toBeGreaterThan(0);
    expect(c.hold).toBeLessThanOrEqual(holdBefore + 0.35);
    const frames = run(c, true, 1, (s) => s.speed > 0);
    expect(frames * FRAME).toBeLessThanOrEqual(0.35 + FRAME);
    expect(c.phase).toBe('walking');
  });

  it('only ever moves forward while walk mode stays on, across the lap wrap', () => {
    const c = createWalkClock();
    let prev = c.d;
    for (let f = 0; f < Math.round((WALK_LOOP_LENGTH * 1.2) / WALK_SPEED / FRAME); f++) {
      advanceWalkClock(c, FRAME, true);
      // Forward progress this frame, allowing for the wrap from the end of the lap to 0.
      const step = (c.d - prev + WALK_LOOP_LENGTH) % WALK_LOOP_LENGTH;
      expect(step).toBeLessThanOrEqual(WALK_SPEED * FRAME + 1e-9);
      prev = c.d;
    }
    expect(c.phase).toBe('walking');
  });
});
