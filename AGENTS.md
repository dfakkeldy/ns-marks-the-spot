# NS Marks The Spot

Two surfaces:

- `web/`: the main product, a React, TypeScript, Vite, and Leaflet map.
- `ns-marks-the-spot/` and `ns-marks-the-spot.xcodeproj`: the native Apple app.

A web task doesn't need native changes, and vice versa. `web/README.md` and
`ARCHITECTURE.md` cover the details.

## Commands

```bash
cd web
npm ci
npm test
npm run lint
npm run build
```

Tests don't prove layout or interaction. When a change affects what the map
shows, check it in a browser, including at phone width.

## Evidence rules

The map is a screening and research tool, not legal proof.

- Keep every source's identity and provenance visible. Distinguish official
  records, project-derived layers, and user-loaded files.
- Never invent or interpolate a PID, civic address, parcel match, owner,
  access right, value, flood probability, or site condition.
- Keep `returned-empty`, `outside-coverage`, `unsupported`, `source-error`,
  `licence-blocked`, `boundary-ambiguous`, and similar states distinct. An
  empty or failed response is not evidence of absence.
- Keep evidence attached to its own identifier and date; don't promote one
  kind of evidence into another.
- Keep licence gates, attribution, accuracy caveats, and source links in the
  UI.
- User-loaded maps and browser location stay in the browser.
- Historical-map sheets are accepted on geographic and numerical fit. Rejected
  sheets stay rejected.

## Publishing

KinNoKi Labs serves a separately pinned copy of `web/`. Merging here doesn't
update that pin or deploy anything. Don't call the site deployed without
checking the live `source.json` receipt and the rendered page.

Frozen inputs read with `git show <rev>:<path>` must be pinned to a commit on
the target branch's own history (normally the squash-merge commit), never to
a PR-branch commit. Land the inputs first, then pin them in a follow-up PR.

## Branches

`feature/*` → `nightly` → `weekly` → `main`. Feature PRs target `nightly`.
Hotfixes branch from `main` and are merged back down. Open promotion PRs only
when asked.
