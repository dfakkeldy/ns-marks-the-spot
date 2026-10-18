import Foundation
import GeoCore

/// What a zoning layer needs beyond the fields every layer has.
///
/// Municipal zoning is published per municipality; Nova Scotia has no
/// provincial zoning layer. The sources differ in schema, licence, and
/// currency, so each entry carries its own field mapping, its own attribution,
/// and its own link to the by-law it is a rendering of, rather than assuming a
/// shared convention.
///
/// The by-law link is not decoration. Every one of these layers is an
/// unofficial rendering: the polygons show where a zone was drawn, and only the
/// by-law says what the zone permits.
public struct ZoningLayerDetail: Hashable, Sendable {
    /// Whether the publisher's geometry may leave their service.
    ///
    /// `liveQueryOnly` sources state no licence terms at all. They are drawn
    /// straight from the publisher's public endpoint and must never be
    /// extracted into project data or a cache that outlives the session.
    public enum Redistribution: String, Hashable, Sendable {
        case permitted
        case liveQueryOnly = "live-query-only"
    }

    public let id: LayerID
    /// The land use by-law this layer renders.
    public let bylawURL: URL
    public let bylawLabel: String
    public let redistribution: Redistribution
    /// The credit the publisher's terms require to travel with the data.
    public let attribution: String
    public let zoneCodeField: String
    public let zoneNameField: String
    /// `nil` where the source publishes no plan-area column.
    public let planAreaField: String?
    public let idField: String
    public let orderByFields: String
    public let outFields: [String]
    /// Hex, as the web writes them, so the two surfaces draw the same colours.
    public let fillColor: String
    public let strokeColor: String

    public init(
        id: LayerID,
        bylawURL: URL,
        bylawLabel: String,
        redistribution: Redistribution,
        attribution: String,
        zoneCodeField: String,
        zoneNameField: String,
        planAreaField: String?,
        idField: String,
        orderByFields: String,
        outFields: [String],
        fillColor: String,
        strokeColor: String
    ) {
        self.id = id
        self.bylawURL = bylawURL
        self.bylawLabel = bylawLabel
        self.redistribution = redistribution
        self.attribution = attribution
        self.zoneCodeField = zoneCodeField
        self.zoneNameField = zoneNameField
        self.planAreaField = planAreaField
        self.idField = idField
        self.orderByFields = orderByFields
        self.outFields = outFields
        self.fillColor = fillColor
        self.strokeColor = strokeColor
    }
}

extension LayerCatalog {
    /// The three Eastern District Planning Commission counties share one schema
    /// (`Zone`, `ZONETYPE`, `PLAN_`) on one ArcGIS Online organisation, so one
    /// adapter serves all three. None of them states a licence.
    private static let edpcAttribution =
        "Zoning rendered live from the Eastern District Planning Commission's public map services. "
        + "Not an official copy of the land use by-law."

    public static let zoningDetail: [ZoningLayerDetail] = [
        ZoningLayerDetail(
            id: .zoningInverness,
            bylawURL: URL(string: "https://edpc.ca/plandocs/inverness_county/Plan_Inverness-LUB.pdf")!,
            bylawLabel: "Plan Inverness Land Use By-law",
            redistribution: .liveQueryOnly,
            attribution: edpcAttribution,
            zoneCodeField: "Zone",
            zoneNameField: "ZONETYPE",
            planAreaField: "PLAN_",
            idField: "OBJECTID",
            orderByFields: "OBJECTID",
            outFields: ["OBJECTID", "Zone", "ZONETYPE", "PLAN_"],
            fillColor: "#2a9d8f",
            strokeColor: "#1d6f66"
        ),
        ZoningLayerDetail(
            id: .zoningVictoria,
            bylawURL: URL(string: "https://edpc.ca/plandocs/victoria_county/Plan_Victoria-LUB.pdf")!,
            bylawLabel: "Plan Victoria Land Use By-law",
            redistribution: .liveQueryOnly,
            attribution: edpcAttribution,
            zoneCodeField: "Zone",
            zoneNameField: "ZONETYPE",
            planAreaField: "PLAN_",
            idField: "OBJECTID",
            orderByFields: "OBJECTID",
            outFields: ["OBJECTID", "Zone", "ZONETYPE", "PLAN_"],
            fillColor: "#4361ee",
            strokeColor: "#2f45a8"
        ),
        ZoningLayerDetail(
            id: .zoningRichmond,
            bylawURL: URL(string: "https://edpc.ca/plandocs/richmond_county/Richmond_County_LUB.pdf")!,
            bylawLabel: "Plan Richmond Land Use By-law",
            redistribution: .liveQueryOnly,
            attribution: edpcAttribution,
            zoneCodeField: "Zone",
            zoneNameField: "ZONETYPE",
            planAreaField: "PLAN_",
            idField: "OBJECTID",
            orderByFields: "OBJECTID",
            outFields: ["OBJECTID", "Zone", "ZONETYPE", "PLAN_"],
            fillColor: "#e76f51",
            strokeColor: "#a94b33"
        ),
        ZoningLayerDetail(
            id: .zoningCumberland,
            bylawURL: URL(string: "https://www.cumberlandcounty.ns.ca/land-use-regulations.html")!,
            bylawLabel: "Cumberland Land Use By-law",
            redistribution: .liveQueryOnly,
            attribution:
                "Zoning rendered live from the Municipality of the County of Cumberland's public "
                + "map service. Not an official copy of the land use by-law.",
            zoneCodeField: "ZONE",
            zoneNameField: "ZoneName",
            planAreaField: nil,
            idField: "OBJECTID",
            orderByFields: "OBJECTID",
            outFields: ["OBJECTID", "ZONE", "ZoneName"],
            fillColor: "#588157",
            strokeColor: "#38553a"
        ),
        ZoningLayerDetail(
            id: .zoningHalifax,
            bylawURL: URL(string: "https://www.halifax.ca/city-hall/legislation-by-laws/land-use-by-laws")!,
            bylawLabel: "Halifax land use by-law index",
            redistribution: .permitted,
            attribution: "Contains information licenced under the Open Government Licence—Halifax.",
            zoneCodeField: "ZONE",
            zoneNameField: "DESCRIPTION",
            planAreaField: nil,
            idField: "OBJECTID",
            orderByFields: "OBJECTID",
            outFields: ["OBJECTID", "ZONE", "DESCRIPTION", "BYLAW_ID"],
            fillColor: "#b5179e",
            strokeColor: "#7c1069"
        ),
    ]

    public static func zoningDetail(for id: LayerID) -> ZoningLayerDetail? {
        zoningDetail.first { $0.id == id }
    }
}
