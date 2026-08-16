import Foundation

/// The small part of a PDF this reader models.
///
/// A georeferenced PDF's registration lives in ordinary PDF objects — names,
/// numbers, strings, arrays and dictionaries — and nothing here needs to know
/// about streams, fonts or page content. Modelling only these five keeps the
/// registration logic testable without a PDF at all: the app target walks
/// CoreGraphics' dictionaries and hands the result over as these values.
///
/// `.opaque` is everything this reader does not model. It is deliberately not
/// an error: a dictionary carrying a stream next to its `CTM` is perfectly
/// ordinary, and only the keys that are looked up have to be understood.
public indirect enum PdfValue: Equatable, Sendable {
    case number(Double)
    case name(String)
    case text(String)
    case array([PdfValue])
    case dictionary([String: PdfValue])
    case opaque
}

extension PdfValue {
    /// A `/Name`'s text, and nothing else's.
    var nameValue: String? {
        if case .name(let value) = self { return value }
        return nil
    }

    /// A string object's text, trimmed as the web trims it.
    var textValue: String? {
        if case .text(let value) = self {
            return value.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }

    /// A number, including one written as a string.
    ///
    /// TerraGo's dictionaries store several of their scalars as strings, so a
    /// reader that accepted only real PDF numbers would reject files that are
    /// otherwise perfectly registered. The pattern is the web's: a bare decimal
    /// with an optional exponent, so "1,5", "0x10" and "Infinity" are not
    /// numbers here either.
    var scalarValue: Double? {
        switch self {
        case .number(let value):
            return value.isFinite ? value : nil
        case .text(let raw):
            let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard PdfMapRegistration.looksNumeric(text), let value = Double(text),
                  value.isFinite
            else { return nil }
            return value
        default:
            return nil
        }
    }

    /// An array of numbers, or nil if any element is not one. All-or-nothing
    /// deliberately: a `CTM` with five numbers and a name in it is not a
    /// transform with one bad entry, it is not a transform.
    var numberArray: [Double]? {
        guard case .array(let items) = self else { return nil }
        var numbers = [Double]()
        for item in items {
            guard let value = item.scalarValue else { return nil }
            numbers.append(value)
        }
        return numbers
    }

    var dictionaryValue: [String: PdfValue]? {
        if case .dictionary(let value) = self { return value }
        return nil
    }
}

/// The page's own geometry: how a PDF user-space coordinate becomes a pixel of
/// the raster the page was rendered to.
///
/// `transform` is in PDF's own order — `[a, b, c, d, e, f]` — and `width` and
/// `height` are the rendered raster's, not the page's points. Registration
/// arrives in user space, and every control point has to come out in the pixels
/// of the image that will actually be drawn.
public struct PdfViewportGeometry: Hashable, Sendable {
    public var transform: [Double]
    public var width: Double
    public var height: Double

    public init(transform: [Double], width: Double, height: Double) {
        self.transform = transform
        self.width = width
        self.height = height
    }

    func apply(x: Double, y: Double) -> PixelPoint {
        let t = transform
        return PixelPoint(x: t[0] * x + t[2] * y + t[4], y: t[1] * x + t[3] * y + t[5])
    }
}

/// Registration read out of a georeferenced PDF.
///
/// Ported from `web/src/userMaps/parsers/geoPdfMetadata.ts`. Two flavours are
/// understood, and they are genuinely different documents:
///
/// - **ISO 32000 `VP`**: a Viewport whose `Measure` dictionary lists paired
///   local and geographic points. The ground positions are already latitude and
///   longitude, so nothing is projected — the coordinate system is checked and
///   then not used.
/// - **TerraGo `LGIDict`**: a projection dictionary and a `CTM`, with the map's
///   neatline giving the four corners. Those corners are projected through the
///   declared system, so this flavour is only usable when the system is one
///   `RasterProjection` accepts.
///
/// Every candidate is checked before it is offered, not when it is first drawn.
/// A registration that names a place but does not solve, or that solves onto a
/// mesh running off the earth, is a sheet that vanishes at draw time with
/// nothing in the arithmetic able to say why.
///
/// The rendering half — turning the page into pixels — is the app target's,
/// because it is CoreGraphics. What a file is allowed to claim about where it
/// sits is here, where it can be tested without a device.
public enum PdfMapRegistration {
    /// Which of the two registrations a candidate came from. Kept on the
    /// candidate because a file carrying both should let the user see which one
    /// they are about to trust, rather than the reader silently preferring one.
    public enum Flavour: String, Equatable, Sendable {
        case measure
        case lgiDict
    }

