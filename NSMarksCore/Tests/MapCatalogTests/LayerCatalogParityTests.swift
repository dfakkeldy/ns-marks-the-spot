import Foundation
import GeoCore
import ParityFixtures
import Testing

@testable import MapCatalog

/// Compares the hand-written Swift catalog against the fixture the web exports.
///
/// The Swift catalog is the native source of truth by design, so nothing here
/// decodes the fixture into descriptors — it reads the fixture as raw JSON and
/// asserts field-by-field. A change on either surface that is not made on both
/// fails here.
@Suite("Layer catalog parity")
struct LayerCatalogParityTests {
    // MARK: - Fixture

    static let fixture = ParityFixture.loaded

    /// Fields the fixture carries that the Swift catalog deliberately does not
    /// model yet, with the phase that will need them.
    ///
    /// Listing them is the point: an unlisted new field fails
    /// `everyFixtureFieldIsModelledOrDeferred`, so a web change cannot slip in
    /// unnoticed just because Swift has no property for it.
    static let deferredFields: Set<String> = [
        // Which screen a health layer belongs to. The panel does not branch on
        // it: a layer with no risk bands draws no legend, which is the same
        // distinction read off the data the legend is made of.
        "screening",
        // The well-log manual link — Phase 6.
        "manualUrl",
    ]

    // MARK: - Coverage

