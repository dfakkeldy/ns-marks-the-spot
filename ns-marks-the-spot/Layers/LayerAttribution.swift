import Foundation

final class LayerResourceBundleToken {}

struct LayerAttribution: Equatable {
    let provider: String
    let copyright: String?
    let disclaimer: String
    let licenseTitle: String?
    let licenseURL: URL?
    let bundledLicenseResourceName: String?

    init(
        provider: String,
        copyright: String?,
        disclaimer: String,
        licenseTitle: String?,
        licenseURL: URL?,
        bundledLicenseResourceName: String? = nil
    ) {
        self.provider = provider
        self.copyright = copyright
        self.disclaimer = disclaimer
        self.licenseTitle = licenseTitle
        self.licenseURL = licenseURL
        self.bundledLicenseResourceName = bundledLicenseResourceName
    }

    var resolvedLicenseURL: URL? {
        if let licenseURL {
            return licenseURL
        }

        guard let bundledLicenseResourceName else { return nil }
        return Bundle(for: LayerResourceBundleToken.self)
            .url(forResource: bundledLicenseResourceName, withExtension: nil)
    }
}
