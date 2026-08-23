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
        .library(name: "NSDataServices", targets: ["NSDataServices"]),
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
        // The web's exported fixture and the reader for it, shared by every
        // test target that checks itself against the web. It lives under
        // `Tests/` and is not a product, so it cannot be linked into the app —
        // this JSON must never ship. Its own target rather than a file in
        // `MapCatalogTests` because the services tests need the same bytes, and
        // a second copy of a fixture is a second thing to forget to regenerate.
        .target(
            name: "ParityFixtures",
            dependencies: ["GeoCore"],
            path: "Tests/ParityFixtures",
            // Copied, not processed: the tests compare bytes-in-fields against
            // what the web declared, and resource processing could rewrite it.
            resources: [.copy("Fixtures")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "MapCatalogTests",
            dependencies: ["MapCatalog", "ParityFixtures"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .target(
            name: "NSDataServices",
            dependencies: ["GeoCore", "MapCatalog"],
            // The tax-sale snapshots, the Inverness micro-hydro pilot, and the
            // manifest that pins them, copied verbatim out of the repository's
            // `SharedData/` export so both surfaces read the same bytes.
            // Copied rather than processed: the manifest hashes describe these
            // files exactly, and a test re-hashes them.
            resources: [.copy("Resources/SharedData")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "NSDataServicesTests",
            dependencies: ["NSDataServices", "ParityFixtures"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
