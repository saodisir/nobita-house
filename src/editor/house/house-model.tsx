import { Html, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type Group, type Material, type Mesh, Plane, Vector3 } from 'three';
import type { EditorLevel } from '../levels';
import { buildFurniture } from './build-furniture';
import { buildRoofFittings, buildRoofs } from './build-roof';
import { buildDoors, buildShell } from './build-shell';
import { CLICK_THROUGH, Doors } from './doors';
import {
  createCapMaterial,
  createMaterials,
  prepareTile,
  specOf,
  TILE_NAMES,
  type TileName,
  type TileTextures,
  tileUrl,
} from './materials';
import { MeshBatch } from './mesh-batch';
import { ROOMS, roomAt, STOREYS, type StoreyId } from './plan';

const TILE_URLS = Object.fromEntries(
  TILE_NAMES.flatMap((tile) => [
    [`${tile}-albedo`, tileUrl(tile, 'albedo')],
    [`${tile}-normal`, tileUrl(tile, 'normal')],
  ]),
);

/** Metres the roof travels at its detent: clear of the upstairs wall tops, and of an orbit above. */
const ROOF_TRAVEL = 3.4;
/** How far the lid fades over its travel: at rest it is a roof, at the top it is gone. */
const ROOF_FADE = 1;
/** Fraction of the travel it rises solid, before it starts dissolving. */
const ROOF_SOLID = 0.35;
/** Below this the lid is not worth drawing at all — a ghost sheet over the garden. */
const ROOF_GONE = 0.02;

/**
 * How far the upper floor slides out, and how high it goes on the way — which is to say, barely.
 *
 * The first version lifted it 4.2 m and carried it aside, which put a four-and-a-half-metre box
 * seven metres up over the side street. Nothing about that height was needed: what the move is
 * for is to vacate the plan, not the airspace. It leaves on the storey it was built on, riding
 * the ground floor's own wall tops — hence `RISE`, six centimetres of clearance, only so the
 * slab's underside does not fight the wall tops it slides across.
 *
 * `SHIFT` clears the ground floor's west wall by about 1.2 m: close enough to read as the floor
 * that came off this house, far enough that the two do not look like one long building.
 */
const UPPER_SHIFT = -5.8;
const UPPER_RISE = 0.06;
const UPPER_BACK = 0;

/**
 * The upper floor waits for the roof to be half off before it starts. Without the wait both
 * moves run at once, and the slab slides through the lid's eave as it rises through the same
 * few cubic metres. It also reads better: the lid comes off, then the floor comes out.
 */
const UPPER_WAIT = 0.5;

/** One merged mesh per material, the way `MeshBatch` lays them out. */
function MergedParts({
  parts,
  materials,
}: {
  parts: ReturnType<MeshBatch['build']>['parts'];
  materials: Record<string, Material>;
}) {
  return (
    <>
      {parts.map(({ material, geometry }) => {
        const seeThrough = specOf(material).seeThrough;
        return (
          <mesh
            key={material}
            name={material}
            geometry={geometry}
            material={materials[material]}
            castShadow={!seeThrough}
            receiveShadow
            userData={seeThrough ? CLICK_THROUGH : undefined}
          />
        );
      })}
    </>
  );
}

/**
 * Nobita's house as built from `plan.ts`: every board, wall and chair derived from the plan
 * data, merged into one mesh per material; each door leaf apart, so a click opens it, and
 * `openDoor` opens one for a view through it. `cutY` clips everything above it, shadows
 * included, and the section cap paints the cut walls solid. `paving` draws the editor's walk
 * from the porch toward the gate, which the diorama's lot lays its own path for.
 *
 * The house is built as three groups, because the diorama takes it apart. The roof lifts and
 * dissolves; the upper floor — walls, slab, furniture and doors — slides out sideways on its own
 * storey; the ground floor stays where it is, which is the one you cannot otherwise see.
 * `stage` (0 shut, 1 roof off, 2 upper floor out) drives both, eased here rather than at the
 * control so the house has some weight.
 */
