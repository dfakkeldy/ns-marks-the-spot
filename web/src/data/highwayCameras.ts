/**
 * Provincial highway camera sites, catalogued from the public 511 Nova Scotia
 * map (https://511.novascotia.ca/map) on August 29, 2026.
 *
 * Only the site id, display name, and coordinates are recorded here — the
 * image behind each site is never copied into this repository. The browser
 * loads the live JPEG straight from 511 at view time (see
 * `imageUrlTemplate` on the highway-cameras descriptor), so imagery stays
 * the Province's, served by the Province.
 *
 * The ids are 511's own map item ids; if 511 renumbers or adds cameras this
 * list needs re-cataloguing, which is a data refresh, not a code change.
 */
export type HighwayCamera = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export const highwayCameras: readonly HighwayCamera[] = [
  { id: "1", name: "Bedford (Exit 4A, Hwy 102)", latitude: 44.7467, longitude: -63.6553 },
  { id: "2", name: "Waverley2 (Hwy 118)", latitude: 44.8063, longitude: -63.6021 },
  { id: "3", name: "BuckLaw (Hwy 105)", latitude: 46.0237, longitude: -60.9742 },
  { id: "4", name: "Canso Causeway", latitude: 45.6472, longitude: -61.414 },
  { id: "5", name: "East Bay", latitude: 46.0107, longitude: -60.3858 },
  { id: "6", name: "French Mountain", latitude: 46.733, longitude: -60.883 },
  { id: "7", name: "Irish Cove", latitude: 45.8149, longitude: -60.6932 },
  { id: "8", name: "Kelly's Mountain", latitude: 46.2516, longitude: -60.5279 },
  { id: "9", name: "Mabou", latitude: 46.1035, longitude: -61.3566 },
  { id: "10", name: "Monastery", latitude: 45.6132, longitude: -61.6295 },
  { id: "11", name: "North Sydney (Pottle Lake, Hwy 125)", latitude: 46.2061, longitude: -60.2754 },
  { id: "12", name: "Beechville (Hwy 102 at Exit 1A)", latitude: 44.645, longitude: -63.6623 },
  { id: "13", name: "River Bourgeois (Highway 104 at Exit 47)", latitude: 45.6416, longitude: -60.9637 },
  { id: "14", name: "Seal Island - East", latitude: 46.2332, longitude: -60.4907 },
  { id: "15", name: "Seal Island - West", latitude: 46.2332, longitude: -60.4907 },
  { id: "16", name: "South Mountain", latitude: 46.8772, longitude: -60.524 },
  { id: "17", name: "Trafalgar", latitude: 45.2875, longitude: -62.659 },
  { id: "18", name: "Amherst (Near Exit 3, Hwy 104)", latitude: 45.8436, longitude: -64.2397 },
  { id: "19", name: "Lornevale (Cobequid Pass, Hwy. 104)", latitude: 45.4713, longitude: -63.6485 },
  { id: "20", name: "Marshy Hope (John Munroe Rd., Hwy 104)", latitude: 45.5877, longitude: -62.2084 },
  { id: "21", name: "Mt Thom (Upper Mt Thom, Hwy 104)", latitude: 45.4955, longitude: -62.9895 },
  { id: "22", name: "Mt William Rd (Hwy 104)", latitude: 45.5809, longitude: -62.6942 },
  { id: "23", name: "Kelly Lake (Exit 5A, Hwy 102)", latitude: 44.8479, longitude: -63.5659 },
  { id: "24", name: "Pictou Causeway", latitude: 45.6656, longitude: -62.727 },
  { id: "25", name: "Pugwash", latitude: 45.8794, longitude: -63.8319 },
  { id: "26", name: "Springhill (Exit 5, Hwy 104)", latitude: 45.6918, longitude: -64.0055 },
  { id: "27", name: "Truro (Exit 15, Hwy 104)", latitude: 45.3875, longitude: -63.3327 },
  { id: "28", name: "Westchester (Cobequid Pass, Hwy. 104)", latitude: 45.5604, longitude: -63.7135 },
  { id: "29", name: "Avonport (Hwy101 @ Ben Jackson Rd.)", latitude: 45.0716, longitude: -64.2227 },
  { id: "30", name: "Bridgetown", latitude: 44.847, longitude: -65.2683 },
  { id: "31", name: "Bridgewater (Exit 13, Hwy 103)", latitude: 44.3709, longitude: -64.5443 },
  { id: "32", name: "Coldbrook (Hwy 101 @ Lovett Rd)", latitude: 45.0774, longitude: -64.578 },
  { id: "33", name: "Cornwallis (Hwy 101)", latitude: 44.627, longitude: -65.6133 },
  { id: "34", name: "Lake Charlotte", latitude: 44.7677, longitude: -62.9316 },
  { id: "35", name: "Granite Village", latitude: 43.8586, longitude: -64.9899 },
  { id: "36", name: "Hubbards (Hwy 103 near Exit 6)", latitude: 44.6364, longitude: -64.0794 },
  { id: "37", name: "Kingston (Hwy 101 @ Bishop Mtn Rd.)", latitude: 44.9973, longitude: -64.9465 },
  { id: "38", name: "Lequille (Hwy 101)", latitude: 44.7437, longitude: -65.384 },
  { id: "39", name: "Meteghan (Hwy 101 South of Exit 29)", latitude: 44.2154, longitude: -66.105 },
  { id: "40", name: "Pubnico (Hwy 103)", latitude: 43.7123, longitude: -65.7796 },
  { id: "41", name: "Trunk 12 (@ Blue Mountain)", latitude: 44.8932, longitude: -64.531 },
  { id: "42", name: "Viewmount (Long Point Rd)", latitude: 45.0861, longitude: -64.803 },
  { id: "43", name: "Weymouth (Hwy 101 South of Exit 27)", latitude: 44.4381, longitude: -65.9999 },
  { id: "44", name: "Yarmouth (Exit 33 Port Maitland)", latitude: 43.9848, longitude: -66.1223 },
  { id: "45", name: "Lake Echo (Hwy 107)", latitude: 44.7126, longitude: -63.3945 },
  { id: "46", name: "Cochrane Hill", latitude: 45.2465, longitude: -62.0169 },
  { id: "47", name: "Tantallon (Hwy 103 @ Bowater Mersey Rd)", latitude: 44.7106, longitude: -63.9001 },
  { id: "48", name: "Lincolnville (Hwy 16)", latitude: 45.5232, longitude: -61.5528 },
  { id: "49", name: "Milford (Exit 9, Hwy 102)", latitude: 45.0549, longitude: -63.4438 },
  { id: "50", name: "Mt Uniacke (Exit 3, Hwy 101)", latitude: 44.8439, longitude: -63.8054 },
  { id: "51", name: "Portobello (Hwy 118)", latitude: 44.7429, longitude: -63.5606 },
  { id: "52", name: "Waverley (Hwy 102)", latitude: 44.8063, longitude: -63.6021 },
  { id: "53", name: "Weavers Mountain", latitude: 45.56797172, longitude: -62.22378824 },
  { id: "54", name: "Chester Basin", latitude: 44.57524904929597, longitude: -64.31378189598696 },
  { id: "55", name: "Point Cross", latitude: 46.581, longitude: -61.023 },
  { id: "56", name: "Margaree Harbour", latitude: 46.437, longitude: -61.098 },
  { id: "57", name: "Windsor", latitude: 44.978, longitude: -64.101 },
] as const;
