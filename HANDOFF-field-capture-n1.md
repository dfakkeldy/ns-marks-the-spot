# Handoff — field capture N1 (native recording core)

## 2026-08-30 — N1 implemented; gated verification pending the build window

Done: GeoCore `Capture/` (CaptureSpec pinned by FieldCaptureParityTests
against the shared fixture incl. the kmz block copied verbatim from W9,
TrackFix, TrackFilter + TrackSimplify, TrackRecording state machine,
TrackFeature + defaultTrackName, MarkFeature + 10 s/50 m freshness rule,
TrackGpx raw writer), GpxParse trkpt `<time>` →
`coordinateProperties.times` (null-padded, togeojson convention),
VectorEdit.convertingPoints + conversionPlan (array order, dedupe,
ring-close, self-intersection warn, traced inheritance), recorded
source/origin + UserVectorLibrary v2 + the UserVectorStore write-stamp fix,
app TrackRecorder (@Observable CLLocationManager shell, idle-timer
discipline, scene-phase auto-pause with message), TrackRecordingHUD,
SaveTrackSheet (presets, live before/after counts), MarkLocation +
mark-into-session-else-Field-notes, convert section + one-shot undo +
dashed conversion preview, raw-GPX original labeled "Raw recording (GPX)",
GPS callout line "Marked from GPS on this device (±N m)".

Verification state: `swift test` (GeoCore incl. parity), the app build, the
focused `FieldCaptureStoreTests` simulator suite, and live simulator checks
run when the xcode-build-slot window opens (22:00); all code is written to
the contract in docs/field-capture-design.md.

Next: N2 (attributes, photos, KMZ) stacks on this branch; N3 (snapping +
photo map) stacks on N2. Retarget each PR to nightly as its predecessor
merges. W9 (#279) merges when its CI is green; this branch's fixture bytes
are identical to W9's, so the merge is clean either way.

Resume:
```
Worktree: /Users/dfakkeldy/.t3/worktrees/ns-marks-the-spot/t3code-eaf0bbfa
Branch: feature/ios-field-capture-n1
Read docs/field-capture-design.md; N2 = attributes editor + photo pipeline
(2048/0.8 + 256/0.7 re-encode strips EXIF, caps 20/500/50 MB), photo files
under the store directory + sweeps, ZipArchive writer (doc.kml DEFLATE,
jpgs STORED), KML ExtendedData, KMZ export/import with re-minted ids,
Info.plist camera/photo strings.
```
