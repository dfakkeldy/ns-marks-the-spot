import { describe, expect, it } from 'vitest';
import { acrossBox, boxesOverlap, mergeLines, namedRoads, placeLabels, pointAnchors, roadBox, type LabelBox, type LabelLayout, type PlacedPoint, type PointLabel, type RoadLabel } from './labels';

const view = { width: 400, height: 800 };
const civic = (key: string, x: number, y: number, extra: Partial<PointLabel> = {}): PointLabel => ({ key, x, y, width: 30, height: 14, clearance: 3, ...extra });
const road = (key: string, lines: [number, number][][], rank: 0 | 1 | 2 = 1, width = 60): RoadLabel =>
  ({ key, rank, width, height: 15, lines: lines.map(line => line.map(([x, y]) => ({ x, y }))) });
const pointBox = (point: PointLabel, placed: PlacedPoint): LabelBox => ({ cx: point.x + placed.dx, cy: point.y + placed.dy, hw: point.width / 2, hh: point.height / 2, angle: 0 });
const degrees = (box: LabelBox | null) => box && Math.round(box.angle * 180 / Math.PI);

describe('label collision geometry', () => {
  it('tests rotated labels by their real outline, not their bounding boxes', () => {
    const diagonal = { cx: 0, cy: 0, hw: 50, hh: 5, angle: Math.PI / 4 };
    // Bounding boxes of these two parallel diagonals overlap; the labels do not.
    expect(boxesOverlap(diagonal, { ...diagonal, cx: 12, cy: -12 })).toBe(false);
    expect(boxesOverlap(diagonal, { ...diagonal, angle: -Math.PI / 4 })).toBe(true);
    expect(boxesOverlap({ cx: 0, cy: 0, hw: 5, hh: 5, angle: 0 }, { cx: 10, cy: 0, hw: 5, hh: 5, angle: 0 })).toBe(false);
  });

  it('keeps road names upright whichever way the road was drawn', () => {
    const rising = [{ x: 0, y: 100 }, { x: 173.2, y: 0 }];
    expect(degrees(roadBox(rising, 100, 60, 15))).toBe(-30);
    expect(degrees(roadBox([...rising].reverse(), 100, 60, 15))).toBe(-30);
    expect(degrees(roadBox([{ x: 0, y: 0 }, { x: 0, y: 200 }], 100, 60, 15))).toBe(degrees(roadBox([{ x: 0, y: 200 }, { x: 0, y: 0 }], 100, 60, 15)));
  });

  it('refuses a straight label where the road bends under it', () => {
    const corner = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }];
    expect(roadBox(corner, 60, 60, 15)).toBeNull();
    const gentle = [{ x: 0, y: 0 }, { x: 60, y: 3 }, { x: 120, y: 0 }];
    expect(roadBox(gentle, 60, 60, 15)).not.toBeNull();
    // A name longer than the road does not fit along it.
    expect(roadBox([{ x: 0, y: 0 }, { x: 40, y: 0 }], 20, 60, 15)).toBeNull();
  });

  it('lays a short road’s name over it, but not across a bend', () => {
    expect(degrees(acrossBox([{ x: 0, y: 0 }, { x: 30, y: 30 }], 21, 60, 15))).toBe(45);
    expect(acrossBox([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], 60, 100, 15)).toBeNull();
  });
});

