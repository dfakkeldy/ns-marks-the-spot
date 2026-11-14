import Foundation

public enum SheetActivationFixture {
    public static func data() throws -> Data {
        guard let url = Bundle.module.url(forResource: "sheet-activation-parity", withExtension: "json", subdirectory: "Fixtures") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try Data(contentsOf: url)
    }
}
