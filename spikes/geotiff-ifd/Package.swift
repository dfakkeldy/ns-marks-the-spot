// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "geotiff-ifd-spike",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "GeoTIFFTags"),
        .executableTarget(name: "geotiff-probe", dependencies: ["GeoTIFFTags"]),
        .executableTarget(name: "geopdf-probe"),
        .executableTarget(name: "warp-probe"),
        .testTarget(name: "GeoTIFFTagsTests", dependencies: ["GeoTIFFTags"]),
    ]
)
