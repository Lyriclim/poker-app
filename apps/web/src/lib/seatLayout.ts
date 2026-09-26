export interface SeatPos {
  x: number; // 百分比
  y: number; // 百分比
}

/**
 * 计算座位在椭圆牌桌上的位置（百分比坐标），并把「你」固定在正下方。
 * 座位号按顺时针递增：庄家左手（顺时针）是下一个座位号，
 * 因此递增座位号应沿「下 → 左 → 上 → 右」顺时针排布（angle 取负号）。
 */
export function seatPosition(
  seatIndex: number,
  yourSeatIndex: number | null,
  totalSeats: number,
): SeatPos {
  const base = yourSeatIndex ?? 0;
  const step = (seatIndex - base) / totalSeats;
  const angle = -step * Math.PI * 2;
  // angle = 0 → 正下方
  const x = 50 + 42 * Math.sin(angle);
  const y = 50 + 40 * Math.cos(angle);
  return { x, y };
}
