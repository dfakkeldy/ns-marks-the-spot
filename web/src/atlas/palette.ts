/**
 * NS Marks Atlas colour tokens.
 *
 * Day is a Fletcher-inspired palette: the warm paper, olive, ochre, salmon and
 * near-black ink of Hugh Fletcher's 1884 Geological Survey sheets of Cape Breton
 * (David Rumsey Map Collection, David Rumsey Map Center, Stanford University
 * Libraries), sampled from the scans and lightened for screen reading. Fletcher's
 * washes and hatching encoded geology; here the same family of colours is applied
 * to modern land cover and land use classes, so every fill keeps its provincial or
 * OSM source meaning. Nothing here redraws historical geology, and the hatching
 * is deliberately left out: calm fills, ink linework and paper-coloured halos
 * carry the character instead.
 */
export const atlasPalettes = {
  day: {
    land: '#efe3c3',        // bare paper: the ground wherever no cover is mapped
    water: '#bed0cc',       // cool wash; stays ~28 grey levels below paper in monochrome print
    waterLine: '#4f7d88',   // brooks, ditches and the wetland tint
    shore: '#a9bfba',       // inner shore band along coasts and lakes
    wood: '#bfb48c',        // olive-khaki for NSTDB tree areas
    grass: '#d3c98f',       // scrub, grass and young reforestation
    farmland: '#e8cb8f',    // ochre wash: farmland, orchards and nurseries
    residential: '#e8b898', // salmon wash: OSM settlement areas
    building: '#c98d66',
    road: '#fbf4de',        // paper-white local road fill inside an ink casing
    roadEdge: '#5e4d33',
    highway: '#d69c42',     // ochre main routes
    path: '#6f5f43',
    ink: '#2a2418',
    mutedInk: '#5a4c33',
    waterInk: '#3b5760',
    halo: '#efe3c3',        // burnished paper behind lettering, as on the sheets
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
