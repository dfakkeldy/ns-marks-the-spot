# GeoPDF browser acceptance receipt — blocked

Date: 2026-07-28

Current integrated commit: `bcc3f8e49bbedfbebc22ce60e86d406fc3d1a280`

Chrome compatibility commit: `bbc6bf5b21569195b44e020a873fd7530208dd29`

Decision: **BLOCKED**

This continuation cleared the previously blocked real-USGS Chrome uploads,
completed the rendered Firefox and desktop Safari matrices, and fixed a
confirmed 320 CSS-pixel chooser overflow. It did not satisfy the separate
performance, cleanup, network-body, durable-screenshot, or physical-device stop
rules. The feature is not fully browser-accepted, deployed, promoted, or
shippable.

## Artifact and publication boundary

PR #180 had already squash-merged the earlier GeoPDF implementation before the
real-USGS follow-up commits existed.

- PR #181 integrated `c9ceb4d78` and `ccb53aa07` into `nightly` at
  `bbc6bf5b21569195b44e020a873fd7530208dd29`.
- The full Chrome compatibility rerun below used an exact detached build of
  that SHA.
- That run reproduced a separate phone-width overflow caused by a long
  underscore-delimited filename. PR #182 added one wrapping declaration and a
  focused regression, then merged into `nightly` at
  `bcc3f8e49bbedfbebc22ce60e86d406fc3d1a280`.
- The corrected 320×640 Chrome case and the complete Firefox/Safari matrices
  used an exact detached build of the current integrated SHA.

The older Chrome matrix is exact evidence for `bbc6bf5b…`, not exact proof of
the later CSS-only `bcc3f8e49…` artifact. No deployment or promotion to
`weekly` or `main` was performed.

## Chrome 150

The Chrome extension delivered file-chooser events again. On exact
`bbc6bf5b…`, Chrome completed:

- the current ME `/Measure` file: `Map Layers`, `Quadrangle Location`, and
  `Adjoining Sheet Diagram`;
- the legacy NH `/LGIDict` file: `Map Layers`, `Quadrangle Location`, and
  `UTM Grid and Projection`;
- San Francisco `/Measure`: all three registered frames;
- Hampton 35 MB `/Measure`: all three registered frames;
- Montara `/LGIDict`: all four registered frames;
- deterministic sole `/Measure` and `/LGIDict` placement;
- `byte_and_rgbsmall_2pages.pdf` reporting `GeoPDF page 1 of 2` and importing
  only page 1; and
- `plain.pdf` opening the zero-point manual georeferencer with
  `absent registration · manual points`.

Every initial multi-registration chooser had no checked radio. Every explicit
main-map and inset choice used four embedded points and showed
`chosen by you`; none requested manual GCP entry. Adjust Points reported:

| File | Frame RMS values |
| --- | --- |
| ME Measure | Map Layers 9 m; Quadrangle 0 m; Adjoining 0 m |
| NH legacy LGIDict | Map Layers 5 m; Quadrangle 0 m; UTM 7 m |
| San Francisco Measure | Map Layers 8 m; Quadrangle 0 m; Adjoining 0 m |
| Hampton Measure | Map Layers 10 m; Quadrangle 0 m; Adjoining 0 m |
| Montara LGIDict | Map Layers 5 m; Quadrangle 0 m; Adjoining 0 m; UTM 6 m |

The final selection for each real file survived reload with its page, label,
format, and `chosen by you` provenance. The 35 MB Hampton chooser completed
within the browser observation window; no precise import duration is claimed.

The 320×640 run then reproduced horizontal overflow with the full Hampton
filename. An identical short-name copy of the same bytes and hash did not
overflow, isolating the long filename's min-content width. The focused style
regression failed before `overflow-wrap: anywhere` was added and passed after
it. On exact current `bcc3f8e49…`, the full filename wrapped, horizontal
overflow was absent, all three radios were initially unchecked, and the
off-screen inset remained scrollable and operable.

Chrome returned no warning or error log entries after the current exact run.
Forty-two rendered `src`/`href` values contained no imported filename,
`file:` URL, or temporary corpus path. The control surface still exposed no
request-body ledger or retained-resource trace.

### Captured candidate IDs

The required Montara, San Francisco, and Hampton reruns recorded these exact
candidate IDs:

- Montara: `lgidict-direct-0-2147.0896552-3608.6780362-163.9724138-117.6618587`,
  `lgidict-direct-1-313.5604591-338.9572414-2586.120461-3241.4675862`,
  `lgidict-direct-2-2126.6758621-3760.5737931-204.8-204.8`, and
  `lgidict-direct-3-151.132816-176.5296552-2910.9757472-3566.3227586`.