    /// Why a registration in the file was not offered.
    public enum Rejection: String, Equatable, Sendable {
        /// Structurally not a registration this reader understands — the wrong
        /// dictionary type, an unsupported version, a neatline that is not a
        /// rectangle.
        case unsupported
        /// A coordinate system outside `RasterProjection`'s accepted list.
        ///
        /// Broader here than on the web: that reader can fall back to a raw
        /// proj4 or WKT definition, and nothing on this surface parses one. A
        /// PDF whose projection is given only as WKT is refused with this
        /// rather than guessed at.
        case unsupportedCrs = "unsupported-crs"
        /// Understood, and the numbers do not place a map: too few points,
        /// points that do not determine a transform, or ground positions that
        /// are not on the earth.
        case invalid
        /// The bytes are not a PDF this reader can open, or the page is not
        /// there. Raised by the caller that does the opening.
        case unreadable
    }

    /// One registration the file offers, ready to become a user map.
    public struct Candidate: Equatable, Sendable, Identifiable {
        public var id: String
        public var flavour: Flavour
        /// The name the file gave this registration, if it gave one. Shown to
        /// the user when a file offers more than one, because "Viewport 2" from
        /// the producer beats an index this reader invented.
        public var label: String?
        /// The part of the rendered page this registration covers, in the
        /// raster's pixels. A map sheet inside a page of margins and title
        /// blocks registers only its own frame.
        public var sourceRect: PixelRect
        public var gcps: [GroundControlPoint]

        public init(
            id: String,
            flavour: Flavour,
            label: String?,
            sourceRect: PixelRect,
            gcps: [GroundControlPoint]
        ) {
            self.id = id
            self.flavour = flavour
            self.label = label
            self.sourceRect = sourceRect
            self.gcps = gcps
        }
    }

    /// What one rejected registration was, and why it was refused. The flavour
    /// is kept so a file with one good `LGIDict` and one broken `VP` can say
    /// which half failed rather than reporting an unattributed problem.
    public struct Refusal: Equatable, Sendable {
        public var flavour: Flavour?
        public var reason: Rejection

        public init(flavour: Flavour?, reason: Rejection) {
            self.flavour = flavour
            self.reason = reason
        }
    }

    /// Everything the page had to say about where it sits.
    ///
    /// Candidates and refusals both, and never one silently standing for the
    /// other: a page with three registrations of which two are unusable is a
    /// different thing from a page with one, and the user choosing between them
    /// is entitled to know that two were refused.
    public struct Extraction: Equatable, Sendable {
        public var candidates: [Candidate]
        public var rejected: [Refusal]

        public init(candidates: [Candidate] = [], rejected: [Refusal] = []) {
            self.candidates = candidates
            self.rejected = rejected
        }
    }

    /// Thrown internally while a candidate is being read. Not public: what
    /// leaves this type is a `Refusal`, which is the same classification the
    /// web reports.
    enum ReadFailure: Error {
        case unsupported
        case unsupportedCrs
        case invalid
    }

    // MARK: - Reading a page

    /// Every registration on one page, checked.
    ///
    /// `page` is the page dictionary, already resolved: the caller has followed
    /// the indirect references, because CoreGraphics does that on the way out
    /// and there is nothing here that could follow one.
    public static func candidates(
        page: [String: PdfValue], viewport: PdfViewportGeometry
    ) -> Extraction {
        var extraction = Extraction()
        guard viewport.transform.count == 6,
              viewport.transform.allSatisfy(\.isFinite),
              viewport.width > 0, viewport.height > 0
        else {
            return Extraction(rejected: [Refusal(flavour: nil, reason: .invalid)])
        }

        if let vp = page["VP"] {
            guard case .array(let entries) = vp else {
                // A `VP` that is not an array is a structure this reader does
                // not model. Reported rather than ignored: the file says it is
                // georeferenced and this reader is declining to agree.
                extraction.rejected.append(Refusal(flavour: .measure, reason: .unsupported))
                return finish(extraction, page: page, viewport: viewport)
            }
            for (index, entry) in entries.enumerated() {
                guard let dictionary = entry.dictionaryValue else {
                    extraction.rejected.append(
                        Refusal(flavour: .measure, reason: .unsupported)
                    )
                    continue
                }
                do {
                    extraction.candidates.append(
                        try measureCandidate(
                            dictionary, identity: "direct-\(index)", viewport: viewport
                        )
                    )
                } catch {
                    extraction.rejected.append(
                        Refusal(flavour: .measure, reason: reason(for: error))
                    )
                }
            }
        }
        return finish(extraction, page: page, viewport: viewport)
    }

