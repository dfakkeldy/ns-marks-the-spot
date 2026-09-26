import { distanceMetres, type GeoPoint } from '../services/geodesy';
export interface TerrainMeta { zoom: number; originX: number; originY: number; width: number; height: number; sha256: string; bounds: number[][] }
export interface TerrainGrid { meta: TerrainMeta; values: Int16Array }
export type VisibilityStatus = 'potential' | 'blocked' | 'uncertain' | 'outside' | 'no-data';
export interface VisibilityResult { status: VisibilityStatus; distanceM: number; requiredHeightM?: number; hubPotential?: boolean }
export const OBSERVER_HEIGHT_M=1.7;
export const TIP_HEIGHT_M=200;
export const HUB_HEIGHT_M=118;
export const MAX_VISIBILITY_DISTANCE_M=20_000;
export const HEIGHT_SENSITIVITY_M=20;
const EFFECTIVE_EARTH_RADIUS_M=6_371_000/(1-0.13);
export function terrainPixel(meta: TerrainMeta, p: GeoPoint): [number,number] {
  const size=256*2**meta.zoom;
  return [(p.lng+180)/360*size-meta.originX-0.5,(1-Math.asinh(Math.tan(p.lat*Math.PI/180))/Math.PI)/2*size-meta.originY-0.5];
}
export function pixelPoint(meta: TerrainMeta, x: number, y: number): GeoPoint {
  const size=256*2**meta.zoom;
  return {lng:(x+0.5+meta.originX)/size*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*(y+0.5+meta.originY)/size)))*180/Math.PI};
}
export function elevationAt(grid: TerrainGrid,x: number,y: number): number | null {
  const {width,height}=grid.meta;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=width-1||y>=height-1)return null;
  const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy;
  const a=grid.values[iy*width+ix],b=grid.values[iy*width+ix+1],c=grid.values[(iy+1)*width+ix],d=grid.values[(iy+1)*width+ix+1];
  if(a===undefined||b===undefined||c===undefined||d===undefined||a===-32768||b===-32768||c===-32768||d===-32768)return null;
  return ((a*(1-dx)+b*dx)*(1-dy)+(c*(1-dx)+d*dx)*dy)/10;
}
/** Target-height threshold from an observer to a turbine; bare earth only.
 * Both endpoint elevations use this DEM. Sample <=1 source pixel along the line.
 * Curvature is represented as terrain bulge; k=0.13 standard refraction is an assumption.
 * The 20 m band is sensitivity at the target, NOT an accuracy/confidence interval.
 */
export function visibilityFromPoint(grid: TerrainGrid, observer: GeoPoint, turbine: GeoPoint, tipHeight=TIP_HEIGHT_M, observerHeight=OBSERVER_HEIGHT_M): VisibilityResult {
  const distanceM=distanceMetres(observer,turbine);
  if(distanceM>MAX_VISIBILITY_DISTANCE_M)return {status:'outside',distanceM};
  const [ox,oy]=terrainPixel(grid.meta,observer),[tx,ty]=terrainPixel(grid.meta,turbine);
  const og=elevationAt(grid,ox,oy),tg=elevationAt(grid,tx,ty);
  if(og===null||tg===null)return {status:'no-data',distanceM};
  const steps=Math.max(2,Math.ceil(Math.hypot(tx-ox,ty-oy)));
  let required=0;
  for(let i=1;i<steps;i++){
    const t=i/steps,elevation=elevationAt(grid,ox+(tx-ox)*t,oy+(ty-oy)*t);
    if(elevation===null)return {status:'no-data',distanceM};
    const bulge=distanceM*distanceM*t*(1-t)/(2*EFFECTIVE_EARTH_RADIUS_M);
    required=Math.max(required,(elevation+bulge-(og+observerHeight)*(1-t))/t-tg);
  }
  const status=Math.abs(tipHeight-required)<=HEIGHT_SENSITIVITY_M?'uncertain':tipHeight>required?'potential':'blocked';
  return {status,distanceM,requiredHeightM:required,hubPotential:HUB_HEIGHT_M>=required};
}
export const visibilityLabels: Record<VisibilityStatus,string> = {potential:'Potentially visible',blocked:'Terrain screens the 200 m tip',uncertain:'Near terrain threshold',outside:'Beyond 20 km screen', 'no-data':'Outside terrain coverage or no data'};

/** Union of potential views, not stacked transparent images. Missing coverage
 * cannot become an all-screened result. One positive result is sufficient even
 * when another turbine cannot be assessed at this location. */
export function combinedVisibility(statuses: readonly VisibilityStatus[]): VisibilityStatus {
  if (statuses.includes('potential')) return 'potential';
  if (statuses.length === 0 || statuses.includes('no-data')) return 'no-data';
  if (statuses.includes('outside')) return 'outside';
  if (statuses.includes('uncertain')) return 'uncertain';
  return 'blocked';
}

export function viewpointSummary(results: readonly VisibilityResult[]): string {
  const potential = results.filter(result => result.status === 'potential').length;
  if (potential) return `${potential} of ${results.length} turbine tips potentially visible in the terrain model.`;
  switch (combinedVisibility(results.map(result => result.status))) {
    case 'blocked': return `Terrain model screens all ${results.length} maximum blade tips.`;
    case 'uncertain': return 'Potential visibility is uncertain: at least one tip is near the terrain threshold.';
    default: return 'This location cannot be fully assessed with the available terrain coverage and 20 km range.';
  }
}
