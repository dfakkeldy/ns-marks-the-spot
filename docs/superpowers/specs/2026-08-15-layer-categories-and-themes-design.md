# Layer Categories and Customizable Themes Design

**Status:** Approved for implementation planning

**Date:** 2026-08-15

**Initial surface:** Web map

**Later surface:** Native iPhone app through stable identifiers and parity fixtures

## Product decision

NS Marks The Spot is a general-purpose Nova Scotia map. Tax-sale research is
one optional use of the map, not the map's default identity. The web map will
therefore organize its controls into collapsible categories, start with all
tax-sale functionality off, and offer editable themes that configure the map
for common jobs.

Categories answer **where a control belongs**. Themes answer **how to set up
the map for a job**. A layer has one permanent category, while a theme may use
layers from several categories.

The first release includes immutable built-in themes and locally saved custom
themes. Users can adjust any applied theme. Existing share links exchange the
exact configured map state. Dedicated theme-package import/export and
cross-device theme syncing are deferred until a real partner-distribution need
exists.

## Goals

- Make the map approachable for general exploration rather than presenting it
  as a tax-sale product.
- Replace the long layer list with predictable, collapsible categories.
- Put every tax-sale control, filter, record mode, and overlay behind one
  explicit default-off Tax Sale category.
- Provide useful built-in setups for exploration, tax-sale research, forestry,
  historical maps, and georeferencing.
- Let users save, rename, update, duplicate, and delete custom themes locally.
- Preserve existing layer identity, provenance, licence gates, rendering order,
  GeoPDF privacy, and exact share-link restoration.
- Establish a portable category/theme contract the iPhone app can adopt later
  without delaying its current parity port.

## Non-goals

- No accounts, server-side theme storage, or cross-device synchronization.
- No dedicated theme files or partner-branded theme packages in the first
  release.
- No imported GeoPDF, raster, or vector bytes embedded in a theme.
- No theme-controlled licence acceptance or location permission.
- No native-app implementation in the first web task.
- No rewrite of map renderers, data services, share URLs, or layer source
  metadata.
- No hiding or moving layers based on the selected theme.
- No theme lock-in: every applied setting remains editable.

## Information architecture

Every supported layer belongs to exactly one category. Categories organize the
panel only; map drawing order remains an independent rendering-safety rule.

| Category | Current contents and responsibility |
| --- | --- |
| **Background Maps** | Modern map and NS Aerial. |
| **Land & Property** | NS Property Boundaries, Crown Lands, Buildings, and municipal zoning layers. |
| **Roads & Places** | Roads, Trails & Culverts, Main Roads, and Place Names. |
| **Water & Terrain** | Water Features, Waterfalls, Watersheds, Contours, and the Inverness micro-hydro pilot. |
| **Environment & Hazards** | Published river flood zones, coastal-flood scenarios, environmental-health screens, surficial aquifers, and well logs. |
| **Forestry & Ecology** | Old-growth policy areas and future forestry/ecology layers. |
| **Geology & Resources** | Mineral occurrences, mineral tenure, abandoned mines, and mineral-proximity parcels. |
| **Historical Maps** | Fletcher, Church county maps, and future historical collections. |
| **Tax Sale** | Master enablement, Current Notices/Historical Records mode, event controls, filters, property lists, dated provenance, and tax-sale-specific parcel presentation. |
| **My Maps** | Add/import controls, user GeoPDFs, images, vectors, opacity, registration state, and georeferencing actions. |

Each category heading shows its name, expansion control, and a concise summary
such as `3 on`, `Off`, `Add`, or an availability warning. Categories that
contain active items may show an active count while collapsed.

Layers never appear in multiple categories. A theme may combine Forestry &
Ecology with Background Maps, Land & Property, Roads & Places, and Water &
Terrain without changing where any of those controls live.

## Built-in themes

The first release includes five immutable themes.

