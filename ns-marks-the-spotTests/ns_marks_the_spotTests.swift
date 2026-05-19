import Foundation
import Testing
@testable import ns_marks_the_spot

// MARK: - TileCache

struct TileCacheTests {
    let cache = TileCache()

    @Test func memoryCacheRoundTrip() {
        let data = Data([0x01, 0x02, 0x03])
        cache.cacheTile(data, z: 10, x: 300, y: 400, layerName: "Fletcher")

        let retrieved = cache.cachedTile(z: 10, x: 300, y: 400, layerName: "Fletcher")
        #expect(retrieved == data)
    }

    @Test func nilOnCacheMiss() {
        let result = cache.cachedTile(z: 0, x: 0, y: 0, layerName: "Nonexistent")
        #expect(result == nil)
    }

    @Test func differentLayerNamesDontCollide() {
        let dataA = Data([0xAA])
        let dataB = Data([0xBB])

        cache.cacheTile(dataA, z: 5, x: 10, y: 10, layerName: "Fletcher")
        cache.cacheTile(dataB, z: 5, x: 10, y: 10, layerName: "Other")

        #expect(cache.cachedTile(z: 5, x: 10, y: 10, layerName: "Fletcher") == dataA)
        #expect(cache.cachedTile(z: 5, x: 10, y: 10, layerName: "Other") == dataB)
    }

    @Test func differentCoordinatesDontCollide() {
        let dataA = Data([0x11])
        let dataB = Data([0x22])

        cache.cacheTile(dataA, z: 5, x: 10, y: 20, layerName: "Fletcher")
        cache.cacheTile(dataB, z: 5, x: 30, y: 40, layerName: "Fletcher")

        #expect(cache.cachedTile(z: 5, x: 10, y: 20, layerName: "Fletcher") == dataA)
        #expect(cache.cachedTile(z: 5, x: 30, y: 40, layerName: "Fletcher") == dataB)
    }
}

// MARK: - MapAnnotation

struct MapAnnotationTests {
    @Test func initialization() {
        let annotation = MapAnnotation(
            id: "test-1",
            latitude: 44.6488,
            longitude: -63.5752,
            title: "Test POI",
            subtitle: "waterfall"
        )

        #expect(annotation.id == "test-1")
        #expect(annotation.coordinate.latitude == 44.6488)
        #expect(annotation.coordinate.longitude == -63.5752)
        #expect(annotation.title == "Test POI")
        #expect(annotation.subtitle == "waterfall")
    }

    @Test func subtitleIsOptional() {
        let annotation = MapAnnotation(
            id: "no-sub",
            latitude: 45.0,
            longitude: -63.0,
            title: "No Subtitle"
        )

        #expect(annotation.subtitle == nil)
    }
}

// MARK: - MapKitTileLayer

struct MapKitTileLayerTests {
    @Test func initialization() {
        let url = URL(fileURLWithPath: "Tiles/Fletcher")
        let layer = MapKitTileLayer(id: "fletcher", name: "Fletcher", type: .tile(url))

        #expect(layer.id == "fletcher")
        #expect(layer.name == "Fletcher")
        #expect(layer.opacity == 1.0)
        #expect(layer.isVisible == true)

        if case .tile(let storedURL) = layer.type {
            #expect(storedURL == url)
        } else {
            Issue.record("Expected .tile type, got \(layer.type)")
        }
    }

    @Test func opacityIsMutable() {
        let layer = MapKitTileLayer(id: "test", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        layer.opacity = 0.3
        #expect(layer.opacity == 0.3)
    }

    @Test func visibilityToggles() {
        let layer = MapKitTileLayer(id: "test", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        layer.isVisible = false
        #expect(layer.isVisible == false)
    }
}

// MARK: - OverlayViewModel

@MainActor
struct OverlayViewModelTests {
    @Test func initialOpacity() {
        let engine = MockMapEngine()
        let vm = OverlayViewModel(engine: engine)

        #expect(vm.opacity == 0.5)
        #expect(vm.selectedLayerId == nil)
    }

    @Test func updateOpacity() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(id: "l1", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        layer.opacity = 0.5
        engine.addLayer(layer)

        let vm = OverlayViewModel(engine: engine)
        vm.selectLayer("l1")
        vm.updateOpacity(0.75)

        #expect(vm.opacity == 0.75)
        #expect(layer.opacity == 0.75)
    }

    @Test func updateOpacityWithoutSelectedLayerDoesNotCrash() {
        let engine = MockMapEngine()
        let vm = OverlayViewModel(engine: engine)

        vm.updateOpacity(1.0)
        #expect(vm.opacity == 1.0)
    }

    @Test func selectLayerSyncsOpacity() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(id: "l1", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        layer.opacity = 0.25
        engine.addLayer(layer)

        let vm = OverlayViewModel(engine: engine)
        vm.selectLayer("l1")

        #expect(vm.opacity == 0.25)
        #expect(vm.selectedLayerId == "l1")
    }

    @Test func opacityClampedByEngine() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(id: "l1", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        engine.addLayer(layer)

        let vm = OverlayViewModel(engine: engine)
        vm.selectLayer("l1")

        // Engine clamps to 0...1
        vm.updateOpacity(-0.5)
        #expect(layer.opacity == 0.0)

        vm.updateOpacity(1.8)
        #expect(layer.opacity == 1.0)
    }
}
