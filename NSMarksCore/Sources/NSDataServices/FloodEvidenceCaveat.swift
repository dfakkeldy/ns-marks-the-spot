import Foundation

/// What a flood figure on this map actually measures.
///
/// The percentages read like a property of the parcel and are nothing of the
/// kind: one is an annual-exceedance probability attached to a mapped event,
/// the others are sea-level scenarios sampled off a rendered picture. Read from
/// one place by the panel, the exported note, and the printed appendix — a
/// number that travels without this sentence is a number a reader will take for
/// a finding.
public nonisolated enum FloodEvidenceCaveat {
    public static let measurement =
        "A 1% or 5% annual-exceedance probability describes the mapped flood event, not a "
        + "probability for the whole PID. The 2050 and 2100 figures are sea-level "
        + "scenarios, not further probabilities. The coastal percentages are read off the "
        + "Province's own rendered map and are an approximate screen — not a survey, an "
        + "elevation certificate, or an insurance finding."
}