| Theme | Applied composition |
| --- | --- |
| **Explore Nova Scotia** | Enable `modern`; disable all catalogue overlays and Tax Sale. Prefer Background Maps expanded. |
| **Tax Sale Research** | Enable `ns-aerial`, `nsprd`, `roads`, `water-features`, and `buildings`; disable `modern`; enable Tax Sale in Current Notices mode. Prefer Tax Sale and Land & Property expanded. Historical records remain off until selected. |
| **Forestry & Field Access** | Enable `ns-aerial`, `nsprd`, `crown-lands`, `roads`, `water-features`, `contours`, and `old-growth-policy`; disable `modern`. Prefer Forestry & Ecology, Land & Property, Roads & Places, and Water & Terrain expanded. |
| **Historical Maps** | Enable `modern`, `fletcher`, `place-names`, and `main-roads`; disable `ns-aerial`. Prefer Historical Maps and Roads & Places expanded. If Fletcher is unavailable, apply the other three settings and report the reason. Church layers remain off. |
| **Georeferencing** | Enable `modern`, `place-names`, and `main-roads`; disable `ns-aerial`. Prefer My Maps, Background Maps, and Roads & Places expanded. Imported-map visibility remains under user control. |

Applying a theme replaces the current built-in-layer composition rather than
accumulating settings from the previous theme. It does not delete, hide, or
change imported map contents.

Built-in themes cannot be overwritten. Once the user changes a map-affecting
theme field—catalogue-layer visibility, supported catalogue-layer opacity, Tax
Sale enablement, or tax-sale mode—the theme label gains `Modified`. Event
filters, imported-map controls, map navigation, and category expansion do not
affect theme matching. The user may reset the theme or save the composition as
a custom theme.

Theme validation permits at most one opaque background map. A built-in theme
uses each layer's catalogue opacity unless it declares an explicit override.

## Custom themes

A custom theme captures the map-affecting configuration the user explicitly
chooses to save:

- stable theme ID and user-supplied name;
- visible catalogue-layer IDs;
- supported opacity overrides;
- preferred expanded category IDs;
- Tax Sale enabled/disabled;
- current or historical tax-sale mode.

A custom theme does not capture:

- selected PID, inspector contents, evidence results, or search text;
- map centre, zoom, or browser location;
- current tax-sale event IDs;
- municipality, year, outcome, or property-list filters;
- licence acceptance or location permission;
- imported-map bytes, browser object references, or file paths.

Dated event selections and filters remain transient/share-link state so a
theme cannot silently point at an auction that has become historical. Imported
maps remain local device content. A custom theme configures the catalogue
layers around them but does not redistribute or remove them.

Custom themes can be saved, renamed, updated, duplicated, and deleted. Category
expansion is a suggested starting layout captured at save time. Opening or
closing a category later is panel navigation and does not mark the theme as
modified.

## Layer-panel interaction

Search remains above the layer controls. A compact **Map setup** control appears
below search and above the categories. It shows the active theme, a short
description, and a menu containing:

- all built-in themes;
- locally saved custom themes;
- **Save current setup as…**;
- **Manage themes**;
- **Reset current theme** when the map is modified.

An ordinary expanded category shows compact layer rows with:

- layer name and switch;
- one-line caveat or useful-scale guidance;
- live status such as loading, ready, zoom required, blocked, or unavailable;
- a collapsed **Source & scale** disclosure for date, scale, coverage, zoom
  range, attribution, and official-source links.

The full provenance remains available beside the switch without forcing every
row to display a metadata block at all times.

On a phone, **Map setup** opens the same information architecture in a map
sheet. Opening a category presents one focused section with a Back control
rather than one extremely long nested scroll. The map stays visible behind the
sheet, and toggling a layer does not unexpectedly dismiss it.

## Tax Sale category

Tax Sale has an explicit master control: **Show tax-sale information**.

When it is off:

