import MapCatalog
import NSDataServices
import SwiftUI

/// The browser's theme manager: the saved setups this device holds, and what
/// can be done to each one.
///
/// Built-in setups are not listed. They cannot be renamed, changed or deleted,
/// and a list that shows them alongside the reader's own would suggest they
/// can.
struct MapThemeManagerSheet: View {
    let viewModel: OverlayViewModel
    /// The panel sections open behind this sheet, recorded by whatever is saved
    /// or updated from here.
    let openSections: [LayerCategoryID]

    @Environment(\.dismiss) private var dismiss
    @State private var newThemeName = ""
    @State private var deletePending: MapTheme?

    var body: some View {
        NavigationStack {
            List {
                if let notice = viewModel.themes.notice {
                    Section {
                        Text(notice)
                            .font(.footnote)
                            .accessibilityIdentifier("theme-manager-notice")
                    }
                }

                Section("Save current setup") {
                    TextField("Setup name", text: $newThemeName)
                        .accessibilityIdentifier("theme-manager-name")
                    Button("Save current setup") {
                        // Cleared only on a save that happened. A refused one
                        // puts a notice at the top of this sheet, and taking
                        // the name away with it would make the reader retype
                        // it to try again.
                        if viewModel.saveCurrentSetup(
                            named: newThemeName,
                            openSections: openSections
                        ) {
                            newThemeName = ""
                        }
                    }
                    .disabled(trimmedName.isEmpty)
                    .accessibilityIdentifier("theme-manager-save")
                }

                Section("My setups") {
                    if viewModel.themes.custom.isEmpty {
                        Text("No saved setups on this device.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.themes.custom) { theme in
                            MapThemeManagerRow(
                                theme: theme,
                                onRename: { viewModel.themes.rename(theme.id, to: $0) },
                                onUpdate: {
                                    viewModel.updateSavedTheme(
                                        theme.id,
                                        openSections: openSections
                                    )
                                },
                                onDuplicate: { viewModel.themes.duplicate(theme.id) },
                                onDelete: { deletePending = theme }
                            )
                            .id(theme.id)
                        }
                    }
                }
            }
            .navigationTitle("My Map Setups")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            // Asked rather than undone: the library is only on this device, so
            // a deletion the reader did not mean has nothing to restore it
            // from.
            //
            // An alert rather than a confirmation dialog. Inside a sheet, iOS
            // draws the dialog as a popover anchored somewhere other than the
            // row that was tapped, and drops the cancel button on the floor:
            // one red button, no visible way back.
            .alert(
                deletePending.map { "Delete \($0.name)?" } ?? "",
                isPresented: Binding(
                    get: { deletePending != nil },
                    set: { if !$0 { deletePending = nil } }
                )
            ) {
                Button("Confirm delete", role: .destructive) {
                    if let theme = deletePending {
                        viewModel.deleteSavedTheme(theme.id)
                    }
                    deletePending = nil
                }
                Button("Keep setup", role: .cancel) { deletePending = nil }
            }
        }
    }

    private var trimmedName: String {
        newThemeName.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// One saved setup: its name, and the four things that can be done to it.
private struct MapThemeManagerRow: View {
    let theme: MapTheme
    let onRename: (String) -> Void
    let onUpdate: () -> Void
    let onDuplicate: () -> Void
    let onDelete: () -> Void

    @State private var name: String

    init(
        theme: MapTheme,
        onRename: @escaping (String) -> Void,
        onUpdate: @escaping () -> Void,
        onDuplicate: @escaping () -> Void,
        onDelete: @escaping () -> Void
    ) {
        self.theme = theme
        self.onRename = onRename
        self.onUpdate = onUpdate
        self.onDuplicate = onDuplicate
        self.onDelete = onDelete
        _name = State(initialValue: theme.name)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TextField("Name", text: $name)
                    .accessibilityLabel("Rename \(theme.name)")

                Button("Rename") { onRename(trimmedName) }
                    .buttonStyle(.borderless)
                    .font(.caption)
                    // Compared trimmed, because that is what gets stored. A
                    // field reading " Field day " against a saved "Field day"
                    // is the same name with spaces on it, and offering Rename
                    // for it offers a change that would do nothing.
                    .disabled(trimmedName.isEmpty || trimmedName == theme.name)
            }

            HStack(spacing: 12) {
                Button("Update from current setup", action: onUpdate)
                Button("Duplicate", action: onDuplicate)
                Button("Delete", role: .destructive, action: onDelete)
                Spacer(minLength: 0)
            }
            .font(.caption)
            .buttonStyle(.borderless)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(theme.name) setup")
        // The field follows what was stored, so a name that was trimmed on the
        // way in reads back as the name the library now holds.
        .onChange(of: theme.name) { _, stored in name = stored }
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
