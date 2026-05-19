import Foundation

final class POIFetcher {
    private let waterfallURL = URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_UT83/MapServer/0/query")!

    func fetchWaterfalls() async throws -> [PointOfInterest] {
        var components = URLComponents(url: waterfallURL, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "where", value: "1=1"),
            URLQueryItem(name: "outFields", value: "*"),
            URLQueryItem(name: "outSR", value: "4326"),
            URLQueryItem(name: "f", value: "json"),
        ]

        let (data, _) = try await URLSession.shared.data(from: components.url!)
        let decoder = JSONDecoder()
        let response = try decoder.decode(EsriQueryResponse.self, from: data)

        return (response.features ?? []).compactMap(mapToPOI)
    }

    private func mapToPOI(_ feature: EsriFeature) -> PointOfInterest? {
        guard let geom = feature.geometry, let attrs = feature.attributes else { return nil }
        let name = attrs["NAME"]
            ?? attrs["NAME_DISP"]
            ?? attrs["FEATURE_NAME"]
            ?? "Waterfall"
        return PointOfInterest(
            name: name,
            latitude: geom.y,
            longitude: geom.x,
            category: "waterfall"
        )
    }
}

private struct EsriQueryResponse: Decodable {
    let features: [EsriFeature]?
}

private struct EsriFeature: Decodable {
    let attributes: [String: String]?
    let geometry: EsriGeometry?
}

private struct EsriGeometry: Decodable {
    let x: Double
    let y: Double
}