- San Francisco:
  `measure-direct-0-0-0-3389.7145968-3984.7847136`,
  `measure-direct-1-2185.6597333-3720.3094069-163.8361943-117.583821`, and
  `measure-direct-2-2168.7111602-3898.2740941-100.9852322-127.1176337`.
- Hampton:
  `measure-direct-0-12.7114299-0-3346.6369766-4027.1572451`,
  `measure-direct-1-2185.6597333-3720.3094069-163.8361943-117.583821`, and
  `measure-direct-2-2172.5952-3898.2740941-93.2171525-127.1176337`.

The controlled run captured before/after 320×640 screenshots, but they were not
stored as durable repository artifacts. Candidate IDs for the other two USGS
files and durable selected-extent/clipping screenshots remain incomplete.

## Firefox 146.0.1 and desktop Safari 27.0

Both browsers used exact current `bcc3f8e49…` and completed the same rendered
matrix:

- all five verified USGS PDFs imported from temporary local storage;
- every initial chooser had no selected frame;
- every main-map and inset choice used embedded coordinates;
- every Adjust Points panel showed four existing points with the RMS values
  recorded above;
- all five final selections and provenance strings survived reload;
- sole deterministic Measure and LGIDict registrations placed automatically;
- the plain PDF opened manual georeferencing; and
- the two-page control reported page 1 of 2 and later pages were not imported.

Neither desktop-control path exposed an accepted console, request ledger,
resource-timing trace, or retained-memory view. Their rendered interaction
matrices pass, while their diagnostic and cleanup matrices remain blocked.

## Physical Mobile Safari

No physical run was made. `xcrun devicectl list devices` reported the paired
iPhone 12 Pro as `unavailable`, and iPhone Mirroring timed out connecting. No
simulator or desktop-browser substitution was used.

## Corpus boundary

All five USGS files remained in temporary local storage and outside Git. Their
recorded byte sizes and SHA-256 hashes matched:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| ME Isles of Shoals, 2024 `/Measure` | 5,831,077 | `9e0e5c17276b6ff0793c29ffc190b0b43e559fd197f0e17c79560adda54a4357` |
| CA San Francisco South, 2021 `/Measure` | 12,127,762 | `1e64eabdb4df545a651a7721ed808c6199e89df27c7659424ead22a3c9f74732` |
| NH Isles of Shoals, 2015 `/LGIDict` | 3,241,291 | `1e9d8c98ddea13d114e88ca33e0f9ad376fa6f5f9793486cfddf208dc4557ffa` |
| CA Montara Mountain, 2012 `/LGIDict` | 9,052,006 | `756f06c2c1a826c151bb2a753fe8a8e9efac28557865c37262cd773160961266` |
| NH Hampton, 2024 `/Measure` | 35,264,037 | `a4b29c41289e5d4dab3ec33f2d0019441c2525aba0c61b498a15da3434bc546b` |

No producer-specific automatic rule is approved. These five files are
discovery inputs, not independent holdouts. Each of the three observed
producer/signature families still needs two untouched passing holdouts, for at
least six additional files with distinct hashes and quadrangles. Silent
first-frame, largest-frame, or label-only selection remains prohibited.

## Verification

The responsive fix passed:

- focused test red before the fix and green after it;
- `npm ci`;
- 11 Node script tests;
- 986 Vitest tests with one skipped;
- `npm run lint`;
- `npm run build`;
- hosted `Change classification`, `Web tests + build`, and
  `Build gate + tests`; and
- an exact detached build of current `bcc3f8e49…`.

## Unresolved stop rules

The decision remains blocked because:

- the full Chrome compatibility matrix was exact for `bbc6bf5b…`, while only
  the corrected responsive Hampton case was rerun on current `bcc3f8e49…`;
- main-thread long-task recording, input latency, and retained-memory
  measurement remain unavailable;
- three consecutive normal and stress import-remove cycles were not completed;
- the removal confirmation timed out under Chrome control, so worker, PDF
  document, object URL, canvas, and memory release were not proven;
- no control surface exposed a PDF request-body ledger;
- durable selected-extent/clipping screenshots and complete candidate-ID
  evidence remain incomplete;
- physical Mobile Safari is unavailable; and
- the alternate PDF.js feature-worker topology remains unsupported and was not
  promoted as a fallback.

The machine-readable companion receipt is
`docs/research/2026-07-28-geopdf-browser-acceptance.json`.
