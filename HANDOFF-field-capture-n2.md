# Handoff — field capture N2 (attributes, photos, KMZ)

## 2026-08-30 — N2 implemented; verification in progress (off-hours build authorized)

Done: GeoCore PhotoDescriptor (strict all-or-nothing reader, KMZ string
form, caps 20/500/50 MB), PhotoPipeline (ImageIO 2048/0.8 + 256/0.7
re-encode strips ALL EXIF incl. GPS; captureClaims reads DateTimeOriginal +
GPS before the strip; tooLarge/unsupportedImage distinct), ZipArchive
writer (STORED jpgs, raw-DEFLATE doc.kml, table CRC-32), KML ExtendedData
(all nsmts: keys except photos in plain KML; nulls skipped; JSON-stringified
structures; traced provenance note on the Document), KMZ export
(CDATA description + img width 400, KMZ-form descriptors with href,
missing bytes dropped and counted) and KmzParse.parseWithAssets +
KmzRelink (re-minted ids, img-strip, missing/undecodable/capped distinct),
VectorEdit.updatingProperties. App: UserVectorStore photo files
(photos/<layerID>/<photoID>.jpg + .thumb.jpg, sweeps on replace/delete/
orphan-sweep), session attachPhotos/removePhoto/updateFeatureProperties +
photo-location offer, FeatureAttributesEditor (reserved/nsmts: refused,
strings stored, complex read-only), FeaturePhotoStrip (camera +
PhotosPicker, caps named, lightbox), callout thumbnails, KMZ export menu
item + honest GeoJSON/KML note + shortfall report, KMZ import relink with
distinct notes, Info.plist camera/photo strings in both pbxproj configs.

Next: verify N1 (swift test, app build, focused sim suites, live check),
push + PR N1 → nightly; rebase this branch, same gates, PR N2 with base n1;
then N3 (snapping + photo map) on a branch off n2.

Resume:
```
Worktree: /Users/dfakkeldy/.t3/worktrees/ns-marks-the-spot/t3code-eaf0bbfa
Branch: feature/ios-field-capture-n2
Read docs/field-capture-design.md; N3 = ParcelQuery envelope +
ParcelFetcher (maxSnapParcels fail-closed), SnapEngine (ownFeature|parcel
only, vertex-first, 15 pt), session integration + caveat + nsmts:traced at
snap time, PhotoLibraryIndex (PHPersistentChangeToken, z15 buckets),
photo-map My Maps row (granted/limited/denied), 500-annotation viewport cap.
```
