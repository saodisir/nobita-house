import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { motions } from './animations';
import { characters } from './characters';
import { layout } from './scene';
import {
  CLIP_SECONDS,
  HOME_SHOT,
  LINE_SECONDS,
  LOT_SHOT,
  MIN_BEAT_SECONDS,
  STORY_CAST,
  storyBeats,
  storyPlaces,
  storyPoint,
} from './story';

const ids = new Set(characters.map((def) => def.id));
const clips = new Set(motions.map((motion) => motion.id));
const roadEnd = layout.road.startZ + layout.road.depth;
const sandlot = layout.sandlot.lot;

/** The player's beat length without walks, which need live poses and are not available here. */
function scriptedSeconds() {
  return storyBeats.reduce((total, beat) => {
    let seconds = MIN_BEAT_SECONDS;
    if (beat.say) seconds = Math.max(seconds, beat.say.seconds ?? LINE_SECONDS);
    if (beat.hold) seconds = Math.max(seconds, beat.hold);
    if (beat.actions?.some((action) => action.clip)) seconds = Math.max(seconds, CLIP_SECONDS);
    return total + seconds;
  }, 0);
}

describe('the story script', () => {
  it('casts exactly the children in the scene', () => {
    expect([...STORY_CAST].sort()).toEqual([...ids].sort());
  });

  it('names real characters, real clips and real places', () => {
    for (const [index, beat] of storyBeats.entries()) {
      if (beat.say) {
        expect(ids.has(beat.say.who), `beat ${index}: speaker`).toBe(true);
        expect(beat.say.line.en.trim()).not.toBe('');
        expect(beat.say.line.zh.trim()).not.toBe('');
      }
      if (beat.pace) expect(beat.pace, `beat ${index}: pace`).toBeGreaterThan(0);
      for (const action of beat.actions ?? []) {
        expect(ids.has(action.who), `beat ${index}: actor`).toBe(true);
        if (action.face) expect(ids.has(action.face), `beat ${index}: facing`).toBe(true);
        if (action.go) {
          expect(action.go === 'home' || action.go in storyPlaces, `beat ${index}: place`).toBe(true);
        }
        if (action.clip) expect(clips.has(action.clip), `beat ${index}: clip ${action.clip}`).toBe(true);
        // A forced clip cancels the walk clip: a child asked to do both would slide.
        expect(!(action.go && action.clip), `beat ${index}: go and clip together`).toBe(true);
      }
    }
  });

  it('puts each group of marks on the ground it belongs to', () => {
    for (const [name, [x, y, z]] of Object.entries(storyPlaces)) {
      expect(y, `${name}: height`).toBe(layout.standY);
      if (name.startsWith('road-')) {
        expect(z, `${name}: off the road`).toBeGreaterThan(layout.road.startZ);
        expect(z, `${name}: off the road`).toBeLessThan(roadEnd);
      } else if (name === 'stage' || name.startsWith('seat-')) {
        expect(x, `${name}: outside the sandlot`).toBeGreaterThan(sandlot.x0);
        expect(x, `${name}: outside the sandlot`).toBeLessThan(sandlot.x1);
        expect(z, `${name}: outside the sandlot`).toBeGreaterThan(sandlot.z0);
        expect(z, `${name}: outside the sandlot`).toBeLessThan(sandlot.z1);
      } else {
        // The gate marks stay on the sidewalk, in front of the wall and behind the kerb.
        expect(z, `${name}: outside the sidewalk`).toBeGreaterThan(layout.wall.frontZ);
        expect(z, `${name}: outside the sidewalk`).toBeLessThan(layout.road.startZ);
      }
      expect(Math.abs(x), `${name}: outside the frontage`).toBeLessThan(layout.lot.width / 2);
    }
    for (const who of STORY_CAST) {
      const [, , z] = storyPoint('home', who);
      expect(z, `${who}: home off the sidewalk`).toBeLessThan(layout.road.startZ);
    }
  });

  it('cuts the lens to the sandlot and back to the gate', () => {
    expect(HOME_SHOT.eye).toEqual([...config.camera.position]);
    expect(HOME_SHOT.look).toEqual([...config.camera.target]);
    expect(LOT_SHOT.look[2], 'lot shot looks into the sandlot').toBeGreaterThan(sandlot.z0);
    expect(LOT_SHOT.look[2]).toBeLessThan(sandlot.z1);
    expect(LOT_SHOT.eye[2], 'lot eye stands at the open edge').toBeLessThan(sandlot.z0);
    const cuts = storyBeats.filter((beat) => beat.camera);
    expect(cuts.map((beat) => beat.camera)).toEqual([LOT_SHOT, HOME_SHOT]);
  });

  it('is long, has dialogue, and ends with everybody back at their own spot', () => {
    expect(storyBeats.length).toBeGreaterThanOrEqual(18);
    expect(scriptedSeconds(), 'scripted seconds, walks excluded').toBeGreaterThan(50);
    expect(storyBeats.filter((beat) => beat.say).length).toBeGreaterThan(8);
    const last = storyBeats.at(-1);
    expect(last?.actions?.filter((action) => action.go === 'home')).toHaveLength(STORY_CAST.length);
  });

  it('seats the audience in an arc facing the singer', () => {
    const seated = storyBeats.find((beat) => beat.actions?.some((action) => action.clip === 'sit'));
    expect(seated).toBeDefined();
    const sitting = seated?.actions?.filter((action) => action.clip === 'sit') ?? [];
    expect(sitting).toHaveLength(STORY_CAST.length - 1);
    for (const action of sitting) expect(action.face, `${action.who} faces the singer`).toBe('jaian');
    for (const [name, [x, , z]] of Object.entries(storyPlaces)) {
      if (!name.startsWith('seat-')) continue;
      expect(z, `${name}: behind the singer`).toBeLessThan(storyPlaces.stage[2]);
      expect(Math.abs(x - storyPlaces.stage[0]), `${name}: in the arc`).toBeLessThan(3.5);
    }
  });

  it('whispers about the singing while clapping along with it', () => {
    const whispers = storyBeats.filter((beat) => beat.say?.line.en.includes('(whispering)'));
    expect(whispers.length).toBeGreaterThanOrEqual(3);
    for (const beat of whispers) {
      const speaker = beat.say?.who;
      const action = beat.actions?.find((item) => item.who === speaker);
      expect(action?.clip, `${speaker}: clapping while complaining`).toBe('clap');
      expect(beat.actions?.filter((item) => item.clip === 'clap').length).toBeGreaterThanOrEqual(5);
    }
  });

  it('keeps the gate scene standing and reluctant, never celebratory', () => {
    const lotCut = storyBeats.findIndex((beat) => beat.camera === LOT_SHOT);
    expect(lotCut, 'the gate half comes before the lens turns round').toBeGreaterThan(8);
    const gate = storyBeats.slice(0, lotCut);
    const quiet = new Set(['idle', 'talk', 'nod', 'think', 'look-around']);
    for (const [index, beat] of gate.entries()) {
      for (const action of beat.actions ?? []) {
        if (!action.clip) continue;
        expect(quiet.has(action.clip), `gate beat ${index}: ${action.clip}`).toBe(true);
      }
    }
    const used = new Set(gate.flatMap((beat) => (beat.actions ?? []).map((action) => action.clip)));
    expect(used.has('idle'), 'standing and listening').toBe(true);
    expect(used.has('talk'), 'talking faces').toBe(true);
    expect(used.has('nod'), 'reluctant nods').toBe(true);
    expect(used.has('think') || used.has('look-around'), 'some hesitation').toBe(true);
    expect(gate.filter((beat) => beat.say).length, 'the gate dialogue got richer').toBeGreaterThanOrEqual(12);
    expect(storyBeats.filter((beat) => beat.say).length).toBeGreaterThanOrEqual(20);
  });

  it('rings the audience round Gian and keeps every eye on him at the gate', () => {
    const lotCut = storyBeats.findIndex((beat) => beat.camera === LOT_SHOT);
    const gate = storyBeats.slice(0, lotCut);
    const listeners = STORY_CAST.filter((who) => who !== 'jaian');
    const ringMarks = ['ring-a', 'ring-b', 'ring-c', 'ring-d', 'ring-e'] as const;

    // The closing-in beat puts five children on five different marks in home order, so their
    // short walks cannot cross. Gian comes round the kerb instead of through the group.
    const gather = gate.find((beat) => beat.actions?.some((action) => action.go === 'ring-a'));
    expect(gather).toBeDefined();
    for (const [index, who] of listeners.entries()) {
      const action = gather?.actions?.find((item) => item.who === who);
      expect(action?.go, `${who}: closes in`).toBe(ringMarks[index]);
    }
    expect(gather?.actions?.find((item) => item.who === 'jaian')?.go).toBe('approach');
    expect(storyPlaces.approach[0], 'the detour keeps his own home x').toBeCloseTo(
      storyPoint('home', 'jaian')[0],
      5,
    );
    expect(storyPlaces.approach[2], 'the detour runs along the kerb').toBeGreaterThan(storyPlaces.gate[2]);

    // Similar short distances from the gate make an arc rather than a strung-out row.
    for (const name of ringMarks) {
      const [x, , z] = storyPlaces[name];
      const distance = Math.hypot(x - storyPlaces.gate[0], z - storyPlaces.gate[2]);
      expect(distance, `${name}: inside the ring`).toBeGreaterThan(1);
      expect(distance, `${name}: not strung out`).toBeLessThan(2);
    }
    const xs = ringMarks.map((name) => storyPlaces[name][0]);
    expect(xs, 'left-to-right order is unchanged').toEqual([...xs].sort((a, b) => a - b));

    // Nobody at the gate looks anywhere but at the singer, on any beat that has a line.
    for (const [index, beat] of gate.entries()) {
      for (const action of beat.actions ?? []) {
        if (action.face) expect(action.face, `gate beat ${index}: ${action.who}`).toBe('jaian');
      }
      if (!beat.say) continue;
      for (const who of listeners) {
        const own = beat.actions?.filter((action) => action.who === who) ?? [];
        const looking = own.some((action) => action.face === 'jaian');
        const walking = own.some((action) => action.go);
        expect(looking || walking, `gate beat ${index}: ${who} keeps looking`).toBe(true);
      }
    }

    // Slipping away is temporary: Nobita returns to his place in the ring, not to his doorstep.
    const slipIndex = gate.findIndex((beat) => beat.actions?.some((action) => action.go === 'left'));
    const backIndex = gate.findIndex(
      (beat, index) =>
        index > slipIndex &&
        (beat.actions?.some((action) => action.who === 'nobita' && action.go === 'ring-b') ?? false),
    );
    expect(slipIndex).toBeGreaterThanOrEqual(0);
    expect(backIndex, 'called back after slipping away').toBeGreaterThan(slipIndex);
  });
});
