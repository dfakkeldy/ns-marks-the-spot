import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, SESSION_KEY, searchableAddresses, addressId, addressLabel, civicLabelPoints, deliveryStatus, placement, postalOnlyAddresses, readSession, searchAddresses, writeSession, type PokerAddress, type PokerData } from './model';
const address = { civic: null, mailing: { id:'one', number:'117', suffix:'', unit:'', road:'EXAMPLE RD', street:'EXAMPLE RD', city:'JUDIQUE', postalCode:'B0E1P0', additional:'', coordinates:[-61.4,45.9] } } as PokerAddress;
beforeEach(() => localStorage.clear());
describe('Poker session', () => {
  it('retains a finished trace, selected address, search and viewport across reopening', () => {
    const session = { ...DEFAULT_STATE, selectedId:'one', query:'117 Example', center:[45.91,-61.44] as [number,number], zoom:18, points:[{lat:45.9,lng:-61.4},{lat:45.91,lng:-61.4}], finished:true };
    expect(writeSession(session)).toBe(true); expect(readSession()).toEqual(session);
  });
  it.each(['not json', '{"version":2}', JSON.stringify({...DEFAULT_STATE,points:[null]}), JSON.stringify({...DEFAULT_STATE,center:[90,0]})])('ignores damaged storage: %s', raw => {
    localStorage.setItem(SESSION_KEY,raw); expect(readSession()).toEqual(DEFAULT_STATE);
  });
  it('reports unavailable storage without crashing', () => {
    const spy = vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw Error('quota'); });
    expect(writeSession(DEFAULT_STATE)).toBe(false); spy.mockRestore();
  });
});
describe('offline address search and threshold', () => {
  it('matches spaced and unspaced postal codes, road aliases and civic numbers', () => {
    for (const query of ['B0E1P0','B0E 1P0','117 Example Road','117 Exa']) expect(searchAddresses([address],query,'')).toEqual([address]);
    expect(searchAddresses([address],'118','')).toEqual([]);
    expect(searchAddresses([address],'117','B0E1X0')).toEqual([]);
  });
  it('does not label an unfinished or exactly 500-metre trace as over the threshold', () => {
    expect(deliveryStatus(500,true,2)).toBe('500 m or less');
    expect(deliveryStatus(500.01,true,2)).toContain('card the parcel');
    expect(deliveryStatus(501,false,2)).toContain('Tracing');
    expect(deliveryStatus(0,true,0)).toContain('Trace the driveway');
  });
});

// Real bundled evidence: the province includes 117, but the NAR subset does not.
const pack: PokerData = JSON.parse(gunzipSync(readFileSync('public/poker/data.json.gz')).toString());
describe('civic addresses missing from the postal list', () => {
  it('finds 117 Gussieville without inventing a postal record or position', () => {
    expect(searchAddresses(pack.addresses, '117 Gussieville', '')).toEqual([]);
    const addresses = searchableAddresses(pack);
    for (const query of ['117 gussieville', '117 Gussieville Road', '117 Guss', '117 Gussieville Judique North']) {
      const matches = searchAddresses(addresses, query, '');
      expect(matches).toHaveLength(1);
      expect(matches[0].mailing).toBeNull();
      expect(matches[0].civic).toEqual(pack.civic.find(a => a.pntid === '400216889'));
      expect(addressId(matches[0])).toBe('civic:400216889:117 Gussieville Rd, Judique North, Inverness County');
      expect(addressLabel(matches[0])).toBe('117 Gussieville Rd, Judique North, Inverness County');
    }
    expect(searchAddresses(addresses, '17 Gussieville', '').some(a => a.civic?.pntid === '400216889')).toBe(false);
  });
  it('keeps unknown postal codes discoverable under a postal filter without claiming a postal match', () => {
    const addresses = searchableAddresses(pack);
    expect(searchAddresses(addresses, '117 Gussieville', 'B0E1P0')).toHaveLength(1);
    expect(searchAddresses(addresses, '117 Gussieville B0E1P0', '')).toEqual([]);
    expect(searchAddresses(addresses, 'B0E1P0', '').every(a => a.mailing?.postalCode === 'B0E1P0')).toBe(true);
  });
  it('preserves separate units sharing a civic point', () => {
    const civic = pack.civic.filter(a => a.pntid === '27600056');
    const addresses = searchableAddresses({ ...pack, addresses: [], civic });
    expect(addresses).toHaveLength(3);
    expect(new Set(addresses.map(addressId)).size).toBe(3);
    expect(searchAddresses(addresses, 'Unit 2 125 Mabou Harbour', '')).toHaveLength(1);
    // The map draws the shared number once; search keeps every unit.
    expect(civicLabelPoints(civic)).toHaveLength(1);
    expect(civicLabelPoints(civic)[0].properties.civicnum).toBe('125');
    expect(civicLabelPoints(pack.civic).length).toBeLessThan(pack.civic.length);
  });
  it('does not duplicate civic points already represented by a verified postal match', () => {
    const addresses = searchableAddresses(pack);
    const matches = searchAddresses(addresses, '118 Gussieville', '');
    expect(matches).toHaveLength(1);
    expect(matches[0].mailing?.postalCode).toBe('B0E1P0');
    expect(addressId(matches[0])).toBe(matches[0].mailing?.id);
    expect(addresses.filter(a => a.mailing)).toEqual(pack.addresses);
    expect(new Set(addresses.map(addressId)).size).toBe(addresses.length);
  });
});

