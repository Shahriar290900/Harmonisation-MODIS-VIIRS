// Earth-fixed frame shared by the whole Earth view. Radius 1 = 6371 km. Y is north, +X is lon 0 / lat 0, -Z is lon 90 E.
// Matches three.js SphereGeometry + an equirectangular texture (lon -180 at the left edge).
import { Vector3 } from 'three';

export const R_KM = 6371;
const D = Math.PI / 180;

/** lat/lon in degrees, radius in Earth radii. */
export function toXyz(lat: number, lon: number, r = 1, out = new Vector3()): Vector3 {
  const cl = Math.cos(lat * D);
  return out.set(r * cl * Math.cos(lon * D), r * Math.sin(lat * D), -r * cl * Math.sin(lon * D));
}
/** Satellite height in km above the surface to radius in Earth radii. Real scale (no exaggeration): 705 km = 1.11. */
export const altRadius = (altKm: number) => 1 + altKm / R_KM;

export const wrapLon = (l: number) => ((((l + 180) % 360) + 360) % 360) - 180;

/** The point on Earth where the Sun is straight overhead, from the clock (low-precision solar position, about 0.01 degrees). */
export function subsolar(at: Date): { lat: number; lon: number } {
  const n = at.getTime() / 864e5 + 2440587.5 - 2451545.0; // days since J2000
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * D;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D;
  const eps = (23.439 - 4e-7 * n) * D;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / D;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  return { lat: dec / D, lon: wrapLon(ra - gmst) };
}

/* ---- "over <country>" from the Natural Earth 110 m outlines that the map view already ships ---- */
type Ring = number[][];
interface Country { name: string; bbox: [number, number, number, number]; polys: Ring[][] }
let countries: Country[] | null = null;
let loading: Promise<void> | null = null;
export function loadCountries(): Promise<void> {
  if (countries) return Promise.resolve();
  loading ??= fetch('./basemap/ne_110m_admin_0_countries.geojson').then((r) => r.json()).then((j: { features: { properties: { NAME?: string }; bbox?: number[]; geometry: { type: string; coordinates: unknown } }[] }) => {
    countries = j.features.map((f) => {
      const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
      let b: [number, number, number, number] = [180, 90, -180, -90];
      for (const p of polys) for (const [x, y] of p[0]) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
      return { name: f.properties.NAME ?? '', bbox: b, polys };
    });
  }).catch(() => { countries = []; });
  return loading;
}
const inRing = (x: number, y: number, ring: Ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Country name under a point, "open water" when none (110 m outlines miss small islands), null while the outlines are loading. */
export function countryAt(lat: number, lon: number): string | null {
  if (!countries) return null;
  for (const c of countries) {
    if (lon < c.bbox[0] || lon > c.bbox[2] || lat < c.bbox[1] || lat > c.bbox[3]) continue;
    for (const p of c.polys) if (inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h))) return c.name;
  }
  return 'open water';
}
