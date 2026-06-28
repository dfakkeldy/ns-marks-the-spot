import Foundation

struct LayerAttribution: Equatable {
    let provider: String
    let copyright: String?
    let disclaimer: String
    let licenseTitle: String?
    let licenseURL: URL?
}
