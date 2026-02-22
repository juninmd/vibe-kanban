export const LANE_X: Record<string, number> = {
  backlog: -4.5,
  in_progress: -1.5,
  review: 1.5,
  done: 4.5
};

export function getLaneSafe(lane?: string): string {
  return lane && LANE_X[lane] !== undefined ? lane : "backlog";
}

export function getTaskCardPosition(lane: string, order: number) {
  return {
    x: LANE_X[lane] ?? 0,
    y: 1.95 - order * 0.9
  };
}

export function shouldRenderTaskIn3D(lane: string, order: number, y: number) {
  if (y < -2.25) return false;
  if (lane === "done" && order > 5) return false;
  return true;
}
