/**
 * Doorways with a body standing in them, published by the walker once per frame.
 *
 * `blocked()` only fills a doorway while its leaf is shut. An open door is deliberately a hole
 * in the wall, so the walker can stand in the exact space the leaf swings back into — and a
 * collider cannot stop that leaf from closing straight through them. The store asks here before
 * it lets a leaf shut, and keeps it open until the doorway is clear.
 *
 * Plain module state, like `walkerPose`: it changes sixty times a second and must not re-render
 * React. The walker writes, the store reads; the two never import each other, so the store
 * stays usable on its own in tests and in the editor.
 */

const occupied = new Set<string>();

/** Forget last frame's doorways. */
export function clearOccupiedDoors(): void {
  occupied.clear();
}

/** Mark one doorway as having a body in it this frame. */
export function markDoorOccupied(id: string): void {
  occupied.add(id);
}

/** Whether a leaf must stay open because somebody is in its way. */
export function doorOccupied(id: string): boolean {
  return occupied.has(id);
}