export function HouseModel({
  cutY,
  openDoor,
  paving,
  stage = 0,
}: {
  cutY: number | null;
  openDoor?: string;
  paving: boolean;
  stage?: number;
}) {
  const textures = useTexture(TILE_URLS);
  const gl = useThree((s) => s.gl);
  const root = useRef<Group>(null);
  const roof = useRef<Group>(null);
  const upper = useRef<Group>(null);
  /** Each group's own eased progress: the lid first, then the floor, in that order both ways. */
  const roofT = useRef(0);
  const upperT = useRef(0);

  const house = useMemo(() => {
    const tiles = {} as TileTextures;
    for (const tile of TILE_NAMES as readonly TileName[]) {
      const albedo = textures[`${tile}-albedo`];
      const normal = textures[`${tile}-normal`];
      if (!albedo || !normal) throw new Error(`tile "${tile}" did not load`);
      prepareTile(albedo, true);
      prepareTile(normal, false);
      tiles[tile] = { albedo, normal };
    }
    const body = { ground: MeshBatch.create(), upper: MeshBatch.create() };
    buildShell(body, { paving });
    buildRoofFittings(body);
    buildFurniture(body);
    const roofBatch = MeshBatch.create();
    buildRoofs(roofBatch);
    const doors = buildDoors();
    return {
      ground: body.ground.build(),
      upper: body.upper.build(),
      roof: roofBatch.build(),
      groundDoors: doors.filter((door) => door.storey === 'ground'),
      upperDoors: doors.filter((door) => door.storey === 'upper'),
      materials: createMaterials(tiles),
      capMaterial: createCapMaterial(),
    };
  }, [textures, paving]);

  /**
   * The roof's own copies of the house's materials, so it can fade without the walls fading too.
   *
   * Cloned once and kept — cloning in the frame loop would leak a hundred materials a second, and
   * setting `transparent` on the shared originals would push every wall into the transparent pass.
   * The upper floor needs none of this: it never fades, it only moves.
   */
  const roofMaterials = useMemo(() => {
    const copies: Record<string, Material> = {};
    for (const { material } of house.roof.parts) {
      const copy = house.materials[material].clone();
      copy.transparent = true;
      copies[material] = copy;
    }
    return copies;
  }, [house]);

  /**
   * The roof's section cap needs its own copy too, and this one matters: the cap is the roof's
   * inner faces, drawn opaque so a clipped roof still looks solid. Leave it shared and opaque, and
   * lifting the roof reveals a grey slab exactly where the rooms should be — which is what the
   * first attempt did.
   */
  const roofCapMaterial = useMemo(() => {
    const copy = house.capMaterial.clone();
    copy.transparent = true;
    return copy;
  }, [house]);

  useEffect(
    () => () => {
      for (const material of Object.values(roofMaterials)) material.dispose();
      roofCapMaterial.dispose();
    },
    [roofMaterials, roofCapMaterial],
  );

  useEffect(
    () => () => {
      for (const batch of [house.ground, house.upper, house.roof]) {
        for (const part of batch.parts) part.geometry.dispose();
        batch.cap.dispose();
      }
      for (const leaf of [...house.groundDoors, ...house.upperDoors].flatMap((door) => door.leaves)) {
        for (const part of leaf.parts) part.geometry.dispose();
        leaf.cap.dispose();
      }
      for (const material of Object.values(house.materials)) material.dispose();
      house.capMaterial.dispose();
    },
    [house],
  );

  useEffect(() => {
    gl.localClippingEnabled = true;
    const planes = cutY === null ? null : [new Plane(new Vector3(0, -1, 0), cutY)];
    // The roof's clones are materials too: leave them out and a floor plan is drawn with the
    // roof still on it, which is what happened when the roof first got its own batch.
    const all = [
      ...Object.values(house.materials),
      house.capMaterial,
      ...Object.values(roofMaterials),
      roofCapMaterial,
    ];
    for (const material of all) {
      material.clippingPlanes = planes;
      // Without this a clipped roof or wall top would still shade the rooms it no longer covers.
      material.clipShadows = true;
    }
  }, [gl, house, cutY, roofMaterials, roofCapMaterial]);

  useFrame((_, delta) => {
    // The roof, eased. Lifting alone does not show the rooms — the lid is still a lid, just
    // higher, and from above it covers the same floor it always did — so it goes see-through as
    // it rises: a glass lid being taken off, not a solid one parked in the sky. The fade waits
    // for the first third, so a nudge reads as a roof coming off its walls (solid, still casting
    // the eaves' shadow) and the whole detent as a roof dissolving.
    //
    // Shutting, it stays up until the upper floor is home. The other way round, the lid sweeps
    // down through a floor that is still half out — it is fading in as it descends, so the two
    // share the air over the wall tops for a second and the eave cuts through the walls.
    const want = stage >= 1 || upperT.current > 0.05 ? 1 : 0;
    roofT.current += (want - roofT.current) * Math.min(1, delta * 4.5);
    const lid = roof.current;
    if (lid) {
      lid.position.y = roofT.current * ROOF_TRAVEL;
      const k = Math.min(1, Math.max(0, (roofT.current - ROOF_SOLID) / (1 - ROOF_SOLID)));
      const opacity = 1 - ROOF_FADE * k * k * (3 - 2 * k);
      // Fully faded, the lid would still draw as a faint sheet across the sky behind the house.
      lid.visible = opacity > ROOF_GONE;
      for (const child of lid.children) {
        const mesh = child as Mesh;
        if (!mesh.material || Array.isArray(mesh.material)) continue;
        const material = mesh.material;
        material.opacity = opacity;
        // A lid that still writes depth punches a hole in whatever is under it.
        material.depthWrite = opacity > 0.95;
        mesh.castShadow = opacity > 0.6;
      }
    }

    // The upper floor is the second detent's job, and it starts only once the lid is half off, so
    // the two never share the cubic metres above the ground floor's walls.
    const floor = upper.current;
    if (!floor) return;
    const opened = Math.min(1, Math.max(0, (roofT.current - UPPER_WAIT) / (1 - UPPER_WAIT)));
    const floorWant = stage >= 2 ? opened : 0;
    upperT.current += (floorWant - upperT.current) * Math.min(1, delta * 3.2);
    const t = upperT.current;
    const e = t * t * (3 - 2 * t);
    floor.position.set(e * UPPER_SHIFT, e * UPPER_RISE, -e * UPPER_BACK);
  });

  return (
    <group name="nobita-house" ref={root}>
      <MergedParts parts={house.ground.parts} materials={house.materials} />
      <mesh
        name="section-cap"
        geometry={house.ground.cap}
        material={house.capMaterial}
        userData={CLICK_THROUGH}
      />
      <Doors
        doors={house.groundDoors}
        materials={house.materials}
        capMaterial={house.capMaterial}
        root={root}
        cutY={cutY}
        opened={openDoor}
      />
      <group name="upper-storey" ref={upper}>
        <MergedParts parts={house.upper.parts} materials={house.materials} />
        <mesh
          name="upper-section-cap"
          geometry={house.upper.cap}
          material={house.capMaterial}
          userData={CLICK_THROUGH}
        />
        <Doors
          doors={house.upperDoors}
          materials={house.materials}
          capMaterial={house.capMaterial}
          root={root}
          cutY={cutY}
          opened={openDoor}
        />
      </group>
      <group name="roof" ref={roof}>
        <MergedParts parts={house.roof.parts} materials={roofMaterials} />
        <mesh
          name="roof-section-cap"
          geometry={house.roof.cap}
          material={roofCapMaterial}
          userData={CLICK_THROUGH}
        />
      </group>
    </group>
  );
}

