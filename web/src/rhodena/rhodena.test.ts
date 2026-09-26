import { describe, expect, it } from 'vitest';
import proj4 from 'proj4';
import data from './features.json';
import receipt from './receipt.json';
import parcels from './parcels.json';
import { builtInMapThemes, buildMapPresentationFixture, validateMapTheme } from '../themes/mapThemes';
import { rhodenaFeatureInLayer, rhodenaLayers } from './catalog';
import { buildMapShareUrl, parseMapShareState, DEFAULT_MAP_POSITION } from '../services/mapShareState';

describe('Rhodena evidence contract',()=>{
  it('keeps six assessed turbines and separates ground elevation from height',()=>{
    const turbines=data.features.filter(f=>f.properties.kind==='turbine');
    expect(turbines.map(f=>f.id)).toEqual(['T1','T2','T3','T4','T5','T6']);
    for(const f of turbines){
      const p=f.properties;
      const ll=proj4('+proj=utm +zone=20 +datum=NAD83 +units=m +no_defs','EPSG:4326',[p.easting!,p.northing!]);
      expect(f.geometry.type).toBe('Point');
      expect(f.geometry.coordinates[0]).toBeCloseTo(ll[0],5);
      expect(f.geometry.coordinates[1]).toBeCloseTo(ll[1],5);
      expect(p.note).toContain('up to 200 m above ground');
      expect(p.groundElevationM).toBeGreaterThan(190);
    }
  });
  it('retains two conflicting substation records and dated anonymous receptors',()=>{
    const substations=data.features.filter(f=>f.properties.kind.includes('substation'));
    expect(substations).toHaveLength(2);
    expect(substations[0].geometry.coordinates).not.toEqual(substations[1].geometry.coordinates);
    const receptors=data.features.filter(f=>f.properties.kind==='receptor');
    expect(receptors).toHaveLength(7);
    expect(receptors.every(f=>f.properties.note.includes('worst case'))).toBe(true);
    expect(data.features.some(f=>/lynx|lichen|archaeolog|WSS|wetland/i.test(f.id))).toBe(false);
    expect(parcels).toHaveLength(80);
    expect(new Set(parcels.map(p=>p.pid)).size).toBe(80);
    expect(parcels.every(p=>/^\d{8}$/.test(p.pid)&&['Crown','Private'].includes(p.category))).toBe(true);
  });
  it('bounds drawing calibration and distinguishes traces from coordinates',()=>{
    expect(Math.max(...receipt.registration['2.2'].leaveOneOutM)).toBeLessThan(40);
    expect(Math.max(...receipt.registration['2.3A'].leaveOneOutM)).toBeLessThan(15);
    expect(receipt.substationCrossCheckM).toBeLessThan(60);
    for(const f of data.features){
      expect(f.properties.sourceUrl).toMatch(/^https:\/\/novascotia.ca\/nse\/ea\/rhodena-wind-project\//);
      expect(f.properties.accuracy).toBeTruthy();
      if(f.properties.digitized)expect(f.properties.accuracy).toContain('Approximate');
      if(f.geometry.type==='Polygon') {
        const ring=f.geometry.coordinates[0] as number[][];
        expect(ring[0]).toEqual(ring.at(-1));
        expect(f.properties.note).toContain('Small holes');
      }
    }
  });
  it('shares layer choices and keeps this web theme out of native parity',()=>{
    const theme=builtInMapThemes.find(t=>t.id==='rhodena')!;
    expect(validateMapTheme(theme)).toEqual([]);
    expect(theme.taxSaleEnabled).toBe(false);
    const ids=rhodenaLayers.map(l=>l.id);
    const url=buildMapShareUrl('https://example.test/',{taxSaleEnabled:false,mode:'current',pid:null,eventIds:[],layerIds:ids,position:DEFAULT_MAP_POSITION});
    expect(parseMapShareState(url).layerIds).toEqual(ids);
    expect(buildMapPresentationFixture().builtInThemes.some(t=>t.id==='rhodena')).toBe(false);
    expect(buildMapPresentationFixture().categories.some(c=>c.id==='rhodena-project')).toBe(false);
    expect(rhodenaFeatureInLayer('receptor','rhodena-distance-rings')).toBe(false);
    expect(rhodenaLayers.find(l=>l.id==='rhodena-distance-rings')?.webCaveat).toContain('Not legal setbacks');
  });
});
