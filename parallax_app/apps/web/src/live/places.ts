// Quick-jump places of the Live page (centres and views of the three regions of the snapshot).
export interface Place { id: 'world' | 'BGD' | 'USA-CA' | 'AUS-NSW'; label: string; lon: number; lat: number; zoom: number }
export const PLACES: Place[] = [
  { id: 'BGD', label: 'Bangladesh', lon: 90.35, lat: 23.7, zoom: 5.6 },
  { id: 'USA-CA', label: 'California', lon: -119.5, lat: 37.2, zoom: 4.9 },
  { id: 'AUS-NSW', label: 'New South Wales', lon: 147.0, lat: -32.8, zoom: 4.9 },
  { id: 'world', label: 'World', lon: 20, lat: 15, zoom: 1.7 }
];
export const placeById = (id: string): Place => PLACES.find((p) => p.id === id) ?? PLACES[PLACES.length - 1];
