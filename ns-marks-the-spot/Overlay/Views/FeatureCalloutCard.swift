import NSDataServices
import SwiftUI

/// What a tapped feature of a catalogued layer says about itself.
///
/// The same shape of card as the one the user's own layers use, so the two are
/// read the same way — but it never carries a "your own material" line, because
/// this is somebody else's published record and saying so is the whole point of
/// the eyebrow above the title.
struct FeatureCalloutCard: View {
    /// A control's touch target, scaled with the reader's text so the glyph
    /// inside it never outgrows the box around it. A definite size rather than
    /// a minimum, which is the pattern MapControlIcon already uses on the
    /// rail: a minimum lets the enclosing row propose whatever width it has
    /// left, so the target is only as certain as the layout around it.
    @ScaledMetric(relativeTo: .title3) private var controlTarget: CGFloat = 44

    let callout: FeatureCallout
    var onOpenParcel: ((String) -> Void)?
    var onClose: () -> Void

    var body: some View {
        // The eyebrow, the title and Close stay put; everything under them
        // scrolls. A well log has seven rows, a summary, a caveat and a
        // source link, and at an accessibility text size that is taller than
        // a phone in landscape — an unbounded card took its own Close
        // control, and the source link that says whose record this is, off
        // the top of the screen.
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(callout.layerName)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text(callout.title)
                        .font(.headline)
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .symbolRenderingMode(.hierarchical)
                        .frame(width: controlTarget, height: controlTarget)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    if let summary = callout.summary {
                        Text(summary)
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if !callout.rows.isEmpty {
                        // A grid rather than a list, so a label and its figure stay on
                        // one line: a depth that wrapped away from "Depth" would be a
                        // number with nothing saying what it measures.
                        Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 12, verticalSpacing: 3) {
                            ForEach(callout.rows) { row in
                                GridRow {
                                    Text(row.label)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .gridColumnAlignment(.leading)
                                    Text(row.value)
                                        .font(.caption)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        .padding(.top, 2)
                    }

                    // Never optional and never trimmed away. Every one of these layers
                    // is a screening rendering of somebody else's record, and the
                    // figures above are only safe to read with this sentence under
                    // them.
                    // The same colour as the figures above it: a sentence
                    // that limits what they mean cannot be the harder of the
                    // two to read through the material.
                    Text(callout.caveat)
                        .font(.footnote)
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)

                    if let label = callout.linkLabel, let url = callout.linkURL {
                        Link(destination: url) {
                            Label(label, systemImage: "arrow.up.right.square")
                                .font(.caption)
                        }
                        .padding(.top, 2)
                    }

                    if let pid = callout.pid, let onOpenParcel {
                        Button {
                            onOpenParcel(pid)
                        } label: {
                            Label("Open PID \(pid)", systemImage: "map")
                                .font(.caption)
                        }
                        .padding(.top, 2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Only as tall as it needs to be, up to what the caller leaves it.
            .scrollBounceBehavior(.basedOnSize)
        }
        .padding(12)
        .mapChromeSurface(shadow: nil)
    }
}

