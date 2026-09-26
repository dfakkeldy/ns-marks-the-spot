import { describe,expect,it } from 'vitest';
import { combinedVisibility, viewpointSummary, elevationAt,pixelPoint,terrainPixel,visibilityFromPoint,type TerrainGrid } from './visibility';
const grid=():TerrainGrid=>({meta:{zoom:12,originX:1349*256,originY:1458*256,width:128,height:128,sha256:'test',bounds:[]},values:new Int16Array(128*128).fill(1000)});
describe('terrain visibility geometry',()=>{
  it('roundtrips cell centres and interpolates metre elevations',()=>{
    const g=grid();expect(terrainPixel(g.meta,pixelPoint(g.meta,30,40))[0]).toBeCloseTo(30,6);
    expect(terrainPixel(g.meta,pixelPoint(g.meta,30,40))[1]).toBeCloseTo(40,6);
    g.values[40*128+30]=2000;
    expect(elevationAt(g,30.5,40)).toBe(150);
    expect(elevationAt(g,-1,40)).toBeNull();
  });
  it('shows potential visibility on flat ground and screening behind a ridge',()=>{
    const g=grid(),observer=pixelPoint(g.meta,10,64),turbine=pixelPoint(g.meta,115,64);
    expect(visibilityFromPoint(g,observer,turbine).status).toBe('potential');
    for(let y=0;y<128;y++)for(let x=58;x<70;x++)g.values[y*128+x]=5000;
    const r=visibilityFromPoint(g,observer,turbine);
    expect(r.status).toBe('blocked');expect(r.hubPotential).toBe(false);
    expect(visibilityFromPoint(g,observer,turbine,r.requiredHeightM).status).toBe('uncertain');
  });
  it('fails closed for a missing sample and bounds the analysis distance',()=>{
    const g=grid(),observer=pixelPoint(g.meta,10,64),turbine=pixelPoint(g.meta,115,64);
    for(let y=0;y<128;y++)g.values[y*128+64]=-32768;
    expect(visibilityFromPoint(g,observer,turbine).status).toBe('no-data');
    expect(visibilityFromPoint(g,observer,{lat:observer.lat+1,lng:observer.lng}).status).toBe('outside');
  });
  it('does not confuse a visible blade tip with a visible hub',()=>{
    const g=grid(),observer=pixelPoint(g.meta,10,64),turbine=pixelPoint(g.meta,115,64);
    for(let y=0;y<128;y++)for(let x=60;x<63;x++)g.values[y*128+x]=1750;
    const r=visibilityFromPoint(g,observer,turbine);
    expect(r.status).toBe('potential');expect(r.hubPotential).toBe(false);
  });
});


describe('combined turbine visibility',()=>{
  it('shows potential visibility whenever at least one turbine has a potential view',()=>{
    expect(combinedVisibility(['blocked','potential','blocked','uncertain','outside','no-data'])).toBe('potential');
  });
  it('requires every turbine to be assessed and screened before showing all-screened',()=>{
    expect(combinedVisibility(Array(6).fill('blocked'))).toBe('blocked');
    expect(combinedVisibility(['blocked','uncertain'])).toBe('uncertain');
    expect(combinedVisibility(['blocked','outside'])).toBe('outside');
    expect(combinedVisibility(['blocked','no-data'])).toBe('no-data');
    expect(combinedVisibility(['uncertain','outside'])).toBe('outside');
    expect(combinedVisibility([])).toBe('no-data');
  });
  it('answers the combined question above individual viewpoint results',()=>{
    expect(viewpointSummary([{status:'potential',distanceM:1000},{status:'blocked',distanceM:1500}])).toBe('1 of 2 turbine tips potentially visible in the terrain model.');
    expect(viewpointSummary(Array(6).fill({status:'blocked',distanceM:1000}))).toContain('screens all 6');
    expect(viewpointSummary([{status:'outside',distanceM:25000}])).toContain('cannot be fully assessed');
  });
});
