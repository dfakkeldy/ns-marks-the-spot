# Unconfirmed app queries and reproduction

This change holds uses whose applicable permission has not been established. It does not declare a source illegal or impose a country restriction. Source links, attribution and local user records remain available. Reopening a held use requires matching the exact source and intended use to a documented grant and reviewing the candidate that implements it.

| Source/use | Native | Web |
| --- | --- | --- |
| Inverness County, Victoria County, Richmond County and Cumberland County zoning | No app query or cached/retained display; no reproduction | Same query/render/export lock; official by-law links remain |
| Province restricted raster services and NSPRD-derived parcels/property records | Viewing clearance remains separate; no exported pixels, geometry or evidence files | Restricted original sources remain held; verified OGL dataset replacements remain usable |
| Fletcher historical mosaic | Approved free native viewing/offline paths remain; PDF/pixel reproduction held | Historical image reproduction held; viewing remains |
| Old Growth Forest Policy, HRM/Halifax zoning and documented open data | Existing permitted paths remain | Existing permitted paths remain |
| User-drawn/imported/recorded material | Ordinary exports remain; NSPRD-traced features and originals containing them are held | Ordinary exports remain; GeoJSON/KML/GPX/KMZ traced output held; raw-recording API requires recording provenance |

The four municipal IDs are `zoning-inverness`, `zoning-victoria`, `zoning-richmond` and `zoning-cumberland`. Public accessibility or a general display term is not treated as an established app query/cache/redistribution grant. The lock preserves each catalog entry and official source/by-law links.

The native restricted set is derived from the source catalog, including `mineral-proximity-parcels` (which has no ordinary licence field but requires Province clearance). Its 16 IDs are `ns-aerial`, `nsprd`, `crown-lands`, `flood-risk`, `waterfalls`, `water-features`, `roads`, `buildings`, `place-names`, `main-roads`, `contours`, `published-river-flood-zones`, `arsenic-risk-wells`, `manganese-risk-wells`, `surficial-aquifers` and `mineral-proximity-parcels`.

The web uses nine separately documented OGL replacements for `crown-lands`, `flood-risk`, `waterfalls`, `water-features`, `roads`, `main-roads`, `place-names`, `contours` and `buildings`. The exception checks the actual open-data format and datasets against [the recorded OGL metadata receipt](../web/src/data/openLayerSources.json) and [replacement mapping](../web/src/layers/openDataSources.ts). The same ID on an old restricted raster does not inherit that exception. Native endpoints have not been replaced by this change.

## Enforcement

- Catalog/viewport/query guards refuse municipal use before constructing a request, clear retained display features, retire in-flight requests and report a permission state separately from an empty response or outage.
- Native whole-frame rendering, compositor, export-tile and tile-provider entry points check reproduction independently of viewing acceptance, before cache/network/render work. Fletcher source identity survives an aliased presentation ID.
- PDF/evidence exits check retained parcel arrays, feature/marker source IDs and property-record/appendix provenance, independently of visible switches. The pure on-device evidence-note formatters remain available; the app's current file/share/print exits are held.
- Browser print media always suppresses the live app shell. A locked preview mounts no printable map or evidence document. GeoPDF construction, direct composition and dialog/file-write entry points also refuse restricted material.
- Vector interchange checks the exact `nsmts:traced = nsprd-parcel` value. Local storage uses a separate serializer and keeps records intact. Native original-file sharing checks the stored file independently of an edited row or untraced sibling, including secondary archive documents and XML provenance before geometry filtering. Unreadable provenance or unsupported nested vector containers fail closed. No originals are deleted.

## Evidence and separate release gates

The native restricted catalogue and web source replacements were inspected at Nightly `96b712de34317598cfa42e0e266c2dae4ed82b7f`. Relevant public terms include the [NSPRD restricted map-service licence](https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf), [Nova Scotia OGL](https://support.novascotia.ca/services/open-data-portal-licence), [Old Growth official dataset metadata](https://data.novascotia.ca/api/views/wanf-acts.json), [HRM open-data licence](https://data-hrm.hub.arcgis.com/pages/open-data-licence), and [Rumsey copyright/permissions terms](https://www.davidrumsey.com/about/copyright-and-permissions). Attribution is preserved and is not used as a substitute for a reproduction grant.

The owner-reviewed Fletcher request/reply includes free native iPhone use, offline bundling and public derived tiles for the matching 1884 Cape Breton set. This lock does not reopen that settled scope; reproduction and any later paid use remain distinct. The municipal and Province locks are conservative product choices pending exact scope evidence, not final legal attestations.

The separate NSPRD disclaimer/disclosure-version proposal is not included here. Its licence markdown, store, sheet and document-test paths are reserved for the existing source/build owner. Correct licence presentation and persisted-acceptance migration remain candidate gates before release. Signed candidate identity, native/UI verification and App Store declarations remain separate from this draft change. No site pin, privacy policy, availability, price, submission or release is changed.
