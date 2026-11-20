import GeoCore
import UIKit

/// Builds the drawing order without changing a sheet's saved row preferences.
enum DriveDrapeSelection {
    static func build(maps: [UserMapDrape], rows: [UserMapsViewModel.Row], catalogue: DriveCatalogue?,
                      auto: Bool, shown: [String], opacity: Double?) -> [UserMapDrape] {
        guard let catalogue, auto else { return maps }
        let ids = Set(catalogue.sheetIDs)
        let others = maps.filter { !ids.contains($0.record.id) }
        let source: [UserMapDrape] = rows.compactMap { row in
            guard shown.contains(row.id), let preview = row.preview else { return nil }
            return UserMapDrape(record: row.record, image: preview, alpha: row.opacity)
        }
        let byID = Dictionary(source.map { ($0.record.id, $0) }, uniquingKeysWith: { first, _ in first })
        let sheets = catalogue.sheetIDs.reversed().compactMap { id -> UserMapDrape? in
            guard var drape = byID[id] else { return nil }
            drape.alpha = CGFloat(opacity ?? catalogue.opacity)
            return drape
        }
        return others + sheets
    }
}