const STOREY_ORDER: readonly StoreyId[] = ['ground', 'upper'];

/**
 * Each shown room's name over the middle of its largest rectangle, floated just above the
 * tallest thing standing in its storey — the wall tops, or the cut — so it never sits inside a
 * wall at any angle. A downstairs room with an upstairs room over its label is not labelled:
 * its name would float over the room above. The stairwell, a hole, has no label.
 */
export function RoomLabels({ level }: { level: EditorLevel }) {
  return (
    <group name="room-labels">
      {ROOMS.map((room) => {
        if (room.floor === 'void' || !level.storeys.includes(room.storey)) return null;
        const rect = [...room.rects].sort(
          (a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0),
        )[0];
        if (!rect) return null;
        const x = (rect.x0 + rect.x1) / 2;
        const z = (rect.z0 + rect.z1) / 2;
        const above = STOREY_ORDER.slice(STOREY_ORDER.indexOf(room.storey) + 1);
        if (above.some((s) => level.storeys.includes(s) && roomAt(x, z, s))) return null;
        const y = Math.min(level.cutY ?? Number.POSITIVE_INFINITY, STOREYS[room.storey].top) + 0.15;
        return (
          <Html key={room.id} position={[x, y, z]} center zIndexRange={[5, 0]} className="room-label">
            <span>{room.name}</span>
            <small lang="ja">{room.kana}</small>
          </Html>
        );
      })}
    </group>
  );
}
