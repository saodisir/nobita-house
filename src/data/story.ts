/**
 * A scripted afternoon at the front gate and the vacant lot, as data.
 *
 * The scene already knows how to walk a child (nav-graph, the wander pack), how to play a
 * clip (the loaded GLB) and how to say things in two languages (i18n). A story adds none of
 * those: it is a list of beats, each beat a line of dialogue plus a few things happening at
 * the same time. The player in `scene/story-runner.tsx` walks that list; nothing here runs.
 *
 * Marks come in three groups. The first stay on the sidewalk in front of the wall (z 5.8) and
 * behind the kerb (z 7.7): the gate, the ring of listeners gathered round it, and the kerb-side
 * approach Gian takes so his opening walk does not cut through anybody. The second are a line
 * across the front road where the group gathers before crossing. The third are on the worn
 * earth in the middle of the sandlot, whose lot is
 * `layout.sandlot.lot` (x −7.5..9, z 15.6..33.6) and whose bare patch is centred on (0.4, 23.6);
 * the three concrete pipes stand further back at z 31.6, in shot but out of the way. `home` is
 * each child's own sidewalk spot from `characters.ts`, and the last beat puts everybody back
 * there so handing control to the diorama is not a visible jump.
 *
 * All marks stand at sidewalk height. The road and the sandlot are a few centimetres lower,
 * which does not read at this camera distance; keeping one height means no per-surface offset
 * has to be invented here.
 */
import { config } from '../config';
import type { Localized } from '../i18n/locale';
import { characters } from './characters';
import { layout } from './scene';

/** The six children who can appear in a beat. Checked against `characters.ts` by story.test.ts. */
export const STORY_CAST = ['jaian', 'shizuka', 'nobita', 'doraemon', 'suneo', 'dekisugi'] as const;
export type StoryCharacterId = (typeof STORY_CAST)[number];

/** Only clips all six GLBs actually carry, verified against the models in public/models/characters. */
export type StoryClip =
  | 'idle'
  | 'look-around'
  | 'talk'
  | 'think'
  | 'nod'
  | 'wave'
  | 'laugh'
  | 'cheer'
  | 'clap'
  | 'sit'
  | 'victory';

export type StoryPlaceId =
  | 'home'
  | 'gate'
  | 'left'
  | 'approach'
  | 'ring-a'
  | 'ring-b'
  | 'ring-c'
  | 'ring-d'
  | 'ring-e'
  | 'road-a'
  | 'road-b'
  | 'road-c'
  | 'road-d'
  | 'road-e'
  | 'road-f'
  | 'stage'
  | 'seat-a'
  | 'seat-b'
  | 'seat-c'
  | 'seat-d'
  | 'seat-e';

/** Semantic places, in the plan's metres. `home` is per character and resolved below. */
export const storyPlaces: Record<Exclude<StoryPlaceId, 'home'>, readonly [number, number, number]> = {
  // In front of the gate, still on the sidewalk. `approach` keeps Gian's first leg on the
  // empty left edge at his own home x, so he never walks through a child who is standing
  // still; from there he crosses along the kerb in front of the ring instead of through it.
  gate: [layout.wall.gateX, layout.standY, 7.3],
  approach: [-0.98, layout.standY, 7.5],
  left: [-2.8, layout.standY, 7.0],
  // The ring round the gate. Five listeners on a shallow arc 1.25–1.55 m from Gian, ordered
  // left to right exactly as they stand at home: closing in is a short step each, and no two
  // paths cross. The arc is what turns "a row of children" into "an audience round him".
  'ring-a': [-0.45, layout.standY, 6.95],
  'ring-b': [0.1, layout.standY, 6.3],
  'ring-c': [1.02, layout.standY, 6.05],
  'ring-d': [1.95, layout.standY, 6.3],
  'ring-e': [2.5, layout.standY, 6.95],
  // A line across the front road: the default camera stands at z 13.8 looking back at the
  // house, so a group gathered at z ~10.6 is still in frame before the lens turns round.
  'road-a': [-3.2, layout.standY, 10.6],
  'road-b': [-1.8, layout.standY, 10.9],
  'road-c': [-0.4, layout.standY, 10.4],
  'road-d': [1.0, layout.standY, 10.8],
  'road-e': [2.4, layout.standY, 10.5],
  'road-f': [3.8, layout.standY, 10.9],
  // The vacant lot: Gian on the bare earth, five listeners in an arc in front of him, 2.5–3 m
  // back and all facing +z. The arc is what makes them an audience rather than a queue.
  stage: [0.4, layout.standY, 24.6],
  'seat-a': [-2.2, layout.standY, 22.1],
  'seat-b': [-1.1, layout.standY, 21.5],
  'seat-c': [0.4, layout.standY, 21.3],
  'seat-d': [1.9, layout.standY, 21.5],
  'seat-e': [3.0, layout.standY, 22.1],
};

