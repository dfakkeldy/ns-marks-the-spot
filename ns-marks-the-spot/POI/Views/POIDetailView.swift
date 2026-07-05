import SwiftUI

struct POIDetailView: View {
    @Environment(\.dismiss) private var dismiss

    let poi: PointOfInterest

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                // Drag indicator
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(Color.secondary.opacity(0.4))
                    .frame(width: 36, height: 5)
                    .padding(.top, 8)

                // Category badge
                Text(poi.category.capitalized)
                    .font(.caption)
                    .bold()
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(categoryColor, in: Capsule())

                // Name
                Text(poi.name)
                    .font(.title2)
                    .bold()

                // Coordinates
                Text(formattedCoordinates)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()

                Spacer()
            }
            .frame(maxWidth: .infinity)
            .navigationTitle("Point of Interest")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.hidden)
    }

    private var formattedCoordinates: String {
        String(
            format: "%.4f°N  %.4f°W",
            abs(poi.latitude),
            abs(poi.longitude)
        )
    }

    private var categoryColor: Color {
        switch poi.category.lowercased() {
        case "waterfall": return .blue
        case "lighthouse": return .orange
        default: return .gray
        }
    }
}
