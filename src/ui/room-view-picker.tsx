import { roomById } from '../data/rooms';
import type { Locale } from '../i18n/locale';
import { useLocale, useT } from '../i18n/use-i18n';
import { useAppStore } from '../state/store';

/**
 * `room-views.ts` builds a corner's name out of words — `Front left`, `Back`, `Doorway` — and
 * numbers the repeats. These are positions rather than prose, so Chinese compresses them to two
 * characters instead of translating the phrase; the trailing number is kept as it is.
 */
const VIEW_ZH: Record<string, string> = {
  Front: '前',
  Back: '后',
  Left: '左',
  Right: '右',
  'Front left': '前左',
  'Front right': '前右',
  'Back left': '后左',
  'Back right': '后右',
  Doorway: '门口',
};

function viewLabel(label: string, locale: Locale): string {
  if (locale === 'en') return label;
  const [, base = '', index = ''] = label.match(/^(.*?)( \d+)?$/) ?? [];
  return `${VIEW_ZH[base] ?? base}${index}`;
}

/**
 * Where in the room to stand: one chip per place `room-views.ts` finds in it, the corners and,
 * for the rooms too small to show from inside, the doorway. The same places `/editor` lists.
 * Nothing to pick in a room with only one.
 */
export function RoomViewPicker() {
  const room = useAppStore((s) => (s.activeRoomId ? roomById(s.activeRoomId) : undefined));
  const index = useAppStore((s) => s.roomViewIndex);
  const setRoomView = useAppStore((s) => s.setRoomView);
  const locale = useLocale();
  const t = useT();
  if (!room || room.views.length < 2) return null;
  return (
    <fieldset className="title__views">
      <legend>{t('standAt')}</legend>
      {room.views.map((view, i) => (
        <button key={view.label} type="button" aria-pressed={i === index} onClick={() => setRoomView(i)}>
          {viewLabel(view.label, locale)}
        </button>
      ))}
    </fieldset>
  );
}
