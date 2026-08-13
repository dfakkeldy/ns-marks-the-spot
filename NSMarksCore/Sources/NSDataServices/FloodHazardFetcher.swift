import Foundation
import GeoCore
import MapCatalog

/// Why a flood source produced no answer.
///
/// None of these means dry ground.
public nonisolated enum FloodHazardFailure: Error, Equatable {
    case refused(FloodHazardQuery.SourceRefusal)
    case cancelled
    case unreachable(URLError.Code)
    case invalidHTTPStatus(Int)
    case unreadable(FloodHazardResponse.Failure)
}

/// One published annual-exceedance-probability finding, and where it was
/// published.
public nonisolated struct RiverAEPIntersection: Sendable, Hashable {
    /// 1 or 5, as published. The 1% zone is the rarer, larger flood.
    public let annualExceedanceProbabilityPercent: Int
    public let relationship: FloodHazardQuery.RiverRelationship
    /// The study areas that reported it, in the order they were asked.
    public let places: [String]

    public init(
        annualExceedanceProbabilityPercent: Int,
        relationship: FloodHazardQuery.RiverRelationship,
        places: [String]
    ) {
        self.annualExceedanceProbabilityPercent = annualExceedanceProbabilityPercent
        self.relationship = relationship
        self.places = places
    }
}

/// What the published river study areas say about a parcel.
///
/// The last two cases are the ones that carry the weight. "Inside a study area
/// and not in a mapped zone" is a real negative from a real survey. "Outside
/// every study area" is not a negative at all: nobody has published mapping
/// there, and most of Nova Scotia is in this state.
public nonisolated enum RiverFloodEvidence: Sendable, Equatable {
    case publishedIntersection([RiverAEPIntersection])
    case withinPublishedExtentWithNoIntersection
    case outsidePublishedExtents
    case unavailable(FloodHazardFailure)
}

/// One sea-level scenario's raster sample over a parcel.
public nonisolated struct CoastalFloodEvidence: Sendable, Equatable {
    public let scenario: FloodHazardQuery.CoastalScenario
    public let sample: Result<FloodHazardResponse.RasterSampleSummary, FloodHazardFailure>

    public init(
        scenario: FloodHazardQuery.CoastalScenario,
        sample: Result<FloodHazardResponse.RasterSampleSummary, FloodHazardFailure>
    ) {
        self.scenario = scenario
        self.sample = sample
    }
}

public nonisolated struct ParcelFloodHazard: Sendable, Equatable {
    public let river: RiverFloodEvidence
    public let coastal: [CoastalFloodEvidence]

    public init(river: RiverFloodEvidence, coastal: [CoastalFloodEvidence]) {
        self.river = river
        self.coastal = coastal
    }
}

