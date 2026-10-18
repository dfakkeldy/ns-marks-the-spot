# Cape Breton content-boundary repair

The configured crop now excludes the complete upper inset strip and Sydney Town/Harbour plan, preserves the Cape Chameau and southern mainland extensions, and follows the locator-map diagonal hinge. The former crop included the upper part of the Sydney Harbour plan and clipped the sloping southern map edge at y=27,800.

`content-boundary.json` records the exact 36,223 × 35,027 source frame, source hash and crop frames. Blue/red source overlays show revised/previous boundaries. The production polygon in `tools/church/panels.py` matches the recorded ring; regression checks preserve southern physical content and exclude the independent plans.

This is a content-boundary repair, not geographic acceptance. The township mesh still supplies no geographic anchor; physical controls and independent validation remain required before a warp or publication.