    private static func finish(
        _ extraction: Extraction,
        page: [String: PdfValue],
        viewport: PdfViewportGeometry
    ) -> Extraction {
        var extraction = extraction
        guard let lgi = page["LGIDict"] else { return extraction }
        // Single dictionary or an array of them; TerraGo writes both, and one
        // registration is not a different kind of file from several.
        let entries: [PdfValue]
        if case .array(let items) = lgi { entries = items } else { entries = [lgi] }
        for (index, entry) in entries.enumerated() {
            guard let dictionary = entry.dictionaryValue else {
                extraction.rejected.append(Refusal(flavour: .lgiDict, reason: .unsupported))
                continue
            }
            do {
                extraction.candidates.append(
                    try lgiCandidate(
                        dictionary, identity: "direct-\(index)", viewport: viewport
                    )
                )
            } catch {
                extraction.rejected.append(
                    Refusal(flavour: .lgiDict, reason: reason(for: error))
                )
            }
        }
        return extraction
    }

    static func reason(for error: Error) -> Rejection {
        switch error {
        case ReadFailure.unsupported: .unsupported
        case ReadFailure.unsupportedCrs: .unsupportedCrs
        default: .invalid
        }
    }

    // MARK: - ISO 32000 Measure

    static func measureCandidate(
        _ dictionary: [String: PdfValue],
        identity: String,
        viewport: PdfViewportGeometry
    ) throws -> Candidate {
        guard dictionary["Type"]?.nameValue == "Viewport" else {
            throw ReadFailure.unsupported
        }
        guard let bbox = dictionary["BBox"]?.numberArray, bbox.count == 4,
              let measure = dictionary["Measure"]?.dictionaryValue,
              measure["Type"]?.nameValue == "Measure",
              measure["Subtype"]?.nameValue == "GEO"
        else { throw ReadFailure.unsupported }

        guard let gcs = measure["GCS"]?.dictionaryValue else { throw ReadFailure.invalid }
        // Checked and then not used. The ground points in this flavour are
        // already latitude and longitude, so nothing is projected — but a file
        // declaring a system this app has never been verified against is a file
        // whose numbers may not mean what they appear to, and accepting it
        // because the arithmetic happens to be a no-op would place the sheet on
        // an unchecked datum.
        try checkGcs(gcs)

        guard let local = measure["LPTS"]?.numberArray,
              let ground = measure["GPTS"]?.numberArray,
              local.count == ground.count, local.count >= 6, local.count % 2 == 0
        else { throw ReadFailure.invalid }

        let (left, bottom, right, top) = (bbox[0], bbox[1], bbox[2], bbox[3])
        guard left != right, bottom != top else { throw ReadFailure.invalid }

        var gcps = [GroundControlPoint]()
        for offset in stride(from: 0, to: local.count, by: 2) {
            let pixel = viewport.apply(
                x: left + (right - left) * local[offset],
                y: bottom + (top - bottom) * local[offset + 1]
            )
            let map = GeoPoint(lat: ground[offset], lng: ground[offset + 1])
            guard isPlace(map) else { throw ReadFailure.invalid }
            gcps.append(GroundControlPoint(pixel: pixel, map: map))
        }

        let sourceRect = try rect(
            from: [
                viewport.apply(x: left, y: bottom),
                viewport.apply(x: left, y: top),
                viewport.apply(x: right, y: bottom),
                viewport.apply(x: right, y: top),
            ],
            viewport: viewport
        )
        let candidate = Candidate(
            id: candidateID(.measure, identity: identity, rect: sourceRect),
            flavour: .measure,
            label: dictionary["Name"]?.textValue,
            sourceRect: sourceRect,
            gcps: gcps
        )
        try validate(candidate)
        return candidate
    }

