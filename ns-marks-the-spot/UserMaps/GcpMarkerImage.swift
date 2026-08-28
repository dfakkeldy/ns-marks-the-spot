import UIKit

/// The numbered disc a control point is drawn as, on the scan and on the map.
///
/// One drawing for both panes, because the number is how a user matches a point
/// on the sheet to the same point on the ground — and to its row in the list.
/// Two renderers would eventually disagree about which is which.
enum GcpMarkerImage {
    static let diameter: CGFloat = 26

    static func image(number: Int?, pending: Bool = false, selected: Bool = false) -> UIImage {
        let size = CGSize(width: diameter, height: diameter)
        return UIGraphicsImageRenderer(size: size).image { _ in
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: 1.5, dy: 1.5)
            let circle = UIBezierPath(ovalIn: rect)
            (pending ? UIColor.systemOrange : UIColor.tintColor).setFill()
            circle.fill()
            // A white ring so a marker stays legible over a dark scan and over
            // a satellite basemap alike.
            (selected ? UIColor.label : UIColor.white).setStroke()
            circle.lineWidth = selected ? 3 : 1.5
            circle.stroke()

            // A half-placed point has no number yet: it is waiting for its
            // other side, and giving it the next one would claim a pair exists.
            let text = number.map(String.init) ?? "?"
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 12, weight: .bold),
                .foregroundColor: UIColor.white,
            ]
            let bounds = (text as NSString).size(withAttributes: attributes)
            (text as NSString).draw(
                at: CGPoint(
                    x: (size.width - bounds.width) / 2,
                    y: (size.height - bounds.height) / 2
                ),
                withAttributes: attributes
            )
        }
    }
}
