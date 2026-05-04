import type { UnitSystem } from "./types";

export const cToF = (c: number) => (c * 9) / 5 + 32;
export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const kmhToMph = (k: number) => k * 0.621371;
export const mmToInch = (mm: number) => mm / 25.4;
export const cmToInch = (cm: number) => cm / 2.54;

export function unitLabels(u: UnitSystem) {
  return u === "imperial"
    ? { temp: "°F", wind: "mph", precip: "in", snow: "in", distance: "mi" }
    : { temp: "°C", wind: "km/h", precip: "mm", snow: "cm", distance: "km" };
}
