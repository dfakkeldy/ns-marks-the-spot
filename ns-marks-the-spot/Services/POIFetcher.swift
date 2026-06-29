import Foundation

enum POIFetcherError: Error, Equatable {
    case invalidHTTPStatus(Int)
    case serviceError(code: Int?, message: String)
}

final class POIFetcher {
    private let waterfallURL = URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_UT83/MapServer/1/query")!
    private let urlSession: URLSession

    init(urlSession: URLSession = .shared) {
        self.urlSession = urlSession
    }

    func fetchWaterfalls() async throws -> [PointOfInterest] {
        var components = URLComponents(url: waterfallURL, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "where", value: "FEAT_DESC = 'Falls -  On a single line river point'"),
            URLQueryItem(name: "outFields", value: "*"),
            URLQueryItem(name: "outSR", value: "4326"),
            URLQueryItem(name: "f", value: "json"),
        ]

        let (data, response) = try await urlSession.data(from: components.url!)
        if let httpResponse = response as? HTTPURLResponse,
           !(200...299).contains(httpResponse.statusCode) {
            throw POIFetcherError.invalidHTTPStatus(httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        let queryResponse = try decoder.decode(EsriQueryResponse.self, from: data)

        if let error = queryResponse.error {
            throw POIFetcherError.serviceError(
                code: error.code,
                message: error.message
            )
        }

        return (queryResponse.features ?? []).compactMap(mapToPOI)
    }

    private func mapToPOI(_ feature: EsriFeature) -> PointOfInterest? {
        guard let geom = feature.geometry, let attrs = feature.attributes else { return nil }
        let name = attrs.name
            ?? attrs.nameDisplay
            ?? attrs.featureName
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
    let error: EsriServiceError?
}

private struct EsriServiceError: Decodable {
    let code: Int?
    let message: String
}

private struct EsriFeature: Decodable {
    let attributes: EsriAttributes?
    let geometry: EsriGeometry?
}

private struct EsriAttributes: Decodable {
    let name: String?
    let nameDisplay: String?
    let featureName: String?

    enum CodingKeys: String, CodingKey {
        case name = "NAME"
        case nameDisplay = "NAME_DISP"
        case featureName = "FEATURE_NAME"
    }
}

private struct EsriGeometry: Decodable {
    let x: Double
    let y: Double
}
