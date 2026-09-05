# Wider-search diagnostic — declared after primary scoring

The primary protocol and scores remain unchanged. After scoring we found that
35/64 Sheet 19 and 2/34 Sheet 16 gold locations were outside the ±80-pixel
search range. This is a substantial limitation of the primary experiment.

Run one additional variant with `search_radius=320` source pixels, changing
nothing else, on the same two frozen target sets. This is a **post-score
sensitivity diagnostic**, not an independent test set or a replacement primary
result. It asks whether inadequate search range explains the lack of usable
matches, or whether wider search mainly admits more ambiguity. Preserve both
variants and all rejections. Do not select a winning configuration for
publication from these data.
