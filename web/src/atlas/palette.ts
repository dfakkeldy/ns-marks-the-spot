/**
 * NS Marks Atlas colour tokens.
 *
 * Day is a Fletcher-inspired palette: the warm paper, olive, ochre, salmon and
 * near-black ink of Hugh Fletcher's 1884 Geological Survey sheets of Cape Breton
 * (David Rumsey Map Collection, David Rumsey Map Center, Stanford University
 * Libraries), sampled from the scans and adjusted for screen reading. Fletcher's
 * washes and hatching encoded geology; here the same family of colours is applied
 * to modern land cover and land use classes, so every fill keeps its provincial or
 * OSM source meaning: salmon is the land ground, olive is tree cover, ochre is
 * farmland, bare paper is water. Nothing here redraws historical geology, and the
 * hatching is deliberately left out: calm fills, ink linework and paper-coloured
 * halos carry the character instead.
 */
export const atlasPalettes = {
  day: {
    land: '#e5a878',        // Fletcher's salmon wash as the ground wherever no tree cover is mapped
    water: '#f0e7cd',       // bare paper for water, as on the sheets, under an ink shore
    waterLine: '#3f6f7c',   // brooks and ditches in teal ink
    shore: '#d8ccae',       // inner band on the water side of shorelines
    wood: '#aa9d66',        // olive for NSTDB tree areas
    grass: '#d2c47f',       // scrub, grass and young reforestation
    farmland: '#e3b356',    // Devonian ochre for farmland, orchards and nurseries
    residential: '#dc9169', // deeper salmon for OSM settlement areas
    building: '#b7623a',
    road: '#fbf3dc',        // paper-white local road fill inside an ink casing
    roadEdge: '#4a3a22',
    highway: '#7d4223',     // main routes as a dark rust line with a paper edge
    path: '#5e4a2c',
    ink: '#2a2418',
    mutedInk: '#503f28',
    waterInk: '#3b5760',
    halo: '#f3e9cf',        // burnished paper behind lettering, as on the sheets
    boundary: '#4d4a5c',    // cool slate so district lines never read as tracks
    accent: '#c1452b',      // Fletcher's vermilion; reserved for annotations, unused by the basemap
  },
  night: {
    land: '#22261f',
    water: '#131c22',
    waterLine: '#4f7a84',
    shore: '#26343a',
    wood: '#2c3124',
    grass: '#33372a',
    farmland: '#3a3524',
    residential: '#3b3027',
    building: '#5a4a3a',
    road: '#6b6552',
    roadEdge: '#121410',
    highway: '#c9a15f',
    path: '#8f8767',
    ink: '#ece3c8',
    mutedInk: '#bdb397',
    waterInk: '#9cbcc4',
    halo: '#22261f',
    boundary: '#8d8a9c',
    accent: '#e07a5f',
  },
} as const;

export type AtlasMode = keyof typeof atlasPalettes;
