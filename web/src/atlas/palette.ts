/**
 * NS Marks Atlas colour tokens.
 *
 * Day and Night are the modern Atlas: quiet paper, sage woodland and a cool
 * water wash. Fletcher is a separate style in the salmon, olive, ochre, paper
 * and ink of Hugh Fletcher's 1884 Geological Survey sheets of Cape Breton
 * (David Rumsey Map Collection, David Rumsey Map Center, Stanford University
 * Libraries), sampled from the scans and adjusted for screen reading. Every
 * token in every style belongs to a modern land cover or land use class, so
 * fills keep their provincial or OSM source meaning: in Fletcher, salmon is the
 * land ground wherever no tree cover is mapped, olive is tree cover, ochre is
 * farmland and bare paper is water. Nothing here redraws historical geology,
 * and the sheets' hatching is deliberately left out.
 */
export const atlasPalettes = {
  day: {
    land: '#f3efe3',
    water: '#b5ced1',
    waterLine: '#7babb5',
    shore: '#a3c0c3',
    wood: '#d5dfca',
    grass: '#e3e7d3',
    farmland: '#ebe4ce',
    residential: '#e9e4d8',
    building: '#d3ccbd',
    road: '#fffaf0',
    roadEdge: '#c5baa4',
    highway: '#e4c492',
    path: '#8d927b',
    ink: '#304746',
    mutedInk: '#566863',
    waterInk: '#365f6c',
    halo: '#f3efe3',
    boundary: '#9f9b8b',
    accent: '#b5533a',
  },
  night: {
    land: '#223338',
    water: '#101f2b',
    waterLine: '#395864',
    shore: '#1c303a',
    wood: '#293f3c',
    grass: '#33443f',
    farmland: '#3b413a',
    residential: '#2c3b40',
    building: '#465254',
    road: '#66716d',
    roadEdge: '#1c2a30',
    highway: '#bda77f',
    path: '#859487',
    ink: '#e5e5d6',
    mutedInk: '#b8c9bd',
    waterInk: '#a0c4d4',
    halo: '#223338',
    boundary: '#75807b',
    accent: '#e08a6a',
  },
  fletcher: {
    land: '#e5a878',        // Fletcher's salmon wash as the ground wherever no tree cover is mapped
    water: '#f0e7cd',       // bare paper for water, as on the sheets, under an ink shore
    waterLine: '#3f6f7c',   // brooks and ditches in teal ink
    shore: '#d8ccae',       // inner band on the water side of shorelines
    wood: '#aa9d66',        // olive for NSTDB tree areas
    grass: '#d2c47f',       // scrub, grass and young reforestation
    farmland: '#e3b356',    // Devonian ochre for farmland, orchards and nurseries
    residential: '#d6845b', // deeper salmon for OSM settlement areas, a clear step from the ground
    building: '#a4522b',
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
} as const;

export type AtlasMode = keyof typeof atlasPalettes;
