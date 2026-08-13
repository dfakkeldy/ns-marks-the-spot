import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

/// Spike: what does a clipped per-triangle warp cost in CoreGraphics?
///
/// The web renderer (`web/src/userMaps/render/mesh.ts`) draws each mesh
/// triangle as save → clip(triangle) → setTransform(affine) → drawImage(whole
/// source) → restore, and its comment records a nasty property: on canvas the
/// cost scales with the SOURCE size rather than the clipped area, so large
/// sources hit a cliff. Phase 8 plans the same algorithm inside a custom
/// MKTileOverlay, where the unit of work is one 256x256 tile.
///
/// This measures whether CoreGraphics has the same cliff. Unlike canvas,
/// CGBitmapContext rasterizes on the CPU synchronously, so the wall clock here
/// is real work rather than queued commands.

func makeSource(_ side: Int) -> CGImage {
    let space = CGColorSpaceCreateDeviceRGB()
    let context = CGContext(
        data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
        space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    // Fine detail so interpolation has something to do; a flat fill could be
    // optimized in ways a real scan never is.
    let step = max(side / 64, 1)
    for y in stride(from: 0, to: side, by: step) {
        for x in stride(from: 0, to: side, by: step) {
            context.setFillColor(
                red: Double((x / step) % 7) / 7, green: Double((y / step) % 5) / 5,
                blue: Double((x + y) / step % 3) / 3, alpha: 1)
            context.fill(CGRect(x: x, y: y, width: step, height: step))
        }
    }
    return context.makeImage()!
}

/// The affine that carries source triangle (s0,s1,s2) onto destination
/// triangle (d0,d1,d2) — same derivation as the web's affineFromTriangles.
func affine(
    _ s0: CGPoint, _ s1: CGPoint, _ s2: CGPoint,
    _ d0: CGPoint, _ d1: CGPoint, _ d2: CGPoint
) -> CGAffineTransform {
    let sx1 = s1.x - s0.x, sy1 = s1.y - s0.y
    let sx2 = s2.x - s0.x, sy2 = s2.y - s0.y
    let det = sx1 * sy2 - sx2 * sy1
    guard abs(det) > 1e-12 else { return .identity }
    let dx1 = d1.x - d0.x, dy1 = d1.y - d0.y
    let dx2 = d2.x - d0.x, dy2 = d2.y - d0.y
    let a = (dx1 * sy2 - dx2 * sy1) / det
    let b = (dy1 * sy2 - dy2 * sy1) / det
    let c = (dx2 * sx1 - dx1 * sx2) / det
    let d = (dy2 * sx1 - dy1 * sx2) / det
    return CGAffineTransform(
        a: a, b: b, c: c, d: d,
        tx: d0.x - a * s0.x - c * s0.y,
        ty: d0.y - b * s0.x - d * s0.y)
}

struct Triangle {
    let s0, s1, s2: CGPoint
    let d0, d1, d2: CGPoint
}

/// A mesh over the source, warped into a destination plane `destSide` wide,
/// with a mild barrel distortion so no two triangles share an affine.
func mesh(sourceSide: Int, gridSize: Int, destSide: CGFloat) -> [Triangle] {
    func corner(_ col: Int, _ row: Int) -> (CGPoint, CGPoint) {
        let u = CGFloat(col) / CGFloat(gridSize)
        let v = CGFloat(row) / CGFloat(gridSize)
        let source = CGPoint(x: u * CGFloat(sourceSide), y: v * CGFloat(sourceSide))
        let bulge = 0.06 * sin(u * .pi) * sin(v * .pi)
        let destination = CGPoint(
            x: (u + bulge) * destSide,
            y: (v - bulge) * destSide)
        return (source, destination)
    }
    var triangles: [Triangle] = []
    for row in 0..<gridSize {
        for col in 0..<gridSize {
            let (s00, d00) = corner(col, row)
            let (s10, d10) = corner(col + 1, row)
            let (s01, d01) = corner(col, row + 1)
            let (s11, d11) = corner(col + 1, row + 1)
            triangles.append(Triangle(s0: s00, s1: s10, s2: s01, d0: d00, d1: d10, d2: d01))
            triangles.append(Triangle(s0: s10, s1: s11, s2: s01, d0: d10, d1: d11, d2: d01))
        }
    }
    return triangles
}

func drawTile(
    image: CGImage, triangles: [Triangle], tile: CGRect,
    interpolation: CGInterpolationQuality
) -> (drawn: Int, context: CGContext) {
    let side = 256
    let context = CGContext(
        data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.interpolationQuality = interpolation
    // Tile-local coordinates.
    context.translateBy(x: -tile.minX, y: -tile.minY)

    var drawn = 0
    for triangle in triangles {
        // Only triangles whose destination bounds meet the tile matter; a real
        // renderer indexes these, but the bounds test alone is what keeps the
        // per-tile cost off the full mesh.
        let minX = min(triangle.d0.x, triangle.d1.x, triangle.d2.x)
        let maxX = max(triangle.d0.x, triangle.d1.x, triangle.d2.x)
        let minY = min(triangle.d0.y, triangle.d1.y, triangle.d2.y)
        let maxY = max(triangle.d0.y, triangle.d1.y, triangle.d2.y)
        guard maxX >= tile.minX, minX <= tile.maxX,
              maxY >= tile.minY, minY <= tile.maxY else { continue }

        context.saveGState()
        context.beginPath()
        context.move(to: triangle.d0)
        context.addLine(to: triangle.d1)
        context.addLine(to: triangle.d2)
        context.closePath()
        context.clip()
        context.concatenate(
            affine(triangle.s0, triangle.s1, triangle.s2,
                   triangle.d0, triangle.d1, triangle.d2))
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        context.restoreGState()
        drawn += 1
    }
    return (drawn, context)
}

func milliseconds(_ body: () -> Void) -> Double {
    let start = DispatchTime.now().uptimeNanoseconds
    body()
    return Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
}

/// Single runs on a laptop swing by 5x with scheduling and thermal noise. Every
/// number below is the fastest of several runs after a warm-up, which is the
/// stable lower bound on the real cost.
func bestMilliseconds(runs: Int = 5, _ body: () -> Void) -> Double {
    body()
    var best = Double.infinity
    for _ in 0..<runs { best = min(best, milliseconds(body)) }
    return best
}

/// Renders one tile and forces its pixels to exist, so the clock covers the
/// rasterization rather than a lazily deferred context.
func tileMilliseconds(
    image: CGImage, triangles: [Triangle], tile: CGRect,
    interpolation: CGInterpolationQuality
) -> (ms: Double, drawn: Int) {
    var drawn = 0
    let ms = bestMilliseconds {
        let result = drawTile(
            image: image, triangles: triangles, tile: tile, interpolation: interpolation)
        drawn = result.drawn
        _ = result.context.makeImage()
    }
    return (ms, drawn)
}

// Unbuffered so a crash mid-run still shows how far the probe got.
setvbuf(stdout, nil, _IONBF, 0)

// The destination plane is 4 tiles wide; the sampled tile sits in the middle,
// so it is fully covered by warped content rather than half empty.
let destSide: CGFloat = 1024
let tile = CGRect(x: 256, y: 256, width: 256, height: 256)

print("source     grid  tris/tile   ms/tile   ms/triangle   Mpx")
for sourceSide in [1024, 2048, 4096, 8192] {
    let image = makeSource(sourceSide)
    let megapixels = Double(sourceSide * sourceSide) / 1_000_000
    for gridSize in [16, 64] {
        let triangles = mesh(sourceSide: sourceSide, gridSize: gridSize, destSide: destSide)
        let (ms, drawn) = tileMilliseconds(
            image: image, triangles: triangles, tile: tile, interpolation: .high)
        print(String(
            format: "%5dx%-5d %4d  %8d  %8.1f  %12.3f  %5.1f",
            sourceSide, sourceSide, gridSize, drawn, ms,
            drawn > 0 ? ms / Double(drawn) : 0, megapixels))
    }
}

print("\ninterpolation quality, 4096px source, grid 64:")
let image4k = makeSource(4096)
let mesh64 = mesh(sourceSide: 4096, gridSize: 64, destSide: destSide)
for (label, quality) in [("none", CGInterpolationQuality.none), ("low", .low),
                         ("medium", .medium), ("high", .high)] {
    let (ms, _) = tileMilliseconds(
        image: image4k, triangles: mesh64, tile: tile, interpolation: quality)
    print("  " + label.padding(toLength: 8, withPad: " ", startingAt: 0)
          + String(format: "%7.1f ms/tile", ms))
}

/// Is the cost driven by the source's absolute size, or by how far the source
/// is being minified for this destination scale? If it is minification, then a
/// mip level cut to the destination scale should make a huge source as cheap as
/// a small one — which is a very different Phase 8 design than "cap the source".
func downsample(_ image: CGImage, to side: Int) -> CGImage {
    let context = CGContext(
        data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
    return context.makeImage()!
}

print("\nmip level vs direct warp (grid 64, .high, dest plane 1024px):")
print("  source    strategy                 mip build   ms/tile")
for sourceSide in [4096, 8192] {
    let image = makeSource(sourceSide)
    let direct = mesh(sourceSide: sourceSide, gridSize: 64, destSide: destSide)
    let (directMs, _) = tileMilliseconds(
        image: image, triangles: direct, tile: tile, interpolation: .high)
    print("  " + "\(sourceSide)px".padding(toLength: 10, withPad: " ", startingAt: 0)
          + "direct".padding(toLength: 25, withPad: " ", startingAt: 0)
          + "        -" + String(format: " %9.1f", directMs))

    // One mip level at the destination scale, built once per source and zoom
    // and then reused by every tile at that zoom. Measured cold and once:
    // CoreGraphics caches a scaled variant against the source CGImage, so a
    // best-of-N here would report the cache hit rather than the real one-time
    // cost the app pays.
    var mip: CGImage!
    let mipMs = milliseconds { mip = downsample(makeSource(sourceSide), to: Int(destSide)) }
    let mipMesh = mesh(sourceSide: Int(destSide), gridSize: 64, destSide: destSide)
    let (mipTileMs, _) = tileMilliseconds(
        image: mip, triangles: mipMesh, tile: tile, interpolation: .high)
    print("  " + "".padding(toLength: 10, withPad: " ", startingAt: 0)
          + "mip to \(Int(destSide))px, warp".padding(
              toLength: 25, withPad: " ", startingAt: 0)
          + String(format: "%6.0f ms %9.1f", mipMs, mipTileMs))
}

/// With minification removed by the mip, what is left is the fixed cost of one
/// clipped drawImage. That sets a ceiling on mesh density per tile, which is
/// the number Phase 8 actually has to design around.
/// The shipping combination: a scale-matched mip removes the minification, so
/// interpolation quality should stop dominating. This is the configuration
/// Phase 8 would actually run.
print("\nmip + interpolation (1024px mip of an 8192px source, grid 64):")
let mip1k = downsample(makeSource(8192), to: Int(destSide))
let mipMesh1k = mesh(sourceSide: Int(destSide), gridSize: 64, destSide: destSide)
for (label, quality) in [("none", CGInterpolationQuality.none), ("low", .low),
                         ("medium", .medium), ("high", .high)] {
    let (ms, _) = tileMilliseconds(
        image: mip1k, triangles: mipMesh1k, tile: tile, interpolation: quality)
    print("  " + label.padding(toLength: 8, withPad: " ", startingAt: 0)
          + String(format: "%7.1f ms/tile", ms))
}

print("\nmesh density at 1:1 scale (1024px source onto a 1024px dest plane, .high):")
print("  grid   cell(dest px)   tris/tile   ms/tile   us/triangle")
for gridSize in [8, 16, 32, 64, 128] {
    // A fresh source per row: sharing one CGImage across rows let CoreGraphics
    // carry cached state between configurations and moved the same
    // measurement by 6x.
    let source = makeSource(1024)
    let triangles = mesh(sourceSide: 1024, gridSize: gridSize, destSide: destSide)
    let (ms, drawn) = tileMilliseconds(
        image: source, triangles: triangles, tile: tile, interpolation: .high)
    print(String(
        format: "  %4d   %13.0f   %9d  %8.1f  %12.0f",
        gridSize, destSide / CGFloat(gridSize), drawn, ms,
        drawn > 0 ? ms * 1000 / Double(drawn) : 0))
}
