# Wind turbines from EA filings: sources

Two layers draw turbine positions published in Nova Scotia environmental
assessment (EA) filings at <https://novascotia.ca/nse/ea/projects.asp>:

- **Planned wind turbines (NS EA filings)** (`planned-wind-turbines`,
  `web/public/wind/planned-turbines.geojson`), drawn hollow.
- **Installed wind turbines since 2018 (NS EA filings)**
  (`wind-turbines-since-2018`, `web/public/wind/installed-since-2018.geojson`),
  drawn filled: farms built after NRCan's inventory stops, so that installed and
  planned turbines together cover what is standing or coming.

Filings were read on October 24, 2026.

- **Only published tables.** Every position comes from a coordinate table in a
  filing (registration documents, their appendices: sound, shadow-flicker and
  radio-interference studies). Nothing was digitised from a map and nothing was
  estimated: proponent maps were read only for Higgins Mountain's site turbine
  numbers, for which Wedgeport positions were dropped, and for the Benjamins
  Mill and Mersey River phase splits. Page numbers
  are PDF page numbers (the `#page=N` in each link).
- **Conversion.** UTM values (NAD83, Zone 20) were converted to WGS84 with the
  GRS80 transverse Mercator inverse; degrees-minutes-seconds were converted
  directly. Each point keeps the published values in `coords_as_published`. An
  independent re-conversion of every UTM point agreed within about 1 m (7 cm
  near the Strait), and the six Rhodena turbines match
  `web/src/rhodena/features.json` exactly. The raw extracts, the conversion
  logs and the merge script are in [`web/scripts/wind/`](../web/scripts/wind/README.md);
  rerunning the script reproduces both public files exactly.
- **What is left out.** Farms already in NRCan's inventory, alternate and
  contingency sites (they would count a layout twice), dropped sites, and
  withdrawn, rejected or possibly lapsed projects. NRCan's Canadian Wind
  Turbine Database has no Nova Scotia turbine commissioned after 2018 (347
  records, checked October 24, 2026), so "not in NRCan" does not mean "not
  built". Build status was checked against proponents, the Canada
  Infrastructure Bank, municipal and tribunal records and news reports, cited
  per project, and against satellite imagery (below).