- current and historical tax-sale geometry is not requested;
- no tax-sale bounds fit occurs;
- tax-sale parcel styling is absent;
- event and historical-record selections are cleared;
- tax-sale-specific inspector content is hidden;
- an independently selected PID remains selected as an ordinary parcel.

The first visit and the Explore Nova Scotia theme keep this master control off.
The Tax Sale Research theme is an explicit opt-in: it turns the master control
on and selects Current Notices.

When enabled, the category reveals the existing Current Notices/Historical
Records mode, municipality and event selection, filters, property lists,
source dates, and verification warnings. All tax-sale-related controls move
into this category; no separate top-level tax-sale mode switch remains.

## My Maps category

My Maps is always present. When empty it offers **Add a map**. Imported GeoPDFs,
images, and vectors appear as normal rows with visibility, opacity,
registration status, and map-specific actions.

Applying or resetting a theme never deletes an imported map, changes its
registration, or embeds it in theme storage. The Georeferencing theme opens My
Maps and prepares useful surrounding reference layers; it does not decide
which imported map should be visible.

## Data model and persistence

A theme is a small versioned configuration. It references catalogue and
category IDs and contains no executable code, source URLs, or copied catalogue
metadata.

Built-in themes live in version-controlled web data. Custom themes use
one versioned `localStorage` document reserved for the theme library. The
small, bounded preference data does not share the IndexedDB stores used for
imported maps. Storage remains account-free and does not alter the existing
user-map privacy contract.

The storage reader validates the outer schema, theme identity, names, layer
IDs, category IDs, opacity values, and tax-sale mode. Unknown or removed IDs
are skipped. A partially obsolete theme may still apply its valid settings and
must report what could not be restored. Corrupt storage does not crash map
startup. The app does not overwrite or delete the raw invalid value
automatically; it reports that the custom-theme library could not be loaded and
falls back to Explore Nova Scotia for the session.

## Startup, theme application, and sharing

Startup follows this precedence:

1. Parse the address-bar share state.
2. If the URL explicitly carries shared map state, restore it exactly and label
   it **Shared setup** unless it exactly matches a known theme.
3. Otherwise apply Explore Nova Scotia.
4. Do not fetch or fit tax-sale geometry while Tax Sale is off.

Theme application is one coherent state transition. React must not briefly
apply intermediate visibility combinations that fetch layers from both the old
and new themes.

Share links remain exact state receipts. They continue to carry visible
layers, tax-sale state and dated selections, selected parcel, and map position.
They do not depend on the recipient having a custom theme with a matching name
or ID. A share link that exactly matches a built-in theme may display that
theme name; otherwise it displays **Shared setup** or **Modified**.

New links add an explicit Tax Sale enabled/disabled field. For backward
compatibility, the parser treats a legacy shared link that has `mode` or
`event` but lacks the new field as Tax Sale enabled, matching the behaviour of
the map version that created it. A newly generated general-purpose link writes
Tax Sale disabled explicitly. A URL with none of the recognized share-state
fields is a first visit and receives Explore Nova Scotia.

Themes do not reposition the map in the first release. Existing explicit
actions—such as selecting a tax-sale event or choosing an imported map—may
offer or retain their own zoom-to behaviour. Share links continue to restore
the exact map position.

## Licensing and unavailable layers

Theme application never bypasses a licence gate.

If a theme requests restricted Province layers:

1. collect the requested restricted layers;
2. if acceptance is not already stored, present the existing licence decision
   once;
3. on acceptance, apply the complete validated theme;
4. on refusal, apply the unrestricted portion and clearly list the requested
   layers that remain off.

Rights-pending, hosting-pending, unsupported, and failed sources remain
distinct. An unavailable historical layer does not prevent the rest of the
Historical Maps theme from applying. The category and affected row explain the
specific reason rather than silently changing the theme.

## Web architecture

The web implementation has five bounded responsibilities:

1. **Category registry** — category IDs, names, descriptions, and order; every
   supported catalogue layer maps to one category.
