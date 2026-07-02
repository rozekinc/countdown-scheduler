export interface AspectRatioPreset {
  id: string;
  label: string;
  w: number;
  h: number;
}

// Keep this list, and every value in it, identical to src/aspectRatios.ts.
export const ASPECT_RATIOS: AspectRatioPreset[] = [
  { id: "widescreen-16-9", label: "Widescreen TV (16:9)", w: 16, h: 9 },
  { id: "standard-4-3", label: "Older TV (4:3)", w: 4, h: 3 },
  { id: "ultrawide-21-9", label: "Ultrawide (21:9)", w: 21, h: 9 },
  { id: "portrait-9-16", label: "Portrait / vertical (9:16)", w: 9, h: 16 },
];

export const DEFAULT_ASPECT_RATIO_ID = "widescreen-16-9";

export function getAspectRatio(id: string | null | undefined): AspectRatioPreset {
  return ASPECT_RATIOS.find((r) => r.id === id) ?? ASPECT_RATIOS[0];
}
