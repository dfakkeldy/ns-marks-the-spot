import GeoCore
import MapCatalog

extension TileLayerConfiguration {
    /// Source identity survives a renamed row or shared presentation id.
    nonisolated var reproductionSourceLayerID: LayerID? {
        switch source {
        case .catalogExport(let id): id
        case .fletcherSheets: .fletcher
        // The modern Atlas's Fletcher style is project cartography, not a historical scan.
        case .atlasRaster: nil
        case .tile: LayerID(rawValue: id)
        }
    }
}