    /// The Measure dictionary's coordinate system, checked against the list
    /// this app can place a raster in.
    static func checkGcs(_ gcs: [String: PdfValue]) throws {
        let type = gcs["Type"]?.nameValue
        guard type == "GEOGCS" || type == "PROJCS" else { throw ReadFailure.unsupported }
        if let epsg = gcs["EPSG"]?.scalarValue {
            try check(crs: "EPSG:\(Int(epsg))")
            return
        }
        // A WKT definition and nothing else. The web parses these; nothing here
        // does, so the file is refused as an unsupported system rather than
        // accepted on the strength of a string nobody read.
        guard gcs["WKT"]?.textValue != nil else { throw ReadFailure.invalid }
        throw ReadFailure.unsupportedCrs
    }

    // MARK: - TerraGo LGIDict

    static func lgiCandidate(
        _ dictionary: [String: PdfValue],
        identity: String,
        viewport: PdfViewportGeometry
    ) throws -> Candidate {
        let version = dictionary["Version"]?.textValue
        guard dictionary["Type"]?.nameValue == "LGIDict",
              version == "2.1" || version == "2.3"
        else { throw ReadFailure.unsupported }

        guard let projection = dictionary["Projection"]?.dictionaryValue,
              let ctm = dictionary["CTM"]?.numberArray, ctm.count == 6
        else { throw ReadFailure.invalid }

        let crs = try projectionDefinition(projection)
        let corners = try neatlineCorners(dictionary)
        var gcps = [GroundControlPoint]()
        for corner in corners {
            let x = ctm[0] * corner.x + ctm[2] * corner.y + ctm[4]
            let y = ctm[1] * corner.x + ctm[3] * corner.y + ctm[5]
            let map: GeoPoint
            do {
                map = try RasterProjection.groundPosition(crs: crs, x: x, y: y)
            } catch {
                throw ReadFailure.invalid
            }
            gcps.append(
                GroundControlPoint(
                    pixel: viewport.apply(x: corner.x, y: corner.y), map: map
                )
            )
        }

        let sourceRect = try rect(
            from: corners.map { viewport.apply(x: $0.x, y: $0.y) }, viewport: viewport
        )
        let candidate = Candidate(
            id: candidateID(.lgiDict, identity: identity, rect: sourceRect),
            flavour: .lgiDict,
            label: dictionary["Description"]?.textValue,
            sourceRect: sourceRect,
            gcps: gcps
        )
        try validate(candidate)
        return candidate
    }

    /// The projection dictionary as an EPSG code this app accepts.
    ///
    /// The three shorthands here are TerraGo's own, and each maps onto exactly
    /// one system. Anything else — including a bare WKT string, which the web
    /// can parse and this cannot — is an unsupported system rather than a
    /// guess.
    static func projectionDefinition(_ projection: [String: PdfValue]) throws -> String {
        guard projection["Type"]?.nameValue == "Projection" else {
            throw ReadFailure.unsupported
        }
        if projection["WKT"]?.textValue != nil { throw ReadFailure.unsupportedCrs }

        let type = string(projection["ProjectionType"])
        let datum = string(projection["Datum"])
        let units = string(projection["Units"])

        if type == "GEOGRAPHIC", datum == "WGE" { return "EPSG:4326" }
        if type == "UT", datum == "NAR",
           projection["Zone"]?.scalarValue == 20,
           string(projection["Hemisphere"]) == "N" {
            return "EPSG:26920"
        }
        if type == "MC", datum == "WGE", units == "m",
           projection["CentralMeridian"]?.scalarValue == 0,
           projection["OriginLatitude"]?.scalarValue == 0,
           projection["FalseEasting"]?.scalarValue == 0,
           projection["FalseNorthing"]?.scalarValue == 0,
           projection["ScaleFactor"]?.scalarValue == 0 {
            return "EPSG:3857"
        }
        throw ReadFailure.unsupportedCrs
    }

    /// A value written either as a string or as a name. TerraGo is
    /// inconsistent about which, in the same dictionary.
    static func string(_ object: PdfValue?) -> String? {
        object?.textValue ?? object?.nameValue
    }

    /// How far apart two neatline coordinates must be to be different edges.
    static let neatlineAxisTolerance = 1e-7

