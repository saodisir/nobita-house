import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Color, type MeshStandardMaterial, type Object3D, type PointLight } from 'three';
import { toWorld } from '../data/house-site';
import { roomById } from '../data/rooms';
import { layout } from '../data/scene';
import { HOODS, WALL_EXTERIOR } from '../editor/house/plan';
import type { TimeOfDayState } from './use-time-of-day';

/** Height of the lamp lens on each utility pole; mirrors `LAMP_H` in streets_build.py. */
const STREET_LAMP_HEIGHT = 4.63;
/** How far the lamp bracket reaches over the carriageway, from the same builder. */
const STREET_LAMP_REACH = 0.85;
/**
 * Below this `lampLevel` the lamps count as off. `lampLevel` eases exponentially, so it only
 * ever approaches 0; without a threshold the lights would never leave the light list.
 */
const LAMPS_OFF_BELOW = 0.01;

const canopy = HOODS.find((hood) => hood.id === 'canopy-front');
if (!canopy) throw new Error('plan.ts has no canopy-front');
const westernWindow = roomById('yoshitsu')?.entry;
if (!westernWindow) throw new Error('the Western room has no street window');

/** Warm practicals on Nobita's lot, at the house's fixtures and the garden's. */
const LOT_LAMPS = [
  // The porch lamp, under the middle of the canopy over the front door.
  {
    position: toWorld((canopy.from + canopy.to) / 2, canopy.y - 0.3, WALL_EXTERIOR / 2 + canopy.depth / 2),
    color: '#FFD9A0',
    intensity: 9,
    distance: 7,
  },
  // Stone lantern in the west garden, at its fire box (`lantern_house` in env_build.py).
  { position: [-6.7, 0.92, -3.3] as const, color: '#FFCE86', intensity: 6, distance: 6 },
  // Spill from the lit Western room's street window onto the front garden.
  {
    position: [
      westernWindow.centre[0] + westernWindow.outward[0] * 0.6,
      1.5,
      westernWindow.centre[2] + westernWindow.outward[1] * 0.6,
    ] as const,
    color: '#FFE0B0',
    intensity: 5,
    distance: 8,
  },
];

/**
 * Street lamps, derived from the same pole table the Blender builder reads, so a pole moved
 * in `scene.ts` takes its light with it. The bracket reaches over the carriageway: the
 * front-street poles face +z, the junction pole on the side street faces -x.
 */
const STREET_LAMPS = layout.streets.poles.map(([x, z]) => {
  const onFrontStreet = z > 0;
  return {
    position: [
      onFrontStreet ? x : x - STREET_LAMP_REACH,
      STREET_LAMP_HEIGHT,
      onFrontStreet ? z + STREET_LAMP_REACH : z,
    ] as [number, number, number],
    color: '#FFE6BC',
    // Street lights sit 4.6 m above dark asphalt. With decay 2 the illuminance falls as
    // 1/d², so the porch lamp's ~9 lands near zero out here: measured road luminance was
    // unchanged from the ambient 47/255 at intensity 14, and only reaches a readable pool
    // around 140. Beyond ~220 the wall and the characters start to blow out.
    intensity: 140,
    distance: 26,
  };
});

/**
 * Materials lit from within at night, grouped by the subtree they live in.
 *
 * Grouping matters: material names are not unique across the GLBs — `env_plate` alone appears
 * in the environment, the streets and the neighbours — so matching by name over the whole
 * scene once lit every neighbour nameplate and pole plate in the block.
 */
const EMISSIVE_BY_ROOT: Record<string, Record<string, { color: string; strength: number }>> = {
  // `house-model.tsx` names every material `house_<key>`. The panes are nearly clear, so their
  // glow is scaled up to read through the 18% they show; frosted glass and the curtains drawn
  // back beside the windows are the house's lamplight from the street.
  'nobita-house': {
    house_glass: { color: '#FFD9A0', strength: 3.2 },
    house_frosted: { color: '#FFDDAA', strength: 1.1 },
    house_curtainTeal: { color: '#FFE3B8', strength: 0.85 },
    house_curtainGreen: { color: '#FFE3B8', strength: 0.85 },
    house_curtainBlue: { color: '#FFE3B8', strength: 0.85 },
  },
  'neighbours-root': {
    // Dimmer than the hero house: the neighbours are backdrop, not subject.
    env_glass: { color: '#FFD49A', strength: 0.8 },
    env_interior: { color: '#FFCF92', strength: 0.55 },
    // Gate lanterns and porch lights: the one warm point each lot shows the street at night.
    env_lamp_lens: { color: '#FFE2B0', strength: 1.8 },
  },
  'streets-root': {
    env_lamp_lens: { color: '#FFF0CC', strength: 2.4 },
  },
};