describe('postal records without a civic point', () => {
  it('opens a postal-only record at its own NAR building coordinate, never at a civic point', () => {
    const wills = pack.addresses.filter(a => a.mailing.road === 'Wills LANE');
    const forty = wills.find(a => a.mailing.number === '40');
    expect(forty?.civic).toBeNull();
    expect(placement(forty!)).toEqual({ coordinates: forty!.mailing.coordinates, source: 'postal' });
    const verified = wills.find(a => a.mailing.number === '25');
    expect(placement(verified!)).toEqual({ coordinates: verified!.civic!.coordinates, source: 'civic' });
    expect(placement({ mailing: null, civic: verified!.civic! })).toEqual({ coordinates: verified!.civic!.coordinates, source: 'civic' });
    expect(searchAddresses(searchableAddresses(pack), '40 Wills', '')).toEqual([forty]);
  });
  it('labels only postal numbers that have no provincial civic point on their road', () => {
    const postal = postalOnlyAddresses(pack);
    expect(postal.every(a => !a.civic)).toBe(true);
    expect(postal.map(a => `${a.mailing.number} ${a.mailing.road}`)).toContain('40 Wills LANE');
    // Apartment units share one provincial point for 30 Reynolds St; the civic label already marks it.
    expect(postal.some(a => a.mailing.number === '30' && a.mailing.road === 'Reynolds ST')).toBe(false);
    // A province point more than 50 m away keeps the civic label and stays selectable at the postal point.
    expect(postal.some(a => a.mailing.number === '1286' && a.mailing.road === 'Mabou RD')).toBe(false);
    expect(postal.length).toBeLessThan(40);
  });
});

describe('civic-number suggestions', () => {
  it('joins the postal and provincial 5447 Highway 19 records, finds them from 544 and narrows as typing continues', () => {
    const addresses = searchableAddresses(pack);
    const complete = searchAddresses(addresses, '5447', '');
    expect(complete).toHaveLength(1);
    expect(complete[0].mailing?.road).toBe('19 HWY');
    expect(complete[0].civic?.pntid).toBe('32300049');
    for (const query of ['544', ' 544 ', '544 Highway 19']) {
      const matches = searchAddresses(addresses, query, '');
      expect(matches).toEqual(expect.arrayContaining(complete));
      expect(matches.length).toBeGreaterThanOrEqual(complete.length);
    }
    expect(searchAddresses(addresses, '5447', '')).toEqual(complete);
    expect(searchAddresses(addresses, '447 Highway 19', '')).not.toEqual(expect.arrayContaining(complete));
    expect(searchAddresses(addresses, '544 Highway 1', '')).not.toEqual(expect.arrayContaining(complete));
    expect(searchAddresses(addresses, '544 B0E1P0', '').every(a => a.mailing?.postalCode === 'B0E1P0')).toBe(true);
    expect(searchAddresses(addresses, '544', 'B0E1X0').filter(a => a.mailing)).not.toEqual(expect.arrayContaining(complete.filter(a => a.mailing)));
  });
  it('supports civic suffixes while preserving unit queries and exact highway numbers', () => {
    const suffixed: PokerAddress = { ...address, mailing: { ...address.mailing, number: '5447', suffix: 'A', unit: '2', road: '19 HWY', street: 'HIGHWAY 19' } };
    for (const query of ['544', '544 Highway 19', '5447A', 'Unit 2 5447A Highway 19', '2-5447A']) {
      expect(searchAddresses([suffixed], query, ''), query).toEqual([suffixed]);
    }
    for (const query of ['447', 'Highway 1', '544 Highway 1']) expect(searchAddresses([suffixed], query, '')).toEqual([]);
  });
});