    /// The neatline's four corners, refused unless they are a rectangle in
    /// user space.
    ///
    /// A non-rectangular neatline — an inset, a clipped county boundary — is a
    /// crop this reader cannot express: `sourceRect` is a rectangle, and
    /// squaring off an L-shaped frame would drape ground the registration never
    /// covered. Refused rather than approximated.
    static func neatlineCorners(
        _ dictionary: [String: PdfValue]
    ) throws -> [PixelPoint] {
        guard let values = dictionary["Neatline"]?.numberArray,
              values.count >= 8, values.count % 2 == 0
        else { throw ReadFailure.invalid }
        var points = stride(from: 0, to: values.count, by: 2).map {
            PixelPoint(x: values[$0], y: values[$0 + 1])
        }
        // A closed ring repeats its first point. Dropping it is not a
        // tolerance: five corners of which two are the same corner is four.
        if points.count == 5,
           abs(points[0].x - points[4].x) <= neatlineAxisTolerance,
           abs(points[0].y - points[4].y) <= neatlineAxisTolerance {
            points.removeLast()
        }
        guard points.count == 4 else { throw ReadFailure.unsupported }

        let xs = clusters(points.map(\.x))
        let ys = clusters(points.map(\.y))
        var cells = Set<String>()
        for point in points {
            guard let column = index(of: point.x, in: xs),
                  let row = index(of: point.y, in: ys)
            else { throw ReadFailure.unsupported }
            cells.insert("\(column)-\(row)")
        }
        guard xs.count == 2, ys.count == 2, cells.count == 4 else {
            throw ReadFailure.unsupported
        }
        return points
    }

    static func clusters(_ values: [Double]) -> [Double] {
        var clusters = [Double]()
        for value in values.sorted() where
            clusters.isEmpty || abs(value - clusters[clusters.count - 1])
                > neatlineAxisTolerance {
            clusters.append(value)
        }
        return clusters
    }

    static func index(of value: Double, in clusters: [Double]) -> Int? {
        clusters.firstIndex { abs(value - $0) <= neatlineAxisTolerance }
    }

    // MARK: - Checks

    /// Whether a registration places a map, rather than merely holding numbers.
    ///
    /// Three points is the affine solver's minimum, and three *distinct* points
    /// is what actually determines a transform: a `LPTS` array listing the same
    /// corner three times solves nothing while passing a count check.
    static func validate(_ candidate: Candidate) throws {
        guard candidate.gcps.count >= 3 else { throw ReadFailure.invalid }
        let distinct = Set(candidate.gcps.map { "\($0.pixel.x)-\($0.pixel.y)" })
        guard distinct.count >= 3,
              candidate.gcps.allSatisfy({
                  $0.pixel.x.isFinite && $0.pixel.y.isFinite && isPlace($0.map)
              })
        else { throw ReadFailure.invalid }

        guard let transform = AffineFit.solve(controlPoints: candidate.gcps) else {
            throw ReadFailure.invalid
        }
        // One cell is enough: an affine warp is affine everywhere, so the
        // corners are where it can run off the earth if it is going to.
        let mesh: [[GeoPoint]]
        do {
            mesh = try GcpMesh.latLngMesh(
                transform,
                pixelSize: PixelSize(
                    width: candidate.sourceRect.x + candidate.sourceRect.width,
                    height: candidate.sourceRect.y + candidate.sourceRect.height
                ),
                gridSize: 1,
                sourceRect: candidate.sourceRect
            )
        } catch {
            throw ReadFailure.invalid
        }
        guard mesh.allSatisfy({ $0.allSatisfy(isPlace) }) else {
            throw ReadFailure.invalid
        }
    }

    static func isPlace(_ point: GeoPoint) -> Bool {
        point.lat.isFinite && point.lng.isFinite
            && point.lat >= -90 && point.lat <= 90
            && point.lng >= -180 && point.lng <= 180
    }

    static func check(crs: String) throws {
        do {
            try RasterProjection.validate(crs: crs)
        } catch {
            throw ReadFailure.unsupportedCrs
        }
    }

    /// The rectangle four transformed corners bound, clipped to the raster.
    static func rect(
        from points: [PixelPoint], viewport: PdfViewportGeometry
    ) throws -> PixelRect {
        let xs = points.map(\.x)
        let ys = points.map(\.y)
        guard let minX = xs.min(), let maxX = xs.max(),
              let minY = ys.min(), let maxY = ys.max()
        else { throw ReadFailure.invalid }
        do {
            return try GcpMesh.resolve(
                pixelSize: PixelSize(width: viewport.width, height: viewport.height),
                sourceRect: PixelRect(
                    x: minX, y: minY, width: maxX - minX, height: maxY - minY
                )
            )
        } catch {
            throw ReadFailure.invalid
        }
    }

