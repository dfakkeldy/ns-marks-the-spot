import type { PathOptions } from 'leaflet';
import { atlasPalettes } from '../atlas/palette';
const p = atlasPalettes.day;
/** Source water-theme polygons also include swamps and built structures. */
export function waterStyle(description: string): PathOptions {
  if (description.includes('Water') && !description.includes('Underground')) return { color:p.waterLine, weight:.5, fillColor:p.water, fillOpacity:1 };
  if (description.includes('Swamp')) return { color:p.path, weight:.5, dashArray:'2 4', fillColor:p.grass, fillOpacity:.8 };
  return { color:p.roadEdge, weight:.7, fillColor:p.building, fillOpacity:1 };
}
export function roadStyle(roadClass: string, description: string, casing = false): PathOptions {
  const major = ['Trans Canada','Highway','Local Highway','Arterial'].includes(roadClass);
  const ordinary = (major || ['Collector','Local Arterial','Local Collector','Ramp','Local'].includes(roadClass)) && !/abandoned|no vehicular traffic|status unknown/iu.test(description);
  return casing ? { color:p.roadEdge, weight:5, opacity:ordinary ? 1 : 0 } : ordinary
    ? { color:major ? p.highway : p.road, weight:2.5 }
    : { color:p.path, weight:1.5, dashArray:'4 3' };
}
