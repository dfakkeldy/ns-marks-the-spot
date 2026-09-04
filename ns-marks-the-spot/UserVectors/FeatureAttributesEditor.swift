import GeoCore
import SwiftUI

/// Freeform key-value attributes on the selected feature, per the
/// field-capture contract: values entered here are stored as STRINGS — no
/// numeric or boolean coercion; typed fields arrive later with templates.
/// Imported non-string values round-trip untouched: scalars stay their type
/// until the user edits them, and objects/arrays render read-only rather
/// than being flattened.
///
/// Hidden rather than editable: `name` and `description` (they have their
/// own fields above), `coordinateProperties` (per-vertex times, not an
/// attribute), and the app-owned `nsmts:` namespace — which the add flow
/// also refuses, so imported files' own attribute tables can never collide
/// with app semantics.
struct FeatureAttributesEditor: View {
    let feature: GeoJsonFeature
    var onPatch: ([String: JSONValue?]) -> Void

    @State private var newKey = ""
    @State private var newValue = ""
    @State private var addError: String?

    private static let hiddenKeys: Set<String> = [
        "name", "description", "coordinateProperties",
    ]

    private static func isReserved(_ key: String) -> Bool {
        hiddenKeys.contains(key) || key.hasPrefix(CaptureSpec.reservedPrefix)
    }

    /// Sorted for a stable list; property order carries no meaning here.
    private var entries: [(key: String, value: JSONValue)] {
        feature.properties
            .filter { !Self.isReserved($0.key) }
            .sorted { $0.key < $1.key }
            .map { (key: $0.key, value: $0.value) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Attributes")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)

            if entries.isEmpty {
                Text("No attributes yet.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(entries, id: \.key) { entry in
                AttributeRow(
                    key: entry.key,
                    value: entry.value,
                    onChange: { text in onPatch([entry.key: .string(text)]) },
                    onRemove: { onPatch([entry.key: nil]) }
                )
                // Re-seeded when the selection or the feature changes.
                .id("\(feature.id ?? "")/\(entry.key)")
            }

            HStack(spacing: 6) {
                TextField("Name", text: $newKey)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)
                    .frame(maxWidth: 120)
                TextField("Value", text: $newValue)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)
                // Shrunk to caption, so the bordered style's own metric is a
                // metric for eleven-point text.
                Button("Add") { addAttribute() }
                    .font(.caption)
                    .buttonStyle(.bordered)
                    .frame(minHeight: 44)
            }

            if let addError {
                Text(addError)
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
    }

    private func addAttribute() {
        let key = newKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else {
            addError = "Give the attribute a name."
            return
        }
        guard !Self.isReserved(key) else {
            addError = "This name is reserved — pick another."
            return
        }
        guard !entries.contains(where: { $0.key == key }) else {
            addError = "This attribute already exists — edit it above."
            return
        }
        onPatch([key: .string(newValue)])
        newKey = ""
        newValue = ""
        addError = nil
    }
}

/// One attribute row: editable for strings and scalars (editing stores a
/// string, per the contract), read-only for structures.
private struct AttributeRow: View {
    let key: String
    let value: JSONValue
    var onChange: (String) -> Void
    var onRemove: () -> Void

    @State private var text = ""

    private var isComplex: Bool {
        switch value {
        case .object, .array: return true
        default: return false
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Text(key)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 120, alignment: .leading)
                .lineLimit(1)
            if isComplex {
                Text("Complex value — kept as imported.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                TextField("Value", text: $text)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)
                    .onAppear { text = value.displayText }
                    .onChange(of: text) { _, edited in
                        // The guard makes commit-on-change safe: seeding the
                        // field fires the same handler with the stored value.
                        guard edited != value.displayText else { return }
                        onChange(edited)
                    }
            }
            Button {
                onRemove()
            } label: {
                Image(systemName: "minus.circle")
                    .foregroundStyle(.secondary)
                    // The row grows to hold a full-size target and the value
                    // field gives up the width, which is the right way round:
                    // the field is the part of this row that stretches, and
                    // this is the control that deletes what was typed into it.
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(key)")
        }
    }
}