- **Built since 2018.** Two farms have entered service since NRCan's last Nova
  Scotia record: Higgins Mountain (17 turbines) and Benjamins Mill phase 1
  (8 turbines). They are on the installed layer, at the positions in their own
  EA tables. No other Nova Scotia farm has reached operation since 2019 (see
  [Built since the NRCan snapshot](#built-since-the-nrcan-snapshot-installed-layer)).
- **Build status from imagery.** Every tabulated position was checked for a
  cleared turbine pad in Copernicus Sentinel-2 imagery (10 m), against a 2022
  baseline (see [Sentinel-2 check](#sentinel-2-check)). The imagery says which
  positions are cleared, and how far the nearest pad is where a turbine was
  moved; it never supplies a position. "Operating" always comes from the
  proponent.
- **What the points are.** Assessed layouts, subject to change: each EA uses a
  representative turbine model and none is an as-built survey. An approval does
  not mean a farm will be built.

## Summary

613 planned positions from 17 projects, and 25 built since 2018 from 2 projects,
counted from the published files.

| Project | County | Status | Points on the map | Project MW (filed) |
|---|---|---|---|---|
| Aulds Cove Wind Project | Guysborough | EA approved with conditions on 13 February 2026 | 21 | 147 |
| Bear Lake Wind Power Project | Hants / Lunenburg / Halifax | EA approved with conditions on 13 December 2023; its two-year deadline to start work passed on 13 December 2025 with no extension posted, and no turbine position had been cleared by 30 August 2026 | 15 | 89 |
| Benjamins Mill Wind Project | Hants | 3 positions under construction (Minas Highlands); 17 not built; the 8 operating are on the installed layer | 20 | 150 |
| Eigg Mountain Wind Project | Antigonish | EA approved with conditions on 9 April 2026; construction not started | 22 | 154 |
| Goose Harbour Lake Wind Farm | Guysborough | Under construction, with commissioning planned for late 2026; EA approved with conditions on 20 March 2023 | 24 | 168 |
| Harbour Hills Wind Project | Guysborough | EA under review, not approved; registered 24 June 2026 | 107 | 856 |
| Kmtnuk Wind Power Project | Colchester | EA approved with conditions on 21 December 2023; its two-year deadline to start work passed on 21 December 2025 with no extension posted, and no turbine position had been cleared by 30 August 2026 | 16 | 98 |
| Melvin Lake Wind Project | Halifax; Hants | EA approved with conditions on 24 January 2025; not under construction, and work must start by 24 January 2027 unless extended | 23 | 161 |
| Mersey River Wind Farm | Queens | Under construction as phase 1 of 2, with first power planned for fall 2026; EA approved with conditions on 27 March 2023 | 33 | 148.5 |
| Ocean Lake Wind Project (formerly EverWind Wind Farm 2) | Guysborough | EA approved with conditions on 2 July 2026 | 158 | 1,264 |
| Rhodena Wind Project | Inverness | EA approved with conditions on 6 January 2025 | 6 | 42 |
| Setapuktuk Wind Project (formerly EverWind Wind Farm 1) | Guysborough | EA approved with conditions on 24 November 2025 | 54 | 432 |
| Sugar Maple Wind Energy Project | Pictou | EA approved with conditions on 22 May 2026; construction planned from 2027 | 16 | 112 |
| Upper Afton Wind Project | Antigonish / Guysborough | EA approved with conditions on 22 April 2026 | 22 | 176 |
| Weavers Mountain Wind Energy Project | Pictou; Antigonish | Under construction, with turbines delivered from June 2026; EA approved with conditions on 27 July 2023 | 16 | 99.2 |
| Wedgeport Wind Farm Project | Yarmouth | Under construction, with operation planned for late 2026; EA approved with conditions on 4 May 2023 | 11 | 84 |
| Windy Ridge Wind Power Project | Colchester / Cumberland | EA approved with conditions on 25 July 2024; site work began between October 2025 and April 2026, before the deadline to start work, and pads were cleared at 32 of these 49 positions by 30 August 2026 | 49 | 340 |

Installed since 2018 (installed layer):

| Project | County | Status | Points on the map | Project MW |
|---|---|---|---|---|
| Benjamins Mill Wind Project, phase 1 | Hants | Operating since 16 December 2025 (8 turbines, about 34 MW) | 8 | 34 (phase 1) |
| Higgins Mountain Wind Farm | Cumberland / Colchester | In operation since 1 May 2026, by the proponent's account | 17 | 100 |

## Status caveats

- The conditions for Bear Lake, Kmtnuk, Windy Ridge and Rhodena require work to
  begin within two years of approval unless the Minister grants a written
  extension (deadlines below). Windy Ridge began site work before its deadline.
  Bear Lake and Kmtnuk passed theirs with no extension posted and no clearing at
  any turbine position, which is the test that keeps Westchester, Clydesdale
  Ridge and Ellershouse 3 off the map. They stay on it because the evidence
  that they are still live is stronger: the Board ordered Bear Lake's
  development agreement approved in May 2026, Nuveen financed EverWind's wind
  projects in March 2026, and EverWind named both in its October 2026
  announcement. Taking them off is a judgement call left open.
- The press figures for EverWind's four farms (650 MW from 80 turbines; elsewhere
  768 MW) do not match the EA filings (703 MW, 102 turbines, 108 with Upper Afton's
  alternates), so the layouts may have changed since the filings. The map shows
  the filed layouts.

## Around the Strait of Canso, and EverWind's four farms

### Setapuktuk Wind Project
Project page: <https://novascotia.ca/nse/ea/setapuktuk-wind/>

| Source | Supports |
|---|---|
| [Decision](https://novascotia.ca/nse/ea/setapuktuk-wind/sw-wind-ministers-decision-approval.pdf), [conditions](https://novascotia.ca/nse/ea/setapuktuk-wind/sw-wind-conditions.pdf); project page | Registered 3 Oct 2025; approved with conditions 24 Nov 2025; 54 turbines, 432 MW, about 221.7 m tip, 8 MW each |
| [EA registration document](https://novascotia.ca/nse/ea/setapuktuk-wind/sw-wind-ea-registration-document.pdf#page=33), Table 3.4, PDF p. 33 | Goldwind GWH182-8.0 (representative): hub 130 m, rotor 183.4 m, tip 221.7 m |
| [Appendix B-G](https://novascotia.ca/nse/ea/setapuktuk-wind/sw-appendix-b-g.pdf#page=9), Appendix C Sound, WindPRO "DECIBEL - Main Result" WTG table, PDF pp. 9-10 (calc. "250815 WF1") | **Mapped coordinates** T1-T54, UTM (north) NAD83(NSRS/CSRS) Zone 20, 0.01 m. The same 78 positions (54 + 24 Goose Harbour Lake) repeat identically in all four model runs in the appendix |
| [Appendix A Part 4](https://novascotia.ca/nse/ea/setapuktuk-wind/sw-appendix-a-part-4.pdf#page=64), Strum EMI letter to ISED dated 31 Jul 2025, Table 1, PDF pp. 64-65 | Same 54 UTM positions plus published 6-decimal lat/lon (used as a check) and base elevations (used for `ground_elev_m_published`). The letter gives 120 m hub and 211.7 m tip, which differs from the 130/221.7 in EARD Table 3.4 |
| Sentinel-2 check | No clearing at any of the 54 positions by October 2026 |

### Goose Harbour Lake Wind Farm (under construction)
Project page: <https://novascotia.ca/nse/ea/goose-harbour-lake-wind-farm-project/>

| Source | Supports |
|---|---|
| Project page; [decision](https://novascotia.ca/nse/ea/goose-harbour-lake-wind-farm-project/ghlwf-decision-approval.pdf) | Registered 27 Jan 2023; approved with conditions 20 Mar 2023; 29 turbines, 130.5 MW, 195 m tip, 4.5 MW each (the 2023 design) |
| [Aulds Cove EA reg. doc](https://novascotia.ca/nse/ea/aulds-cove-wind-project/aulds-cove-ea-registration-document.pdf#page=28), Table 3.4, PDF p. 28 (Dec 2025) | "Under Development" status |
| [Setapuktuk Appendix B-G](https://novascotia.ca/nse/ea/setapuktuk-wind/sw-appendix-b-g.pdf#page=10), Appendix C Sound, WTG rows 55-78, PDF pp. 9-10 | **Mapped coordinates**: 24 unlabelled NORDEX N163/7.X (7,000 kW, rotor 163 m, hub 118 m) modelled as existing turbines in a calculation titled "Goose Harbour Lake Wind Farm Phase 1 Turbines Included"; NAD83(NSRS/CSRS) |
| [Aulds Cove Appendix B-K](https://novascotia.ca/nse/ea/aulds-cove-wind-project/aulds-cove-appendix-b-k.pdf#page=10), Appendix C Noise, Table 3 "Turbines Under Construction", PDF p. 10 | IDs T5, T21, T27 and T30 for four of the 24 (each matches within 2 m). The other 20 are labelled `unlabelled-rowNN` after their row in the Setapuktuk table |
| News (not official filings): [CTV/CP on CIB financing](https://atlantic.ctvnews.ca/nova-scotia-paper-mill-to-be-powered-by-wind-farm-with-financing-from-federal-agency-1.7166159); [RES construction start](https://reglobal.org/res-commences-construction-of-168-mw-goose-harbour-lake-wind-farm-in-nova-scotia/) | Redesigned to 24 x Nordex N163 7.0 MW = 168 MW; construction began in 2025; operation expected late 2026 |
| [PHP Wind project timeline](https://www.phpwind.ca/project-timeline) (proponent, undated) | Q4 2026: "Completion of wind turbine erection and commissioning" and "Commercial Operation Commences" |
| Sentinel-2 check | A cleared pad at every one of the 24 positions (S2A_20TPR_20261003, S2C_20TPR_20261001) |
| [2023 EA part 10](https://novascotia.ca/nse/ea/goose-harbour-lake-wind-farm-project/ghlwf-ea-registration-document-part-10-appendix-n-q.pdf#page=3), EMI Table 1, PDF p. 3 (29 of 32 candidate locations, 120 m hub, 150 m rotor) | **Superseded; not mapped.** Turbine 14's UTM and lat/lon disagree by 270 m (digits swapped). 7 of the 24 modelled positions lie within 2 m of a 2023 location; the other 17 are 17 m to 1.6 km from the nearest one, so 2023 IDs were not carried over |

Why included: the farm is not operating and not in the CWTD, so without it a map of what is
coming near Point Tupper would miss 24 turbines 7-18 km away. Its points say `Under construction` in their status and layout.
The positions come from a third party's model input (Strum for EverWind, Aug 2025), not the
proponent's own filing. Ground elevations are left null because one modelled value (341.3 m at
E 618,361) is clearly wrong; CDEM and Aulds Cove give about 171 m. Each of the 24 positions has a
cleared pad, which confirms the redesigned layout is the one being built.

### Aulds Cove Wind Project
Project page: <https://novascotia.ca/nse/ea/aulds-cove-wind-project/>

| Source | Supports |
|---|---|
| Project page; [decision](https://novascotia.ca/nse/ea/aulds-cove-wind-project/aulds-cove-decision.pdf), [conditions](https://novascotia.ca/nse/ea/aulds-cove-wind-project/aulds-cove-conditions.pdf) | Registered 18 Dec 2025; approved 13 Feb 2026; up to 21 turbines, 147 MW, about 199.5 m tip, up to 7 MW; entirely in Guysborough County |
| [EA registration document](https://novascotia.ca/nse/ea/aulds-cove-wind-project/aulds-cove-ea-registration-document.pdf#page=29), Table 3.5, PDF p. 29 | Nordex N163 6.X 7000 (representative): hub 118 m, rotor 163 m, tip 199.5 m |
| [Appendix B-K](https://novascotia.ca/nse/ea/aulds-cove-wind-project/aulds-cove-appendix-b-k.pdf#page=24), Appendix D Shadow Flicker, WindPRO "SHADOW - Main Result" WTG table, PDF p. 24 | **Mapped coordinates** T1-T22 with no T18 (21 turbines), UTM (north) NAD83(CSRS)v6 Zone 20, 0.01 m. Rows run in reverse order; IDs are taken from the "T22:"-style row labels |
| Same file, Appendix C Noise, Table 1, PDF p. 9 | Same 21 positions as N01-N22, rounded to metres; N07 has a typo ("619.075 5.052.399") |
| [Appendix A](https://novascotia.ca/nse/ea/aulds-cove-wind-project/aulds-cove-appendix-a.pdf#page=65), Strum EMI letters dated 22 Sep 2025, Table 1, PDF pp. 64-65 | 22 turbines including T18 (619225.4 / 5051750.6), which was later dropped; published 6-decimal lat/lon used as a check. T18 is not mapped |

### Rhodena Wind Project
Project page: <https://novascotia.ca/nse/ea/rhodena-wind-project/>

| Source | Supports |
|---|---|
| Project page; [decision](https://novascotia.ca/nse/ea/rhodena-wind-project/Decision_Letter_Rhodena_Wind_EA.pdf), [approval/conditions](https://novascotia.ca/nse/ea/rhodena-wind-project/EA_Approval_RhodenaWind.pdf) | Registered 6 Nov 2024; approved 6 Jan 2025; up to 6 turbines, 42 MW, up to 200 m tip, up to 7 MW |
| [Part 8, Appendix J](https://novascotia.ca/nse/ea/rhodena-wind-project/rwp-Part-8-Appendix-J-Appendix-M.pdf#page=2), Strum EMI letter dated 24 Jul 2024, Table 1, PDF pp. 2-3 | **Mapped coordinates** T1-T6, UTM Z20 (datum not stated) with published 6-decimal lat/lon; tip 199.5 m, hub 118 m, rotor 163 m |
| Repo `web/src/rhodena/features.json` | **Confirmed:** same six turbines, same source, within 0.05 m |

### Upper Afton Wind Project (one of EverWind's four)
Project page: <https://novascotia.ca/nse/ea/upper-afton-wind-project/>

| Source | Supports |
|---|---|
| Project page; [decision](https://novascotia.ca/nse/ea/upper-afton-wind-project/upper-afton-decision.pdf), [conditions](https://novascotia.ca/nse/ea/upper-afton-wind-project/upper-afton-conditions.pdf) | Registered 6 Mar 2026; approved 22 Apr 2026; up to 176 MW, up to 28 turbines, about 221.7 m tip, 8 MW |
| [EA reg. doc to Appendix E](https://novascotia.ca/nse/ea/upper-afton-wind-project/upper-afton-ea-registration-document-to-appendix-e.pdf#page=21), section 2.1 (PDF p. 21) and Table 3.3 (PDF p. 30) | "fourth Phase 1 onshore wind project"; 22 turbines planned and 6 of 28 locations alternates; Goldwind GWH182-8.0: hub 130 m, rotor 183.4 m, tip 221.7 m; EARD centre 45.550643 N, 61.661264 W |
| Same PDF, Appendix E WSP Noise Assessment (4 Feb 2026), Table 1, PDF p. 438 | **Mapped coordinates** for the 22 primary turbines (T03-T28), "UTM Zone 20T", whole metres. Identical to the WSP Shadow Flicker report Table 1 ([Appendix F-J](https://novascotia.ca/nse/ea/upper-afton-wind-project/upper-afton-appendix-f-j.pdf#page=6), PDF p. 6), whose figures state NAD83 UTM Zone 20 |
| Same PDF, Appendix C WSP EMI letter (22 Dec 2025), Table 1, PDF p. 417 | **Mapped coordinates** for the 6 alternates (T1, T2, T6, T7, T12, T24) and **T15A**, and base elevations. The letter says 29 turbines; T15A (603451 / 5043664) is not one of the 28 EA locations and is flagged `layout_role: unclear`. It is left out of the map |

### Ocean Lake Wind Project (EverWind and Membertou; not one of the four)
Project page: <https://novascotia.ca/nse/ea/ocean-lake-wind/>

| Source | Supports |
|---|---|
| Project page; [decision](https://novascotia.ca/nse/ea/ocean-lake-wind/ocean-lake-decision.pdf), [conditions](https://novascotia.ca/nse/ea/ocean-lake-wind/ocean-lake-conditions.pdf) | Registered 13 May 2026; approved 2 Jul 2026; up to 158 turbines, up to 1,264 MW, about 221.7 m tip, 8 MW; near New Harbour, Goldboro, Larry's River, Lundy, Roachvale |
| [EA reg. doc to Appendix C](https://novascotia.ca/nse/ea/ocean-lake-wind/ocean-lake-ea-registration-document-appendix-c.pdf#page=31), section 3.5.1 and Table 3.3, PDF p. 31 | Optional turbine locations (OTs) were assessed except in the sound and shadow models; Goldwind GWH182-8.0: hub 130, rotor 183.4, tip 221.7; project centre 45.236163 N, 61.535765 W (42.2 km from the reference point) |
| [Appendix D-I](https://novascotia.ca/nse/ea/ocean-lake-wind/ocean-lake-appendix-d-i.pdf#page=10), Appendix E WSP Noise Assessment (27 Apr 2026), Table 1, PDF pp. 10-16 | **Mapped coordinates** for the 143 modelled turbines (source codes T001-T158), "Zone 20T", whole metres. Identical to the Shadow Flicker Table 1 in the same file |
| EA reg. doc to Appendix C, Appendix C WSP EMI letter, Table 1, PDF pp. 483-487 | Lat/long in degrees, minutes and seconds for all 158 (datum not stated). **Mapped directly** for the 15 optional locations (T4, T22, T24, T33, T51, T82, T90, T95, T99, T107, T110, T120, T121, T125, T126); used as a check for the 143 (within 1.4 m) |


### Windy Ridge Wind Power Project (one of EverWind's four)
Project page: <https://novascotia.ca/nse/ea/windy-ridge-wind-power/>

| Source | Supports |
|---|---|
| Project page; [decision](https://novascotia.ca/nse/ea/windy-ridge-wind-power/wrwp-decision.pdf), [conditions](https://novascotia.ca/nse/ea/windy-ridge-wind-power/wrwp-conditions.pdf) | Registered 5 Jun 2024; approved 25 Jul 2024; 49 turbines, 340 MW, 199.5 m tip, 7 MW; near Debert |
| [EA registration document](https://novascotia.ca/nse/ea/windy-ridge-wind-power/wrwp-ea-registration-document.pdf#page=27), PDF p. 27 and p. 312 | 52 locations on the EA figures, 49 to be built, 3 contingency alternates; Nordex N163: hub 118 m, rotor 163 m, total 199.5 m |
| [Appendix E](https://novascotia.ca/nse/ea/windy-ridge-wind-power/wrwp-appendix-e.pdf#page=6), WSP Noise Assessment (15 Apr 2024), Table 1, PDF pp. 6-7 | **Mapped coordinates** for the 49 turbines (T01-T72, not sequential), "Zone 20", whole metres; Figure 1 (PDF p. 10) states NAD83 UTM Zone 20. Identical to the [Appendix L](https://novascotia.ca/nse/ea/windy-ridge-wind-power/wrwp-appendix-l.pdf#page=5) Shadow Flicker Table 1. The report says "EverWind Fuels LLC, majority owner of Windy Ridge" (PDF p. 5) |
| — | The 3 alternates appear only on the EA figures; **no published coordinates**, not mapped |
| [Colchester County council committee minutes, 3 Jun 2025](https://www.colchester.ca/council-committee-minutes/2025-council-committee-minutes/4701-council-committee-minutes-06-03-25-presentation-meeting/file), "Windy Ridge and Kmtnuk Wind Power Projects Update", PDF p. 2 | EverWind and Membertou: "All turbines at this site will now be the same, 8mw model", two turbines eliminated, and the site realigned so there are no turbines west of the East Folly Mountain River. The revised positions are not published, so the map keeps the 49 assessed ones and says so |
| [EverWind Windy Ridge page](https://everwindfuels.com/projects/windy-ridge-wind-project/) (fetched 2026-10-24) | 47 turbines, up to 376 MW; "construction is expected to begin in 2026" |
| [The Canadian Press via BNN Bloomberg, 3 Mar 2026](https://www.bnnbloomberg.ca/business/2026/03/03/everwind-lands-more-than-240m-in-financing-for-ns-wind-and-hydrogen-projects/) (news) | EverWind's CEO: the company "has begun clearing land" on Windy Ridge |
| Sentinel-2 check (reviewed by eye, `site-review.txt`) | A round pad on a new access road at 32 positions (T1-T9, T14, T16, T17, T20, T21, T28-T35, T37-T39, T41-T46, T52) on 30 Aug 2026 (S2B_20TMR_20260830), none on 29 Sep 2025 (S2C_20TMR_20250929); the first (T16, T17, T37, T38) are visible on 27 Apr 2026 (S2C_20TMR_20260427). No clearing at T18, T47 or the 14 eastern positions T53-T72; T40 unclear. Work therefore began before the 25 Jul 2026 deadline, which corroborates the CEO's statement |

### Kmtnuk Wind Power Project (one of EverWind's four)
Project page: <https://novascotia.ca/nse/ea/kmtnuk-wind-power/>

| Source | Supports |
|---|---|
| Project page; [decision](https://novascotia.ca/nse/ea/kmtnuk-wind-power/kwp-decision.pdf), [conditions](https://novascotia.ca/nse/ea/kmtnuk-wind-power/kwp-conditions.pdf) | Registered 1 Nov 2023; approved 21 Dec 2023; 16 turbines, 98 MW, 206.5 m tip, 7.0 MW; north of McCallum Settlement |
| [Appendix S-V](https://novascotia.ca/nse/ea/kmtnuk-wind-power/kwp-appendix-s-v.pdf#page=59), Appendix T Shadow Flicker, WindPRO WTG table, PDF p. 59 | **Mapped coordinates**, NAD83(NSRS/CSRS) Zone 20; IDs from the "WTG n" labels (1, 2, 4-8, 10-17, 20) |
| Same file, Appendix S EMI letter (18 Sep 2023), Table 1, PDF pp. 2-3 | Hub 125 m, rotor 163 m, tip 206.5 m; UTM about 1.05 m north of the WindPRO values (likely an NAD83 realisation difference) and 4-decimal lat/lon used as a check |
| [EverWind Kmtnuk page](https://everwindfuels.com/projects/kmtnuk-wind-project/) (fetched 2026-10-24) | 16 turbines, up to 128 MW (8 MW each); "construction is expected to begin in 2026" |
| Sentinel-2 check | No clearing at any of the 16 positions on 30 Aug 2026 (S2B_20TMR_20260830) or in October (T6's October flag is thin cloud) |

### Bear Lake Wind Power Project (one of EverWind's four)
Project page: <https://novascotia.ca/nse/ea/bear-lake-wind-power/>

| Source | Supports |
|---|---|
| Project page; [decision](https://novascotia.ca/nse/ea/bear-lake-wind-power/blwp-decision.pdf), [conditions](https://novascotia.ca/nse/ea/bear-lake-wind-power/blwp-conditions.pdf) | Registered 24 Oct 2023; approved 13 Dec 2023; up to 15 turbines, up to 89 MW, up to 206.5 m tip; near Upper Vaughn (EA page spelling) |
| [Appendix Q-T](https://novascotia.ca/nse/ea/bear-lake-wind-power/blwp-appendix-q-t.pdf#page=62), Appendix R Shadow Flicker, WindPRO WTG table, PDF p. 62 | **Mapped coordinates**, NAD83(NSRS/CSRS) Zone 20 (unlabelled rows) |
| Same file, Appendix Q EMI letter (15 Sep 2023), Table 1, PDF pp. 2-3 | IDs 1-15 (identical coordinates to the WindPRO rows), 4-decimal lat/lon (check), hub 125 m, rotor 163 m, tip 206.5 m |
| [NS Regulatory and Appeals Board, 2026 NSRAB 76, decision of 26 May 2026](https://nserbt.ca/sites/default/files/NSRAB%20Board%20Decision%20-%20Bear%20Lake%20Wind%20Ltd%20M12505.pdf), matter M12505 | "The appeal is allowed. The Board orders Council to approve the Development Agreement." Para. 8: "An updated project description was approved on April 28, 2025." Paras. 10-11: the revised project is 11 Goldwind GWH182-8.0 turbines (7 in West Hants, 3 in Halifax, 1 in Chester), 211 m tall. The revised positions are not published, so the map keeps the 15 assessed ones and says at least 4 will not be built |
| Sentinel-2 check | No clearing at any of the 15 positions on 30 Aug 2026 (S2B_20TLQ_20260830) or in October |

### Construction deadlines in the 2023–2025 approvals
The conditions for Bear Lake, Kmtnuk, Windy Ridge and Rhodena (condition 3.2) require work to
begin within two years of approval unless the Minister grants a written extension. The
[EA Regulations](https://novascotia.ca/just/regulations/regs/envassmt.htm) define "commence work" as
"to begin construction or site preparation activity" (s. 2(2)), so site clearing meets the
condition, and only a written extension can move the deadline (s. 27(2)). The deadlines were 13 Dec 2025 (Bear Lake), 21 Dec 2025 (Kmtnuk),
25 Jul 2026 (Windy Ridge) and 6 Jan 2027 (Rhodena). On 2026-10-24 the EA pages list only the
registration, decision, conditions, comments and public notice: no extension or amendment notice,
although the Department has posted extensions on other pages
([Amherst Wind, 2010](https://novascotia.ca/nse/ea/amherst.wind.energy.project.asp)). Condition 3.3's
30-day notice of commencement is not published.

- **Windy Ridge:** started. Pads were cleared at 32 positions between October 2025 and August 2026,
  the first by 27 April 2026 (see its table).
- **Bear Lake and Kmtnuk:** no clearing at any turbine position by 30 August 2026, and no extension
  posted. That is not proof that none was granted: an unpublished extension, or work away from the
  turbine sites, would not show here. Bear Lake's April 2025 project change was approved without a
  new EA (2026 NSRAB 76, para. 57), and EverWind's pages say construction of both is expected to
  begin in 2026.
- **Rhodena:** deadline 6 January 2027; no clearing at its six positions.

## Checked: no coordinates mapped

### Near the Strait, not planned or no usable filing
| Project | Why not mapped | Link |
|---|---|---|
| Wind Energy Project, Creignish Rear (Black River Wind, 2005; six 1.2 MW) | Historical. Approved 14 Nov 2005, deadline to begin extended to 14 Nov 2011; only CRE1 (2013) is in the CWTD; the registration PDF has no text coordinate table | <https://novascotia.ca/nse/ea/creignishwind.asp> |
| Canso Wind Farm (Barrington Wind Energy, 2006; up to 8 turbines SE of Canso, about 39 km) | Approval presumed lapsed: condition 1.2 required work to begin within 2 years and no extension is posted; not in the CWTD; only the decision, conditions and notice are posted (no coordinates). The Canso-area farm now operating is Sable (2015, CWTD) | <https://novascotia.ca/nse/ea/cansowind.asp> |
| Wind/Hydro Energy Project, Lake Uist (Cape Breton Explorations; up to 44 turbines) | Status "Null and void" (Class II report never filed); about 60 km | <https://novascotia.ca/nse/ea/CBWindHydro.asp> |
| Mulgrave Community Wind (2014), Point Tupper Wind Farm (2008), Sable Wind (2013), Fairmont (2011), Maryvale (2009), Glen Dhu (2009) | Operating; in the CWTD | <https://novascotia.ca/nse/ea/projects.asp> |
| EverWind Strait Crossing Transmission Line (approved 25 Apr 2025); EverWind Point Tupper Green Hydrogen/Ammonia Phase 1 (approved 7 Feb 2023); Bear Head Energy hydrogen/ammonia (approved 12 Apr 2023) | No wind turbines | <https://novascotia.ca/nse/ea/everwind-strait-crossing-transmission-line/>, <https://novascotia.ca/nse/ea/everwind-point-tupper-green-hydrogen-ammonia-project/>, <https://novascotia.ca/nse/ea/bear-head-energy/> |
| Nova Sustainable Fuels Renewable Energy Park, Goldboro (approved 18 Dec 2025) | Fuel plant only; "the renewable energy project and transmission line will be assessed under another environmental assessment". No wind EA yet | <https://novascotia.ca/nse/ea/nova-sustainable-fuels-renewable-energy/> |
| Melford, Mulgrave, Pirate Harbour, Middle Melford | Covered by Setapuktuk and Aulds Cove; no separate project found | — |
| Richmond County (including Point Tupper industrial land) | No wind EA registration found. Council amended planning documents in 2023 to allow utility-scale turbines in heavy-industrial zones; no development agreement with coordinates found | <https://commediaportal.ca/en/media/richmond-county-examines-offshore-and-onshore-wind-possibilities> |
| Port Hastings, Creignish (other than Rhodena), Glen Dhu, Lochaber, "Bayview" | No NS EA registration under these names found on the projects list | <https://novascotia.ca/nse/ea/projects.asp> |

### Farther from the Strait
Eigg Mountain, Sugar Maple, Weavers Mountain and the other mainland projects are under [Elsewhere in Nova Scotia](#elsewhere-in-nova-scotia). Harbour Hills is there too.

### Withdrawn or rejected
None found for wind projects near the Strait.

### Other registries
- Impact Assessment Agency of Canada: the federal Physical Activities Regulations designate offshore
  wind facilities, not onshore wind farms, and a search found only the Regional Assessment of
  Offshore Wind Development in Nova Scotia (registry 83514), which gives no turbine positions:
  <https://iaac-aeic.gc.ca/050/evaluations/document/147038>
- Municipal development agreements: none with turbine coordinates found in a quick search
  (Richmond, Guysborough, Inverness, Antigonish). Not searched exhaustively.

## Elsewhere in Nova Scotia

### Eigg Mountain Wind Project (22 turbines): Antigonish County, 59.5-66.7 km from Point Tupper
NRCan: not present; nearest NRCan turbine 1.9 km (Glen Dhu, 2011).
| Source | Supports |
|---|---|
| [EA project page](https://novascotia.ca/nse/ea/eigg-mountain-wind-project/) | Proponent (Eigg Mountain Wind Inc, RES); registered 2026-02-18; 22 turbines, 154 MW, 199.5 m tip, 7.0 MW; approved 2026-04-09; construction planned late 2026, operation 2028 |
| [Appendix K, Shadow Flicker Assessment (Nortek, 4 Feb 2026)](https://novascotia.ca/nse/ea/eigg-mountain-wind-project/eigg-mountain-appendix-k.pdf), Table 1, PDF p. 4 | **Coordinates** for IDs 1-22, UTM NAD83(CSRS) Zone 20. Tables 2-3 list existing Glen Dhu and Maryvale turbines in the same CRS, which were used as a check against NRCan (12-42 m) |
| [EA registration document](https://novascotia.ca/nse/ea/eigg-mountain-wind-project/eigg-mountain-ea-registration-document.pdf) | Hub height 118 m, rotor 163 m (Nordex N163); centre at 45.701936 N, 62.131292 W; turbine locations A3 and A24 are "alternative turbine locations as a contingency" (p. 259). Those alternatives are not tabulated, so they are not mapped |
| [Appendix D, Noise Impact Assessment](https://novascotia.ca/nse/ea/eigg-mountain-wind-project/eigg-mountain-appendix-d.pdf) | Not used for coordinates. Its "Table 1: Proposed Turbine Positions" actually reprints the receptor table (a document error) |
| [Conditions](https://novascotia.ca/nse/ea/eigg-mountain-wind-project/eigg-mountain-conditions.pdf) | Condition 3.2: work must start within 2 years unless the Minister extends this (deadline 2028-04-09) |

The Appendix K IDs (1-22) may not match the turbine labels on the EA figures, which include the A-prefixed alternatives.

### Sugar Maple Wind Energy Project (16 turbines): Pictou County, 65-73 km from Point Tupper
NRCan: not present; nearest NRCan turbine 14.9 km.
| Source | Supports |
|---|---|
| [EA project page](https://novascotia.ca/nse/ea/sugar-maple-wind-energy/) | Proponent (WEB Sugar Maple Wind Inc: Glooscap First Nation and SWEB Development LP); registered 2026-04-02; up to 16 turbines, 112 MW, up to 200 m tip, 7.0 MW; approved 2026-05-22; major construction spring 2027, commercial operation end of 2028 (Green Choice Program) |
| [Appendix D, Noise Impact Assessment (Nortek, 20 Mar 2026)](https://novascotia.ca/nse/ea/sugar-maple-wind-energy/sugar-maple-appendix-d.pdf), Table 1, PDF p. 4 | **Coordinates** S1-S16, including "the updated position for turbine S10" (S10R); UTM NAD83(CSRS) Zone 20. The table is an embedded image, transcribed by eye |
| [Appendix K, Shadow Flicker Assessment](https://novascotia.ca/nse/ea/sugar-maple-wind-energy/sugar-maple-appendix-k.pdf), Table 1, PDF p. 4 | Second copy of the coordinates. All 16 values are identical (labelled S10 rather than S10R). Hub 118 m, rotor 163 m. Its second table lists 5 Weavers Mountain turbines "currently under construction", which match the Weavers EA coordinates |

### Weavers Mountain Wind Energy Project (16 turbines): Pictou/Antigonish, 64-71 km from Point Tupper. UNDER CONSTRUCTION
NRCan: not present; nearest NRCan turbine 10.8 km (Avondale, 2016).
| Source | Supports |
|---|---|
| [EA project page](https://novascotia.ca/nse/ea/weavers-mountain-wind-energy/) | Proponent; registered 2023-06-07; up to 16 turbines, 99.2 MW, 206.5 m tip, up to 6.2 MW; approved 2023-07-27 |
| [Appendix G-P (Strum EMI consultation letters, Apr 2023)](https://novascotia.ca/nse/ea/weavers-mountain-wind-energy/wmw-appendix-g-p.pdf), Table 1, first at PDF p. 284 | **Coordinates** 1-16 (UTM Z20, NAD83, with 3-dp lat/lon); hub 125 m, rotor 163 m. All 15 copies are identical |
| [CIB project page](https://cib-bic.ca/en/projects/clean-energy/weavers-mountain-wind/) | "$117.4 million (under construction)"; financed size 94.4 MW (16 Nordex turbines). The GeoJSON keeps the EA figure of 99.2 MW |
| Sugar Maple Appendix K (above) | Independent confirmation that turbines 2, 4, 9, 12 and 15 were under construction at the EA coordinates (March 2026) |
| [SWEB news, 9 Jun 2026](https://www.sweb.energy/ca-en/projectpages/weavers-mountain/events-news) ("Turbines for Weavers Mountain are on the Move") | Turbine deliveries from the Strait of Canso began in June 2026 |
| Sentinel-2 check | A pad at all 16 positions on 21 Oct 2026 (S2C_20TNR_20261021); at turbine 3 the pad edge is about 40 m away |

### Melvin Lake Wind Project (23 turbines): Halifax/Hants, 213+ km from Point Tupper
NRCan: not present; nearest NRCan turbine 3.2 km (Chebucto Pockwock, 2014).
| Source | Supports |
|---|---|
| [EA project page](https://novascotia.ca/nse/ea/melvin-lake-wind-project/) | Proponent (Melvin Lake Wind Inc); registered 2024-11-28; up to 23 turbines, 161 MW, up to 206 m tip, 7 MW; decision released 2025-01-27 (the decision letter is dated 2025-01-24) |
| [Part 5, Appendix G (part b) to N (Strum EMI letters, 19 Sep 2024)](https://novascotia.ca/nse/ea/melvin-lake-wind-project/mlwp-Part-5-Appendix-G-part-b-to-Appendix-N.pdf), Table 1, first at PDF p. 281 | **Coordinates** 1-23 (UTM 20N, NAD83, with 4-dp lat/lon); 206.5 m tip, 125 m hub, 163 m rotor. All 16 copies are identical. The printed lat/lon for T5 is about 85 m from its UTM position; the UTM value was used |
| [Conditions](https://novascotia.ca/nse/ea/melvin-lake-wind-project/mlwp-EA-Approval.pdf) | Condition 3.2: work must start within 2 years (deadline about 2027-01-24) unless extended |
| [ABO Energy project page](https://www.aboenergy.com/ca/company/projects/melvin-lake-wind/index.php); [East Hants council update, Oct 2025](https://www.easthants.ca/wp-content/uploads/easthants-occ/agendas/46388/attachments/27424/ABO%20Wind%20-%20Melvin%20Lake%20update%20-%20October%202025.pdf) | Melvin Lake is an ABO Energy project. It was selected in the Green Choice Program, but ABO declined the PPA in 2025. ABO is re-bidding in November 2026, with an award expected January 2027 and a target COD of 2030-12-31. Not under construction. **Watch the January 2027 commencement deadline** |

### Benjamins Mill Wind Project (28 positions): Hants County. PARTLY BUILT
8 positions operating (installed layer), 3 under construction and 17 not built (planned layer).
NRCan: not present (its 2025-2026 turbines post-date the NRCan snapshot); nearest NRCan turbine 7.8 km (South Canoe, 2015).
| Source | Supports |
|---|---|
| [EA project page](https://novascotia.ca/nse/ea/benjamins-mill-wind-project/) | Proponent; addendum 2023-01-06; up to 28 turbines, up to 150 MW, up to 200 m tip, up to 6.2 MW; approved 2023-02-13 |
| [EA Addendum Appendix M (WindPRO DECIBEL, "Ben Mill - EA Layout Noise Model - Nov 2022")](https://novascotia.ca/nse/ea/benjamins-mill-wind-project/bmwp-ea-addendum-appendix-m.pdf), WTGs table, PDF p. 1 (repeated p. 9) | **Coordinates** 1-28, printed as WGS84 decimal degrees, used as printed. The model turbine was an Enercon E-160 (hub 99 m), but the EA gives ranges (hub 100-131 m, rotor 138-170 m), so hub and rotor are `null` |
| [EA Addendum Part 1](https://novascotia.ca/nse/ea/benjamins-mill-wind-project/bmwp-ea-addendum-part-1.pdf), Table 3 | Turbine specification ranges |
| [Natural Forces Phase 1 page](https://www.naturalforces.ca/projects/benjamins-mill-wind-project/) | Phase 1: 8 turbines, about 34 MW; "reached Commercial Operation as of December 16, 2025" |
| [Natural Forces Minas Highlands (Phase 2) page](https://www.naturalforces.ca/projects/minas-highlands-wind-project-benjamins-mill-wind-project-phase-2/) | Phase 2: 3 turbines under construction (tower deliveries 19-20 Sep 2026), COD 2026; permitted under the same EA |
| [Natural Forces future-phases page](https://www.naturalforces.ca/projects/benjamins-mill-wind-project-phase-2/) | Later phases are being bid into the Green Choice Program, up to 28 turbines in total |
| Sentinel-2 check (`site-review.txt`) | **Which positions are built.** Pads at EA positions 14, 15, 17, 18, 19, 20, 21 and 22 by 30 Aug 2024 (S2B_20TLQ_20240830; none on 10 Sep 2022), which is phase 1; pads at 6, 8 and 9 between 27 May and 4 Oct 2025 (S2B_20TLQ_20250527, S2B_20TLQ_20251004), which is Minas Highlands; no pad at the other 17 by 24 Oct 2026. The phase-1 dates fit construction from 2024 and COD in December 2025, and the eastern three fit Minas Highlands' construction from September 2025 |
| [Natural Forces layout map, 3 Sep 2025](https://www.naturalforces.ca/wp-content/uploads/2025/09/Minas-Highlands-Project-Layout_GM-1024x663.jpg) | Unnumbered: eight Benjamins Mill turbines in the west and three Minas Highlands turbines north-east of the substation, the same arrangement as the pads. Read only to confirm the phase split; no position taken from it |

### Mersey River Wind Farm (33 turbines): Queens County. UNDER CONSTRUCTION
NRCan: not present; nearest NRCan turbine 8.9 km (Liverpool, 2017).
| Source | Supports |
|---|---|
| [EA project page](https://novascotia.ca/nse/ea/mersey-river-wind-farm/) | Proponent; registered 2023-02-03; 33 turbines, 148.5 MW, 180 m tip, 4.5 MW; approved 2023-03-27; conditions amended 2023-11-29 |
| [Part 6, Appendices J-Q (Strum EMI letters, 19 Sep 2022)](https://novascotia.ca/nse/ea/mersey-river-wind-farm/mrwf-ea-registration-document-part-1-appendix-j-q.pdf), Table 1, first at PDF p. 182 | **Coordinates** 1-33 (UTM Z20, NAD83, with 8-dp lat/lon, which agree with the conversion to 0.1 m); hub 105 m, rotor 150 m (Vestas V150). All 16 copies are identical |
| [Minister's amendment letter, 2023-10-30](https://novascotia.ca/nse/ea/mersey-river-wind-farm/mrwf-minister-amendment-letter.pdf) | **Accuracy caveat:** the October 2023 layout revision moved "a few select turbines". The revised project description (Strum, 2023-10-12) is still not published (EA page checked 2026-10-24), so some mapped positions are outdated |
| [CIB project page](https://cib-bic.ca/en/projects/clean-power/mersey-river-wind/); [Frequency/QCCR, 2025-05-16](https://www.frequencynews.ca/news/mersey-river-wind-project-to-start-in-next-few-months/) | "$206.4 million (Under construction)". In May 2025 site clearing was largely done and the first turbines were expected by late 2026 |
| [Mersey River Wind construction page](https://www.merseywind.ca/construction) (proponent, fetched 2026-10-24) | "33 Vestas V150 wind turbines on 120m towers, built in two phases"; first large components arrived at the Port of Mersey on 7 October; "Fall 2026: First turbines begin generating electricity"; "Spring 2027: Full project commissioning". Its map (unnumbered, no coordinates) shows 20 phase 1 and 13 phase 2 turbines |
| Sentinel-2 check (`site-review.txt`) | Pads on or within 100 m of 18 positions (1-8, 15, 16, 18, 20-26) on 24 Oct 2026 (S2C_20TLP_20261024); positions 7, 15, 16 and 26 are 20-100 m off, which fits the 2023 revision. No clearing within 300 m of the other 15 (9-14, 17, 19, 27-33), in the north and west where the construction map puts most of phase 2. At least one more pad is at an untabulated site and is not mapped |

### Wedgeport Wind Farm Project (13 positions, 11 mapped): Yarmouth County. UNDER CONSTRUCTION
NRCan: not present; nearest NRCan turbine 456 m (Black Pond, 2015), a separate small project, not part of this one.
| Source | Supports |
|---|---|
| [EA project page](https://novascotia.ca/nse/ea/wedgeport-wind-farm-project/) | Proponent; registered 2023-03-15; up to 13 turbines, up to 200 m tip, 5.9-7.0 MW each; approved 2023-05-04 |
| [EA registration document](https://novascotia.ca/nse/ea/wedgeport-wind-farm-project/wwf-ea-registration-document.pdf), Table 6-2, printed pp. 49-50 | **Coordinates** WTG1-13, UTM NAD83 **Zone 19**. Table 6-1 gives hub 110-118 m and rotor 162-175 m (ranges, so `null`) |
| [Elemental Energy project page](https://elementalenergy.ca/project/wedgeport-wind/); [CIB, financial close May 2025](https://cib-bic.ca/en/medias/articles/cib-loans-97-million-towards-new-energy-project-wedgeport-wind/) | Under construction, with operations scheduled late 2026. The project is now **12 x 7 MW = 84 MW** (the map uses 84 MW) |
| [Elemental's updated layout, McCallum Environmental Figure 1, 5 Dec 2023](https://elementalenergy.ca/wp-content/uploads/2022/04/231205_Wedgeport-updated-for-MD-Arglye39-pdf-1600x1035.jpg) | WTG1-WTG12 in NAD83(CSRS) UTM 19N. Read against its axis labels: no turbine near EA WTG7 or WTG10, one added between EA WTG11 and WTG12, and the rest at EA positions. Read only to find the dropped positions; no position taken from it |
| Sentinel-2 check (`site-review.txt`) | Twelve pads by 7 Oct 2026 (S2C_19TGJ_20261007): on or within 20 m of WTG1, 6, 8, 9, 12 and 13; 80-240 m from WTG2, 3, 4, 5 and 11; one at the untabulated site. No pad within 270 m of WTG7 or WTG10. **WTG7 and WTG10 are therefore marked dropped and left off the map**: 11 of the 12 turbines are at or near EA positions, and the twelfth is not mapped |

### Harbour Hills Wind Project (107 turbines): Guysborough County, 52-66 km from Point Tupper. UNDER REVIEW
| Source | Supports |
|---|---|
| [EA project page](https://novascotia.ca/nse/ea/harbour-hills-wind/) | EverWind and Membertou ("Wind Farm 3"); registered 2026-06-24; 107 turbines, 856 MW. On 2026-08-13 the Minister found the registration insufficient and asked for more flora and fauna information; it is under review, not approved and not rejected |
| [Appendix B-F](https://novascotia.ca/nse/ea/harbour-hills-wind/harbour-hills-appendix-b-f.pdf), Table 1, PDF pp. 42-44 | **Coordinates** for all 107 positions, printed in degrees, minutes and seconds (datum not stated in the table; the report's maps are NAD83), converted arithmetically |

EverWind and Membertou therefore have six approved wind farms (Bear Lake, Kmtnuk, Windy Ridge, Setapuktuk, Upper Afton, Ocean Lake) and Harbour Hills under review. The four the data-centre announcement named are Bear Lake, Kmtnuk, Upper Afton and Windy Ridge. West Hants refused Bear Lake's development agreement in September 2025; the NS Regulatory and Appeals Board allowed the appeal on 26 May 2026 and ordered Council to approve it (2026 NSRAB 76). EverWind's own pages now list 11 (Bear Lake), 16, 47 (Windy Ridge) and 22 (Upper Afton) turbines, 96 in all; the press figure of 80 turbines and 650 MW is from EverWind's data-centre FAQ ("more than 80 turbines and more than 650 MW").

## Approval possibly lapsed (kept off the map)
Every recent approval carries the same condition 3.2: work must start within 2 years of the approval unless the Minister grants a written extension. None of the project pages shows an extension.

| Project | Approved | Deadline | Evidence work has not started | Coordinates |
|---|---|---|---|---|
| Westchester Wind Project (12 turbines, 50-84 MW, Natural Forces) | 2023-02-13 | 2025-02-13 | The [Natural Forces page](https://www.naturalforces.ca/projects/westchester-wind-project/) still calls it "proposed", with a Green Choice bid and an information session on 2026-10-27 | Not found in EARD Section 2 or Addendum Parts 1-2. Addendum Appendix L (sound) has no text-layer table and was not checked further. <https://novascotia.ca/nse/ea/Westchester-Wind-Project/> |
| Clydesdale Ridge Wind Project (18 turbines, 126 MW, Natural Forces/RMS) | 2024-09-26 | 2026-09-26 | The [Natural Forces page](https://www.naturalforces.ca/projects/clydesdale-ridge-wind-project/) says "proposed", with a Green Choice bid and an information session on 2026-11-02. No clearing at any of the 18 positions in Sentinel-2 imagery to October 2026 (WTG11 sits in a forestry cut). The deadline passed only a month ago, and an unpublished extension is possible | [EA registration document](https://novascotia.ca/nse/ea/clydesdale-ridge-wind/cwr-ea-registration-document.pdf), Table 6.3, PDF p. 32 (UTM NAD83 Z20). Not mapped while the approval may have lapsed |
| Ellershouse 3 Wind Project (12 turbines, 66 MW, Potentia/AVFN) | 2023-07-05 | 2025-07-05 | **Not built.** No pad at any of the 12 positions on 30 Aug 2026 (S2B_20TMQ_20260830). Potentia's planned 2025 construction (6 turbines under the AREA PPA, COD December 2025) did not happen; its project page now returns 404, and IESO Nova Scotia's 2026 outlook lists no Ellershouse addition | [Appendix M-P](https://novascotia.ca/nse/ea/ellershouse-3-wind/e3w-ea-registration-appendix-m-p.pdf), Table 1, PDF p. 7 (8 identical copies). Printed lon for T7 is a typo. Not mapped while the approval may have lapsed |

Older approvals with no matching NRCan project, all approved 10 or more years ago with no sign of construction (approval possibly lapsed):
- Pugwash Wind Farm (approved 2012-03-27): <https://novascotia.ca/nse/ea/pugwash.wind.farm.asp>
- Glen Dhu South Wind Power Project (2012-03-16): <https://novascotia.ca/nse/ea/glen.dhu.south.wind.power.project.asp>
- Clydesdale Ridge Wind Farm (2012-07-24; superseded by the 2024 registration): <https://novascotia.ca/nse/ea/clydesdale-ridge-wind-farm.asp>
- Hampton Mountain Wind Power Project (2011-01-10): <https://novascotia.ca/nse/ea/hampton.mountain.wind.power.asp>
- Harrietsfield Williamswood Wind Farm (2015/2016; no NRCan name match, though NRCan "Ketch Harbour", 3 turbines, 2016, is nearby and was not checked): <https://novascotia.ca/nse/ea/harrietsfield-williamswood-wind-farm-project.asp>
- Canso Wind Farm (2006-05-19; inside the radius in any case): <https://novascotia.ca/nse/ea/cansowind.asp>

All other wind entries in the EA list from 2003-2017 match NRCan installed projects by name or place.

## Withdrawn / rejected / void
- Wind / Hydro Energy Project, Cape Breton Explorations (Lake Uist; status "Null and void"): <https://novascotia.ca/nse/ea/CBWindHydro.asp>
- No wind project in the EA list has a rejected or withdrawn status. The registry may drop withdrawn registrations, so this is not proof that none exist.

## Built since the NRCan snapshot (installed layer)

Two farms, 25 turbines. A search of proponent, Canada Infrastructure Bank, IESO Nova Scotia and news
sources found no other Nova Scotia wind farm in operation since 2019, and no community-scale turbines
after COMFIT's last in 2016. IESO Nova Scotia's existing wind (645 MW in its 2026 outlook, Table 2,
including Benjamins Mill) against NRCan's 621.8 MW leaves nothing large missing; this is a rough
check, not proof for small turbines.

### Higgins Mountain Wind Farm (17 turbines): Cumberland/Colchester. OPERATING
EA page: <https://novascotia.ca/nse/ea/higgins-mountain-wind-farm/>. Not in NRCan; NRCan "Higgins Mountain Riverhurst" is a different project from 2006.

| Source | Supports |
|---|---|
| [Decision](https://novascotia.ca/nse/ea/higgins-mountain-wind-farm/hmwf-decision.pdf); project page | Registered 15 Mar 2023; approved 4 May 2023; up to 17 turbines, up to 195.5 m tip, 5.9-7 MW each |
| [Appendix O-Q](https://novascotia.ca/nse/ea/higgins-mountain-wind-farm/hmwf-ea-registration-appendix-o-q.pdf#page=2), Appendix O Shadow Flicker, WindPRO "SHADOW - Main Result" WTG table ("Higgins - Real Case - Dec 2022"), PDF p. 2 | **Mapped coordinates**, rows 1-17, UTM (north) NAD83 Zone 20, whole metres. Identical in the worst-case run (p. 14) and the Appendix P "DECIBEL - Main Result" table (Jan 2023, p. 30). Representative model Siemens Gamesa SG 6.6-170, hub 110.5 m |
| [Appendix N](https://novascotia.ca/nse/ea/higgins-mountain-wind-farm/hmwf-ea-registration-appendix-n.pdf), Strum EMI letters (15 Feb 2022), Table 1 | **Superseded; not mapped.** An earlier 18-turbine layout (WTG1-18, 110 m hub, 160 m rotor) with different numbering and positions |
| [Elemental Energy, Spring 2026 project update](https://elementalenergy.ca/wp-content/uploads/2022/04/202605-Higgins-Wind-Project-Update_FINAL.pdf) | "a 17 turbine / 100 MW wind project"; "As of May 1st 2026, the project has entered the operations phase" (the map's status date). 100 MW / 17 is about 5.9 MW each, so the built turbines are not the EA's representative model: hub and rotor are left null |
| [Elemental project page](https://elementalenergy.ca/project/higgins-mountain-wind/); [CIB project page](https://cib-bic.ca/en/projects/clean-power/higgins-mountain-wind-farm/) | COD in 2026; CIB: "Project complete", "17 wind turbines producing 100 MW". IESO Nova Scotia's 2026 outlook (section 3.2.1) still lists Higgins Mountain as expected in service by 31 December 2026, so the status says "by the proponent's account" |
| [Elemental signage map, January 2026](https://elementalenergy.ca/wp-content/uploads/2022/04/Higgins_Signage-Map_v0.6_20260120.jpg) | The site's turbine numbers, T1-T17. Each table row was matched to the nearest turbine symbol using the map's UTM ticks: all 17 one-to-one, each nearest symbol more than 3x closer than the next (`web/scripts/wind/conversion-check-built.txt`). The row number stays the id and label; the sign number is in the layout note. No position taken from the map |
| Sentinel-2 check (`site-review.txt`) | 17 pads with a bright centre on 24 Oct 2026 (S2C_20TMR_20261024), none in 2022. Ten on the tabulated position, three within 10-20 m, and four 40-130 m away (rows 17, 7, 5, 11): the turbines were micro-sited after the EA, and each point says how far its pad is |

### Benjamins Mill Wind Project, phase 1 (8 turbines): Hants County. OPERATING
EA positions 14, 15, 17, 18, 19, 20, 21 and 22, on the installed layer; the sources and the phase
split are under [Benjamins Mill](#benjamins-mill-wind-project-28-positions-hants-county-partly-built) above.

## Partly built
- **Benjamins Mill**: phase 1 (8 turbines, COD 2025-12-16) is on the installed layer; the 3 Minas Highlands positions (under construction) and the 17 unbuilt positions stay on the planned layer.

## No published coordinates / not EA-registered
- New Prospect Wind (Elemental Energy, near Parrsboro, 150 MW). In development, with the EA planned for 2026-2028; not in the EA registry: <https://elementalenergy.ca/project/newprospectwind/>
- Ellershouse 4 (Potentia, 2024 open house). Not in the EA registry: <https://www.potentiarenewables.com/wp-content/uploads/2024/05/03MAY2024_Ellershouse-4-OH-Boards_FINAL_for-print_v2.pdf>
- Westchester: see the lapsed table; no coordinate table was found in the documents checked.
- Federal registry (IAAC): no Nova Scotia onshore wind projects found. The only Nova Scotia wind item is the Regional Assessment of Offshore Wind Development (reference 83514), which has no turbine coordinates. Offshore wind (Wind West etc.) is out of scope.

## Sentinel-2 check

Every tabulated position (and the off-map Ellershouse 3 and Clydesdale Ridge tables) was checked in
Copernicus Sentinel-2 L2A imagery read from the Earth Search public archive (Element 84):
`web/scripts/wind/pad_check.py`, its log `pad-check.txt` (every scene id) and the by-eye review
`site-review.txt`. For each position it takes the latest scene from 1 Jul to 24 Oct 2026 that the
scene classification marks clear within 60 m, counts bare pixels (NDVI below 0.25) within 30 m
against a summer-2022 baseline, and finds the nearest bare 30 m disk within 300 m. A gravel turbine
pad fills most of the 29-pixel disk; forest leaves it empty. Calibrated on Benjamins Mill (11 pads
at 21-29 pixels, the other 17 positions at 0-3) and checked on Higgins Mountain (17 of 17 found).

- **What it decides.** Which positions are cleared, and how far a moved turbine's pad is. Every
  status line still comes from the proponent or a public record, and no position comes from the
  imagery. Notes on the map say what was measured ("a pad was cleared here by ..."), never that a
  turbine stands.
- **Limits.** 10 m pixels; smaller earth pads (Windy Ridge) and greening pads fall below the NDVI
  test, so they were reviewed by eye; thin cloud can pass the scene classification and read as
  vegetation loss (Kmtnuk T6, Ellershouse 3 position 5 in October; both clear in August); forestry
  cuts can do the same (Clydesdale Ridge WTG11, Sugar Maple). Every flag was looked at before use.
- **Results.** Pads at every Goose Harbour Lake and Weavers Mountain position; 11 of 28 at Benjamins
  Mill; 18 of 33 at Mersey River; 11 of 13 Wedgeport positions within 240 m of a pad; 32 of 49 at
  Windy Ridge; all 17 at Higgins Mountain. None at Bear Lake, Kmtnuk, Setapuktuk, Ocean Lake, Upper
  Afton, Aulds Cove, Rhodena, Eigg Mountain, Melvin Lake, Sugar Maple, Harbour Hills, Ellershouse 3
  or Clydesdale Ridge. Most Sugar Maple positions show a bright patch 20-30 m across in September
  2026, consistent with small pre-construction clearings such as geotechnical boreholes; not used.
- **Licence.** Contains modified Copernicus Sentinel data 2022-2026 (also in
  `web/public/wind/LICENCE.txt`).

## Not yet checked
- Westchester Addendum Appendix L (sound; image tables) and the original registration appendices, for coordinates. Low priority because the approval is possibly lapsed.
- Whether Bear Lake, Kmtnuk, Ellershouse 3, Westchester or Clydesdale Ridge holds an unpublished extension. Asking the EA Branch (ea@novascotia.ca) would settle it.
- The revised layouts for Mersey River (October 2023), Bear Lake (April 2025, 11 turbines) and Windy Ridge (June 2025, 47 turbines): none is published as a table. If one appears, its positions should replace the assessed ones.
- Projects bid into the 2026 Green Choice RFP that have not registered for EA.
- Per-turbine land check: only each project's centroid and first turbine were reverse-geocoded; the cluster spreads, turbine spacing and agreement with printed lat/lon make a gross error unlikely.