export function storyPoint(place: StoryPlaceId, who: StoryCharacterId): readonly [number, number, number] {
  if (place === 'home') {
    const def = characters.find((c) => c.id === who);
    if (!def) throw new Error(`story: no character called ${who}`);
    return def.position;
  }
  return storyPlaces[place];
}

/** A fixed lens for a beat. `camera-rig.tsx` performs the cut; absent means hold the lens. */
export interface StoryCamera {
  eye: readonly [number, number, number];
  look: readonly [number, number, number];
}

/** The opening framing, straight from the app's default hero camera. */
export const HOME_SHOT: StoryCamera = {
  eye: [...config.camera.position],
  look: [...config.camera.target],
};

/**
 * Over the audience's shoulder toward the singer: the eye stands at the open (street) edge of
 * the sandlot, so the arc of seated children is in the foreground and the pipe stack behind.
 * The default camera looks the other way — without this cut the whole concert happens behind
 * the lens.
 */
export const LOT_SHOT: StoryCamera = {
  eye: [0.4, 3.4, 15.2],
  look: [0.4, 1.0, 22.8],
};

/** One thing one child does during a beat. `go` and `clip` on the same child are not used
 * together: a forced clip would hold the body still while the feet travel. */
export interface StoryAction {
  who: StoryCharacterId;
  go?: StoryPlaceId;
  clip?: StoryClip;
  /** Turn to face another member of the cast, at wherever they stand when the beat opens. */
  face?: StoryCharacterId;
}

export interface StoryLine {
  who: StoryCharacterId;
  line: Localized;
  /** How long the fixed dialogue box stays up. Defaults to LINE_SECONDS. */
  seconds?: number;
}

export interface StoryBeat {
  say?: StoryLine;
  actions?: readonly StoryAction[];
  /** A beat with neither a line nor a walk still holds for this long. */
  hold?: number;
  /** Metres per second for this beat's walks. Long crossings use a quicker pace so a walk
   * does not outlast the story; the walker picks the run clip above a walking pace. */
  pace?: number;
  /** One camera cut at the start of the beat. */
  camera?: StoryCamera;
}

/** Metres per second for a scripted walk, the same pace as the wander loop. */
export const STORY_WALK_SPEED = 1.15;
export const LINE_SECONDS = 2.8;
export const CLIP_SECONDS = 2.2;
/** A beat is never shorter than this, so a two-metre errand does not flash past. */
export const MIN_BEAT_SECONDS = 1.2;

/** Everyone but the singer, in the order they stand along the sidewalk at home. */
const AUDIENCE: readonly StoryCharacterId[] = ['shizuka', 'nobita', 'doraemon', 'suneo', 'dekisugi'];

/**
 * One action per listener at the gate: keep every eye on Gian and hold the clip this beat
 * asks for. Restating `face` each beat matters, because a turn is only applied on the beat
 * that asks for it and a child left alone slowly keeps whatever heading it had. A child who
 * is walking is skipped: its own `go` already carries the turn, and a second turn would hold
 * its head sideways for the whole walk.
 */
function watching(
  clips: StoryClip | Partial<Record<StoryCharacterId, StoryClip>> = {},
  walking?: StoryCharacterId,
): StoryAction[] {
  const perChild: Partial<Record<StoryCharacterId, StoryClip>> = {};
  if (typeof clips === 'string') for (const who of AUDIENCE) perChild[who] = clips;
  else Object.assign(perChild, clips);
  return AUDIENCE.filter((who) => who !== walking).map((who) => ({
    who,
    face: 'jaian' as const,
    ...(perChild[who] ? { clip: perChild[who] } : {}),
  }));
}

