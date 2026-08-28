import Foundation
import SwiftUI

/// Adapts a main-actor callback into the `@Sendable` setter `Binding` wants.
///
/// The direct spelling — `Binding(get:set: someMainActorClosure)` — is accepted
/// by the type checker and then crashes the Swift 6.3.3 code generator: while
/// emitting the isolated-to-`@Sendable` reabstraction thunk it asks LLVM for a
/// vector of 4,294,967,297 elements and aborts. Because it is a code-generation
/// failure and not a type error, `-typecheck` cannot see it; it surfaces only
/// in a real build, as a compiler crash with no source line.
///
/// Calling the callback from inside a closure literal asks for no thunk at all.
/// `assumeIsolated` is honest here rather than a way of silencing the checker:
/// SwiftUI drives a `Binding` setter from the main actor, and if that ever
/// stopped being true this would trap loudly instead of quietly mutating view
/// state off it.
///
/// Remove this and pass the callback straight through once the toolchain
/// emitting that thunk is fixed.
func mainActorSetter<Value: Sendable>(
    _ body: @escaping @MainActor (Value) -> Void
) -> @Sendable (Value) -> Void {
    { value in MainActor.assumeIsolated { body(value) } }
}