    @Test("Models every layer in the fixture, and none the fixture lacks")
    func coversFixture() {
        let native = Set(LayerCatalog.all.map(\.id.rawValue))
        let web = Set(Self.fixture.layers.keys)
        #expect(
            native == web,
            """
            Missing from Swift: \(web.subtracting(native).sorted())
            Extra in Swift: \(native.subtracting(web).sorted())
            """
        )
    }

    @Test("Lists layers in the same panel order the web presents")
    func matchesPanelOrder() {
        #expect(LayerCatalog.all.map(\.id.rawValue) == Self.fixture.order)
    }

    @Test("Numbers uiOrder to match the fixture")
    func matchesUIOrder() {
        for layer in LayerCatalog.all {
            let expected = Self.fixture.layer(layer.id.rawValue)?["uiOrder"]?.int
            #expect(layer.uiOrder == expected, "\(layer.id.rawValue) uiOrder")
        }
    }

    @Test("Declares groups in the fixture's order")
    func matchesGroupOrder() {
        #expect(LayerGroupID.allCases.map(\.rawValue) == Self.fixture.groupOrder)
    }

    // MARK: - Field-by-field

    @Test("Matches every scalar field the fixture declares")
    func matchesScalarFields() {
        for layer in LayerCatalog.all {
            let id = layer.id.rawValue
            guard let web = Self.fixture.layer(id) else {
                Issue.record("\(id) is absent from the fixture")
                continue
            }

            #expect(layer.name == web["name"]?.nonNull?.string, "\(id) name")
            #expect(layer.group.rawValue == web["group"]?.nonNull?.string, "\(id) group")
            #expect(layer.minZoom == web["minZoom"]?.int, "\(id) minZoom")
            #expect(layer.maxZoom == web["maxZoom"]?.int, "\(id) maxZoom")
            #expect(layer.caveat == web["webCaveat"]?.nonNull?.string, "\(id) caveat")
            #expect(layer.sourceDate == web["sourceDate"]?.nonNull?.string, "\(id) sourceDate")
            #expect(layer.scale == web["scale"]?.nonNull?.string, "\(id) scale")
            #expect(layer.coverage == web["coverage"]?.nonNull?.string, "\(id) coverage")
            #expect(
                layer.webDefaultVisible == web["webDefaultVisible"]?.bool,
                "\(id) webDefaultVisible"
            )

            // The derived parcel layer declares no opacity; it draws with the
            // parcel overlay's own styling. Asserted in both directions, so a
            // Swift-invented default fails here rather than quietly becoming
            // the number the renderer uses.
            #expect(layer.opacity == web["opacity"]?.double, "\(id) opacity")

            // nativeDefaultVisibility only exists on the descriptors the web
            // shares with the native app; the rest are off by definition.
            let webNativeDefault = web["nativeDefaultVisibility"]?.bool ?? false
            #expect(
                layer.nativeDefaultVisible == webNativeDefault,
                "\(id) nativeDefaultVisible"
            )
        }
    }

    /// The advice and the legend a health screen carries.
    ///
    /// Field-by-field against the fixture, colours included: the swatch beside
    /// a band is a claim that this is the colour on the map, and a hex that has
    /// drifted from the province's makes the legend say something the raster
    /// does not.
    @Test("Carries the province's guidance and legend for every health screen")
    func matchesGuidanceAndRiskBands() {
        for layer in LayerCatalog.all {
            let id = layer.id.rawValue
            guard let web = Self.fixture.layer(id) else { continue }

            #expect(
                layer.guidance == (web["guidance"]?.nonNull?.string ?? ""),
                "\(id) guidance"
            )

            let webBands = web["riskBands"]?.nonNull?.array ?? []
            #expect(layer.riskBands.count == webBands.count, "\(id) risk band count")
            for (band, expected) in zip(layer.riskBands, webBands) {
                #expect(
                    band.label == expected.object?["label"]?.string,
                    "\(id) risk band label"
                )
                #expect(
                    band.colorHex == expected.object?["color"]?.string,
                    "\(id) risk band colour"
                )
            }
        }
    }

    @Test("Matches every URL the fixture declares")
    func matchesURLs() {
        for layer in LayerCatalog.all {
            let id = layer.id.rawValue
            guard let web = Self.fixture.layer(id) else { continue }

            // Fletcher's serviceUrl is the empty string on the web and nil
            // here: its base URL is runtime configuration, not catalog data.
            let webService = web["serviceUrl"]?.nonNull?.string
            if let webService, !webService.isEmpty {
                #expect(
                    layer.serviceURL?.absoluteString == webService,
                    "\(id) serviceUrl"
                )
            } else {
                #expect(layer.serviceURL == nil, "\(id) should have no serviceUrl")
            }

            #expect(
                layer.sourceURL?.absoluteString == web["sourceUrl"]?.nonNull?.string,
                "\(id) sourceUrl"
            )
            // licenceUrl is explicitly null for the municipal sources that
            // state no terms at all, which reads the same as absent here.
            #expect(
                layer.licenceURL?.absoluteString == web["licenceUrl"]?.nonNull?.string,
                "\(id) licenceUrl"
            )
        }
    }

    @Test("Matches licence, delivery and availability")
    func matchesClassification() {
        for layer in LayerCatalog.all {
            let id = layer.id.rawValue
            guard let web = Self.fixture.layer(id) else { continue }

            #expect(layer.licence?.rawValue == web["licence"]?.nonNull?.string, "\(id) licence")

            // Only some descriptor shapes carry `delivery`; the rest are
            // ArcGIS map exports by construction.
            let webDelivery = web["delivery"]?.nonNull?.string
            if let webDelivery {
                #expect(layer.delivery.rawValue == webDelivery, "\(id) delivery")
            }

            let webAvailability = web["webAvailability"]?.nonNull?.string
            if let webAvailability {
                #expect(
                    layer.availability.rawValue == webAvailability,
                    "\(id) webAvailability"
                )
            }

            let webRequires = web["requiresProvinceLicence"]?.bool ?? false
            if webRequires {
                #expect(
                    layer.requiresProvinceClearance,
                    "\(id) sets requiresProvinceLicence but Swift does not gate it"
                )
            }
        }
    }

    /// How the web actually obtains each layer, read off `MapCanvas` and the
    /// layer components rather than off the catalog.
    ///
    /// The web declares `delivery` on only five layers, so the parity check
    /// above can say nothing about the other thirty-one — and that gap already
    /// hid one wrong answer: `inverness-hydro-potential` was modelled as a
    /// live FeatureServer query when the web imports a bundled JSON document
    /// and never contacts its `serviceUrl` at all. This table closes the gap by
    /// being an independent statement of what each layer does, so a wrong
    /// inference has to be argued with rather than merely not contradicted.
    static let expectedDelivery: [String: LayerDelivery] = [
        // ArcGIS /export rasters.
        "ns-aerial": .mapExport, "nsprd": .mapExport, "crown-lands": .mapExport,
        "flood-risk": .mapExport, "waterfalls": .mapExport,
        "water-features": .mapExport, "roads": .mapExport,
        "buildings": .mapExport, "place-names": .mapExport,
        "main-roads": .mapExport, "contours": .mapExport,
        "published-river-flood-zones": .mapExport,
        "coastal-flood-current": .mapExport, "coastal-flood-2050": .mapExport,
        "coastal-flood-2100": .mapExport, "arsenic-risk-wells": .mapExport,
        "uranium-risk-wells": .mapExport, "manganese-risk-wells": .mapExport,
        "surficial-aquifers": .mapExport, "mineral-tenure": .mapExport,
        // Viewport-scoped feature queries.
        "zoning-inverness": .featureQuery, "zoning-victoria": .featureQuery,
        "zoning-richmond": .featureQuery, "zoning-cumberland": .featureQuery,
        "zoning-halifax": .featureQuery, "ns-well-logs": .featureQuery,
        "mineral-occurrences": .featureQuery, "abandoned-mines": .featureQuery,
        // Fetched whole, per viewport, as GeoJSON.
        "old-growth-policy": .geoJSONEndpoint,
        // Shipped in the app; its serviceUrl is provenance, not an endpoint.
        "inverness-hydro-potential": .bundledGeoJSON,
        // Derived from other layers.
        "mineral-proximity-parcels": .derivedParcelQuery,
        // Pre-rendered sheets at a runtime-configured base URL.
        "fletcher": .xyzTemplate,
        // Rights pending: catalogued, never fetched.
        "church-inverness": .unavailable, "church-victoria": .unavailable,
        "church-richmond": .unavailable, "church-cape-breton": .unavailable,
    ]

    @Test("Delivery matches how the web actually obtains each layer")
    func matchesDelivery() {
        #expect(Set(Self.expectedDelivery.keys) == Set(Self.fixture.layers.keys))
        for layer in LayerCatalog.all {
            #expect(
                layer.delivery == Self.expectedDelivery[layer.id.rawValue],
                "\(layer.id.rawValue) delivery"
            )
        }
    }

    @Test("Only ArcGIS exports and tile templates count as rasters")
    func rasterClassificationFollowsDelivery() {
        // Old growth is the case worth pinning: it has a tile-space z-index,
        // because its Leaflet pane hangs off `tilePane`, but it draws GeoJSON.
        // Treating it as a raster would install a tile overlay for a layer that
        // has no tiles.
        #expect(LayerCatalog.descriptor(for: .oldGrowthPolicy)?.isRaster == false)
        #expect(LayerCatalog.descriptor(for: .invernessHydroPotential)?.isRaster == false)
        for layer in LayerCatalog.all {
            let expected = layer.delivery == .mapExport || layer.delivery == .xyzTemplate
            #expect(layer.isRaster == expected, "\(layer.id.rawValue) isRaster")
        }
    }

    @Test("Matches ArcGIS export options byte-for-byte")
    func matchesExportOptions() {
        for layer in LayerCatalog.all {
            let id = layer.id.rawValue
            guard let web = Self.fixture.layer(id) else { continue }
            expectExport(layer.exportOptions, web["exportOptions"], label: "\(id) exportOptions")
            expectExport(
                layer.exportOverlayOptions,
                web["exportOverlayOptions"],
                label: "\(id) exportOverlayOptions"
            )
        }
    }

    /// `dynamicLayers` is compared as an exact string, not as parsed JSON.
    ///
    /// The byte sequence is what reaches the ArcGIS service: two encodings that
    /// differ only in key order are equivalent JSON but different requests, and
    /// a cached render keyed by URL would treat them as different layers.
    private func expectExport(_ native: ArcGISExportOptions?, _ web: ParityFixtures.JSONValue?, label: String) {
        guard let web = web?.object else {
            #expect(native == nil, "\(label): Swift declares options the web does not")
            return
        }
        guard let native else {
            Issue.record("\(label): the web declares options Swift does not")
            return
        }
        #expect(native.transparent == web["transparent"]?.bool, "\(label).transparent")
        #expect(native.layers == web["layers"]?.nonNull?.string, "\(label).layers")
        #expect(
            native.dynamicLayers == web["dynamicLayers"]?.nonNull?.string,
            "\(label).dynamicLayers"
        )
        #expect(native.dpi == web["dpi"]?.int, "\(label).dpi")
    }

    @Test("Zoning detail matches the fixture, layer for layer")
    func matchesZoningDetail() {
        // Both directions: a zoning layer the fixture declares and the detail
        // table omits would otherwise render with no field mapping, no
        // attribution, and no link to the by-law it claims to draw.
        let modelled = Set(LayerCatalog.zoningDetail.map(\.id.rawValue))
        let declared = Set(
            Self.fixture.layers.filter { $0.value["zoneCodeField"] != nil }.keys
        )
        #expect(modelled == declared)

        for detail in LayerCatalog.zoningDetail {
            let id = detail.id.rawValue
            guard let web = Self.fixture.layer(id) else { continue }

            #expect(detail.bylawURL.absoluteString == web["bylawUrl"]?.nonNull?.string, "\(id) bylawUrl")
            #expect(detail.bylawLabel == web["bylawLabel"]?.nonNull?.string, "\(id) bylawLabel")
            #expect(
                detail.redistribution.rawValue == web["redistribution"]?.nonNull?.string,
                "\(id) redistribution"
            )
            #expect(detail.attribution == web["attribution"]?.nonNull?.string, "\(id) attribution")
            #expect(detail.zoneCodeField == web["zoneCodeField"]?.nonNull?.string, "\(id) zoneCodeField")
            #expect(detail.zoneNameField == web["zoneNameField"]?.nonNull?.string, "\(id) zoneNameField")
            #expect(detail.planAreaField == web["planAreaField"]?.nonNull?.string, "\(id) planAreaField")
            #expect(detail.idField == web["idField"]?.nonNull?.string, "\(id) idField")
            #expect(
                detail.orderByFields == web["orderByFields"]?.nonNull?.string,
                "\(id) orderByFields"
            )
            #expect(
                detail.outFields == web["outFields"]?.array?.compactMap(\.string),
                "\(id) outFields"
            )
            #expect(detail.fillColor == web["fillColor"]?.nonNull?.string, "\(id) fillColor")
            #expect(detail.strokeColor == web["strokeColor"]?.nonNull?.string, "\(id) strokeColor")
        }
    }

    @Test("Mineral point detail matches the fixture, layer for layer")
    func matchesResourcePointDetail() {
        let modelled = Set(LayerCatalog.resourcePointDetail.map(\.id.rawValue))
        let declared = Set(
            Self.fixture.layers.filter { $0.value["markerColor"] != nil }.keys
        )
        #expect(modelled == declared)

        for detail in LayerCatalog.resourcePointDetail {
            let id = detail.id.rawValue
            guard let web = Self.fixture.layer(id) else { continue }

            #expect(
                detail.outFields == web["outFields"]?.array?.compactMap(\.string),
                "\(id) outFields"
            )
            #expect(detail.markerColor == web["markerColor"]?.nonNull?.string, "\(id) markerColor")
        }
    }

    @Test("Forestry status colours match the fixture")
    func matchesForestryStatusColors() {
        let modelled = Set(LayerCatalog.forestryStatusColors.map(\.id.rawValue))
        let declared = Set(
            Self.fixture.layers.filter { $0.value["statusColors"] != nil }.keys
        )
        #expect(modelled == declared)

        for colors in LayerCatalog.forestryStatusColors {
            let id = colors.id.rawValue
            guard let web = Self.fixture.layer(id)?["statusColors"]?.object else { continue }

            #expect(colors.confirmedOldGrowth == web["confirmedOldGrowth"]?.string, "\(id) confirmed")
            #expect(
                colors.restorationOpportunity == web["restorationOpportunity"]?.string,
                "\(id) restoration"
            )
            #expect(colors.unknown == web["unknown"]?.string, "\(id) unknown")
        }
    }

    @Test("Every fixture field is either modelled or explicitly deferred")
    func everyFixtureFieldIsModelledOrDeferred() {
        let modelled: Set<String> = [
            "id", "name", "group", "uiOrder", "licence", "delivery",
            "webAvailability", "serviceUrl", "sourceUrl", "licenceUrl",
            "minZoom", "maxZoom", "opacity", "webDefaultVisible",
            "nativeDefaultVisibility", "requiresProvinceLicence", "webCaveat",
            "sourceDate", "scale", "coverage", "exportOptions",
            "exportOverlayOptions",
            // Modelled on `ZoningLayerDetail` rather than on the descriptor
            // every layer shares, and checked by `matchesZoningDetail`.
            "attribution", "bylawLabel", "bylawUrl", "fillColor", "strokeColor",
            "idField", "orderByFields", "planAreaField", "redistribution",
            "zoneCodeField", "zoneNameField",
            // Modelled on `ZoningLayerDetail` and `ResourcePointLayerDetail`,
            // which declare an `outFields` each; both are checked below.
            "outFields", "markerColor",
            // Modelled on `ForestryStatusColors`, checked by
            // `matchesForestryStatusColors`.
            "statusColors",
            // The health screens' advice and legend, checked by
            // `matchesGuidanceAndRiskBands`.
            "guidance", "riskBands",
        ]
        var unknown: Set<String> = []
        for entry in Self.fixture.layers.values {
            unknown.formUnion(Set(entry.keys).subtracting(modelled).subtracting(Self.deferredFields))
        }
        #expect(
            unknown.isEmpty,
            "New web fields with no Swift home and no deferral: \(unknown.sorted())"
        )
    }

    // MARK: - The gate's inputs

    @Test("Restricted set matches the fixture, including the derived layer")
    func restrictedSetMatchesFixture() {
        var expected = Set(
            Self.fixture.layers
                .filter { $0.value["licence"]?.string == "province-restricted" }
                .keys
        )
        expected.formUnion(
            Self.fixture.layers
                .filter { $0.value["requiresProvinceLicence"]?.bool == true }
                .keys
        )
        #expect(Set(LayerCatalog.restrictedLayerIDs.map(\.rawValue)) == expected)
        #expect(LayerCatalog.restrictedLayerIDs.count == 16)
    }

    @Test("Restricted hosts cover every restricted service, and nothing else")
    func restrictedHostsAreDerived() {
        // Derived from the catalog rather than listed, so a new restricted
        // layer extends the no-request assertion automatically.
        #expect(
            LayerCatalog.restrictedHosts == [
                "nsgiwa.novascotia.ca",
                "nsgiwa2.novascotia.ca",
                "fletcher.novascotia.ca",
                "dawson.novascotia.ca",
            ]
        )
    }

    @Test("The app opens with the historical sheet and nothing restricted")
    func nativeDefaultsAreUnrestricted() {
        #expect(LayerCatalog.nativeDefaultVisibleIDs == [.fletcher])
        #expect(
            LayerCatalog.nativeDefaultVisibleIDs
                .isDisjoint(with: LayerCatalog.restrictedLayerIDs),
            "a restricted layer on at launch would gate the app behind a dialog"
        )
    }

    @Test("Every layer is reachable by id")
    func lookupCoversEveryLayer() {
        for id in LayerID.allCases {
            #expect(LayerCatalog.descriptor(for: id) != nil, "\(id.rawValue) has no descriptor")
        }
    }

    @Test("Group membership partitions the catalog")
    func groupsPartitionTheCatalog() {
        let grouped = LayerGroupID.allCases.flatMap { LayerCatalog.layers(in: $0) }
        #expect(grouped.count == LayerCatalog.all.count)
        #expect(Set(grouped.map(\.id)) == Set(LayerCatalog.all.map(\.id)))
    }

    @Test("Zoom ranges are non-empty")
    func zoomRangesAreSane() {
        for layer in LayerCatalog.all {
            #expect(layer.minZoom <= layer.maxZoom, "\(layer.id.rawValue) has an inverted range")
            if let native = layer.maxNativeZoom {
                #expect(native <= layer.maxZoom, "\(layer.id.rawValue) maxNativeZoom")
                #expect(native >= layer.minZoom, "\(layer.id.rawValue) maxNativeZoom")
            }
        }
    }
}
