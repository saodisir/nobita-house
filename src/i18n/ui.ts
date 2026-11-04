/**
 * Every word the chrome says, in both languages, side by side.
 *
 * One flat table rather than two parallel files: a missing translation then fails to compile
 * instead of rendering as an empty button, and the two versions stay legible next to each other
 * while the copy is being written. Placeholders are `{name}` and are filled by `translate`.
 *
 * Prose that belongs to the *data* — a room's name, a character's biography, a hotspot card —
 * lives with that data as a `Localized` pair, not here. This file is the chrome: buttons,
 * headings, accessible names.
 */
import type { Locale, Localized } from './locale';

export const UI = {
  // --- the house itself --------------------------------------------------------------------
  appTitle: { en: 'Nobita’s House', zh: '大雄的家' },
  tagline: { en: 'Doraemon · 3D diorama', zh: '哆啦A梦 · 3D 微缩场景' },
  canvasInside: {
    en: 'Inside Nobita’s house from Doraemon, standing in one room: {room} ({kana}).',
    zh: '《哆啦A梦》里大雄的家。你正站在其中一个房间：{room}（{kana}）。',
  },
  canvasStreet: {
    en: "Nobita's house from Doraemon seen from the street: a two-storey cream house under red tile roofs behind a concrete block wall, with six children gathered at the front gate — two sitting on the wall, one on the pavement, three standing. The Let them roam switch sends three of them round the yard and three along the street.",
    zh: '从街上看到的《哆啦A梦》大雄家：一栋米色的两层小楼，红瓦屋顶，前面围着水泥砌块墙，六个孩子聚在院门口——两个坐在墙上，一个站在人行道上，三个站着。按「让他们走走」可以让院子里的三个和街上的三个各自走动起来。',
  },

  // --- toolbar -----------------------------------------------------------------------------
  toolbar: { en: 'View', zh: '视图' },
  settings: { en: 'Settings', zh: '设置' },
  langSwitchTo: { en: 'Switch to {language}', zh: '切换到{language}' },

  // --- where you are -----------------------------------------------------------------------
  placeAnotherRoom: { en: 'Go to another room', zh: '去别的房间' },
  placeLookInside: { en: 'Look inside the house', zh: '看看屋里' },
  placeStreet: { en: 'Street', zh: '街上' },
  placeBackToStreet: { en: 'Back to the street', zh: '回到街上' },
  placeMenu: { en: 'Places', zh: '房间' },
  placeGroundFloor: { en: 'Ground floor', zh: '一楼' },
  placeUpstairs: { en: 'Upstairs', zh: '二楼' },
  standAt: { en: 'Stand at', zh: '站在这儿' },

  // --- the tour ----------------------------------------------------------------------------
  tourStart: { en: 'Tour', zh: '游览' },
  tourStartTitle: { en: 'Tour the house', zh: '游览整栋房子' },
  tourGroup: { en: 'House tour', zh: '房屋导览' },
  tourPrevious: { en: 'Previous stop', zh: '上一站' },
  tourNext: { en: 'Next stop', zh: '下一站' },
  tourExit: { en: 'Exit tour', zh: '退出导览' },

  // --- the visitor's own feet --------------------------------------------------------------
  // Both buttons name who is doing the walking. "Stroll" and "Walk" were both just ways of
  // going somewhere, and the two switches were forever being mistaken for each other.
  walkIn: { en: 'Walk myself', zh: '自己走走' },
  walkOut: { en: 'Exit', zh: '退出' },
  walkInTitle: { en: 'Walk the house on my own feet', zh: '以自己的视角走走' },
  walkOutTitle: { en: 'Back to the street', zh: '回到街上' },

  // --- the six children on their laps -------------------------------------------------------
  strollOut: { en: 'Let them roam', zh: '让他们走走' },
  strollBack: { en: 'Call them back', zh: '叫他们回来' },
  strollOutTitle: { en: 'Let the six children out on their laps', zh: '让他们出来玩' },
  strollBackTitle: { en: 'Call them back', zh: '叫他们回来' },
  roster: { en: 'Characters', zh: '角色' },

  // --- the view menu: the lens and the lid, two independent controls -----------------------
  viewControl: { en: 'View', zh: '视图' },
  viewMenu: { en: 'Camera and roof', zh: '视角与掀顶' },
  viewAerialTitle: {
    en: 'Look down from above — the roof stays where you left it',
    zh: '从上方俯视，房顶保持你选的状态',
  },
  viewLift: { en: 'Lift the roof', zh: '掀开房顶' },
  roofLegend: { en: 'How far to take the house apart', zh: '房子拆到哪一步' },
  roofStageShut: { en: 'Shut', zh: '关闭' },
  roofStageRoof: { en: 'Roof', zh: '掀顶' },
  roofStage2F: { en: '2F', zh: '二楼' },
  roofShutTitle: { en: 'The house as built', zh: '房子原样' },
  roofRoofTitle: { en: 'Roof off: look down into the upstairs rooms', zh: '掀掉屋顶：俯视楼上的房间' },
  roof2FTitle: { en: 'Upper floor slid aside: see the whole ground floor', zh: '把二楼挪开：看清整个一楼' },
  roofAerial: { en: 'Aerial', zh: '俯瞰' },

  // --- settings ----------------------------------------------------------------------------
  settingsTimeOfDay: { en: 'Time of day', zh: '时段' },
  settingsRain: { en: 'Rain', zh: '下雨' },
  settingsResetView: { en: 'Reset view', zh: '重置视角' },
  settingsAutoRotate: { en: 'Auto-rotate', zh: '自动旋转' },
  settingsVolume: { en: 'Volume', zh: '音量' },
  settingsSfx: { en: 'Sound effects', zh: '音效' },
  settingsPerf: { en: 'Show performance', zh: '显示性能' },
  settingsStudio: { en: 'Character studio', zh: '角色工作室' },

  // --- sound -------------------------------------------------------------------------------
  music: { en: 'Music', zh: '音乐' },
  musicVolume: { en: 'Music volume', zh: '音乐音量' },

  // --- menus -------------------------------------------------------------------------------
  menus: { en: 'Menus', zh: '菜单' },
  menusHide: { en: 'Hide menus', zh: '隐藏菜单' },
  menusShow: { en: 'Show menus', zh: '显示菜单' },

  // --- the info card -----------------------------------------------------------------------
  cardCharacter: { en: 'Character', zh: '角色' },
  cardInThisRoom: { en: 'In this room', zh: '这个房间' },
  cardClose: { en: 'Close', zh: '关闭' },

  // --- taking a child by the hand ------------------------------------------------------------
  cardPossess: { en: 'Take control', zh: '操纵这个角色' },
  cardDriveFirst: { en: 'First person', zh: '第一人称' },
  cardDriveThird: { en: 'Third person', zh: '第三人称' },
  poseView: { en: 'Camera', zh: '视角' },
  poseViewFirst: { en: 'First person', zh: '第一人称' },
  poseViewThird: { en: 'Third person', zh: '第三人称' },
  poseBar: { en: 'Driving a character', zh: '操控角色' },
  poseBarClips: { en: 'Motions', zh: '动作' },
  poseAuto: { en: 'Auto', zh: '自动' },
  poseActions: { en: 'Motions', zh: '动作' },
  poseRelease: { en: 'Let go', zh: '松手' },
  poseForced: { en: 'While you move, the walk takes over.', zh: '走动时以走路动作为准。' },
  poseNoClips: {
    en: 'No motion clips in {name}’s model yet: it moves without one.',
    zh: '{name} 的模型还没有动作片段，移动时只能平移。',
  },
  poseHint: {
    en: 'WASD walk · Shift run · V view · E floors · Esc let go',
    zh: 'WASD 走 · Shift 跑 · V 视角 · E 楼层 · Esc 松手',
  },

  // --- performance readout -----------------------------------------------------------------
  perf: { en: 'Performance', zh: '性能' },
  perfFrame: { en: 'Frame', zh: '帧耗时' },
  perfWorst: { en: 'Worst', zh: '最差' },
  perfDraws: { en: 'Draws', zh: '绘制' },
  perfTris: { en: 'Tris', zh: '三角面' },

  // --- loading -----------------------------------------------------------------------------
  veilTagline: { en: 'A 3D diorama · Doraemon fan project', zh: '3D 微缩场景 · 哆啦A梦同人作品' },
  veilLoading: { en: 'Loading models', zh: '正在加载模型' },
  veilModels: { en: '{loaded} / {total} models', zh: '{loaded} / {total} 个模型' },

  // --- the character studio ----------------------------------------------------------------
  studioBack: { en: 'Diorama', zh: '回到场景' },
  studioTitle: { en: 'Character studio', zh: '角色工作室' },
  studioTagline: {
    en: 'Every motion the model carries, one character at a time.',
    zh: '模型里带的每一个动作，一次一个角色，慢慢看。',
  },
  studioHeight: { en: 'Height', zh: '身高' },
  studioStride: { en: 'Stride', zh: '步幅' },
  studioClips: { en: 'Clips', zh: '动作数' },
  studioMotion: { en: 'Motion', zh: '动作' },
  studioMotionClips: { en: 'Motion clips', zh: '动作片段' },
  studioPick: { en: 'Pick a motion.', zh: '选一个动作。' },
  studioNothing: { en: 'nothing yet', zh: '还没选动作' },
  studioSpeed: { en: 'Speed', zh: '速度' },
  studioLoop: { en: 'Loop', zh: '循环' },
  studioTurntable: { en: 'Turntable', zh: '转台' },
  studioScene: {
    en: '{name} standing on a studio turntable, playing {motion}.',
    zh: '{name} 站在工作室的转台上，正在做「{motion}」。',
  },
  studioMissing: {
    en: '{name}’s model is not built yet — the stage shows a placeholder.',
    zh: '{name} 的模型还没做出来——台上放的是占位模型。',
  },
  studioLoading: { en: 'Loading {name}…', zh: '正在加载 {name}…' },
  studioNoClips: {
    en: '{name} carries no animation clips yet. The Mixamo motion set lands with the pipeline in phase 3.',
    zh: '{name} 的模型里还没有动作片段。Mixamo 动作集要等第三阶段的管线接入。',
  },

  // --- walking hints -----------------------------------------------------------------------
  hintClick: { en: 'Click', zh: '单击' },
  hintLook: { en: 'to look', zh: '看四周' },
  hintMove: { en: 'move', zh: '移动' },
  hintRun: { en: 'run', zh: '跑' },
  hintStairs: { en: 'Stairs', zh: '楼梯' },
  hintClimb: { en: 'climb', zh: '上下楼' },
  hintFloors: { en: 'jump floors', zh: '切换楼层' },
  hintRelease: { en: 'release mouse', zh: '松开鼠标' },
} as const satisfies Record<string, Localized>;

export type UIKey = keyof typeof UI;

/** Values to substitute into a `{name}` placeholder. */
export type TVars = Record<string, string | number>;

/**
 * The string, in `locale`, with any `{name}` filled in. A placeholder with no matching variable
 * is left as written rather than blanked, so a mistake shows up in the page instead of turning
 * a sentence into a gap.
 */
export function translate(key: UIKey, locale: Locale, vars?: TVars): string {
  const entry = UI[key];
  const raw = (entry[locale] ?? entry.en) as string;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
