import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, SESSION_KEY, deliveryStatus, readSession, searchAddresses, writeSession, type PokerAddress } from './model';
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
