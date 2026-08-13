import Foundation

/// Reads an ArcGIS `returnCountOnly` reply.
public enum BuildingCountResponse {
    public enum Failure: Error, Equatable, Sendable {
        /// ArcGIS reports a rejected query as HTTP 200 with this inside.
        case serviceError(code: Int?, message: String?)
        /// Not JSON, or JSON with no count in it. A reply this reader does not
        /// recognise is not a parcel with no buildings on it.
        case malformed
    }

    public static func count(from data: Data) throws(Failure) -> Int {
        let payload: Payload
        do {
            payload = try JSONDecoder().decode(Payload.self, from: data)
        } catch {
            throw .malformed
        }
        if let error = payload.error {
            throw .serviceError(code: error.code, message: error.message)
        }
        // A fractional or negative count is not a count of buildings, and
        // rounding one into an integer would put a number on screen that the
        // service did not send.
        guard let count = payload.count, count >= 0, count == count.rounded(),
              count <= Double(Int.max)
        else { throw .malformed }
        return Int(count)
    }

    private struct Payload: Decodable {
        let count: Double?
        let error: ServiceError?
    }

    private struct ServiceError: Decodable {
        let code: Int?
        let message: String?
    }
}
