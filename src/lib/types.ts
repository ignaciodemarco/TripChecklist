export type UnitSystem = "imperial" | "metric";

export interface DefaultItem {
  itemKey: string;
  label: string;
  category: string;
  qty: number;
}

export interface WeatherDay {
  date: string;
  tMin: number | null;
  tMax: number | null;
  rain: number;        // unit per user pref (mm or inch)
  rainProb: number | null;
  snow: number;
  wind: number | null; // km/h or mph per user pref
  uv: number | null;
  code: number | null;
}

export interface WeatherSummary {
  approximated: boolean;
  units: { temp: "C" | "F"; precip: "mm" | "inch"; wind: "kmh" | "mph" };
  days: WeatherDay[];
  min: number | null;   // in user units
  max: number | null;
  rainProb: number;
  totalRain: number;
  totalSnow: number;
  maxUV: number;
  maxWind: number;
  // Always-celsius fields for rule engine (avoids unit branches)
  minC: number | null;
  maxC: number | null;
}

export interface TripInput {
  city: string;
  cityFull: string;
  lat: number;
  lon: number;
  startDate: string;
  endDate: string;
  tripType: string;
  travelers: number;
  laundry: boolean;
  international: boolean;
  activities: string[];
}

export interface PackingItem {
  itemKey: string;
  label: string;
  category: string;
  qty: number;
  reasons: string[];
  source: "rule" | "user-default" | "manual";
}
