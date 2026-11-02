import { LEVEL, type StoreyId } from './house/plan';

/**
 * Height above a storey's floor where its plan is cut: through the window openings and the
 * doorways, under every head, as an architect's floor plan is drawn.
 */
export const PLAN_CUT = 1.4;

export type EditorLevelId = 'house' | 'upper' | 'ground';

export interface EditorLevel {
  id: EditorLevelId;
  label: string;
  /** Everything above this world height is clipped away; null shows the whole house. */
  cutY: number | null;
  /** Finished floor of the storey, where a plan view aims. */
  floorY: number;
  /** The storeys whose rooms are on show, and so labelled. */
  storeys: readonly StoreyId[];
}

/** The house as built so far, nothing cut. The editor opens on it. */
export const WHOLE_HOUSE: EditorLevel = {
  id: 'house',
  label: 'Whole house',
  cutY: null,
  floorY: LEVEL.floor,
  storeys: ['ground', 'upper'],
};

export const editorLevels: readonly EditorLevel[] = [
  WHOLE_HOUSE,
  {
    // The ground floor under it is roofed over where the upper storey does not cover it, so
    // only the upstairs rooms are named.
    id: 'upper',
    label: 'Upper floor',
    cutY: LEVEL.upper + PLAN_CUT,
    floorY: LEVEL.upper,
    storeys: ['upper'],
  },
  {
    id: 'ground',
    label: 'Ground floor',
    cutY: LEVEL.floor + PLAN_CUT,
    floorY: LEVEL.floor,
    storeys: ['ground'],
  },
];
