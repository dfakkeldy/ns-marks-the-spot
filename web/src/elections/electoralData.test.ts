import { describe, expect, it, vi } from 'vitest';
import { classifyResult, resultSummary, loadElectoralCollection } from './electoralData';
import { electoralLayers } from '../layers/electoralLayers';

describe('electoral evidence', () => {
  it('uses valid votes for margin and shares, source turnout for listed-elector turnout', () => {
    const summary = resultSummary({ PC_Votes: 101, Liberal_Votes: 100, NDP_Votes: 20, Green_Votes: 5, Independent_Votes: 0, Total: 230, Rejected: 3, Declined: 1, PctVoterTurnout: 45 });
    expect(summary?.validVotes).toBe(226);
    expect(summary?.marginVotes).toBe(1);
    expect(summary?.marginPoints).toBeCloseTo(100 / 226);
    expect(summary?.turnout).toBe(45);
  });
  it('does not convert absent or contradictory results into zero votes', () => {
    expect(resultSummary({})).toBeNull();
    expect(resultSummary({ PC_Votes: -1 })).toBeNull();
    expect(resultSummary({ PC_Votes: 10, Liberal_Votes: 2, NDP_Votes: 1, Green_Votes: 0, Independent_Votes: 0, Total: 1, Rejected: 0, Declined: 0 })).toBeNull();
  });
  it('uses exact classification edges and keeps missing data unclassified', () => {
    expect([0, 4.99, 5, 15, 30, 50].map(v => classifyResult('margin', v))).toEqual([0, 0, 1, 2, 3, 4]);
    expect([39, 40, 45, 50, 55].map(v => classifyResult('turnout', v))).toEqual([0, 1, 2, 3, 4]);
    expect(classifyResult('margin', null)).toBeNull();
  });
  it('blocks restricted requests before network access', async () => {
    const fetcher = vi.fn();
    const result = await loadElectoralCollection(electoralLayers[0], false, new AbortController().signal, fetcher);
    expect(result.status).toBe('licence-blocked');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends no location, viewport or spatial query and distinguishes empty/error', async () => {
    const layer = electoralLayers[0];
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) });
    expect((await loadElectoralCollection(layer, true, new AbortController().signal, fetcher)).status).toBe('returned-empty');
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('where')).toBe('1=1');
    for (const key of ['geometry','bbox','distance','lat','lng']) expect(url.searchParams.has(key)).toBe(false);
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ error: { message: 'failure' } }) });
    expect((await loadElectoralCollection(layer, true, new AbortController().signal, fetcher)).status).toBe('source-error');
  });
});
