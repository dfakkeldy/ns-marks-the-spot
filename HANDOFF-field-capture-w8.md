# Handoff — field capture W8 (photo storage + attach + display)

## 2026-08-30 — W8 implemented, live-verified, PR opened

Done: DB_VERSION 3 (photos store + by-layer index, live-upgraded in the
browser with data preserved), pinned exifr, contract photo pipeline
(2048/256 JPEG re-encode strips EXIF incl. GPS; unsupported-image distinct),
UserPhotoStore + sweeps (layer delete + per-commit via putVectorLayer),
usePhotoManager (LRU object URLs, caps 20/500, per-file outcomes, transient
GPS out), PhotoStrip + use-photo's-location offer, PhotoLightbox, popup
thumbnails, hollow map indicator + "· photo" tooltip, session
setFeaturePhotos/moveFeaturePoint + reconcile Point-move case (realMount
pinned). Live proof: attach → thumb → lightbox → remove w/ blob cleanup.
Next: W9 (KMZ with embedded photos + bulk EXIF placement) closes the web
roadmap; then the iOS N1-N3 mirror.
Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch: feature/web-field-capture-w8
Read docs/field-capture-design.md, then implement PR W9 from its roadmap
table on a fresh branch off nightly.
```
