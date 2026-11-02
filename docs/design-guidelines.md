# Design Guidelines — nobita-house-3d

Trimmed 2026-09-10 to the surfaces that exist. The scene is the hero; chrome is a paper-and-ink annotation layer. The 2026-08-02 version specified dollhouse surfaces (room rail, hotspot pins, editor mode) that were never built after the pivot; git history keeps it.

Rules: chrome stays translucent paper or absent; the scene owns all saturation except one blue accent; nothing blocks orbit unless it must.

## 1. Palette

UI tokens are **implemented in `src/styles/tokens.css`** — that file is the source of truth. Summary:

| Group | Tokens | Use |
|---|---|---|
| Paper | `--paper-100…400` (#FFFCF6 → #E0D3BC) | panel fills, hover/pressed states |
| Ink | `--ink-900/700/500` (#2A241E / #4E453B / #6F6355) | text hierarchy; 13.7:1 / 8.4:1 / 5.2:1 on paper |
| Lines | `--line`, `--line-strong` | hairlines, dashed plate frame |
| Accent | `--accent-600` #0B63C5 (+700 pressed, 400 glow, soft fill) | the only interactive hue; Doraemon blue darkened to pass AA |
| Overlay | `--panel-bg` rgba paper .92 + blur | every floating panel |

Never put chrome in kawara blue, tatami green or Doraemon yellow; those belong to the model. Per-character accent colours come from `data/characters.ts` and appear only in roster swatches and the card eyebrow.

## 2. Typography

| Role | Font | Where |
|---|---|---|
| Display | Fraunces 600, `SOFT 100, WONK 1` | loading title, card title, app title |
| UI/body | Hanken Grotesk 400–700 | everything else |
| JP flourish | system JP stack | character name kana in the info card |

Loaded from Google Fonts in `index.html`, `display=swap`.

## 3. Surfaces (all implemented in `src/ui/` + `src/styles/app.css`)

| Surface | Spec |
|---|---|
| Loading veil | full-bleed warm wash, paper plate with dashed offset frame, 3px accent progress rule, `n / N models` tabular counter; `role="progressbar"`, removed from DOM after fade |
| Title card | top-left paper card, Fraunces title + uppercase micro eyebrow |
| Performance | paper card stacked under the title: FPS with a status dot (green ≥55, amber ≥30, red below), then frame / worst-frame ms, draw calls and triangles in tabular monospace; averaged over 500 ms windows by `scene/perf-probe.tsx`; not a live region |
| View controls | top-right toolbar of 16px line icons (`ui/icons.tsx`) with labels, groups split by hairlines: **Camera** (Reset view as a plain action; Auto-rotate as an `aria-pressed` toggle. The Walk toggle is hidden since 2026-09-13 because a seated character has no way to stand up and set off; the walk loop and `walkMode` in the store remain, so restoring the button in `ui/chrome.tsx` brings it back) and **Time of day** (Dawn / Morning / Sunset / Night, each with an icon — sunrise, sun, sunset, moon — and a tooltip). The time group is a `<fieldset>` of real radio inputs styled as chips — one choice is active at a time and arrow keys move between them; the input stays in the layout at zero opacity so focus and keyboard behaviour survive. The checked fill is one shared-layout `motion` chip (`layoutId`) that slides to the new choice; forced-colors mode adds an outline instead. Right after it, a **Rain** toggle (cloud-and-drops icon, `aria-pressed`) lays rain over whichever time is selected — on phones it moves into the settings sheet as a switch next to the time of day. The settings sheet's **Sound effects** switch (formerly "Interaction sounds") covers the rain's sound as well as the door and drawer sounds. Then the **sound** control (see Music) and, after a hairline, the **Character studio** link (person icon, accent text, →), the diorama's only way to the studio page. Below 1200px (the labelled toolbar is ~866px wide) time of day, Music and the studio link show icons only (tooltips, names kept for screen readers); 768–1099px also tightens the chips. **Phones (<768px):** the toolbar becomes a bottom bar of 40px icon buttons (34px under 360px) that fits without scrolling — Reset view │ four times │ sound │ Settings. Auto-rotate and the studio link are hidden there and live in the **settings sheet**: a Settings button (sliders icon, `aria-expanded`) opens a panel above the bar with an Auto-rotate switch (`role="switch"`), the volume slider and the studio link as 44px rows; focus moves into it, and Esc (focus back to the button), a press or focus outside, or the button again closes it (`ui/settings-sheet.tsx`, dismissal shared with the sound popover in `ui/use-dismiss.ts`). |
| Menus toggle | 40px paper square, bottom-right on desktop, top-right on mobile (the toolbar has moved to the bottom there). One button (accessible name "Menus" + `aria-expanded`, `aria-controls="main-menus"`, tooltip "Hide menus" / "Show menus", corner-arrow icon) fades the title, performance, view controls and roster out together (200 ms, `.menus` layer in `app.tsx`) so the scene can be seen whole. Hidden menus stay mounted — unmounting the toolbar would stop the music — and turn `visibility:hidden` + `inert`, leaving the tab order and hit testing. The info card is outside the layer and still opens from a model click; closing it then returns focus to the toggle, since the roster is inert. On desktop the card's height stops above the toggle and scrolls. Not persisted across reloads. |
| Roster | bottom-left pill row, one button per character with colour swatch; `aria-current` on selection; doubles as the keyboard/SR path to character selection |
| Info card | desktop right panel 360px / on phones a panel floating above the bottom bar (so the bar stays usable), inset 12px, all corners rounded; eyebrow in character colour, Fraunces title, kana subtitle, ≤62ch body; Esc closes, focus returns to the roster button |
| Music | one sound control in the view-controls toolbar (`SoundControl` in `ui/music-player.tsx`): a speaker button labelled "Music" (icon only below 1200px), `aria-pressed` = playing, drawn muted while off or at 0 volume. A click toggles the music. The volume popover — a labelled 0–100 range slider with a % readout — opens on mouse hover (150 ms close delay bridges the gap), on keyboard focus (`:focus-visible` only, so a tap just toggles; Tab carries on from the button into the slider in DOM order), or after a 500 ms long-press on touch, which swallows that press's click and the touch callout. It hangs off the toolbar's right end, below it on desktop and above the phone bar. Esc, or a press or focus outside, hides it until the next approach; Esc does not also close an open info card. On phones the same slider also sits in the settings sheet. `useBackgroundMusic` lives in `ViewControls`, so both share one track. The volume is saved in `localStorage` (`nobita-house.music-volume`, first visit uses `config.music.volume`); iOS Safari ignores page-set volume, so there the slider does not change loudness. The toggle plays and pauses a looped track of `config.music.src` (`public/audio/background-music.mp3`) through `useBackgroundMusic`. Music auto-plays on load; if the browser blocks sound before a user gesture, it starts on the first click or key press. The on/off choice is saved in `localStorage` (`nobita-house.music`), so a visitor who turned it off stays silent after a reload; the pressed state follows the element's play/pause events; leaving the diorama pauses it. |

Canvas: `role="img"` with a scene-describing `aria-label`; `#ui-root` is `pointer-events:none`, only leaf panels re-enable.

## 4. Motion

| Event | Duration |
|---|---|
| Button hover / press | 120 ms colour / 90 ms `motion` squeeze to 0.95 (toolbar buttons) |
| Time-of-day chip | spring slide between chips (stiffness 520, damping 40) |
| Volume popover in / out | 180 ms fade + scale from 0.94, from the toolbar corner |
| Card in / out | 280 / 180 ms (mobile sheet 320) |
| Camera fly (`CameraControls`) | smoothTime 0.35 |
| Character idle | breath ~1.55 Hz bob + squash, slow sway, phase-offset per character |
| Time-of-day change | ~1.4 s exponential ease on sun direction, light colour/intensity, background and fog; stars cut in once the sky has darkened |
| Resting pose | every character holds its own looping clip at home after `assets/home.jpg` (`rest` in `characters.ts`): Gian and Suneo sit on the front wall, Nobita sits on the ground at the gate, Shizuka stands thinking, Doraemon cheers beside Nobita, and Dekisugi talks out on the sidewalk right of Suneo, each in a different mood; all six gather tight round the gate, neighbours at least 0.7 m apart so the walk loop's spacing test still holds; `rest.offset` lifts the wall sitters onto the coping. A GLB without its clip falls back to `idle`, and without that to the procedural breath |
| Select greeting | ~0.95 s dip → hop → settle, slight yaw wave; held back while out walking, played on arrival home if still selected; a resting (seated) character never greets |
| Walk mode (UI hidden since 2026-09-13) | 1 m/s round the block, reached in 0.6 s and braked as fast; five characters swing their legs through the authored `walk` clip, one cycle per stride of ground, and Doraemon waddles procedurally; the procedural step bounce halves and the waddle drops where the clip plays; a slight forward lean replaces the idle; yaw turns toward the route at ~8 rad/s; 0.35 s standstill to turn round |
| Walker follow | the selected walker is tracked with a 0.2 s ease, keeping the user's orbit angle; turning onto another street swings the eye to the street side once if a lot wall would hide the walker |

`prefers-reduced-motion`: camera cuts instantly (a followed walker is tracked without easing), character idle and procedural gait motion freeze while walk mode still walks them round the block and their authored leg clip keeps stepping, time-of-day snaps rather than eases, card/veil transitions collapse to fades, toolbar press squeezes and the chip slide are skipped (`MotionConfig reducedMotion="user"`) while the popover keeps its fade. Implemented in `use-character-motion.ts`, `camera-rig.tsx` and `ui/chrome.tsx`, media-query-driven in CSS.

## 5. Accessibility checklist (current state)

- [x] Canvas `role="img"` + descriptive label
- [x] Roster buttons mirror 3D click targets; `aria-current` selection
- [x] Info card `role="dialog"`, labelled, Esc closes, focus in/out managed
- [x] Toggles use `aria-pressed`; plain actions do not
- [x] Focus ring: 2px accent + 4px white halo, survives on canvas
- [x] Text contrast ≥ 4.5:1 (values in §1)
- [x] Reduced motion honoured end to end
- [ ] Touch-target audit on mobile chrome (roster pills < 44px tall) — open
