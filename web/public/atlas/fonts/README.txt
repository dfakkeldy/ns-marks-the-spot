NS Marks Atlas label glyphs

MapLibre draws map labels from signed-distance-field glyph ranges
(<stack>/<start>-<end>.pbf), not from CSS web fonts. These ranges are
generated from pinned open-licensed fonts by scripts/buildAtlasGlyphs.mjs,
which rasterizes each glyph's own TrueType outline; source.json records each
stack's upstream font release, checksum, licence and glyph count.

  Atlas Serif Regular / Atlas Serif Italic  derived from Libre Baskerville
  Atlas Sans Regular                        derived from Noto Sans

Both fonts are licensed under the SIL Open Font License 1.1 (texts beside this
file). Libre Baskerville declares the Reserved Font Name "Libre Baskerville";
the Noto OFL text declares no Reserved Font Name, and "Noto" is a Google
trademark. Converting a font to glyph ranges makes a Modified Version under the
OFL, so the stacks use project names and the upstream names appear only as the
derivation record. The ranges stay under the OFL and are not covered by the
repository's MIT code licence. Serving them with the app means no font host is
contacted for map lettering.
