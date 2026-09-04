import SwiftUI

/// The material a card floating over the map is drawn on.
///
/// Every panel, callout and readout the app draws over MapKit shares one
/// surface treatment: a material, a rounded corner and a shadow. On iOS 26 the
/// system's own answer for exactly this — chrome layered over content it has to
/// stay legible against — is Liquid Glass, which refracts and reacts to what
/// is under it rather than blurring it flat. Naming the treatment once is what
/// lets the app take the system's answer where it exists and keep its own
/// where it does not, without eighteen `#available` checks in eighteen views.
///
/// What does NOT change with the surface: the type on it. The evidence caveats
/// were raised out of the smallest tier in the same pass this landed, and they
/// carry the label colour on both surfaces — glass is more transparent than a
/// material, not less, so a sentence that has to survive a moving map behind
/// it needed that raise more on iOS 26, not less.
struct MapChromeSurface: ViewModifier {
    /// What the surface is cut to. The app's cards are rounded rectangles and
    /// its rail buttons are circles, and the glass takes the same shape so the
    /// two generations of the app look like the same app.
    enum Shape {
        case roundedRectangle(cornerRadius: CGFloat)
        case circle
    }

    var shape: Shape = .roundedRectangle(cornerRadius: 16)

    /// Whether this surface is one the reader acts on rather than reads.
    /// Interactive glass reacts to touch; a caption chip should not pretend to.
    var interactive = false

    /// The shadow the material surface carries. Glass draws its own edge and
    /// its own separation, so passing a shadow through it doubles the
    /// treatment and reads as a sticker rather than a pane.
    var shadow: (opacity: Double, radius: CGFloat, y: CGFloat)? = (0.15, 6, 3)

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            let glass: Glass = interactive ? .regular.interactive() : .regular
            switch shape {
            case .roundedRectangle(let cornerRadius):
                content.glassEffect(glass, in: .rect(cornerRadius: cornerRadius))
            case .circle:
                content.glassEffect(glass, in: .circle)
            }
        } else {
            switch shape {
            case .roundedRectangle(let cornerRadius):
                content
                    .background(.regularMaterial)
                    .clipShape(.rect(cornerRadius: cornerRadius))
                    .modifier(MapChromeShadow(shadow: shadow))
            case .circle:
                content
                    .background(.regularMaterial)
                    .clipShape(.circle)
                    .modifier(MapChromeShadow(shadow: shadow))
            }
        }
    }
}

/// The pre-26 shadow, optional so a card that never had one does not gain one.
private struct MapChromeShadow: ViewModifier {
    var shadow: (opacity: Double, radius: CGFloat, y: CGFloat)?

    func body(content: Content) -> some View {
        if let shadow {
            content.shadow(
                color: .black.opacity(shadow.opacity),
                radius: shadow.radius,
                x: 0,
                y: shadow.y
            )
        } else {
            content
        }
    }
}

extension View {
    /// Draws this view as a card over the map. See `MapChromeSurface`.
    func mapChromeSurface(
        cornerRadius: CGFloat = 16,
        interactive: Bool = false,
        shadow: (opacity: Double, radius: CGFloat, y: CGFloat)? = (0.15, 6, 3)
    ) -> some View {
        mapChromeSurface(
            shape: .roundedRectangle(cornerRadius: cornerRadius),
            interactive: interactive,
            shadow: shadow
        )
    }

    func mapChromeSurface(
        shape: MapChromeSurface.Shape,
        interactive: Bool = false,
        shadow: (opacity: Double, radius: CGFloat, y: CGFloat)? = (0.15, 6, 3)
    ) -> some View {
        modifier(
            MapChromeSurface(shape: shape, interactive: interactive, shadow: shadow)
        )
    }
}
