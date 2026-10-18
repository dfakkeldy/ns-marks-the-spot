# Chrome GeoPDF import hang — diagnostic record

Date: 2026-07-30
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Control runtime: receipt baseline `4c46ca276982ac9e4da593ee79b5a88503818511`
Browser: Chrome 150.0.0.0 (macOS 27.0, build 26A5388g)
File: NH_Isles_of_Shoals_OE_W_20150610_TM_geo.pdf
  bytes 3,241,291  sha256 1e9d8c98ddea13d114e88ca33e0f9ad376fa6f5f9793486cfddf208dc4557ffa
  (hash verified against docs/research/2026-07-27-geopdf-external-corpus.json)

## Observed

Import never completes. UI remains on `Reading "<file>"…` indefinitely
(observed to 576 s on one origin, 136 s on another). No chooser appears.
No console error. No failed network request. No unhandled rejection.

## Worker-level trace (window.Worker instrumented before app import)

1. geoPdfWorker  <- postMessage {type:"parse",    bytes:3241291} t=25923ms
   geoPdfWorker  -> {kind:"topology-unsupported", ok:false}      t=25991ms  (68 ms)
   terminated t=25991ms
   => worker-canvas topology declined; correct fallback to main-canvas path.

2. geoPdfWorker  <- postMessage {type:"metadata", bytes:3241291} t=26080ms
   geoPdfWorker  -> {kind:"metadata", ok:true}                   t=26147ms  (67 ms)
   terminated t=26147ms
   => REGISTRATION METADATA EXTRACTION SUCCEEDS. Not the failure point.

3. pdf.worker.min-DEtVeC4l.mjs created t=26016ms
   322 messages exchanged, last at t=28915ms (~29 s)
   silent for 107 s at time of capture; never terminated
   => PDF.js rasterization in the main-canvas fallback stops responding
      and the import promise never settles.

## Control result

The identical file, identical harness, and identical browser reproduce the
same indefinite `Reading` state on the receipt baseline `4c46ca276`, the SHA
whose recorded Chrome matrix is claimed complete. Therefore this is NOT a
regression introduced by PRs #181/#183/#186/#188/#189/#190/#191/#192.

## Harness exoneration

The injected File object was verified byte-exact before blaming the product:
  declaredSize 3241291, actualBytesRead 3241291, header "%PDF-1.6",
  trailer "%EOF", read in 4 ms.
Delivery is therefore not the cause.

Both a threaded static server (python3 http.server :4320) and `vite preview`
(:4340) reproduce it. All 201 PDF.js vendor assets are present in dist and
serve HTTP 200 from both origins.

## Status

Stop rule 1 (legacy post-reload blank raster, Zoom-to-point rerun) CANNOT be
evaluated: the import never reaches a rendered state, so there is no raster to
reload. Reported as BLOCKED, not as pass or fail.
