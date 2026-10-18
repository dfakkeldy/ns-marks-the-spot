import MapCatalog
import NSDataServices
import SwiftUI

/// The map-setup control at the top of the layer panel.
///
/// The browser's "Map setup" section: a picker over the five setups the app
/// ships and the reader's own, the line that describes the chosen one, what has
/// happened to it since, and the three things that can be done about it.
///
/// It sits above the sections rather than inside one because it moves all of
/// them. A theme decides which layers are drawn, whether tax-sale information
/// is shown, which record set it reads, and which sections of this panel open.
struct MapThemePickerView: View {
    let viewModel: OverlayViewModel
    /// The panel's open sections. A theme reopens the ones it names, and a
    /// saved setup records the ones that are open when it is saved.
    @Binding var expandedCategories: Set<LayerCategoryID>

    @State private var isNaming = false
    @State private var newThemeName = ""
    @State private var isManaging = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Map Setup")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)

            // On its own line rather than beside the heading. Beside it, the
            // menu gets what is left of a phone's width, and "Explore Nova
            // Scotia" wraps to three lines over the description underneath.
            Picker("Map Setup", selection: selection) {
                // Only while no named setup describes the map. Offering it
                // alongside the themes would be an entry that does nothing
                // when chosen.
                if viewModel.activeThemeID == nil {
                    Text("Current setup").tag("")
                }

                Section("Built-in") {
                    ForEach(MapTheme.builtIn) { theme in
                        Text(theme.name).tag(theme.id)
                    }
                }

                if !viewModel.themes.custom.isEmpty {
                    Section("My setups") {
                        ForEach(viewModel.themes.custom) { theme in
                            Text(theme.name).tag(theme.id)
                        }
                    }
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            // Two lines and room to take them, rather than one line clipped:
            // at accessibility type sizes the menu's own label wrapped and cut
            // its descenders off mid-glyph.
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("map-theme-picker")

            Text(viewModel.themeDescription)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            // One line, out loud, because everything it reports happened
            // without a dialog: a setup applied in part, a layer the licence
            // refused, a library that could not be read.
            Text(status)
                .font(.caption2)
                .foregroundStyle(isPlain ? .secondary : .primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("map-theme-status")

            HStack(spacing: 12) {
                Button {
                    newThemeName = ""
                    isNaming = true
                } label: {
                    Text("Save setup…")
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("map-theme-save")

                Button {
                    isManaging = true
                } label: {
                    Text("Manage")
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("map-theme-manage")

                if viewModel.themeStatus == .modified || viewModel.themeStatus == .partial {
                    Button {
                        viewModel.resetTheme()
                    } label: {
                        Text("Reset")
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityIdentifier("map-theme-reset")
                }

                Spacer(minLength: 0)
            }
            .font(.caption)
            .buttonStyle(.borderless)
        }
        // Reopened when a theme lands rather than when one is picked: a theme
        // naming a restricted layer waits on the licence sheet first, and the
        // sections should open with the layers, not before them.
        // Watched on the count rather than on the resolution itself: Reset
        // applies the same setup again, which resolves to an equal value, and
        // SwiftUI would not call this for a value that did not change.
        .onChange(of: viewModel.themeApplications) { _, _ in
            guard let resolution = viewModel.themeResolution else { return }
            expandedCategories = Set(resolution.preferredCategoryIDs)
        }
        .alert("Save this setup", isPresented: $isNaming) {
            TextField("Name", text: $newThemeName)
                .accessibilityIdentifier("map-theme-name")
            Button("Cancel", role: .cancel) {}
            Button("Save") {
                viewModel.saveCurrentSetup(
                    named: newThemeName,
                    openSections: openSections
                )
            }
            .disabled(newThemeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } message: {
            Text(
                "Saves the layers, sliders, tax-sale switch, record mode and "
                    + "open sections this map has now. It stays on this device."
            )
        }
        .sheet(isPresented: $isManaging) {
            MapThemeManagerSheet(viewModel: viewModel, openSections: openSections)
        }
    }

    private var selection: Binding<String> {
        Binding(
            get: { viewModel.activeThemeID ?? "" },
            set: { id in
                guard !id.isEmpty else { return }
                viewModel.selectTheme(id)
            }
        )
    }

    /// The sections in panel order, so a saved setup reopens them the way the
    /// panel lists them rather than in whatever order they were tapped.
    private var openSections: [LayerCategoryID] {
        LayerCategoryID.allCases.filter(expandedCategories.contains)
    }

    private var isPlain: Bool {
        viewModel.themeStatus == .exact || viewModel.themeStatus == .unnamed
    }

    private var status: String {
        guard let notice = viewModel.themeNotice else { return viewModel.themeStatusText }
        return "\(viewModel.themeStatusText) · \(notice)"
    }
}
