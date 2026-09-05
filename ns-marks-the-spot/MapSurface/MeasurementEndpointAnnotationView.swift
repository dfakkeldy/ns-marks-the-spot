import MapKit
import UIKit

/// A placed corner, with a readout above it when it ends a measurement.
@MainActor
final class MeasurementEndpointAnnotationView: MKAnnotationView {
    private let marker = UIImageView()
    private let badge = UIView()
    private let readout = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        setUp()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setUp()
    }

    private func setUp() {
        addSubview(marker)
        addSubview(badge)
        badge.addSubview(readout)
        badge.backgroundColor = .systemBackground
        badge.layer.cornerRadius = 6
        badge.layer.borderWidth = 1
        readout.textColor = .label
        readout.textAlignment = .center
        readout.numberOfLines = 0
        isAccessibilityElement = true
        canShowCallout = false
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
            (view: MeasurementEndpointAnnotationView, _: UITraitCollection) in
            view.layoutReadout()
        }
    }

    func configure(with corner: VectorDraftVertexAnnotation) {
        annotation = corner
        marker.image = VectorDraftHandleImage.image(colorHex: corner.colorHex)
        readout.text = corner.endpointLabel
        badge.layer.borderColor = UIColor(featureHex: corner.colorHex).cgColor
        // A label can cover the ground where the reader wants to place the
        // next point. It must not select an annotation or intercept that tap.
        isUserInteractionEnabled = corner.endpointLabel == nil
        displayPriority = corner.endpointLabel == nil ? .defaultLow : .required
        zPriority = corner.endpointLabel == nil ? .defaultUnselected : .max
        accessibilityIdentifier = corner.endpointLabel == nil ? nil : "measure-endpoint-label"
        accessibilityLabel = corner.endpointLabel ?? "Placed corner \(corner.ordinal)"
        accessibilityValue = nil
        accessibilityHint = corner.endpointLabel == nil ? nil : "Measured on the map, not surveyed."
        accessibilityTraits = corner.endpointLabel == nil ? [] : [.staticText, .updatesFrequently]
        layoutReadout()
    }

    private func layoutReadout() {
        let dot = marker.image?.size ?? .zero
        guard readout.text != nil else {
            badge.isHidden = true
            bounds = CGRect(origin: .zero, size: dot)
            marker.frame = bounds
            centerOffset = .zero
            return
        }
        badge.isHidden = false
        readout.font = UIFont.preferredFont(forTextStyle: .subheadline, compatibleWith: traitCollection)
        let textSize = readout.sizeThatFits(CGSize(width: 220, height: .greatestFiniteMagnitude))
        let width = max(dot.width, ceil(textSize.width) + 16)
        let badgeHeight = ceil(textSize.height) + 10
        let height = badgeHeight + 10 + dot.height
        bounds = CGRect(x: 0, y: 0, width: width, height: height)
        badge.frame = CGRect(x: 0, y: 0, width: width, height: badgeHeight)
        readout.frame = badge.bounds.insetBy(dx: 8, dy: 5)
        marker.frame = CGRect(
            x: (width - dot.width) / 2, y: height - dot.height,
            width: dot.width, height: dot.height
        )
        // MapKit anchors the view's centre plus this offset. Keep the corner
        // dot exactly at the coordinate when the label wraps or text grows.
        centerOffset = CGPoint(x: 0, y: -(height - dot.height) / 2)
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        readout.text = nil
        accessibilityIdentifier = nil
        accessibilityLabel = nil
        accessibilityValue = nil
        accessibilityHint = nil
        accessibilityTraits = []
        isUserInteractionEnabled = true
        displayPriority = .defaultLow
        zPriority = .defaultUnselected
        layoutReadout()
    }
}
