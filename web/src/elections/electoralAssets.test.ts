import { resolve } from "node:path";
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { electoralLayers } from '../layers/electoralLayers';
import { loadElectoralCollection, isInstitution, electoralFill } from './electoralData';
import { buildMapShareUrl, parseMapShareState, DEFAULT_MAP_POSITION } from '../services/mapShareState';

describe('electoral assets and disclosure', () => {
  it('has a receipt, exact count and intact geometry for each open extract', async () => {
    const root = resolve('public/elections');
    const receipt = JSON.parse(await readFile(resolve(root,'source.json'),'utf8'));
    for (const layer of electoralLayers) {
      if (!('asset' in layer.electoral)) continue;
      const asset = layer.electoral.asset;
      const source = receipt.sources.find((s: {asset:string}) => s.asset===asset);
      const data = await readFile(resolve(root,layer.electoral.asset));
      expect(createHash('sha256').update(data).digest('hex')).toBe(source.sha256);
      expect(source.licenceUrl).toBe(layer.licenceUrl);
      const result = await loadElectoralCollection(layer,false,new AbortController().signal,async () => new Response(data.toString()));
      expect(result.status,layer.id).toBe('ready');
      expect(source.featureCount).toBe(layer.electoral.expectedCount);
    }
  });
  it('preserves modes in shared links and rejects forged modes', () => {
    const url=buildMapShareUrl('https://example.test/',{ mode:'current',taxSaleEnabled:false,pid:null,eventIds:[],layerIds:['provincial-results-2024'],position:DEFAULT_MAP_POSITION,electoralModes:{'provincial-results-2024':'turnout'} });
    expect(parseMapShareState(url).electoralModes).toEqual({'provincial-results-2024':'turnout'});
    expect(parseMapShareState('https://example.test/?electoral=provincial-seats-2026:turnout').electoralModes).toBeUndefined();
  });
  it('never assigns a party fill to institutional polls', () => {
    const layer=electoralLayers.find(l=>l.id==='federal-polls-2025')!;
    expect(isInstitution(layer,{PD_TYPE:'S'})).toBe(true);
    expect(electoralFill(layer,{PD_TYPE:'M'},'winner',false).colour).toBe('transparent');
  });
});
