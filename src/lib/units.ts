export const UNITS = ["pcs", "kg", "g", "l", "ml", "box", "pack", "bag", "dozen", "bottle", "carton"] as const;
export type Unit = (typeof UNITS)[number];
