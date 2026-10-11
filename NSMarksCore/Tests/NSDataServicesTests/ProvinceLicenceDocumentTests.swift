import Foundation
import Testing

@testable import NSDataServices

@Suite("NSPRD required acceptance statements")
struct ProvinceLicenceDocumentTests {
    // Transcribed from the supplied official NSPRD v1 PDF, SHA-256
    // 39b41573e53b14b142b4d7082bd76fa68de708d646475a1b0288a54bbb7ba20d.
    // These independent expectations pin the supplied words, including the
    // source's "size or a property" wording; do not editorialise legal text.
    private static let statements = [
        "The Province of Nova Scotia makes no representations, expressed or implied, as to the accuracy, completeness and timeliness of the information, maps and other data, including PID numbers or property boundaries, which are displayed in this map that is presented in this application.",
        "The map is provided on the understanding that it is not guaranteed to be correct or complete or current, is subject to change, and conclusions drawn or decisions made, based on an interpretation of the data, are the responsibility of the user.",
        "By continuing to use this application, you agree to the terms of this disclaimer.",
        "Property boundaries shown on maps are obtained from the provincial land registration system. They are not based upon survey and are subject to change. They are not conclusive evidence of the location or size or a property. You cannot rely on them to determine boundaries or legal descriptions of properties.",
    ]

    private static func bundledText() throws -> String {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { root.deleteLastPathComponent() }
        return try String(
            contentsOf: root.appendingPathComponent(
                "ns-marks-the-spot/Layers/ProvinceRestrictedGeographicServicesLicense.md"
            ),
            encoding: .utf8
        )
    }

    @Test("The shipped document includes every required statement with supplied wording")
    func bundledTextContainsRequiredStatements() throws {
        let text = try Self.bundledText()
        for statement in Self.statements {
            #expect(text.contains(statement), "The shipped terms omit or reword a required statement")
        }
        #expect(text.contains("Province of Nova Scotia Restricted Geographic Services License (Nova Scotia Property Records Database)"))
        #expect(text.contains("Her Majesty the Queen in right of the Province of Nova Scotia."))
        #expect(text.contains("Restricted Geographic Services License (NSPRD)."))
        #expect(ProvinceLicenceDocument(text: text)?.text == text)
    }

    @Test("Every missing required statement prevents an acceptance presentation", arguments: 0..<4)
    func removingAnyRequiredStatementClosesThePresentation(index: Int) throws {
        let text = try Self.bundledText()
        let incomplete = text.replacingOccurrences(of: Self.statements[index], with: "")
        #expect(ProvinceLicenceDocument(text: incomplete) == nil)
    }

    @Test("Missing, empty and attribution-only text cannot be accepted", arguments: [
        nil,
        "",
        "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions.",
    ] as [String?])
    func incompleteDocumentsAreRefused(text: String?) {
        #expect(ProvinceLicenceDocument(text: text) == nil)
    }

    @Test("Layout changes preserve the supplied statements")
    func lineWrappingDoesNotChangeAcceptancePresentation() throws {
        let wrapped = try Self.bundledText().replacingOccurrences(of: " ", with: "\n\t")
        #expect(ProvinceLicenceDocument(text: wrapped)?.text == wrapped)
    }

    @Test("Rewording the accuracy disclaimer prevents an acceptance presentation")
    func rewordedDisclaimerIsRefused() throws {
        let text = try Self.bundledText().replacingOccurrences(
            of: "accuracy, completeness and timeliness", with: "accuracy"
        )
        #expect(ProvinceLicenceDocument(text: text) == nil)
    }

    @Test("Legacy acceptance requires the corrected disclosure without removing its record")
    @MainActor
    func legacyAcceptanceRequiresTheCorrectedDisclosure() throws {
        let suiteName = "province-licence-disclosure-review-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let legacyKey = "ns-marks-the-spot:province-license:v1"
        defaults.set("accepted", forKey: legacyKey)

        let store = ProvinceLicenceStore(storage: UserDefaultsProvinceLicenceStorage(defaults: defaults))
        #expect(store.state == .unknown)
        #expect(store.needsDecision)
        #expect(store.clearance == .none)
        #expect(defaults.string(forKey: legacyKey) == "accepted")
    }

    @Test("Current disclosure acceptance persists and decline preserves the legacy record")
    @MainActor
    func currentDisclosureAcceptanceAndDeclinePreserveLegacyRecord() throws {
        let suiteName = "province-licence-disclosure-persistence-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let legacyKey = "ns-marks-the-spot:province-license:v1"
        let currentKey = "ns-marks-the-spot:province-license:nsprd-v1:disclosure-v2"
        defaults.set("accepted", forKey: legacyKey)
        let storage = UserDefaultsProvinceLicenceStorage(defaults: defaults)
        let store = ProvinceLicenceStore(storage: storage)

        store.accept()
        #expect(defaults.string(forKey: currentKey) == "accepted")
        #expect(defaults.string(forKey: legacyKey) == "accepted")
        #expect(ProvinceLicenceStore(storage: storage).clearance.allows(.nsprd))

        store.decline()
        #expect(defaults.object(forKey: currentKey) == nil)
        #expect(defaults.string(forKey: legacyKey) == "accepted")
        #expect(ProvinceLicenceStore(storage: storage).state == .unknown)
        #expect(ProvinceLicenceStore(storage: storage).needsDecision)
    }
}
