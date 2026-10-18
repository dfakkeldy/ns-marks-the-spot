# PVSC residential dwelling evidence — design

**Date:** 2026-07-23 · **Status:** approved in conversation (user: "okay, let's do it")

## Problem

The parcel sheet's "Mapped buildings" count comes from the NSTDB 1:10k Buildings
theme, which is compiled from aerial photography and misses recent construction
for years (verified live: a 2018 house absent on one parcel; one undated point
where two dwellings exist on another). PVSC's open **Residential Dwelling
Characteristics** dataset (`a859-xvcs` on thedatazone.ca) is assessment-driven,
knows about new construction promptly, and carries per-dwelling detail (year
built, style, living area, living units, bathrooms, garage, under-construction
flag). Surfacing it answers "is there actually a house here?" — the question
the NSTDB count cannot.

## Approach

Chosen: **separate service + separate App state chained on the assessment
result** (matches the app's one-service-per-dataset structure and its
each-source-reports-its-own-failure evidence pattern).

Rejected: extending `fetchParcelAssessments` to also fetch dwellings (couples
two datasets into one atomic success/failure, muddies an existing tested
contract); fetching inside `ParcelInspector` (App owns data fetching; the
inspector stays presentational).

## Components

1. **`web/src/services/pvscDwellings.ts`** — `buildDwellingQueryUrl(aans)`
   (Socrata `$where=aan in(...)`, ordered `aan, year_built DESC`),
   `fetchDwellingCharacteristics(aans, signal)` returning
   `PvscDwellingAccount[]` (`{ aan, dwellings: PvscDwelling[] }`, dwellings
   sorted newest-built first, unparseable rows dropped). Residential dataset
   only; commercial (`9ac6-zg6i`) is a noted follow-up.
2. **App state** — `DwellingState` (`idle | loading | error | ready(value)`),
   driven by an effect watching `assessmentState`:
   - assessment `ready` with accounts → fetch dwellings for those AANs
   - assessment `ready` with 0 accounts → `ready([])` without a request
   - assessment `error` → `error` (dwellings need an AAN to query)
   - abort handling identical to sibling evidence effects.
3. **`DwellingDetails` section in `ParcelInspector`** — after
   `AssessmentDetails`: per-AAN dwelling rows (built year, style, living area,
   living units, bathrooms, garage, under construction). Bounded-claim copy:
   records are assessment records, not a building census; absence proves
   nothing; multi-unit parcels can repeat living-unit totals across records
   (dataset caveat), so no summed "building count" is ever claimed. Source
   link + PVSC open-data attribution (dataset updated 2026-01-12, same
   refresh as the assessment dataset).
4. **Evidence export** — `evidenceNote.ts` gains a dwellings section with the
   same honesty lines; the export-readiness gate waits for dwelling evidence
   the way it waits for assessment evidence.

## Testing

TDD throughout: `pvscDwellings.test.ts` (URL builder, parsing, grouping,
sorting, error paths); `App.test.tsx` (dwellings render for a selected parcel
with accounts; dwelling-fetch failure shows bounded copy without hiding
assessments; export waits for dwelling evidence). Inspector rendering is
covered through App tests, as with `AssessmentDetails`.

## Docs

`web/README.md` data-source notes gain the dwelling dataset alongside the
existing PVSC assessment entry.