/// Fetches the published river mapping and the coastal raster samples for a
/// parcel.
public nonisolated final class FloodHazardFetcher: Sendable {
    private let transport: HTTPTransport
    private let decoder: RasterDecoder

    public init(
        transport: HTTPTransport = .urlSession(),
        decoder: RasterDecoder = .coreGraphics()
    ) {
        self.transport = transport
        self.decoder = decoder
    }

    /// Both halves of the flood question about `parts`.
    ///
    /// The river half fails whole when any one study-area sublayer fails: the
    /// answer is assembled from all of them, and a list missing the 1% layer
    /// looks exactly like a parcel that is only in the 5% zone. The coastal half
    /// reports per scenario, because the three are independent renders and one
    /// timing out says nothing about the other two.
    public func hazard(
        for parts: [PolygonHitTest.PolygonPart],
        mappedAreaSquareMetres: Double?,
        clearance: ProvinceLicenceClearance
    ) async throws(FloodHazardQuery.Refusal) -> ParcelFloodHazard {
        let plan = try FloodHazardQuery.plan(for: parts, clearance: clearance)

        async let river = self.river(plan.river)
        async let coastal = self.coastal(
            plan.coastal, parts: parts, mappedAreaSquareMetres: mappedAreaSquareMetres
        )
        return ParcelFloodHazard(river: await river, coastal: await coastal)
    }

    private func river(
        _ planned: Result<[FloodHazardQuery.RiverRequest], FloodHazardQuery.SourceRefusal>
    ) async -> RiverFloodEvidence {
        let requests: [FloodHazardQuery.RiverRequest]
        switch planned {
        case .success(let value): requests = value
        case .failure(let refusal): return .unavailable(.refused(refusal))
        }
        guard !requests.isEmpty else { return .outsidePublishedExtents }

        var hits = [Bool?](repeating: nil, count: requests.count)
        var failure: FloodHazardFailure?
        await withTaskGroup(of: (Int, Result<Bool, FloodHazardFailure>).self) { group in
            for (index, request) in requests.enumerated() {
                group.addTask {
                    do throws(FloodHazardFailure) {
                        return (index, .success(try await self.intersects(request)))
                    } catch {
                        return (index, .failure(error))
                    }
                }
            }
            for await (index, reply) in group {
                switch reply {
                case .success(let hit): hits[index] = hit
                case .failure(let error): if failure == nil { failure = error }
                }
            }
        }
        if let failure { return .unavailable(failure) }

        // Grouped by probability and relationship, in the order the study areas
        // were asked, matching the web's insertion-ordered Map.
        var grouped: [RiverAEPIntersection] = []
        for (request, hit) in zip(requests, hits) where hit == true {
            let layer = request.layer
            if let existing = grouped.firstIndex(where: {
                $0.annualExceedanceProbabilityPercent == layer.annualExceedanceProbabilityPercent
                    && $0.relationship == layer.relationship
            }) {
                guard !grouped[existing].places.contains(layer.place) else { continue }
                grouped[existing] = RiverAEPIntersection(
                    annualExceedanceProbabilityPercent: layer.annualExceedanceProbabilityPercent,
                    relationship: layer.relationship,
                    places: grouped[existing].places + [layer.place]
                )
            } else {
                grouped.append(
                    RiverAEPIntersection(
                        annualExceedanceProbabilityPercent:
                            layer.annualExceedanceProbabilityPercent,
                        relationship: layer.relationship,
                        places: [layer.place]
                    )
                )
            }
        }
        return grouped.isEmpty
            ? .withinPublishedExtentWithNoIntersection
            : .publishedIntersection(grouped)
    }

    private func coastal(
        _ planned: [Result<FloodHazardQuery.CoastalRequest, FloodHazardQuery.SourceRefusal>],
        parts: [PolygonHitTest.PolygonPart],
        mappedAreaSquareMetres: Double?
    ) async -> [CoastalFloodEvidence] {
        var evidence = [CoastalFloodEvidence?](repeating: nil, count: planned.count)
        await withTaskGroup(of: (Int, CoastalFloodEvidence).self) { group in
            for (index, entry) in planned.enumerated() {
                switch entry {
                case .failure(let refusal):
                    // `allCases` order is the panel's order, so the scenario is
                    // recovered by position rather than carried on the refusal.
                    evidence[index] = CoastalFloodEvidence(
                        scenario: FloodHazardQuery.CoastalScenario.allCases[index],
                        sample: .failure(.refused(refusal))
                    )
                case .success(let request):
                    group.addTask {
                        do throws(FloodHazardFailure) {
                            let summary = try await self.sample(
                                request, parts: parts,
                                mappedAreaSquareMetres: mappedAreaSquareMetres
                            )
                            return (
                                index,
                                CoastalFloodEvidence(
                                    scenario: request.scenario, sample: .success(summary)
                                )
                            )
                        } catch {
                            return (
                                index,
                                CoastalFloodEvidence(
                                    scenario: request.scenario, sample: .failure(error)
                                )
                            )
                        }
                    }
                }
            }
            for await (index, found) in group {
                evidence[index] = found
            }
        }
        return evidence.compactMap { $0 }
    }

    private func intersects(
        _ request: FloodHazardQuery.RiverRequest
    ) async throws(FloodHazardFailure) -> Bool {
        var urlRequest = URLRequest(url: request.url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue(
            "application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type"
        )
        urlRequest.httpBody = Data(request.body.utf8)

        let data = try await self.data(for: urlRequest)
        do {
            return try FloodHazardResponse.riverIntersects(from: data)
        } catch {
            throw .unreadable(error)
        }
    }

    private func sample(
        _ request: FloodHazardQuery.CoastalRequest,
        parts: [PolygonHitTest.PolygonPart],
        mappedAreaSquareMetres: Double?
    ) async throws(FloodHazardFailure) -> FloodHazardResponse.RasterSampleSummary {
        let data = try await self.data(for: URLRequest(url: request.url))
        let raster: RasterDecoder.Raster
        do {
            raster = try decoder(data)
        } catch {
            throw .unreadable(.undecodableRaster)
        }
        return FloodHazardResponse.summarizeRasterAlpha(
            rgba: raster.rgba,
            width: raster.width,
            height: raster.height,
            bounds: request.bounds,
            parts: parts,
            mappedAreaSquareMetres: mappedAreaSquareMetres
        )
    }

    private func data(for request: URLRequest) async throws(FloodHazardFailure) -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport(request)
        } catch is CancellationError {
            throw .cancelled
        } catch let error as URLError {
            throw error.code == .cancelled ? .cancelled : .unreachable(error.code)
        } catch {
            throw .unreachable(.unknown)
        }
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw .invalidHTTPStatus(http.statusCode)
        }
        return data
    }
}
