export type TaxSaleListing = {
  lien: number;
  location: string;
  totalArrearsCents: number;
  redeemable: boolean;
  pids: string[];
};

export const invernessTaxSaleNotice = {
  municipality: "Municipality of the County of Inverness",
  publishedOn: "2026-07-16",
  retrievedOn: "2026-07-19",
  saleStartsAt: "2026-08-11T09:30:00-03:00",
  venue: "St. Peter's Parish Hall, 260 Main Street, Port Hood",
  sourceUrl:
    "https://invernesscounty.ca/wp-content/uploads/2026/07/Tax-Sale_August-11.pdf",
} as const;

export const taxSaleListings: TaxSaleListing[] = [
  { lien: 1, location: "Highway 19, Mabou", totalArrearsCents: 1_552_915, redeemable: false, pids: ["50203256"] },
  { lien: 2, location: "Crandall Road", totalArrearsCents: 129_563, redeemable: true, pids: ["50000462"] },
  { lien: 3, location: "No. 19 Highway, Southwest Margaree", totalArrearsCents: 143_264, redeemable: true, pids: ["50057611"] },
  { lien: 4, location: "Roseburn Road, Roseburn", totalArrearsCents: 175_597, redeemable: true, pids: ["50113372"] },
  { lien: 5, location: "155 Deepdale Road, Inverside", totalArrearsCents: 138_450, redeemable: true, pids: ["50055201"] },
  { lien: 6, location: "376 Upper Glencoe Road, Glencoe, Parcel A", totalArrearsCents: 526_459, redeemable: true, pids: ["50326669"] },
  { lien: 7, location: "155 Tranquil Shore Road, Marshes (West Bay), Lot 23", totalArrearsCents: 762_082, redeemable: true, pids: ["50338219"] },
  { lien: 8, location: "Whycocomagh–Port Hood Road, Soapstone Mine", totalArrearsCents: 2_565_151, redeemable: true, pids: ["50113968"] },
  { lien: 9, location: "Militia Point Road, Militia Point, Lot 14", totalArrearsCents: 934_838, redeemable: true, pids: ["50330216"] },
  { lien: 10, location: "99 East Big Intervale Road, Northeast Margaree", totalArrearsCents: 1_557_872, redeemable: true, pids: ["50077452"] },
  { lien: 11, location: "6509 Cabot Trail, Northeast Margaree", totalArrearsCents: 930_065, redeemable: true, pids: ["50076777", "50207794", "50207802"] },
  { lien: 12, location: "Margaree Valley", totalArrearsCents: 5_787_501, redeemable: true, pids: ["50081678"] },
  { lien: 13, location: "Militia Point Road, Militia Point, Lot 18", totalArrearsCents: 1_288_215, redeemable: true, pids: ["50328608"] },
  { lien: 14, location: "Militia Point Road, Militia Point, Lot 19", totalArrearsCents: 5_619_407, redeemable: true, pids: ["50328624"] },
  { lien: 15, location: "Militia Point Road, Militia Point, Lot 20", totalArrearsCents: 1_116_589, redeemable: true, pids: ["50328632"] },
  { lien: 16, location: "Southside River Denys Road, Valley Mills", totalArrearsCents: 194_636, redeemable: true, pids: ["50119817"] },
  { lien: 17, location: "Southside River Denys Road, Valley Mills, Lot 1", totalArrearsCents: 393_848, redeemable: true, pids: ["50308311"] },
  { lien: 18, location: "Southside River Denys Road, Valley Mills, Lot 3", totalArrearsCents: 409_867, redeemable: true, pids: ["50308337"] },
  { lien: 19, location: "MacGarry Road, Cap Le Moine", totalArrearsCents: 197_815, redeemable: false, pids: ["50064146"] },
  { lien: 20, location: "Cabot Trail, Scotch Hill", totalArrearsCents: 143_857, redeemable: true, pids: ["50065424"] },
  { lien: 21, location: "54 Davids Lane, Hays River", totalArrearsCents: 261_322, redeemable: true, pids: ["50312297"] },
  { lien: 22, location: "No. 19 Highway, Craigmore", totalArrearsCents: 219_300, redeemable: false, pids: ["50309970"] },
  { lien: 23, location: "Arsenaults Hill Road, Margaree", totalArrearsCents: 244_875, redeemable: false, pids: ["50329291"] },
  { lien: 24, location: "No. 19 Highway, Troy, Lot 1", totalArrearsCents: 264_738, redeemable: false, pids: ["50234921"] },
  { lien: 25, location: "Cabot Trail, Chéticamp", totalArrearsCents: 174_553, redeemable: false, pids: ["50296359"] },
  { lien: 26, location: "MacGarry Road, Grand Étang", totalArrearsCents: 360_036, redeemable: true, pids: ["50157239"] },
  { lien: 27, location: "Cabot Trail, Cap Le Moine", totalArrearsCents: 113_516, redeemable: false, pids: ["50334317"] },
  { lien: 28, location: "201 Beaton Road, Little Judique", totalArrearsCents: 429_364, redeemable: true, pids: ["50035039"] },
  { lien: 29, location: "3349 Highway 19, Craigmore", totalArrearsCents: 2_701_728, redeemable: false, pids: ["50014620"] },
  { lien: 30, location: "Chéticamp Back Road", totalArrearsCents: 89_562, redeemable: false, pids: ["50179225"] },
  { lien: 31, location: "Mull River Road, Mull River", totalArrearsCents: 510_593, redeemable: false, pids: ["50043207"] },
  { lien: 32, location: "Grand Étang Road, Grand Étang", totalArrearsCents: 145_944, redeemable: false, pids: ["50211085"] },
  { lien: 33, location: "No. 395 Highway, East Lake Ainslie", totalArrearsCents: 102_121, redeemable: true, pids: ["50342476"] },
  { lien: 34, location: "No. 395 Highway, East Lake Ainslie", totalArrearsCents: 87_969, redeemable: true, pids: ["50190503"] },
  { lien: 35, location: "Mount Young Road, Melrose Hill", totalArrearsCents: 446_082, redeemable: false, pids: ["50042258"] },
  { lien: 36, location: "Portree Road, Margaree Valley", totalArrearsCents: 338_171, redeemable: false, pids: ["50215995"] },
  { lien: 37, location: "Longstretch Road, Mackdale", totalArrearsCents: 193_032, redeemable: true, pids: ["50003904"] },
  { lien: 38, location: "Chéticamp Back Road, Belle-Marche", totalArrearsCents: 430_914, redeemable: false, pids: ["50170224"] },
  { lien: 39, location: "Cormier Road, Plateau", totalArrearsCents: 341_712, redeemable: false, pids: ["50092790"] },
  { lien: 40, location: "266 Broad Cove Marsh Road, Broad Cove Chapel, Lot 6F-B", totalArrearsCents: 734_770, redeemable: true, pids: ["50326339"] },
  { lien: 41, location: "Bashure Road, La Prairie", totalArrearsCents: 149_940, redeemable: true, pids: ["50159409"] },
  { lien: 42, location: "Cabot Trail, Cap Le Moine", totalArrearsCents: 103_061, redeemable: false, pids: ["50163336"] },
  { lien: 43, location: "Highway 19, Lot 4, Creignish", totalArrearsCents: 341_209, redeemable: false, pids: ["50291475"] },
  { lien: 44, location: "Orangedale–Marble Mountain Road, Seal Cove, Lot 7", totalArrearsCents: 141_164, redeemable: true, pids: ["50291558"] },
  { lien: 45, location: "Shore Road, St. Rose", totalArrearsCents: 785_718, redeemable: false, pids: ["50067925"] },
];

export const taxSalePids = taxSaleListings.flatMap(({ pids }) => pids);

export function listingForPid(pid: string): TaxSaleListing | undefined {
  return taxSaleListings.find(({ pids }) => pids.includes(pid));
}
