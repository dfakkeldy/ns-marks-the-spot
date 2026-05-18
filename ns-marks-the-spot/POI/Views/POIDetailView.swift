import SwiftUI

struct POIDetailView: View {
    let poi: PointOfInterest

    var body: some View {
        VStack(spacing: 16) {
            // Drag indicator
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color.secondary.opacity(0.4))
                .frame(width: 36, height: 5)
                .padding(.top, 8)

            // Category badge
            Text(poi.category.capitalized)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(categoryColor, in: Capsule())

            // Name
            Text(poi.name)
                .font(.title2)
                .fontWeight(.bold)

            // Coordinates
            Text(formattedCoordinates)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .monospacedDigit()

            Spacer()
        }
        .frame(maxWidth: .infinity)
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
