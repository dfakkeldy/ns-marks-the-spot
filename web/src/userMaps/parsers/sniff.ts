export type SniffedType = "geotiff" | "pdf" | "png" | "jpeg" | "unknown";

type Signature = { type: SniffedType; magic: number[] };

/**
 * File extensions are user-editable, so type detection reads magic bytes.
 * TIFF covers classic (42) and BigTIFF (43) in both byte orders; GeoTIFF is
 * plain TIFF plus geo tags, which the parser (not the sniffer) verifies.
 */
const SIGNATURES: Signature[] = [
  { type: "geotiff", magic: [0x49, 0x49, 0x2a, 0x00] },
  { type: "geotiff", magic: [0x4d, 0x4d, 0x00, 0x2a] },
  { type: "geotiff", magic: [0x49, 0x49, 0x2b, 0x00] },
  { type: "geotiff", magic: [0x4d, 0x4d, 0x00, 0x2b] },
  { type: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  { type: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: "jpeg", magic: [0xff, 0xd8, 0xff] },
];

export function sniffFileType(bytes: Uint8Array): SniffedType {
  for (const { type, magic } of SIGNATURES) {
    if (bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b)) {
      return type;
    }
  }
  return "unknown";
}