    /// A candidate's identity, stable across two reads of the same file.
    ///
    /// The web keys on the PDF object number where it has one; CoreGraphics
    /// does not hand those out, so the position in the array stands in. The
    /// rectangle is rounded into the id for the same reason the web rounds it:
    /// a registration re-read from the same bytes must produce the same id, and
    /// the last bits of a float do not survive a round trip through a renderer.
    static func candidateID(_ flavour: Flavour, identity: String, rect: PixelRect) -> String {
        let numbers = [rect.x, rect.y, rect.width, rect.height]
            .map { String(format: "%.7f", $0) }
            .joined(separator: "-")
        return "\(flavour.rawValue)-\(identity)-\(numbers)"
    }

    /// What an extraction means for the file the user chose.
    public enum Outcome: Equatable, Sendable {
        /// A registration to place the sheet by. The rest of the candidates are
        /// carried so the user can be told there were others.
        case placed(Candidate, alternatives: [Candidate])
        /// The page said nothing about where it belongs. An ordinary scan, for
        /// the georeferencer — not an error.
        case unregistered
        /// The page said where it belongs and this app could not use the
        /// answer.
        case refused(Rejection)
    }

    /// Which registration to place the sheet by, or what to tell the user.
    ///
    /// The first usable candidate wins, in the file's own order — `VP` before
    /// `LGIDict`, because the ISO structure carries latitude and longitude
    /// outright while TerraGo's has to be projected, and a projection is one
    /// more place two surfaces can disagree.
    ///
    /// A page whose only registrations were refused is refused, rather than
    /// quietly demoted to a blank scan for the user to place by hand. The
    /// file's own answer about where it sits went unread, and placing it by eye
    /// on top of that is worse than being told why.
    public static func outcome(of extraction: Extraction) -> Outcome {
        if let first = extraction.candidates.first {
            return .placed(first, alternatives: Array(extraction.candidates.dropFirst()))
        }
        guard !extraction.rejected.isEmpty else { return .unregistered }
        // The most specific reason present, not the first. A file with one
        // structurally unreadable viewport and one in an unsupported system
        // should say which system, because that is the half the user can act
        // on.
        for reason in [Rejection.unsupportedCrs, .invalid, .unsupported, .unreadable]
        where extraction.rejected.contains(where: { $0.reason == reason }) {
            return .refused(reason)
        }
        return .unregistered
    }

    /// How large a rasterised page may be on its longest side.
    ///
    /// A PDF page has no pixels of its own, so this number *is* the map's
    /// resolution — control points are recorded in it, and it cannot be raised
    /// later without every saved point moving. A letter page at this cap comes
    /// out near 370 dots per inch, which holds a surveyed line; the same cap is
    /// what an imported raster is downscaled to, so the two kinds of map cost
    /// the same memory.
    public static let maxRenderDimension = 4096.0

    /// How much to magnify a page, in points, to reach that cap.
    ///
    /// Never below 1: a page smaller than the cap is drawn at least at its own
    /// size, because rendering a business-card-sized inset at 0.3× would throw
    /// away detail to save memory nobody needed.
    public static func renderScale(
        pageWidth: Double, pageHeight: Double, maxDimension: Double = maxRenderDimension
    ) -> Double? {
        let longest = max(pageWidth, pageHeight)
        guard pageWidth.isFinite, pageHeight.isFinite,
              pageWidth > 0, pageHeight > 0, longest > 0
        else { return nil }
        return max(1, maxDimension / longest)
    }

    /// The web's PDF number pattern: a bare decimal with an optional exponent.
    static func looksNumeric(_ text: String) -> Bool {
        var rest = Substring(text)
        if rest.first == "+" || rest.first == "-" { rest = rest.dropFirst() }
        let digits = rest.prefix { $0.isASCII && $0.isNumber }
        rest = rest.dropFirst(digits.count)
        var fraction = Substring("")
        if rest.first == "." {
            rest = rest.dropFirst()
            fraction = rest.prefix { $0.isASCII && $0.isNumber }
            rest = rest.dropFirst(fraction.count)
        }
        guard !digits.isEmpty || !fraction.isEmpty else { return false }
        guard !rest.isEmpty else { return true }
        guard rest.first == "e" || rest.first == "E" else { return false }
        rest = rest.dropFirst()
        if rest.first == "+" || rest.first == "-" { rest = rest.dropFirst() }
        return !rest.isEmpty && rest.allSatisfy { $0.isASCII && $0.isNumber }
    }
}
