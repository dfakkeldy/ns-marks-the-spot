// swift-tools-version: 6.0
import PackageDescription

// Local package for logic that must not depend on MapKit or UIKit.
//
// Why a package rather than more app-target folders: everything here builds and
// tests mac-native through `swift test`, with no simulator and no Xcode build.
// On this machine an Apple build is a scarce, gated resource, so keeping the
// portable logic — geodesy, parsers, services, dataset pinning — outside the
// app target is what makes the port testable at speed. The app target consumes
// these modules; MapKit bridging stays in `MapSurface/`.
let package = Package(
    name: "NSMarksCore",
    platforms: [
        .iOS("26.0"),
        .macOS("14.0"),
    ],
    products: [
        .library(name: "GeoCore", targets: ["GeoCore"]),
        .library(name: "MapCatalog", targets: ["MapCatalog"]),
    ],
    targets: [
        .target(
            name: "GeoCore",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "GeoCoreTests",
            dependencies: ["GeoCore"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .target(
            name: "MapCatalog",
            dependencies: ["GeoCore"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "MapCatalogTests",
            dependencies: ["MapCatalog"],
            // The parity fixture the web exports. Copied, not processed: the
            // test compares bytes-in-fields against what the web declared, and
            // resource processing could rewrite it.
            resources: [.copy("Fixtures")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
