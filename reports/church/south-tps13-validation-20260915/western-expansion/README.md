# Western island expansion of frozen south validation

Two new physical checks extend the unchanged TPS13 batch to **five checks, 144.60 m ground RMS**. Their own RMS is **161.44 m**: Susannah Point on Port Hood Island 192.46 m, and the eastern Fishery Point corner on Henry Island 122.83 m. The preserved accepted baseline gives 318.87 m and 537.98 m respectively. No fitting, promotion or coordinate change followed these first scores.

The new-two median is 157.64 m, empirical P95 188.98 m, maximum 192.46 m, bias +105.95 m east / -49.66 m north, and scatter 111.23 m. These use the existing ground-distance and linear sample-percentile conventions; uncertainty is not subtracted. Both points are outside the thirteen-control hull and are only about 3 km apart, so they supply two local western-coast checks, not full regional coverage.

## Identity before measurement

The original JP2 was hash-verified before new crops. The broad context shows Smith’s Island opposite Port Hood town and Henry Island southwest. Public name records identify **Port Hood Island** and **Henry Island**; similarly named unincorporated-area records are excluded from the island identity selection. No name point or inverse-fit prediction supplies a measurement.

- **IS37:** The source’s west-side concavity terminates in the southwest shoulder labelled Susannah Point. The selected clean outer-shore corner is the island’s western extremum. Original WACOIS10 **20913 v32** is the corresponding modern western longitude extremum. The modern coast is rounded, with that vertex slightly north of the lower turning tip. It is not a synthetic sharp apex. The source’s long southern Portsmouth spit is a different feature.
- **IS38:** The Henry coast reaches an upper eastward corner beside Fishery Point, then retreats west into a small southeast recess before the lower southern corner. The source crosshair is on the upper visible corner. Original WACOIS10 **22576 v5** is the unique eastern longitude extremum. The printed panel edge obscures the western coast, so the incomplete outline is never closed by inventing a shore.

Whole-island source centroids were considered but not adopted: dense property/shore ink affects Port Hood’s northern/eastern outline, and the printed edge obscures Henry’s west coast. These unscored alternatives remain documented; the chosen extrema were fixed before scoring.

## Original reference categories and history

The existing original-water extract contains **4,435 features**, bbox `-61.65,45.94,-61.08,46.30`, EPSG:4326. `reference-receipt.json` preserves its exact source, date and hash. Neither clipping nor simplification was applied.

The first Port Hood polygon search using only WACOIS10 could not close the exterior. The original full island also includes WACOIS15 **22915 and 22916**, explicitly described as **Coastal Island Indefinite**. Those original segments complete the reference context; they are not invented joins. The adopted point itself is on a WACOIS10 segment. The original incomplete search and corrected category-aware packet are both retained. Henry’s exterior closes with its original WACOIS10 features. The verifier checks the extrema against those complete original exteriors and their original segments.

`previous-published.json` pins the original three observations, first results, controls and CSV prefix to nightly ancestry commit `0abc8bf4c985c0238132efdb3e4afc2cc775cf54`. Their first accuracy/status/verification snapshots remain under `../snapshots/`. The original freeze, selected TPS13 controls, all prior model trials and accepted July baseline remain unchanged.

## Actual raster and terrain

The two inspected source positions have nonzero alpha in the same frozen GeoTIFF. The source’s clipped western Henry shoreline remains clipped; the visible eastern check does not reconstruct the missing side. Two actual-raster/reference windows retain the discrepancies, and browser 2D/10× terrain comparisons use only the persisted TPS13 at 70% opacity. Terrain is context, not a coordinate measurement. The original full-content alpha/distortion checks apply to the unchanged raster bytes.

`coverage-overview.jpg` marks thirteen controls and five fresh reference positions on the actual raster, making the remaining northern gap explicit. No observation was measured from that overview.

The five-check total remains sparse and lacks fresh northern/intervening coverage. No whole-panel acceptance, full-island accuracy claim, activation, tiles or deployment follows. David Rumsey Map Collection / Stanford Libraries imagery retains the recorded CC BY-NC-SA 3.0 terms; original provincial geometry and Mapzen terrain retain their provenance.