/**
 * An original little scene in two halves, built on the classic "Gian's concert" setup: he
 * drafts an audience, nobody dares refuse, and everyone smiles while suffering.
 *
 * At the gate the five close into a ring round him before he speaks and never look away,
 * even when they are talking about Nobita behind his back. They stand, talk, nod and
 * hesitate: the only celebratory clips in the whole script belong to the sandlot, where
 * putting on a happy face is the joke. At the vacant lot they cross the road, sit in an arc
 * in front of him, and whisper that he is terrible while clapping and smiling the whole
 * time. The whispered beats deliberately give the speaker the same clapping clip as
 * everybody else.
 *
 * About two minutes, no branches, no pause and no audience input: once it starts it plays to
 * the end and walks everybody home.
 */
export const storyBeats: readonly StoryBeat[] = [
  {
    // Gather round him before a word is spoken. Gian takes the empty kerb-side edge first;
    // the five close in a short step each, in the same left-to-right order as their homes,
    // so no path crosses another. Nobody turns yet: a walking body faces its own path.
    actions: [
      { who: 'jaian', go: 'approach' },
      { who: 'shizuka', go: 'ring-a' },
      { who: 'nobita', go: 'ring-b' },
      { who: 'doraemon', go: 'ring-c' },
      { who: 'suneo', go: 'ring-d' },
      { who: 'dekisugi', go: 'ring-e' },
    ],
  },
  {
    // Gian crosses along the kerb in front of the ring to the gate. The ring turns toward
    // him as he comes; the next beat restates the turn once he has arrived, because `face`
    // is measured against where he stands as a beat opens.
    actions: [{ who: 'jaian', go: 'gate' }, ...watching()],
  },
  {
    say: {
      who: 'jaian',
      line: {
        en: 'Hold it, everybody! I am putting on a concert. Today. Right here.',
        zh: '都别走！今天我要在这儿开演唱会，就现在。',
      },
      seconds: 3.4,
    },
    actions: [{ who: 'jaian', clip: 'talk' }, ...watching('nod')],
  },
  {
    say: {
      who: 'jaian',
      line: {
        en: 'I have been practising all afternoon. My throat is sore, and it is all for you.',
        zh: '我练了一整个下午，嗓子都练哑了，可全是为了你们啊。',
      },
      seconds: 3.6,
    },
    actions: [{ who: 'jaian', clip: 'talk' }, ...watching()],
  },
  {
    // The pause after the announcement is the whole mood of the gate scene. Nobody rushes
    // to cheer; a couple of them are already looking for a way out, but all eyes stay on him.
    hold: 2.2,
    actions: [
      { who: 'jaian', clip: 'look-around' },
      ...watching({ nobita: 'think', doraemon: 'look-around', suneo: 'think', dekisugi: 'nod' }),
    ],
  },
  {
    say: {
      who: 'suneo',
      line: {
        en: 'W-well, that is... wonderful news, Gian. We would never miss it.',
        zh: '哇、哇，那可真是……太好了，胖虎。我们怎么可能不去呢。',
      },
      seconds: 3.6,
    },
    actions: [{ who: 'jaian', clip: 'nod' }, ...watching({ suneo: 'talk', nobita: 'think' })],
  },
  {
    // Nobita edges out of the ring while he says it, and even then keeps his face toward
    // Gian: turning his back on the singer is not an option. `face` on a `go` applies once
    // he arrives, so the walk itself still faces where he is going.
    say: {
      who: 'nobita',
      line: {
        en: 'Uh... my mum asked me to bring in the laundry. I should, um, go and do that.',
        zh: '啊……我妈让我收衣服来着，我、我得赶紧回去。',
      },
      seconds: 3.6,
    },
    actions: [
      { who: 'nobita', go: 'left', face: 'jaian' },
      { who: 'jaian', clip: 'idle' },
      ...watching({ doraemon: 'look-around' }, 'nobita'),
    ],
  },
  {
    say: {
      who: 'doraemon',
      line: {
        en: 'Nobita. You did not bring your bag, and there is no laundry out today.',
        zh: '大雄，你连书包都没带，而且今天根本没晾衣服。',
      },
      seconds: 3.4,
    },
    actions: [
      { who: 'jaian', clip: 'idle' },
      ...watching({ doraemon: 'talk', nobita: 'think', shizuka: 'nod', dekisugi: 'nod' }),
    ],
  },
  {
    say: {
      who: 'dekisugi',
      line: {
        en: 'Strictly speaking, it has been cloudy since morning. So, no laundry.',
        zh: '严格来说，今天一早就是阴天，所以确实没有晾衣服。',
      },
      seconds: 3.4,
    },
    actions: [
      { who: 'jaian', clip: 'look-around' },
      ...watching({ dekisugi: 'talk', nobita: 'think', doraemon: 'nod' }),
    ],
  },
  {
    say: {
      who: 'jaian',
      line: {
        en: 'I counted all six of us. Eyes on me, and nobody leaves until the last note.',
        zh: '我数过了，一个都不许少。眼睛都给我看着，唱到最后一个音之前谁也别想走。',
      },
      seconds: 3.6,
    },
    actions: [{ who: 'jaian', clip: 'talk' }, ...watching('nod')],
  },
  {
    // Nobita is called back into his place in the ring, not to his own doorstep. He stays
    // inside the circle for the rest of the negotiation, facing the singer like everyone else.
    say: {
      who: 'shizuka',
      line: {
        en: 'Gian, how about just one song? We were all going to the vacant lot.',
        zh: '胖虎，只唱一首好不好？我们本来约好要去空地的。',
      },
      seconds: 3.4,
    },
    actions: [
      { who: 'nobita', go: 'ring-b', face: 'jaian' },
      { who: 'jaian', clip: 'think' },
      ...watching({ shizuka: 'talk', dekisugi: 'nod' }, 'nobita'),
    ],
  },
  {
    say: {
      who: 'doraemon',
      line: {
        en: '(muttering) ...Last time even the window glass rattled.',
        zh: '（嘟囔）……上次连窗户玻璃都在响。',
      },
      seconds: 3.2,
    },
    actions: [
      { who: 'jaian', clip: 'talk' },
      ...watching({ doraemon: 'think', nobita: 'nod', suneo: 'look-around' }),
    ],
  },
  {
    say: {
      who: 'jaian',
      line: {
        en: '...Fine. One song. But you all listen properly, and you all clap.',
        zh: '……行吧，就一首。不过都得好好听，还得给我鼓掌。',
      },
      seconds: 3.6,
    },
    // He demands applause; all he gets for now is five reluctant nods. Nobody claps yet.
    actions: [{ who: 'jaian', clip: 'talk' }, ...watching('nod')],
  },
  {
    // The first forced smile. It is still a nod, not applause; the pretence pays off later.
    say: {
      who: 'shizuka',
      line: {
        en: '(forcing a smile) ...Of course. We would love to.',
        zh: '（勉强笑着）……当然啦，我们很期待呢。',
      },
      seconds: 3.2,
    },
    actions: [{ who: 'jaian', clip: 'nod' }, ...watching({ shizuka: 'talk' })],
  },
  {
    say: {
      who: 'doraemon',
      line: {
        en: 'Then dorayaki for everyone afterwards. My treat.',
        zh: '那唱完之后，我请大家吃铜锣烧，算我的。',
      },
      seconds: 3.2,
    },
    actions: [{ who: 'jaian', clip: 'nod' }, ...watching({ doraemon: 'talk', nobita: 'nod' })],
  },
  {
    say: {
      who: 'nobita',
      line: {
        en: 'Dorayaki? ...Well, if there is dorayaki, I suppose one song is all right.',
        zh: '铜锣烧？……那、那要是有的话，一首也还行吧。',
      },
      seconds: 3.4,
    },
    actions: [
      { who: 'jaian', clip: 'nod' },
      ...watching({ nobita: 'talk', doraemon: 'nod', suneo: 'look-around' }),
    ],
  },
  {
    // Off to the sandlot. The default lens is still on the gate, and this line across the
    // road is the last place the whole group fits in that framing. Gian hustles them along,
    // so the pace trips the run clip here as well as on the crossing.
    pace: 1.9,
    say: {
      who: 'nobita',
      line: { en: 'All right, then. To the vacant lot, everybody.', zh: '那……走吧，大家一起去空地。' },
      seconds: 2.8,
    },
    actions: [
      { who: 'jaian', go: 'road-d' },
      { who: 'nobita', go: 'road-c' },
      { who: 'shizuka', go: 'road-b' },
      { who: 'doraemon', go: 'road-e' },
      { who: 'suneo', go: 'road-f' },
      { who: 'dekisugi', go: 'road-a' },
    ],
  },
  {
    // The one camera cut of the story. The lens turns round to the sandlot while the group
    // walks into frame; a quicker pace keeps a 13 m crossing from swallowing the scene.
    camera: LOT_SHOT,
    pace: 1.9,
    actions: [
      { who: 'jaian', go: 'stage' },
      { who: 'dekisugi', go: 'seat-a' },
      { who: 'shizuka', go: 'seat-b' },
      { who: 'nobita', go: 'seat-c' },
      { who: 'doraemon', go: 'seat-d' },
      { who: 'suneo', go: 'seat-e' },
    ],
  },
  {
    // Everyone sits down in the arc, all of them looking at the singer; he faces Nobita in
    // the middle of the front row. The sit clip is the audience's resting pose from here on.
    say: {
      who: 'jaian',
      line: { en: 'Everybody sitting? Here we go!', zh: '都坐好了？那我可要唱了！' },
    },
    actions: [
      { who: 'jaian', clip: 'talk', face: 'nobita' },
      ...AUDIENCE.map((who) => ({ who, clip: 'sit' as const, face: 'jaian' as const })),
    ],
  },
  {
    // A verse with no line: the story just lets him sing for a while.
    hold: 4.5,
    actions: [{ who: 'jaian', clip: 'talk' }, ...AUDIENCE.map((who) => ({ who, clip: 'sit' as const }))],
  },
  {
    // The joke. The line is a whisper, but the speaker is clapping along with everyone else.
    say: {
      who: 'shizuka',
      line: {
        en: '(whispering) ...That is even worse than last time.',
        zh: '（小声）……唱得比上次还难听了。',
      },
    },
    actions: [{ who: 'jaian', clip: 'talk' }, ...AUDIENCE.map((who) => ({ who, clip: 'clap' as const }))],
  },
  {
    hold: 4.5,
    actions: [{ who: 'jaian', clip: 'cheer' }, ...AUDIENCE.map((who) => ({ who, clip: 'sit' as const }))],
  },
  {
    say: {
      who: 'suneo',
      line: {
        en: '(whispering) But look how happy he is. Who could say it to his face?',
        zh: '（小声）可他这么高兴，谁说得出口啊。',
      },
    },
    actions: [{ who: 'jaian', clip: 'talk' }, ...AUDIENCE.map((who) => ({ who, clip: 'clap' as const }))],
  },
  {
    say: {
      who: 'nobita',
      line: {
        en: '(whispering) The dorayaki has to wait until he finishes, then...',
        zh: '（小声）铜锣烧……还得等他唱完吧。',
      },
    },
    actions: [{ who: 'jaian', clip: 'victory' }, ...AUDIENCE.map((who) => ({ who, clip: 'clap' as const }))],
  },
  {
    hold: 4,
    actions: [{ who: 'jaian', clip: 'victory' }, ...AUDIENCE.map((who) => ({ who, clip: 'sit' as const }))],
  },
  {
    say: {
      who: 'jaian',
      line: { en: 'One more song!', zh: '再来一首！' },
    },
    actions: [{ who: 'jaian', clip: 'cheer' }, ...AUDIENCE.map((who) => ({ who, clip: 'clap' as const }))],
  },
  {
    // The last line says one thing and the picture says another, right to the end.
    say: {
      who: 'shizuka',
      line: {
        en: '(smiling) ...One more song, then.',
        zh: '（笑着）……再来一首啊。',
      },
      seconds: 3.2,
    },
    hold: 3.6,
    actions: STORY_CAST.map((who) => ({ who, clip: 'clap' as const })),
  },
  {
    // The lens turns back to the gate and the children run home. Ending on their own spots
    // means the diorama takes over without a jump: the wall sitters simply sit down again.
    camera: HOME_SHOT,
    pace: 2.6,
    // Gian has the longest way back (18.4 m from the stage). Holding past his arrival lets
    // the whole group stand still on their own spots before the diorama takes over, so the
    // handover is not caught mid-stride with a run clip still playing.
    hold: 8.2,
    say: {
      who: 'doraemon',
      line: { en: 'Dorayaki! I will go and get them.', zh: '铜锣烧！我这就去拿。' },
      seconds: 2.4,
    },
    actions: STORY_CAST.map((who) => ({ who, go: 'home' as const })),
  },
];