const TOTAL_TARGETS = Object.values(EMISSIVE_BY_ROOT).reduce(
  (sum, group) => sum + Object.keys(group).length,
  0,
);

interface Captured {
  material: MeshStandardMaterial;
  color: Color;
  strength: number;
  /** What the GLB authored, so daylight restores the original rather than approaching it. */
  originalColor: Color;
  originalIntensity: number;
}

/**
 * Night practicals: point lights at the modelled fixtures, plus an emissive lift on window
 * glass, neighbour windows and the street-lamp lenses. Everything scales with `tod.lampLevel`.
 *
 * When the lamps are off the point lights are made invisible, not just dimmed. three.js loops
 * over every light in the scene in every lit fragment shader whatever its intensity, so eight
 * lights at intensity 0 cost 30–40 % of a daylight frame for no visible effect (measured
 * 2026-09-11). Leaving the light list does change the shader key, so crossing the threshold
 * recompiles the lit materials once — acceptable on a button press, never mid-orbit.
 */
export function NightLights({ tod }: { tod: TimeOfDayState }) {
  const scene = useThree((s) => s.scene);
  const lights = useRef<(PointLight | null)[]>([]);
  const captured = useRef<Captured[]>([]);
  const lastLevel = useRef(-1);

  useFrame(() => {
    // `userData.baseIntensity` is the source of truth: this line overwrites `intensity`
    // every frame, so tuning the light by setting `intensity` directly does nothing.
    const lampsOn = tod.lampLevel >= LAMPS_OFF_BELOW;
    for (const light of lights.current) {
      if (!light) continue;
      light.visible = lampsOn;
      light.intensity = light.userData.baseIntensity * tod.lampLevel;
    }

    // Keep scanning until every target is found: the four GLBs load behind independent
    // Suspense boundaries, so stopping at the first non-empty result would permanently miss
    // whichever files resolved later.
    if (captured.current.length < TOTAL_TARGETS) {
      for (const [rootName, group] of Object.entries(EMISSIVE_BY_ROOT)) {
        scene.getObjectByName(rootName)?.traverse((node: Object3D) => {
          const mesh = node as { isMesh?: boolean; material?: MeshStandardMaterial };
          const material = mesh.material;
          if (!mesh.isMesh || !material?.name) return;
          const spec = group[material.name];
          if (!spec || captured.current.some((entry) => entry.material === material)) return;
          captured.current.push({
            material,
            color: new Color(spec.color),
            strength: spec.strength,
            originalColor: material.emissive.clone(),
            originalIntensity: material.emissiveIntensity,
          });
          // Force a write next frame: without this the dead-band below would skip materials
          // captured after the ease had already settled.
          lastLevel.current = -1;
        });
      }
    }

    if (Math.abs(tod.lampLevel - lastLevel.current) < 0.002) return;
    lastLevel.current = tod.lampLevel;
    for (const entry of captured.current) {
      if (tod.lampLevel < LAMPS_OFF_BELOW) {
        // Restore exactly, rather than asymptotically approaching the original.
        entry.material.emissive.copy(entry.originalColor);
        entry.material.emissiveIntensity = entry.originalIntensity;
      } else {
        entry.material.emissive.copy(entry.color);
        entry.material.emissiveIntensity = entry.strength * tod.lampLevel;
      }
    }
  });

  return (
    <group name="night-lights">
      {[...LOT_LAMPS, ...STREET_LAMPS].map((lamp, index) => (
        <pointLight
          key={lamp.position.join(',')}
          ref={(node) => {
            lights.current[index] = node;
            if (node) node.userData.baseIntensity = lamp.intensity;
          }}
          position={lamp.position}
          color={lamp.color}
          // Start out of the light list: the default preset is daylight, and mounting visible
          // would compile every lit shader once with the lamps and then again without them.
          visible={false}
          intensity={0}
          distance={lamp.distance}
          decay={2}
        />
      ))}
    </group>
  );
}
