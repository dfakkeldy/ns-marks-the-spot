import Foundation
import GeoCore

/// What the reader is told about a walk that came back off disk.
///
/// A walk the reader stopped arrives in the save sheet a second after they
/// tapped Stop, and needs no explanation. One read back at launch does: they
/// are being shown a recording they did not just end, and the two ways it can
/// get here are not the same thing.
///
/// Kept out of the view so the words can be checked without one — and because
/// what separates the two sentences is a fact about the journal, not a
/// presentation choice.
enum TrackRestoreNotice {
    /// The walk's account of itself.
    ///
    /// **Interrupted**: the journal ran out with the recording still going, so
    /// iOS ended the process under it. The reader is owed two things — that the
    /// walk was kept, and that it stops where the app stopped. It does not say
    /// the app "crashed": ending a backgrounded app is a normal thing for iOS
    /// to do and this app cannot tell that from anything else.
    ///
    /// **Stopped and never saved**: they pressed Stop and the app went away
    /// before the walk was written to a layer. Nothing is missing from it.
    static func text(for restored: TrackJournal.Restored) -> String {
        let when = moment(restored.result.endedAt)
        guard restored.wasInterrupted else {
            return "You stopped this walk on \(when) and closed the app before saving it. "
                + "It is all here."
        }
        return "This walk was still recording when the app closed. Everything up to \(when) "
            + "was kept; nothing was recorded after that."
    }

    /// What the reader is told when a checkpoint was there and could not be
    /// read as a walk.
    ///
    /// The one thing this must not say is "no walk". A checkpoint that is empty
    /// or damaged is evidence that something was being recorded, not evidence
    /// that nothing was — and the file is kept rather than deleted, so this
    /// says where it went. `keptAt` is nil only when the move itself failed, in
    /// which case the bytes are still where they always were.
    static let unreadableTitle = "A recording could not be read"

    static func unreadableMessage(keptAt: URL?) -> String {
        let kept = keptAt.map { "It has been kept on this device as \"\($0.lastPathComponent)\"." }
            ?? "It has been kept on this device."
        return "NS Marks the Spot found a track recording it could not read, so it cannot "
            + "be shown or saved as a layer. \(kept) Nothing has been deleted."
    }

    /// The date and time a walk ended, said in full.
    ///
    /// The date as well as the time, always. A phone can be terminated on a
    /// Friday and opened on a Monday, and "at 14:32" would leave the reader
    /// guessing which day's walk they are looking at.
    private static func moment(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }
}
