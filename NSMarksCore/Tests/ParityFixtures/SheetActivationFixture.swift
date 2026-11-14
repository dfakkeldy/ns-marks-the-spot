import Foundation

public enum SheetActivationFixture {
    public static func data() throws -> Data {
        let url = Bundle.module.url(forResource: "sheet-activation-parity", withExtension: "json", subdirectory: "Fixtures")!
        return try Data(contentsOf: url)
    }
}
