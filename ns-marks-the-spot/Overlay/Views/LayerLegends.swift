import GeoCore
import MapCatalog
import NSDataServices
import SwiftUI

/// What the colours on a thematic layer mean.
///
/// These four layers say everything they have to say in their own symbology:
/// they are rasters or lines with no feature to tap and no popup, so a reader
/// who cannot read the colour is reading nothing. Worse, they can misread it —
/// a purple band on the arsenic screen describes the rate of exceedances across
/// a bedrock unit, and without the legend and the province's own advice beside
/// it, a reader is left to guess whether the map has just told them their water
/// is unsafe. It has not, and cannot.
///
/// Ported from the legends in `web/src/components/LayerRows.tsx`.
enum LayerLegends {
    /// The legend for a layer, or nothing where the layer needs none.
    @ViewBuilder
    static func view(for descriptor: LayerDescriptor) -> some View {
        switch descriptor.id {
        case .roads:
            RoadLegend()
        case .invernessHydroPotential:
            HydroPotentialLegend()
        case .oldGrowthPolicy:
            ForestryStatusLegend(
                colors: LayerCatalog.forestryStatusColors(for: descriptor.id)
            )
        default:
            if !descriptor.guidance.isEmpty || !descriptor.riskBands.isEmpty {
                HealthScreenLegend(descriptor: descriptor)
            }
        }
    }
}

/// A short rule in the colour the map draws the thing in.
private struct LineSwatch: View {
    let hex: String
    var width: Double = 3
    var dashed = false

    var body: some View {
        Path { path in
            path.move(to: CGPoint(x: 0, y: width / 2))
            path.addLine(to: CGPoint(x: 26, y: width / 2))
        }
        .stroke(
            Color(uiColor: UIColor(featureHex: hex)),
            style: StrokeStyle(
                lineWidth: width, lineCap: .round, dash: dashed ? [4, 3] : []
            )
        )
        .frame(width: 26, height: width)
        .accessibilityHidden(true)
    }
}

private struct BandSwatch: View {
    let hex: String

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(Color(uiColor: UIColor(featureHex: hex)))
            .frame(width: 16, height: 12)
            .overlay(
                RoundedRectangle(cornerRadius: 2)
                    .strokeBorder(.primary.opacity(0.15), lineWidth: 0.5)
            )
            .accessibilityHidden(true)
    }
}

private struct LegendRow<Swatch: View>: View {
    let label: String
    @ViewBuilder var swatch: Swatch

    var body: some View {
        HStack(spacing: 6) {
            swatch
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
    }
}

/// The province's advice, and the bands it draws the screen in.
///
/// The advice shows even for the aquifer-extent layer, which has no bands: what
/// it has to say is precisely that it rates nothing, and that is the sentence a
/// reader most needs before drawing a conclusion from a shaded area.
private struct HealthScreenLegend: View {
    let descriptor: LayerDescriptor

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !descriptor.guidance.isEmpty {
                Text(descriptor.guidance)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(descriptor.riskBands, id: \.label) { band in
                LegendRow(label: band.label) { BandSwatch(hex: band.colorHex) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(descriptor.name) risk bands")
    }
}

private struct ForestryStatusLegend: View {
    let colors: ForestryStatusColors?

    var body: some View {
        if let colors {
            VStack(alignment: .leading, spacing: 4) {
                LegendRow(label: "Confirmed old growth") {
                    BandSwatch(hex: colors.confirmedOldGrowth)
                }
                LegendRow(label: "Restoration opportunity") {
                    BandSwatch(hex: colors.restorationOpportunity)
                }
                LegendRow(label: "Status unknown") { BandSwatch(hex: colors.unknown) }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Old-growth policy status legend")
        }
    }
}

private struct RoadLegend: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LegendRow(label: "Highway") { LineSwatch(hex: "#333333") }
            LegendRow(label: "Local road") { LineSwatch(hex: "#cc4d4d") }
            LegendRow(label: "Resource road") { LineSwatch(hex: "#e66600") }
            LegendRow(label: "Trail / track") {
                LineSwatch(hex: "#2b2730", width: 4, dashed: true)
            }
            LegendRow(label: "Culvert") { LineSwatch(hex: "#111111", width: 4) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Road type legend")
    }
}

/// Two separate keys, because the reach carries two separate readings.
///
/// Width is catchment area, which is measured; colour is a nominal power band
/// under one fixed flow scenario, which is modelled. Presenting them as one key
/// would let a thick red line read as a confirmed generating site.
private struct HydroPotentialLegend: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Line width = modeled upstream area")
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                LineSwatch(hex: "#64748b", width: 1.75)
                Text("smaller").font(.caption2).foregroundStyle(.secondary)
                LineSwatch(hex: "#64748b", width: 6.5)
                Text("larger").font(.caption2).foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Thinner lines drain smaller areas")

            Text("Colour = nominal micro-hydro scale")
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
            ForEach(HydroPotentialPilot.PotentialClass.allCases, id: \.self) { band in
                LegendRow(label: label(for: band)) {
                    LineSwatch(hex: band.colorHex)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Micro-hydro symbology")
    }

    /// The web spells the first band out rather than naming it: "no qualifying
    /// drop" is the pilot's own shorthand, and the sentence behind it — that no
    /// 5 m drop was found within 3 km — is what tells a reader what was
    /// actually looked for.
    private func label(for band: HydroPotentialPilot.PotentialClass) -> String {
        band == .notQualified ? "No 5 m drop within 3 km" : band.label
    }
}
