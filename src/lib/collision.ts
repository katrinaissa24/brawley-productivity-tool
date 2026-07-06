import {
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";

/** Pointer-first collision detection: precise for sidebar rows, with a rect fallback. */
export const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length > 0) return within;
  return rectIntersection(args);
};

/**
 * No-op sorting strategy for task lists. The dragged card leaves the list
 * (space closes) and an insertion line marks the drop position — letting
 * items ALSO shift to make room would move them under a stationary pointer,
 * causing an over/measure feedback loop that freezes the renderer.
 */
export const noSortingStrategy = () => null;
