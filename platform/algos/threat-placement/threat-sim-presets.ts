export type LaunchPreset = { code: string; lat: number; lng: number };

// Real-world Shahed launch corridors against western Ukraine, named after the closest
// recognizable settlement / oblast capital. Kherson 1/2 sit on the occupied south bank
// of the Dnipro; Belgorod, Bryansk, and Kursk are inside Russia.
export const LAUNCH_PRESETS: LaunchPreset[] = [
  { code: 'Kherson 1', lat: 46.49888819224525, lng: 32.36797798686785 }, // Hola Prystan area, occupied south bank
  { code: 'Kherson 2', lat: 46.68051701482264, lng: 33.23893383586933 }, // S of Nova Kakhovka, occupied south bank
  { code: 'Belgorod',  lat: 50.59064456471446, lng: 36.4706167249293  }, // Belgorod Oblast, RU
  { code: 'Bryansk',   lat: 52.41244335760817, lng: 32.47892813950152 }, // Bryansk Oblast (Klimovo area), RU
  { code: 'Kursk',     lat: 51.10093453476964, lng: 35.59061923602374 }, // Kursk Oblast (Sudzha sector), RU
];