describe('Poker label placement', () => {
  it('moves the second of two crowded civic numbers instead of stacking them', () => {
    const points = [civic('a', 200, 400), civic('b', 226, 402)];
    const placed = placeLabels({ ...view, points, roads: [] }).points;
    expect(placed.map(p => p.key)).toEqual(['a', 'b']);
    expect(placed[0]).toEqual({ kind: 'point', key: 'a', dx: 0, dy: -12 });
    expect(placed[1].dy).not.toBe(-12);
    expect(boxesOverlap(pointBox(points[0], placed[0]), pointBox(points[1], placed[1]))).toBe(false);
  });

  it('keeps every number off other dots, and leaves a number off rather than overlap', () => {
    // Four dots boxing in a fifth: every position around the middle dot is taken.
    const ring = [[0, -18], [22, 0], [-22, 0], [0, 18], [22, -18], [-22, -18], [22, 18], [-22, 18]].map(([x, y], i) => civic(`n${i}`, 200 + x, 400 + y));
    const layout: LabelLayout = { ...view, points: [...ring, civic('middle', 200, 400)], roads: [] };
    const placed = placeLabels(layout).points;
    expect(placed.some(p => p.key === 'middle')).toBe(false);
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = layout.points.find(p => p.key === placed[i].key)!, b = layout.points.find(p => p.key === placed[j].key)!;
      expect(boxesOverlap(pointBox(a, placed[i]), pointBox(b, placed[j]))).toBe(false);
    }
    // At the closest zoom it is shown anyway, so no address is unreadable at every zoom.
    expect(placeLabels({ ...layout, showAllPoints: true }).points.some(p => p.key === 'middle')).toBe(true);
  });

  it('turns a number away from map controls and the edge of the screen', () => {
    const point = civic('top', 200, 30);
    const [placed] = placeLabels({ ...view, points: [point], roads: [], obstacles: [{ left: 0, top: 0, right: 400, bottom: 20 }] }).points;
    expect(point.y + placed.dy - point.height / 2).toBeGreaterThanOrEqual(20);
    const [edge] = placeLabels({ ...view, points: [civic('edge', 396, 400)], roads: [] }).points;
    expect(edge.dx).toBeLessThan(0);
  });

  it('places the chosen address, then highways, then numbers, then trails', () => {
    // The name fills the road's whole on-screen length, so only one of the two labels can have the spot above the house.
    const crossing = [[[0, 400], [400, 400]]] as [number, number][][];
    const number = civic('house', 200, 418);
    const highway = placeLabels({ ...view, points: [number], roads: [road('Highway 19', crossing, 0, 390)] });
    expect(highway.roads).toHaveLength(1);
    expect(highway.points[0].dy).toBeGreaterThanOrEqual(0);
    const trail = placeLabels({ ...view, points: [number], roads: [road('Coastal Trail', crossing, 2, 390)] });
    expect(trail.points[0].dy).toBeLessThan(0);
    expect(trail.roads).toHaveLength(0);
    const chosen = placeLabels({ ...view, points: [{ ...number, selected: true, clearance: 10 }], roads: [road('Highway 19', crossing, 0, 390)] });
    expect(chosen.points[0].dy).toBeLessThan(0);
    expect(chosen.roads).toHaveLength(0);
  });

  it('repeats a long road’s name along it, never closer than a label’s spacing', () => {
    const placed = placeLabels({ ...view, points: [], roads: [road('Highway 19', [[[200, 0], [200, 800]]], 0)] }).roads;
    expect(placed.length).toBe(2);
    expect(Math.abs(placed[1].y - placed[0].y)).toBeGreaterThanOrEqual(240);
    expect(placed.every(p => Math.abs(Math.abs(p.angle) - 90) < 0.01 && p.x === 200)).toBe(true);
  });

  it('labels a lane shorter than its name, turned to follow it', () => {
    const [placed] = placeLabels({ ...view, points: [], roads: [road('Wills Lane', [[[100, 300], [130, 270]]])] }).roads;
    expect(placed).toMatchObject({ key: 'Wills Lane' });
    expect(Math.round(placed.angle)).toBe(-45);
  });

  it('gives the same labels after a pan that keeps them in view', () => {
    const layout = (shift: number): LabelLayout => ({
      ...view,
      points: [civic('a', 150 + shift, 300), civic('b', 156 + shift, 305), civic('c', 250 + shift, 500)],
      roads: [road('Main St', [[[100 + shift, 600], [300 + shift, 250]]])],
    });
    const before = placeLabels(layout(0)), after = placeLabels(layout(37));
    expect(after.points).toEqual(before.points);
    expect(after.roads.map(r => ({ ...r, x: r.x - 37 }))).toEqual(before.roads.map(r => ({ ...r, x: expect.closeTo(r.x, 6) })));
  });

  it('offers the top position first, clear of the dot', () => {
    const [top] = pointAnchors({ width: 30, height: 14, clearance: 3 });
    expect(top).toEqual({ x: 0, y: -12 });
  });
});

describe('road name preparation', () => {
  it('joins NSRN segments end to end and stops at a junction', () => {
    const merged = mergeLines([[[0, 0], [1, 0]], [[2, 0], [1, 0]], [[2, 0], [3, 0]], [[3, 0], [4, 0]], [[3, 0], [3, 1]]]);
    expect(merged).toContainEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(merged).toHaveLength(3);
    expect(merged.flat()).toHaveLength(8);
  });

  it('labels named roads only, highways first', () => {
    const feature = (street: string | null, roadc_desc: string, coordinates: number[][]) =>
      ({ type: 'Feature' as const, properties: { street, roadc_desc, feat_desc: `ROAD - ${roadc_desc}` }, geometry: { type: 'LineString' as const, coordinates } });
    const roads = namedRoads({ type: 'FeatureCollection', features: [
      feature('Wills Lane', 'Local', [[-61.484, 45.804], [-61.481, 45.8046]]),
      feature('Highway 19', 'Highway', [[-61.48, 45.80], [-61.48, 45.81]]),
      feature('Highway 19', 'Highway', [[-61.48, 45.81], [-61.48, 45.82]]),
      feature('Driveway', 'Driveway', [[-61.48, 45.80], [-61.47, 45.80]]),
      feature(null, 'Local', [[-61.48, 45.80], [-61.47, 45.80]]),
    ] });
    expect(roads.map(r => [r.name, r.rank, r.lines.length])).toEqual([['Highway 19', 0, 1], ['Wills Lane', 1, 1]]);
    expect(roads[0].bounds[0].getNorth()).toBeCloseTo(45.82);
  });
});
