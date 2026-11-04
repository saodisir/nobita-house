/**
 * Display catalog for the character motion clips.
 *
 * This file never decides what a model can do: availability is always read from the loaded
 * GLB (`gltf.animations`). A clip listed here that a model does not carry simply never shows
 * up, which is what lets the Mixamo motion set land one character at a time
 * (`plans/260912-1356-character-studio-mixamo/`).
 *
 * `welcome` is also the clip `src/scene/character.tsx` plays on selection, and `walk` is the
 * one walk mode will drive — renaming either here without renaming it in Blender breaks both.
 */
import type { Localized } from '../i18n/locale';

export interface MotionDef {
  /** Clip name inside the GLB. */
  id: string;
  label: Localized;
  description: Localized;
  /** False = holds its last frame (a bow, a wave); true = repeats for ever. */
  loop: boolean;
  /** Mixamo title the clip is downloaded under — the only link to the manual step. */
  source: string;
}

/** Catalog order is picker order: rest, locomotion, the looping moods, then the one-shots. */
export const motions: MotionDef[] = [
  {
    id: 'idle',
    label: { en: 'Idle', zh: '站立' },
    description: {
      en: 'Standing still, breathing. The resting pose everything else returns to.',
      zh: '站着不动，只是呼吸。其余所有动作最后都回到这个姿势。',
    },
    loop: true,
    source: 'Breathing Idle',
  },
  {
    id: 'look-around',
    label: { en: 'Look around', zh: '张望' },
    description: {
      en: 'Turning the head and shoulders to take in the street. A curious idle.',
      zh: '转动头和肩膀，看看街上的动静。一个好奇的待机动作。',
    },
    loop: true,
    source: 'Looking Around',
  },
  {
    id: 'sit',
    label: { en: 'Sit', zh: '坐下' },
    description: {
      en: 'Sitting on the ground, breathing — the hips sink to the floor and stay there.',
      zh: '坐在地上呼吸——胯部沉到地面就停在那儿。',
    },
    loop: true,
    source: 'Sitting Idle',
  },
  {
    id: 'walk',
    label: { en: 'Walk', zh: '走路' },
    description: {
      en: 'One walking cycle in place. Walk mode plays this in step with ground speed.',
      zh: '原地的一个行走循环。走路模式下它会跟着地面速度同步播放。',
    },
    loop: true,
    source: 'Walking (In Place)',
  },
  {
    id: 'run',
    label: { en: 'Run', zh: '奔跑' },
    description: {
      en: 'Running in place — the hardest test of the shoulder and knee weights.',
      zh: '原地奔跑——对肩膀和膝盖权重最狠的考验。',
    },
    loop: true,
    source: 'Running (In Place)',
  },
  {
    id: 'think',
    label: { en: 'Think', zh: '思考' },
    description: {
      en: 'Weight on one leg, hand near the chin. In character for the top of the class.',
      zh: '重心压在一条腿上，手靠近下巴。很符合班里第一名的样子。',
    },
    loop: true,
    source: 'Thinking',
  },
  {
    id: 'talk',
    label: { en: 'Talk', zh: '说话' },
    description: {
      en: 'Chatting with small hand gestures, as if explaining the homework.',
      zh: '一边说一边比划小手势，像在讲作业。',
    },
    loop: true,
    source: 'Talking',
  },
  {
    id: 'clap',
    label: { en: 'Clap', zh: '拍手' },
    description: { en: 'Clapping in front of the chest.', zh: '在胸前拍手。' },
    loop: true,
    source: 'Clapping',
  },
  {
    id: 'dance',
    label: { en: 'Dance', zh: '跳舞' },
    description: {
      en: 'A silly dance — the longest clip, and the loosest the top of the class ever gets.',
      zh: '一段滑稽的舞——最长的一个片段，也是这位第一名最放松的一次。',
    },
    loop: true,
    source: 'Silly Dancing',
  },
  {
    id: 'house-dancing',
    label: { en: 'House dance', zh: '街舞' },
    description: {
      en: 'Bouncy house footwork with loose arms.',
      zh: '脚步弹跳的 house 舞步，手臂松弛。',
    },
    loop: true,
    source: 'House Dancing',
  },
  {
    id: 'swing-dancing',
    label: { en: 'Swing dance', zh: '摇摆舞' },
    description: {
      en: 'A swing dance: kicks, swings and a lot of hip.',
      zh: '摇摆舞：踢腿、摆荡，还有大量的胯部动作。',
    },
    loop: true,
    source: 'Swing Dancing',
  },
  // Resting poses, one per character, held at home to match `assets/home.jpg`.
  {
    id: 'sit-wall-laugh',
    label: { en: 'Sit and laugh', zh: '坐墙头大笑' },
    description: {
      en: 'Sitting on a ledge with the shins hanging, laughing. Gian on the front wall.',
      zh: '坐在矮墙上，小腿垂着，哈哈大笑。胖虎在院墙上用的是这个。',
    },
    loop: true,
    source: 'Sitting Laughing',
  },
  {
    id: 'sit-wall-talk',
    label: { en: 'Sit and talk', zh: '坐墙头聊天' },
    description: {
      en: 'Sitting on a ledge with the shins hanging, talking. Suneo on the front wall.',
      zh: '坐在矮墙上，小腿垂着，说话。小夫在院墙上用的是这个。',
    },
    loop: true,
    source: 'Sitting Talking',
  },
  {
    id: 'sit-ground-happy',
    label: { en: 'Sit happy', zh: '盘腿开心坐' },
    description: {
      en: 'Sitting cross-legged on the ground, holding a foot.',
      zh: '盘腿坐在地上，抓着一只脚。',
    },
    loop: true,
    source: 'Sitting (floor, cheerful)',
  },
  {
    id: 'sitting-pose',
    label: { en: 'Sitting pose', zh: '坐姿' },
    description: {
      en: 'A still pose on the ground, knees up, feet forward, hands down by the feet. Nobita at the gate.',
      zh: '一个静止的地面坐姿：屈膝、脚尖朝前、双手垂在脚边。大雄在院门口用的是这个。',
    },
    loop: true,
    source: 'Sitting Pose',
  },
  {
    id: 'stand-happy',
    label: { en: 'Stand happy', zh: '开心站立' },
    description: {
      en: 'A happy standing idle. Shizuka on the sidewalk.',
      zh: '开心的站立待机。静香在人行道上用的是这个。',
    },
    loop: true,
    source: 'Happy Idle',
  },
  {
    id: 'stand-calm',
    label: { en: 'Stand calm', zh: '安静站立' },
    description: {
      en: 'A calm, composed standing idle. Dekisugi by the gate pier.',
      zh: '沉静从容的站立待机。出木杉在门柱边用的是这个。',
    },
    loop: true,
    source: 'Standing idle (calm)',
  },
  {
    id: 'stand-cheerful',
    label: { en: 'Stand cheerful', zh: '兴高采烈' },
    description: {
      en: 'An excited standing loop. Doraemon beside Nobita.',
      zh: '兴奋的站立循环。哆啦A梦在大雄身旁用的是这个。',
    },
    loop: true,
    source: 'Standing idle (cheerful)',
  },
  {
    id: 'wave',
    label: { en: 'Wave', zh: '招手' },
    description: {
      en: 'A raised hand and a greeting toward the camera.',
      zh: '举起手，朝镜头打个招呼。',
    },
    loop: false,
    source: 'Waving',
  },
  {
    id: 'welcome',
    label: { en: 'Bow', zh: '鞠躬' },
    description: {
      en: 'The welcome bow the diorama plays when a character is selected at home.',
      zh: '在有人的时候点选角色，会播放这个迎接的鞠躬。',
    },
    loop: false,
    source: 'Standing Bow',
  },
  {
    id: 'nod',
    label: { en: 'Nod', zh: '点头' },
    description: { en: 'A nod yes.', zh: '点头答应。' },
    loop: false,
    source: 'Head Nod Yes',
  },
  {
    id: 'jump',
    label: { en: 'Jump', zh: '跳' },
    description: {
      en: 'A standing jump: take-off, air, landing.',
      zh: '原地的起跳：蹬地、滞空、落地。',
    },
    loop: false,
    source: 'Jumping',
  },
  {
    id: 'laugh',
    label: { en: 'Laugh', zh: '大笑' },
    description: {
      en: 'Laughing out loud, the whole body shaking with it.',
      zh: '放声大笑，整个身子都在抖。',
    },
    loop: false,
    source: 'Laughing',
  },
  {
    id: 'victory',
    label: { en: 'Victory', zh: '胜利' },
    description: {
      en: 'A fist raised in triumph, like a perfect score coming back.',
      zh: '得意地举起拳头，像满分卷子发回来了。',
    },
    loop: false,
    source: 'Victory',
  },
  {
    id: 'cheer',
    label: { en: 'Cheer', zh: '欢呼' },
    description: { en: 'Both arms above the head.', zh: '双手举过头顶。' },
    loop: false,
    source: 'Cheering',
  },
];

export const motionById = (id: string) => motions.find((m) => m.id === id);

export interface MotionEntry extends MotionDef {
  /** False for a clip the GLB carries that this catalog has never heard of. */
  known: boolean;
}

/**
 * The clips a loaded model actually carries, in catalog order, with anything unknown appended
 * under its own name rather than hidden — a model is allowed to ship more than this file knows.
 */
export function listMotions(clipNames: readonly string[]): MotionEntry[] {
  const present = new Set(clipNames);
  const known = motions.filter((m) => present.has(m.id)).map((m) => ({ ...m, known: true }));
  const extra = clipNames
    .filter((name) => !motionById(name))
    .sort()
    .map((name) => ({
      id: name,
      // A clip the catalog has never seen has no name in any language: the GLB's own is all
      // there is, and inventing a translation for it would be making one up.
      label: { en: name, zh: name },
      description: {
        en: 'Shipped in the model, not in the motion catalog.',
        zh: '模型自带，动作目录里没有收录。',
      },
      loop: true,
      source: 'unknown',
      known: false,
    }));
  return [...known, ...extra];
}
