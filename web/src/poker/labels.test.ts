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
    // Long enough in a straight line, but bowing off it by more than a third of the text height.
    expect(roadBox([{ x: 0, y: 0 }, { x: 60, y: 20 }, { x: 120, y: 0 }], Math.hypot(60, 20), 60, 15)).toBeNull();
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
    // So is the address the carrier chose.
    const chosen = { ...layout, points: [...ring, civic('middle', 200, 400, { selected: true })] };
    expect(placeLabels(chosen).points.some(p => p.key === 'middle')).toBe(true);
  });

  it('never puts a number over another address’s dot', () => {
    const points = [civic('a', 200, 400), civic('b', 200, 388)];
    const placed = placeLabels({ ...view, points, roads: [] }).points;
    expect(placed.map(p => p.key)).toEqual(['a', 'b']);
    for (const label of placed) {
      const own = points.find(p => p.key === label.key)!;
      for (const other of points.filter(p => p !== own)) expect(boxesOverlap(pointBox(own, label), { cx: other.x, cy: other.y, hw: 3, hh: 3, angle: 0 })).toBe(false);
    }
  });

  it('uses a corner position when the four sides are taken', () => {
    const obstacles = [{ left: 190, top: 385, right: 200, bottom: 390 }, { left: 210, top: 400, right: 220, bottom: 405 }, { left: 170, top: 398, right: 180, bottom: 404 }, { left: 195, top: 410, right: 205, bottom: 415 }];
    const placed = placeLabels({ ...view, points: [civic('a', 200, 400)], roads: [], obstacles }).points;
    expect(placed).toHaveLength(1);
    expect(placed[0].dx).toBeCloseTo(18.54, 1);
    expect(placed[0].dy).toBeCloseTo(-10.54, 1);
  });

  it('turns a number away from map controls and the edge of the screen', () => {
    const point = civic('top', 200, 30);
    const [placed] = placeLabels({ ...view, points: [point], roads: [], obstacles: [{ left: 0, top: 0, right: 400, bottom: 20 }] }).points;
    expect(point.y + placed.dy - point.height / 2).toBeGreaterThanOrEqual(20);
    const [edge] = placeLabels({ ...view, points: [civic('edge', 396, 400)], roads: [] }).points;
    expect(edge.dx).toBeLessThan(0);
  });

  it('never shows a number cut off by the screen edge, which would read as another number', () => {
    // Only the positions spilling past the right edge are free for a dot 6 px from it.
    const obstacles = [{ left: 330, top: 360, right: 380, bottom: 440 }];
    expect(placeLabels({ ...view, points: [civic('edge', 394, 400)], roads: [], obstacles }).points).toEqual([]);
    // Just off screen, a number may wait there for a pan to bring it in.
    expect(placeLabels({ ...view, points: [civic('beyond', 405, 400)], roads: [], obstacles }).points).toHaveLength(1);
    // Forced at the closest zoom, it still takes a whole position when one exists.
    const [forced] = placeLabels({ ...view, points: [civic('edge', 394, 400)], roads: [], obstacles, showAllPoints: true }).points;
    expect(394 + forced.dx + 15).toBeLessThanOrEqual(398);
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
    // Placed first, the chosen number keeps the spot above the house even though its ring leaves room for the road.
    const chosen = placeLabels({ ...view, points: [civic('house', 200, 425, { selected: true, clearance: 10 })], roads: [road('Highway 19', crossing, 0, 390)] });
    expect(chosen.points[0].dy).toBeLessThan(0);
    expect(chosen.roads).toHaveLength(0);
  });

  it('names a village street lined with dots, clear of them where it can', () => {
    const houses = Array.from({ length: 12 }, (_, i) => civic(`h${i}`, 20 + i * 32, i % 2 ? 392 : 408));
    const [street] = placeLabels({ ...view, points: houses, roads: [road('Fraser St', [[[0, 400], [400, 400]]])] }).roads;
    expect(street).toMatchObject({ key: 'Fraser St', y: 400 });
    // The chosen address's ring is never passed over, even as a last resort.
    const chosen = [...houses, civic('chosen', 200, 400, { selected: true, clearance: 10 })];
    const beside = placeLabels({ ...view, points: chosen, roads: [road('Fraser St', [[[0, 400], [400, 400]]])] }).roads;
    expect(beside).toHaveLength(1);
    expect(boxesOverlap({ cx: beside[0].x, cy: beside[0].y, hw: 32, hh: 9.5, angle: 0 }, { cx: 200, cy: 400, hw: 10, hh: 10, angle: 0 })).toBe(false);
    // A long street lined end to end still gets its name repeated along it.
    const row = Array.from({ length: 27 }, (_, i) => civic(`r${i}`, i % 2 ? 192 : 208, 10 + i * 30));
    expect(placeLabels({ ...view, points: row, roads: [road('Main St', [[[200, 0], [200, 800]]])] }).roads).toHaveLength(2);
    const clear = [...houses.slice(0, 6), civic('far', 390, 300)];
    const [open] = placeLabels({ ...view, points: clear, roads: [road('Fraser St', [[[0, 400], [400, 400]]])] }).roads;
    expect(clear.every(h => !boxesOverlap({ cx: open.x, cy: open.y, hw: 32, hh: 9.5, angle: 0 }, { cx: h.x, cy: h.y, hw: 3, hh: 3, angle: 0 }))).toBe(true);
  });

  it('repeats a long road’s name along it, never closer than a label’s spacing', () => {
    const placed = placeLabels({ ...view, points: [], roads: [road('Highway 19', [[[200, 0], [200, 800]]], 0)] }).roads;
    expect(placed.length).toBe(2);
    expect(Math.abs(placed[1].y - placed[0].y)).toBeGreaterThanOrEqual(240);
    expect(placed.every(p => Math.abs(Math.abs(p.angle) - 90) < 0.01 && p.x === 200)).toBe(true);
    // Something in the way of the second copy moves it along the road rather than dropping it.
    const moved = placeLabels({ ...view, points: [], roads: [road('Highway 19', [[[200, 0], [200, 800]]], 0)], obstacles: [{ left: 190, top: 590, right: 210, bottom: 610 }] }).roads;
    expect(moved.map(p => p.y)).toEqual([200, 552]);
    // Two runs of one name side by side still keep their copies apart.
    const twin = placeLabels({ ...view, points: [], roads: [road('Main St', [[[100, 0], [100, 800]], [[200, 0], [200, 800]]])] }).roads;
    expect(twin.length).toBeGreaterThan(0);
    for (let i = 0; i < twin.length; i++) for (let j = i + 1; j < twin.length; j++) expect(Math.hypot(twin[i].x - twin[j].x, twin[i].y - twin[j].y)).toBeGreaterThanOrEqual(240);
  });

  it('finds the on-screen part of a road far longer than the view', () => {
    const [placed] = placeLabels({ ...view, points: [], roads: [road('Highway 19', [[[200, -500_000], [200, 500_000]]], 0)] }).roads;
    expect(placed.y).toBeGreaterThan(0);
    expect(placed.y).toBeLessThan(800);
  });

  it('leaves a road off rather than run its name past the screen edge', () => {
    expect(placeLabels({ ...view, points: [], roads: [road('Shore Rd', [[[-500, 400], [30, 400]]])] }).roads).toEqual([]);
  });

  it('keeps a short road’s name from hanging across the road it meets', () => {
    // 60 px of a 1000 px road show beside its junction with Main St at x=330.
    const roads = [road('Main St', [[[330, 0], [330, 844]]], 0), road('Long Side Rd', [[[330, 400], [1330, 400]]], 1, 100)];
    const side = placeLabels({ width: 390, height: 844, points: [], roads }).roads.filter(r => r.key === 'Long Side Rd');
    expect(side.every(r => r.x - 50 >= 330)).toBe(true);
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
      feature('Highway 19', 'Track', [[-61.48, 45.82], [-61.48, 45.83]]),
      feature('Driveway', 'Driveway', [[-61.48, 45.80], [-61.47, 45.80]]),
      feature(null, 'Local', [[-61.48, 45.80], [-61.47, 45.80]]),
    ] });
    expect(roads.map(r => [r.name, r.rank, r.lines.length])).toEqual([['Highway 19', 0, 1], ['Wills Lane', 1, 1]]);
    // A road is ranked by its best-kept stretch.
    expect(roads[0].bounds[0].getNorth()).toBeCloseTo(45.83);
  });
});