2. **Theme registry** — immutable built-in definitions and validation against
   current catalogue/category IDs.
3. **Theme application logic** — a pure conversion from validated theme plus
   licence decision to one complete map-state update and an exact, modified, or
   partially blocked result.
4. **Custom-theme repository** — browser-local schema versioning, migration,
   validation, save, update, rename, duplicate, and delete.
5. **Layer-panel presentation** — theme picker, category summaries, ordinary
   layer rows, specialized Tax Sale section, and My Maps section.

Existing map renderers, services, stable layer IDs, source metadata, drawing
order, licence checks, GeoPDF storage, and share-state serialization remain the
authoritative subsystems. The theme system orchestrates them rather than
replacing them.

## Native portability

The initial implementation changes only the web product. It exports category
and built-in-theme JSON fixtures using the stable layer IDs already shared with
the native parity catalogue. The fixtures are generated from the web
registries rather than maintained as a second hand-written source. The active
iPhone parity project is not modified or blocked by this work.

When native theming begins, Swift adopts the same identifiers and verifies its
definitions against the exported fixtures, following the existing layer-
catalogue parity pattern. Native custom-theme storage is a later surface-
specific implementation; dedicated theme transfer between web and iPhone is
not implied by identifier parity.

## Accessibility and responsive behaviour

- Category headings are real buttons/disclosures with expanded state and
  concise accessible summaries.
- Active counts and failure states are expressed in text, not colour alone.
- Theme selection and modification status are announced to assistive
  technology.
- Keyboard focus remains visible and follows the opened phone/desktop section.
- A licence prompt returns focus to the theme control or affected category.
- The Tax Sale master control has an explicit accessible relationship to the
  controls it reveals.
- Desktop and phone use the same labels and state model.

## Verification and acceptance

### Pure model tests

- Every supported layer appears in exactly one category.
- Every built-in theme references valid layer and category IDs.
- Explore Nova Scotia always has Tax Sale off.
- Tax Sale Research explicitly enables Tax Sale in Current Notices mode.
- Theme application produces one coherent state and never changes imported-map
  contents.
- Unknown, removed, unavailable, and licence-blocked layer IDs yield safe,
  explained partial results.
- Custom-theme schema migration and corrupt-data fallback are deterministic.

### Integration tests

- A first visit performs no tax-sale geometry request and no tax-sale fit.
- Existing share links restore exactly and override the default theme.
- Applying, modifying, resetting, saving, renaming, updating, duplicating, and
  deleting themes updates the panel and URL correctly.
- Licence acceptance applies the requested complete theme; refusal applies only
  the unrestricted subset and reports the blocked layers.
- Turning Tax Sale off clears tax-sale state without clearing an independently
  selected parcel.
- Applying or resetting themes neither deletes nor embeds imported GeoPDFs.
- Exported category and theme fixtures remain compatible with stable layer IDs.

### Rendered browser acceptance

- Desktop and phone category navigation are usable without a wall of expanded
  metadata.
- Category counts, theme modification status, Tax Sale shutdown, licence
  partial application, and return to Explore Nova Scotia are visually clear.
- The phone sheet keeps the map available and does not dismiss unexpectedly on
  ordinary layer toggles.
- The first-load network record contains no tax-sale parcel request.
- An imported GeoPDF remains intact and controllable across theme changes.

## Implementation boundary

The first implementation is complete when the web map has categorized layer
controls, the five built-in presets with editable applied state, local custom
themes, a genuinely default-off Tax Sale category, compatible share links,
exported portability fixtures, and passing model/integration/rendered-browser
acceptance.

Partner-branded configurations, custom-theme files, cross-device sync, and the
native theme UI are separate future designs. A Cape Breton Private Land
Partnership setup may later be added as a built-in or distributable theme after
the organization has an actual package and support requirement; it is not
silently generalized into first-release infrastructure.
