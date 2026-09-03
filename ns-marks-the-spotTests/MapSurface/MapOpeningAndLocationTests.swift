import CoreLocation
import GeoCore
import MapKit
import NSDataServices
import Testing
@testable import ns_marks_the_spot

/// The opening view and the answer to the location button.
///
/// Both are things a reader notices before touching anything: where the map
/// starts, and whether pressing a button appears to do nothing.
@MainActor
struct MapOpeningAndLocationTests {
    // MARK: - The opening view

    /// The shared default is Cape Breton, and the native map has to use it.
    ///
    /// This was the visible difference: the browser opened on Cape Breton while
    /// the app opened on a province-wide view centred near Halifax, so the same
    /// zoom-dependent layers were drawn on one surface and not the other.
    @Test func theMapOpensWhereTheWebOpens() {
        let controller = MapController()
        let mapView = MKMapView(frame: CGRect(x: 0, y: 0, width: 390, height: 700))
        controller.mapView = mapView

        let opening = MapPosition.default
        controller.center(
            on: GeoPoint(lat: opening.latitude, lng: opening.longitude),
            zoom: opening.zoom,
            animated: false
        )

        #expect(abs(mapView.region.center.latitude - 46.08) < 0.01)
        #expect(abs(mapView.region.center.longitude - -60.92) < 0.01)
        // 256-point tiles across a 390-point view at zoom 9 is a little over a
        // degree of longitude. Checked as a range, because MapKit rounds a
        // requested region to one it can actually show.
        #expect(mapView.region.span.longitudeDelta > 0.7)
        #expect(mapView.region.span.longitudeDelta < 1.7)
    }

    /// A position asked for before layout is applied once the view has a width.
    ///
    /// The opening view arrives that way: `makeUIView` runs before the map has
    /// any size, and zoom 9 is a count of tiles across a width that does not
    /// exist yet.
    @Test func aPositionAskedForBeforeLayoutIsNotLost() {
        let controller = MapController()
        let unsized = MKMapView()
        controller.mapView = unsized

        controller.center(on: GeoPoint(lat: 46.08, lng: -60.92), zoom: 9, animated: false)
        // Nothing to apply it to yet.
        #expect(abs(unsized.region.center.latitude - 46.08) > 0.01)

        unsized.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        controller.mapViewDidChangeVisibleRegion(unsized)

        #expect(abs(unsized.region.center.latitude - 46.08) < 0.01)
    }

    // MARK: - The location button

    /// A refusal already on file is reported, so the button is not silent.
    ///
    /// This is the case the app had no answer for. The delegate is not called
    /// again for a status that did not change, so a reader who had said no once
    /// could press the button forever and see nothing at all.
    @Test func aRefusalIsWorthSaying() {
        #expect(
            MapController.locationMessage(for: .denied, readerAsked: true) == .denied
        )
        // Restricted is not a refusal the reader made, and no Settings page
        // lifts it; it gets its own words.
        #expect(
            MapController.locationMessage(for: .restricted, readerAsked: true) == .restricted
        )
    }

    /// The same refusal, arriving on its own, says nothing.
    ///
    /// Authorization is reported at launch as well as after a tap. Announcing a
    /// refusal nobody asked about would complain about a feature the reader has
    /// not used.
    @Test func aRefusalNobodyAskedAboutIsNotAnnounced() {
        #expect(MapController.locationMessage(for: .denied, readerAsked: false) == nil)
        #expect(MapController.locationMessage(for: .restricted, readerAsked: false) == nil)
    }

    /// Permission that was granted, or not yet asked for, is not a message.
    @Test func onlyARefusalIsAMessage() {
        for status: CLAuthorizationStatus in [
            .authorizedAlways, .authorizedWhenInUse, .notDetermined,
        ] {
            #expect(MapController.locationMessage(for: status, readerAsked: true) == nil)
        }
    }

    /// Pressing the button says so while the fix is still coming.
    @Test func lookingForTheReaderIsSaidOutLoud() {
        let controller = MapController()
        // No fix on a map view nothing has located, which is the state the
        // button is pressed in.
        controller.mapView = MKMapView()

        controller.centerOnUserLocation()

        #expect(controller.locationMessage == .searching)
    }

    /// The words are the web's, which is what makes the two surfaces one
    /// product rather than two apps that both find you.
    @Test func theWordsMatchTheBrowser() {
        #expect(MapController.LocationMessage.searching.rawValue == "Finding your location…")
        #expect(MapController.LocationMessage.found.rawValue == "Your location is shown on the map.")
        #expect(
            MapController.LocationMessage.denied.rawValue
                == "Location permission was not granted. You can keep using the map."
        )
        #expect(MapController.LocationMessage.signalLost.rawValue == "GPS signal lost — still trying.")
    }

    // MARK: - Where the map goes

    private static let chisholmMacLean = CLLocation(latitude: 45.80849, longitude: -61.47137)

    private func sizedMap(_ controller: MapController, zoom: Int, near location: CLLocation) -> MKMapView {
        let mapView = MKMapView(frame: CGRect(x: 0, y: 0, width: 390, height: 700))
        controller.mapView = mapView
        // A little off, so the locate has somewhere to pan from.
        controller.center(
            on: GeoPoint(
                lat: location.coordinate.latitude + 0.002,
                lng: location.coordinate.longitude + 0.003
            ),
            zoom: zoom,
            animated: false
        )
        return mapView
    }

    /// The reported zoom-out: a reader at a parcel presses the button and is
    /// thrown out to a 5 km view. Closer than the locate scale, the map only
    /// pans.
    @Test func aCloseZoomIsKeptWhenLocating() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        let spanBefore = mapView.region.span.longitudeDelta

        controller.center(on: location, animated: false)

        #expect(abs(mapView.region.span.longitudeDelta - spanBefore) < spanBefore * 0.02)
        #expect(abs(mapView.region.center.latitude - location.coordinate.latitude) < 0.0002)
        #expect(abs(mapView.region.center.longitude - location.coordinate.longitude) < 0.0002)
        #expect(controller.locationMessage == .found)
        #expect(controller.isWaitingToCenterOnUserLocation == false)
        #expect(controller.userTrackingState == .following)
    }

    /// From a province-wide view the button still comes in, to the locate
    /// scale: five kilometres across the screen.
    @Test func aFarZoomComesInToTheLocateScale() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 9, near: location)

        controller.center(on: location, animated: false)

        let metresAcross = mapView.region.span.longitudeDelta
            * 111_320 * cos(location.coordinate.latitude * .pi / 180)
        // MapKit fits a requested region to the view, so a band rather than a
        // number; well inside the 80 km the zoom-9 view spanned.
        #expect(metresAcross > 3_000)
        #expect(metresAcross < 8_000)
    }

    /// With a card over the bottom of the map, the dot is put in the middle
    /// of the map the reader can see rather than in the middle of the screen,
    /// which the card covers.
    ///
    /// This pins the mechanism as much as the result: the card's height goes
    /// into the map's layout margins, and MapKit centres inside them on its
    /// own. Measured here rather than assumed, because the first version of
    /// this code offset the centre by hand as well and landed the dot half a
    /// card too high.
    @Test func aCardBelowLiftsTheDotIntoTheVisibleMap() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)

        // No card: the middle of a 700-point view.
        controller.center(on: location, animated: false)
        let uncovered = mapView.convert(location.coordinate, toPointTo: mapView)
        #expect(abs(uncovered.y - 350) < 4)
        #expect(abs(uncovered.x - 195) < 4)

        controller.setBottomCardHeight(300, for: .parcel)
        #expect(mapView.layoutMargins.bottom == 300)
        controller.center(on: location, animated: false)

        let dot = mapView.convert(location.coordinate, toPointTo: mapView)
        // The visible map is the top 400 points; its middle is at 200.
        #expect(abs(dot.y - 200) < 4)
        #expect(abs(dot.x - 195) < 4)

        // The card closing hands the margin back.
        controller.setBottomCardHeight(0, for: .parcel)
        #expect(mapView.layoutMargins.bottom == 0)
    }

    /// The zoom rule itself, at the width of a phone: 5 km across 390 points
    /// is a little over zoom 13 at Nova Scotia's latitude.
    @Test func theLocateScaleIsAboutZoomThirteen() {
        let zoom = MapController.locateZoom(forWidth: 390, at: 45.8)
        #expect(zoom > 12.9)
        #expect(zoom < 13.2)
    }

    // MARK: - The wait, and how it ends

    /// A fix has to be worth centring on: the first one after the dot is
    /// switched on is usually a cached, coarse position.
    @Test func onlyAFreshTightEnoughFixIsCentredOnAtOnce() {
        let now = Date()
        func fix(accuracy: Double, ageSeconds: TimeInterval) -> CLLocation {
            CLLocation(
                coordinate: Self.chisholmMacLean.coordinate, altitude: 0,
                horizontalAccuracy: accuracy, verticalAccuracy: -1,
                timestamp: now.addingTimeInterval(-ageSeconds)
            )
        }
        #expect(MapController.isFixGoodEnoughToCentreOn(fix(accuracy: 30, ageSeconds: 5), now: now))
        #expect(MapController.isFixGoodEnoughToCentreOn(fix(accuracy: 100, ageSeconds: 30), now: now))
        #expect(!MapController.isFixGoodEnoughToCentreOn(fix(accuracy: 500, ageSeconds: 5), now: now))
        #expect(!MapController.isFixGoodEnoughToCentreOn(fix(accuracy: 30, ageSeconds: 120), now: now))
        #expect(!MapController.isFixGoodEnoughToCentreOn(fix(accuracy: -1, ageSeconds: 1), now: now))
        #expect(!MapController.isFixGoodEnoughToCentreOn(fix(accuracy: 0, ageSeconds: 1), now: now))
        // A moment ahead of the clock is jitter; an hour ahead is not a fix.
        #expect(MapController.isFixGoodEnoughToCentreOn(fix(accuracy: 30, ageSeconds: -1), now: now))
        #expect(!MapController.isFixGoodEnoughToCentreOn(fix(accuracy: 30, ageSeconds: -3_600), now: now))
    }

    /// The deadline with a fix the gate refused for being coarse: the map
    /// still goes to the dot, but the reader is told it is approximate, not
    /// found.
    @Test func theDeadlineWithACoarseFixSaysApproximate() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        controller.centerOnUserLocation()
        let now = Date()
        let coarse = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 3_000, verticalAccuracy: -1,
            timestamp: now.addingTimeInterval(-300)
        )

        controller.animatesLocate = false
        controller.settleLocate(with: coarse, now: now)

        #expect(controller.locationMessage == .approximate)
        #expect(controller.isWaitingToCenterOnUserLocation == false)
        #expect(abs(mapView.region.center.latitude - location.coordinate.latitude) < 0.0002)

        // And a fix the gate would take is found, as before. Built with an
        // accuracy: the bare coordinate initializer reports 0, which the gate
        // rightly refuses as CoreLocation's "invalid".
        let again = MapController()
        _ = sizedMap(again, zoom: 16, near: location)
        again.centerOnUserLocation()
        again.animatesLocate = false
        let fresh = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: now
        )
        again.settleLocate(with: fresh, now: now)
        #expect(again.locationMessage == .found)
    }

    /// A fix hours old is where the phone last was, not where the reader is:
    /// the deadline leaves the map alone and says so. Going there was the
    /// stale-location jump this button was reported for, ten seconds late.
    @Test func theDeadlineDoesNotGoWhereThePhoneWasHoursAgo() {
        let controller = MapController()
        let elsewhere = CLLocation(latitude: 43.65, longitude: -79.38)
        let mapView = sizedMap(controller, zoom: 16, near: Self.chisholmMacLean)
        let centreBefore = mapView.region.center
        controller.centerOnUserLocation()
        let now = Date()
        let hoursOld = CLLocation(
            coordinate: elsewhere.coordinate, altitude: 0,
            horizontalAccuracy: 30, verticalAccuracy: -1,
            timestamp: now.addingTimeInterval(-7_200)
        )

        controller.animatesLocate = false
        controller.settleLocate(with: hoursOld, now: now)

        #expect(controller.locationMessage == .stale)
        #expect(controller.userTrackingState == .idle)
        #expect(controller.isWaitingToCenterOnUserLocation == false)
        #expect(abs(mapView.region.center.latitude - centreBefore.latitude) < 0.0002)
        #expect(abs(mapView.region.center.longitude - centreBefore.longitude) < 0.0002)
    }

    /// Precise Location off is a setting, not weather: the coarse fix is
    /// still centred on, but the caveat names the setting and offers the
    /// way to it, instead of sending the reader outdoors.
    @Test func reducedAccuracyIsSaidAsTheSettingItIs() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        controller.isReducedAccuracy = { true }
        controller.centerOnUserLocation()
        let now = Date()
        let coarse = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 3_000, verticalAccuracy: -1, timestamp: now
        )

        controller.animatesLocate = false
        controller.settleLocate(with: coarse, now: now)

        #expect(controller.locationMessage == .reducedAccuracy)
        #expect(MapController.offersSettings(.reducedAccuracy))
        #expect(MapController.staysUntilDismissed(.reducedAccuracy))
        #expect(!MapController.LocationMessage.reducedAccuracy.rawValue.contains("outdoors"))
        #expect(abs(mapView.region.center.latitude - location.coordinate.latitude) < 0.0002)
    }

    /// A parcel search during a locate takes the camera: the search ends,
    /// and the fix that arrives afterwards does not replace the parcel view.
    @Test func aParcelSearchTakesTheCameraFromASearch() {
        let controller = MapController()
        let mapView = sizedMap(controller, zoom: 12, near: Self.chisholmMacLean)
        controller.centerOnUserLocation()
        #expect(controller.userTrackingState == .searching)

        controller.focus(
            on: MapBounds(
                minLatitude: 45.79, minLongitude: -61.49, maxLatitude: 45.81, maxLongitude: -61.45
            )
        )

        #expect(controller.userTrackingState == .idle)
        #expect(controller.isWaitingToCenterOnUserLocation == false)
        #expect(controller.locationMessage == nil)
        let framed = mapView.region.center
        let fix = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 46.2, longitude: -60.9), altitude: 0,
            horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: Date()
        )
        controller.receiveFix(fix, now: Date())
        #expect(abs(mapView.region.center.latitude - framed.latitude) < 0.0002)
        #expect(abs(mapView.region.center.longitude - framed.longitude) < 0.0002)
    }

    /// Framing a layer while following ends the follow: MapKit would
    /// otherwise re-centre on the dot with the next fix and undo the framing.
    @Test func framingALayerEndsAFollow() {
        let controller = MapController()
        let mapView = sizedMap(controller, zoom: 16, near: Self.chisholmMacLean)
        controller.center(on: Self.chisholmMacLean, animated: false)
        controller.mapView(mapView, didChange: .follow, animated: false)
        #expect(controller.userTrackingState == .following)

        controller.frame(GeoBoundingBox(south: 45.7, west: -61.6, north: 45.9, east: -61.3))

        #expect(controller.userTrackingState == .idle)
        #expect(mapView.userTrackingMode == .none)
        #expect(controller.locationMessage == nil)
    }

    /// A turned map at parcel scale is still at parcel scale: the keep-zoom
    /// decision measures the ground across the screen, not the box around
    /// the rotated view, which is wider.
    @Test func aRotatedCloseCameraKeepsItsZoom() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        let straight = MapController.visibleGroundWidth(of: mapView)
        mapView.camera = MKMapCamera(
            lookingAtCenter: location.coordinate,
            fromDistance: mapView.camera.centerCoordinateDistance, pitch: 0, heading: 45
        )
        let turned = MapController.visibleGroundWidth(of: mapView)

        #expect(straight != nil)
        #expect(turned != nil)
        if let straight, let turned {
            #expect(abs(turned - straight) < straight * 0.1)
        }
        #expect(MapController.keepsZoom(mapView, locating: location.coordinate))
    }

    /// A network failure while following ends the follow and says so; the
    /// glyph does not go on claiming to follow fixes that are not coming.
    @Test func aNetworkFailureWhileFollowingEndsIt() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.mapView(mapView, didChange: .follow, animated: false)

        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.network))

        #expect(controller.locationMessage == .failed)
        #expect(controller.userTrackingState == .idle)
        #expect(mapView.userTrackingMode == .none)
    }

    /// The compass failing is not the position failing: heading-up falls
    /// back to plain follow rather than a heading it does not have.
    @Test func aHeadingFailureFallsBackToPlainFollow() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.mapView(mapView, didChange: .followWithHeading, animated: false)
        #expect(controller.userTrackingState == .heading)

        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.headingFailure))

        #expect(controller.userTrackingState == .following)
        #expect(controller.locationMessage == nil)
    }

    /// The approximate caveat is about the followed dot: a pan away takes it
    /// down, because the dot may no longer be on screen to be approximate.
    @Test func approximateComesDownWhenTheFollowEnds() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        _ = sizedMap(controller, zoom: 16, near: location)
        controller.centerOnUserLocation()
        let now = Date()
        let coarse = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 3_000, verticalAccuracy: -1, timestamp: now
        )
        controller.animatesLocate = false
        controller.settleLocate(with: coarse, now: now)
        #expect(controller.locationMessage == .approximate)

        controller.userTookTheMap()

        #expect(controller.locationMessage == nil)
    }

    /// The automatic fit to a sale's parcels yields to a reader who has asked
    /// for their location or taken the map: it lands whenever its request
    /// returns, and a late return must not move the map off what they chose.
    @Test func aReaderWhoLocatedHasClaimedTheCamera() {
        let controller = MapController()
        _ = sizedMap(controller, zoom: 12, near: Self.chisholmMacLean)
        #expect(!controller.readerHasClaimedTheCamera)

        controller.centerOnUserLocation()

        #expect(controller.readerHasClaimedTheCamera)
    }

    /// The unit tests drive the real controller, and a permission asked for
    /// in this process would raise a system alert that outlives it and blocks
    /// the UI suite on the same simulator. The guard is on, here and nowhere
    /// else: the app itself, which the UI tests launch, asks as it always has.
    @Test func aUnitTestHostNeverAsksForLocationPermission() {
        #expect(MapController.isRunningUnitTests)
        let controller = MapController()
        let mapView = MKMapView(frame: CGRect(x: 0, y: 0, width: 390, height: 700))
        controller.mapView = mapView
        controller.showsUserLocation = true
        // The state still says the dot is wanted; only the device is spared.
        #expect(controller.showsUserLocation)
        #expect(!mapView.showsUserLocation)
    }

    /// Where the reader is standing is not what they chose to look at: a
    /// followed view stays out of the share link, the evidence note and the
    /// saved session, while the readout still says where the map is.
    @Test func aFollowedViewIsNotTheViewThatIsShared() {
        let controller = MapController()
        _ = sizedMap(controller, zoom: 14, near: Self.chisholmMacLean)
        controller.recordZoomLevel(14)
        #expect(!controller.viewportIsLocationDriven)
        let model = OverlayViewModel.forTesting(controller: controller, installing: [])
        model.notePositionSettled()
        let chosen = model.mapPosition

        controller.animatesLocate = false
        controller.center(
            on: CLLocation(latitude: 46.5, longitude: -60.5), animated: false
        )
        #expect(controller.viewportIsLocationDriven)
        controller.recordZoomLevel(14)
        // A settle while following remembers nothing.
        model.notePositionSettled()

        #expect(abs(model.mapPosition.latitude - chosen.latitude) < 0.01)
        #expect(abs(model.shareState.position.latitude - chosen.latitude) < 0.01)
        #expect(abs(model.shareState.position.longitude - chosen.longitude) < 0.01)
        // The readout is about the screen, and says where the map now is.
        #expect(abs(model.currentPosition.latitude - 46.5) < 0.2)

        // Taken back by hand, the view is the reader's again.
        controller.readerTookTheMapByHand()
        #expect(!controller.viewportIsLocationDriven)
        model.notePositionSettled()
        #expect(abs(model.mapPosition.latitude - 46.5) < 0.2)
    }

    /// A pan while the locate is still waiting for its first fix ends the
    /// wait: the next good fix must not pull the map back to the dot.
    @Test func aPanWhileSearchingEndsTheLocate() {
        let controller = MapController()
        _ = sizedMap(controller, zoom: 16, near: Self.chisholmMacLean)
        controller.centerOnUserLocation()
        #expect(controller.userTrackingState == .searching)
        #expect(controller.locationMessage == .searching)

        // A gesture: MapKit reports the region about to change with the
        // reader's finger down.
        controller.readerTookTheMapByHand()

        #expect(controller.userTrackingState == .idle)
        #expect(controller.locationMessage == nil)
        #expect(!controller.isWaitingToCenterOnUserLocation)
    }

    /// Under Precise Location off, even a tight fix is said as the setting:
    /// the deadline path agrees with the immediate one.
    @Test func theDeadlineSaysReducedAccuracyBeforeFound() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        _ = sizedMap(controller, zoom: 16, near: location)
        controller.isReducedAccuracy = { true }
        controller.centerOnUserLocation()
        controller.animatesLocate = false
        let now = Date()
        controller.settleLocate(
            with: CLLocation(
                coordinate: location.coordinate, altitude: 0,
                horizontalAccuracy: 10, verticalAccuracy: -1, timestamp: now
            ),
            now: now
        )
        #expect(controller.locationMessage == .reducedAccuracy)
    }

    /// A waved-away Precise Location caveat does not come back with the
    /// signal: recovery takes "signal lost" down and leaves it at that.
    @Test func signalRecoveryRespectsADismissedCaveat() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.isReducedAccuracy = { true }
        controller.mapView(mapView, didChange: .follow, animated: false)
        controller.authorizationChanged(to: .authorizedWhenInUse)
        #expect(controller.locationMessage == .reducedAccuracy)
        controller.dismissLocationMessage()
        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.locationUnknown))
        #expect(controller.locationMessage == .signalLost)
        let now = Date()
        controller.receiveFix(
            CLLocation(
                coordinate: Self.chisholmMacLean.coordinate, altitude: 0,
                horizontalAccuracy: 3_000, verticalAccuracy: -1, timestamp: now
            ),
            now: now
        )
        #expect(controller.locationMessage == nil)
    }

    /// A cached position is not the signal returning, and what the signal
    /// brings back decides the caveat: coarse is approximate, good is found.
    @Test func signalRecoveryKeepsTheAccuracyCaveat() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.mapView(mapView, didChange: .follow, animated: false)
        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.locationUnknown))
        #expect(controller.locationMessage == .signalLost)
        let now = Date()
        func fix(accuracy: Double, age: TimeInterval) -> CLLocation {
            CLLocation(
                coordinate: Self.chisholmMacLean.coordinate, altitude: 0,
                horizontalAccuracy: accuracy, verticalAccuracy: -1,
                timestamp: now.addingTimeInterval(-age)
            )
        }

        controller.receiveFix(fix(accuracy: 20, age: 300), now: now)
        #expect(controller.locationMessage == .signalLost)

        controller.receiveFix(fix(accuracy: 3_000, age: 1), now: now)
        #expect(controller.locationMessage == .approximate)

        controller.receiveFix(fix(accuracy: 10, age: 1), now: now)
        #expect(controller.locationMessage == .found)
    }

    /// Precise Location switched on in Settings takes its caveat down; a
    /// refusal that was lifted comes down the same way.
    @Test func aLiftedRefusalOrRestoredPrecisionTakesTheNoticeDown() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        controller.isReducedAccuracy = { true }
        controller.centerOnUserLocation()
        let now = Date()
        let coarse = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 3_000, verticalAccuracy: -1, timestamp: now
        )
        controller.animatesLocate = false
        controller.settleLocate(with: coarse, now: now)
        #expect(controller.locationMessage == .reducedAccuracy)

        // Precision back on keeps the caveat until a precise fix arrives;
        // that fix turns it into "found".
        controller.isReducedAccuracy = { false }
        controller.authorizationChanged(to: .authorizedWhenInUse)
        #expect(controller.locationMessage == .reducedAccuracy)
        controller.mapView(mapView, didChange: .follow, animated: false)
        let precise = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 8, verticalAccuracy: -1, timestamp: now
        )
        controller.receiveFix(precise, now: now)
        #expect(controller.locationMessage == .found)

        // A search waiting on the prompt is refused with Location Services
        // off; the switch turned on in Settings takes the notice down.
        let refused = MapController()
        _ = sizedMap(refused, zoom: 16, near: location)
        refused.servicesEnabled = { false }
        refused.centerOnUserLocation()
        refused.authorizationChanged(to: .denied)
        #expect(refused.locationMessage == .servicesOff)
        refused.authorizationChanged(to: .authorizedWhenInUse)
        #expect(refused.locationMessage == nil)
    }

    /// Under Precise Location off a fix a quarter of an hour old is the best
    /// the setting allows, not a phone that has lost its position.
    @Test func reducedAccuracyTakesAnOlderFix() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        controller.isReducedAccuracy = { true }
        controller.centerOnUserLocation()
        let now = Date()
        let quarterHourOld = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 5_000, verticalAccuracy: -1,
            timestamp: now.addingTimeInterval(-900)
        )
        controller.animatesLocate = false
        controller.settleLocate(with: quarterHourOld, now: now)

        #expect(controller.locationMessage == .reducedAccuracy)
        #expect(abs(mapView.region.center.latitude - location.coordinate.latitude) < 0.0002)
    }

    /// Zooming to a cluster is a deliberate move and takes the camera from a
    /// follow.
    @Test func aClusterTapTakesTheCamera() {
        let controller = MapController()
        let mapView = sizedMap(controller, zoom: 12, near: Self.chisholmMacLean)
        controller.mapView(mapView, didChange: .follow, animated: false)
        let members = [MKPointAnnotation(), MKPointAnnotation()]
        members[0].coordinate = Self.chisholmMacLean.coordinate
        members[1].coordinate = CLLocationCoordinate2D(latitude: 45.81, longitude: -61.47)
        let cluster = MKClusterAnnotation(memberAnnotations: members)

        controller.mapView(mapView, didSelect: MKAnnotationView(annotation: cluster, reuseIdentifier: nil))

        #expect(controller.userTrackingState == .idle)
        #expect(mapView.userTrackingMode == .none)
    }

    /// "Shown on the map" comes down with the follow: after a pan the dot may
    /// not be.
    @Test func aPanTakesDownShownOnTheMap() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        _ = sizedMap(controller, zoom: 16, near: location)
        controller.center(on: location, animated: false)
        #expect(controller.locationMessage == .found)

        controller.userTookTheMap()

        #expect(controller.locationMessage == nil)
    }

    /// A locate tap, like a pan, is a claim on the camera that a lookup
    /// started earlier must not override when it answers.
    @Test func aLocateTapMovesTheCameraClaim() {
        let controller = MapController()
        _ = sizedMap(controller, zoom: 12, near: Self.chisholmMacLean)
        let before = controller.cameraClaimGeneration

        controller.centerOnUserLocation()

        #expect(controller.cameraClaimGeneration == before + 1)
    }

    /// Framing a page and selecting a save area take the camera too: a
    /// search answering afterwards must not move the ground under them.
    @Test func printFramingAndBoundsSelectionClaimTheCamera() {
        let controller = MapController()
        _ = sizedMap(controller, zoom: 12, near: Self.chisholmMacLean)
        // The opening view is not the reader's choice, and neither is the
        // automatic fit to a sale's parcels; a focus asked for is.
        #expect(!controller.readerHasClaimedTheCamera)
        let bounds = MapBounds(
            minLatitude: 45.79, minLongitude: -61.48, maxLatitude: 45.81, maxLongitude: -61.46
        )
        controller.focus(on: bounds, maxZoom: 13, asReader: false)
        #expect(!controller.readerHasClaimedTheCamera)
        controller.focus(on: bounds)
        #expect(controller.readerHasClaimedTheCamera)
        let before = controller.cameraClaimGeneration
        controller.beginPrintFraming()
        #expect(controller.cameraClaimGeneration == before + 1)
        #expect(controller.readerHasClaimedTheCamera)
        controller.endPrintFraming()
        controller.beginBoundsSelection()
        #expect(controller.cameraClaimGeneration == before + 2)
    }

    /// Precision back on, and the next fresh fix decides: found if it is
    /// good, approximate if it is not; the setting is no longer the reason.
    /// And a waved-away caveat stays away on return to the foreground.
    @Test func aRestoredPrecisionCaveatBecomesTheNextFix() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        controller.isReducedAccuracy = { true }
        controller.centerOnUserLocation()
        let now = Date()
        controller.animatesLocate = false
        controller.settleLocate(
            with: CLLocation(
                coordinate: location.coordinate, altitude: 0,
                horizontalAccuracy: 3_000, verticalAccuracy: -1, timestamp: now
            ),
            now: now
        )
        controller.mapView(mapView, didChange: .follow, animated: false)
        #expect(controller.locationMessage == .reducedAccuracy)

        controller.isReducedAccuracy = { false }
        controller.receiveFix(
            CLLocation(
                coordinate: location.coordinate, altitude: 0,
                horizontalAccuracy: 150, verticalAccuracy: -1, timestamp: now
            ),
            now: now
        )
        #expect(controller.locationMessage == .approximate)

        let waved = MapController()
        let map2 = sizedMap(waved, zoom: 16, near: location)
        waved.isReducedAccuracy = { true }
        waved.centerOnUserLocation()
        waved.animatesLocate = false
        waved.settleLocate(
            with: CLLocation(
                coordinate: location.coordinate, altitude: 0,
                horizontalAccuracy: 3_000, verticalAccuracy: -1, timestamp: now
            ),
            now: now
        )
        waved.mapView(map2, didChange: .follow, animated: false)
        waved.dismissLocationMessage()
        waved.authorizationChanged(to: .authorizedWhenInUse)
        #expect(waved.locationMessage == nil)
    }

    /// A refusal on screen is re-said as what it now is when its cause
    /// changes: Location Services back on while the app stays denied.
    @Test func aRefusalIsReclassifiedWhenItsCauseChanges() {
        let controller = MapController()
        _ = sizedMap(controller, zoom: 16, near: Self.chisholmMacLean)
        controller.servicesEnabled = { false }
        controller.centerOnUserLocation()
        controller.authorizationChanged(to: .denied)
        #expect(controller.locationMessage == .servicesOff)

        controller.servicesEnabled = { true }
        controller.authorizationChanged(to: .denied)

        #expect(controller.locationMessage == .denied)
    }

    /// A fix an hour ahead of the clock is not the signal returning; and
    /// Precise Location switched off while the signal is lost does not
    /// pretend a fix came back.
    @Test func neitherAFutureFixNorASettingChangeIsSignalRecovery() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.mapView(mapView, didChange: .follow, animated: false)
        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.locationUnknown))
        #expect(controller.locationMessage == .signalLost)
        let now = Date()
        let future = CLLocation(
            coordinate: Self.chisholmMacLean.coordinate, altitude: 0,
            horizontalAccuracy: 10, verticalAccuracy: -1, timestamp: now.addingTimeInterval(3_600)
        )
        controller.receiveFix(future, now: now)
        #expect(controller.locationMessage == .signalLost)

        controller.isReducedAccuracy = { true }
        controller.authorizationChanged(to: .authorizedWhenInUse)
        #expect(controller.locationMessage == .signalLost)

        let coarse = CLLocation(
            coordinate: Self.chisholmMacLean.coordinate, altitude: 0,
            horizontalAccuracy: 3_000, verticalAccuracy: -1, timestamp: now
        )
        controller.receiveFix(coarse, now: now)
        #expect(controller.locationMessage == .reducedAccuracy)
    }

    /// An out-of-range coordinate is not a position either, however fresh and
    /// tight its accuracy says it is; and an invalid update does not restore
    /// a lost signal.
    @Test func anInvalidCoordinateIsNotAFix() {
        let now = Date()
        let offTheGlobe = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 91, longitude: -61), altitude: 0,
            horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: now
        )
        #expect(!MapController.isFixGoodEnoughToCentreOn(offTheGlobe, now: now))

        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.mapView(mapView, didChange: .follow, animated: false)
        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.locationUnknown))
        #expect(controller.locationMessage == .signalLost)
        let invalid = CLLocation(
            coordinate: Self.chisholmMacLean.coordinate, altitude: 0,
            horizontalAccuracy: -1, verticalAccuracy: -1, timestamp: now
        )
        controller.receiveFix(invalid, now: now)
        #expect(controller.locationMessage == .signalLost)
    }

    /// After the reader pans away, a good fix does not turn "approximate"
    /// into "shown on the map": the dot may be off screen.
    @Test func aGoodFixAfterAPanDoesNotClaimTheDotIsShown() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        controller.centerOnUserLocation()
        let now = Date()
        let stale = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 3_000, verticalAccuracy: -1, timestamp: now.addingTimeInterval(-300)
        )
        controller.animatesLocate = false
        controller.settleLocate(with: stale, now: now)
        #expect(controller.locationMessage == .approximate)
        controller.userTookTheMap()
        controller.mapView(mapView, didChange: .none, animated: false)
        // The pan took the caveat down with the follow.
        #expect(controller.locationMessage == nil)

        let fresh = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: now
        )
        controller.receiveFix(fresh, now: now)

        #expect(controller.locationMessage == nil)
    }

    /// Framing a page for print takes the camera: a search or a follow in
    /// progress ends, so a late fix cannot move the page out from under the
    /// reader.
    @Test func printFramingEndsASearchAndAFollow() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        controller.centerOnUserLocation()
        #expect(controller.userTrackingState == .searching)
        controller.beginPrintFraming()
        #expect(controller.isWaitingToCenterOnUserLocation == false)
        #expect(controller.userTrackingState == .idle)

        controller.mapView(mapView, didChange: .followWithHeading, animated: false)
        controller.beginPrintFraming()
        #expect(controller.userTrackingState == .idle)
        #expect(mapView.userTrackingMode == .none)
    }

    /// A replaced map view stops talking: a callback it had queued cannot
    /// set the glyph for the map that replaced it.
    @Test func aDetachedMapViewsCallbacksAreIgnored() {
        let controller = MapController()
        let old = MKMapView()
        controller.mapView = old
        let replacement = MKMapView()
        controller.mapView = replacement

        controller.mapView(old, didChange: .follow, animated: false)

        #expect(controller.userTrackingState == .idle)
        #expect(old.delegate == nil)

        // Nor may its last frame write the heading, nor a selection queued
        // on it end a follow begun on the replacement.
        old.camera.heading = 90
        controller.mapViewDidChangeVisibleRegion(old)
        #expect(controller.mapHeading == 0)
        controller.mapView(replacement, didChange: .follow, animated: false)
        let cluster = MKClusterAnnotation(memberAnnotations: [])
        controller.mapView(old, didSelect: MKAnnotationView(annotation: cluster, reuseIdentifier: nil))
        #expect(controller.userTrackingState == .following)
    }

    /// A non-positive accuracy is CoreLocation's "invalid", not a position:
    /// the deadline does not send the map there and call it approximate.
    @Test func theDeadlineDoesNotCentreOnAnInvalidPosition() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        let before = mapView.region.center
        controller.centerOnUserLocation()
        let invalid = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: -1, verticalAccuracy: -1, timestamp: Date()
        )

        controller.animatesLocate = false
        controller.settleLocate(with: invalid, now: Date())

        #expect(controller.locationMessage == .unavailable)
        #expect(controller.userTrackingState == .idle)
        #expect(mapView.region.center.latitude == before.latitude)
    }

    /// An approximate position becomes a found one when a fix the gate takes
    /// arrives, rather than staying on screen for its whole lifetime.
    @Test func aGoodFixMakesAnApproximatePositionFound() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        _ = sizedMap(controller, zoom: 16, near: location)
        controller.centerOnUserLocation()
        let now = Date()
        let stale = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 3_000, verticalAccuracy: -1,
            timestamp: now.addingTimeInterval(-300)
        )
        controller.animatesLocate = false
        controller.settleLocate(with: stale, now: now)
        #expect(controller.locationMessage == .approximate)

        let fresh = CLLocation(
            coordinate: location.coordinate, altitude: 0,
            horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: now
        )
        controller.receiveFix(fresh, now: now)

        #expect(controller.locationMessage == .found)
    }

    /// The deadline does not run while the system prompt is up: the reader
    /// may take longer than ten seconds to read it.
    @Test func theDeadlineWaitsForThePromptToBeAnswered() {
        #expect(!MapController.deadlineStarts(for: .notDetermined))
        #expect(MapController.deadlineStarts(for: .authorizedWhenInUse))
        #expect(MapController.deadlineStarts(for: .authorizedAlways))
        #expect(MapController.deadlineStarts(for: .denied))
    }

    /// Location Services off for the whole device is not this app's refusal.
    @Test func servicesOffIsItsOwnMessage() {
        #expect(
            MapController.locationMessage(for: .denied, readerAsked: true, servicesEnabled: false)
                == .servicesOff
        )
        #expect(
            MapController.locationMessage(for: .denied, readerAsked: true, servicesEnabled: true)
                == .denied
        )
        #expect(MapController.lifetime(of: .servicesOff) == nil)
        #expect(MapController.staysUntilDismissed(.servicesOff))
        #expect(!MapController.offersSettings(.servicesOff))
    }

    /// Permission taken away while following ends the following, says so,
    /// and puts the glyph down.
    @Test func losingPermissionWhileFollowingEndsIt() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.servicesEnabled = { true }
        controller.mapView(mapView, didChange: .follow, animated: false)
        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.locationUnknown))
        #expect(controller.locationMessage == .signalLost)

        controller.authorizationChanged(to: .denied)

        #expect(controller.userTrackingState == .idle)
        #expect(controller.locationMessage == .denied)
        #expect(mapView.userTrackingMode == .none)
    }

    /// A pan during the flight also takes the signal-lost banner down: the
    /// glyph says off, and "still trying" would contradict it.
    @Test func aPanDuringTheFlightClearsSignalLost() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        controller.center(on: location, animated: false)
        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.locationUnknown))
        #expect(controller.locationMessage == .signalLost)

        controller.userTookTheMap()

        #expect(controller.locationMessage == nil)
        #expect(controller.userTrackingState == .idle)
    }

    /// A network failure is not the sky: it is not answered with "try again
    /// outdoors".
    @Test func aNetworkFailureIsNotSentOutdoors() {
        #expect(!MapController.LocationMessage.failed.rawValue.contains("outdoors"))
        #expect(MapController.LocationMessage.unavailable.rawValue.contains("outdoors"))
    }

    /// CoreLocation giving up ends the wait and says so; the button is not
    /// left spinning under a banner that never comes down.
    @Test func aFailedLocateClearsTheWait() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.centerOnUserLocation()
        #expect(controller.isWaitingToCenterOnUserLocation)
        #expect(controller.userTrackingState == .searching)

        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.network))

        #expect(controller.isWaitingToCenterOnUserLocation == false)
        #expect(controller.userTrackingState == .idle)
        #expect(controller.locationMessage == .failed)
    }

    /// A refusal delivered as a failure is reported as the refusal it is.
    @Test func aFailureThatIsARefusalSaysSo() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.centerOnUserLocation()

        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.denied))

        #expect(controller.isWaitingToCenterOnUserLocation == false)
        #expect(controller.locationMessage == .denied)
    }

    /// `locationUnknown` is CoreLocation saying "not yet", and it keeps
    /// trying; the wait goes on until the deadline.
    @Test func aTransientFailureKeepsWaiting() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.centerOnUserLocation()

        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.locationUnknown))

        #expect(controller.isWaitingToCenterOnUserLocation)
        #expect(controller.locationMessage == .searching)
    }

    /// The deadline with nothing on the map ends the wait and the banner.
    @Test func theDeadlineWithNoFixSaysTheLocationWasNotFound() {
        let controller = MapController()
        // Held: the controller's reference is weak, and a map view nothing
        // else owns is gone before the next line.
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.centerOnUserLocation()

        controller.locateDeadlineElapsed()

        #expect(controller.isWaitingToCenterOnUserLocation == false)
        #expect(controller.userTrackingState == .idle)
        #expect(controller.locationMessage == .unavailable)
    }

    /// A failure that arrives with no search running is not a message: the
    /// reader did not ask.
    @Test func aFailureNobodyAskedAboutIsNotAnnounced() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView

        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.network))

        #expect(controller.locationMessage == nil)
    }

    // MARK: - Follow mode

    /// Tap: follow. Tap again: heading-up. Again: follow. Never a fourth,
    /// off, state — a pan is how following stops, as in Maps.
    @Test func tapsCycleFollowAndHeading() {
        #expect(MapController.nextTrackingMode(after: .following) == .followWithHeading)
        #expect(MapController.nextTrackingMode(after: .heading) == .follow)
        #expect(MapController.nextTrackingMode(after: .idle) == nil)
        #expect(MapController.nextTrackingMode(after: .searching) == nil)
    }

    /// MapKit releases follow mode on a pan and reports it; the glyph follows.
    @Test func aPanReportedByMapKitReleasesTheGlyph() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView

        controller.mapView(mapView, didChange: .follow, animated: false)
        #expect(controller.userTrackingState == .following)
        controller.mapView(mapView, didChange: .followWithHeading, animated: false)
        #expect(controller.userTrackingState == .heading)
        controller.mapView(mapView, didChange: .none, animated: false)
        #expect(controller.userTrackingState == .idle)
    }

    /// A search that has found nothing yet is not ended by MapKit reporting
    /// the mode it was in all along.
    @Test func aSearchSurvivesAReportOfNoTracking() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.centerOnUserLocation()

        controller.mapView(mapView, didChange: .none, animated: false)

        #expect(controller.userTrackingState == .searching)
    }

    // MARK: - Messages come down

    /// Only the searching banner has no clock of its own; the fix or the
    /// deadline ends it. Everything else expires, the refusal last because it
    /// carries a button.
    @Test func everyFinishedMessageExpiresAndEveryDecisionWaits() {
        #expect(MapController.lifetime(of: .searching) == nil)
        #expect(MapController.lifetime(of: .found) == .seconds(4))
        #expect(MapController.lifetime(of: .unavailable) == .seconds(6))
        #expect(MapController.lifetime(of: .stale) == .seconds(6))
        #expect(MapController.lifetime(of: .failed) == .seconds(6))
        // Ended by the next fix or by leaving follow mode, not by time.
        #expect(MapController.lifetime(of: .signalLost) == nil)
        #expect(MapController.lifetime(of: .approximate) == nil)
        // A decision to make in Settings waits for the reader.
        for message in [MapController.LocationMessage.denied, .restricted, .servicesOff, .reducedAccuracy] {
            #expect(MapController.lifetime(of: message) == nil)
            #expect(MapController.staysUntilDismissed(message))
        }
        #expect(MapController.offersSettings(.denied))
        #expect(!MapController.offersSettings(.restricted))
    }

    /// The reader panned during the locate flight: the follow armed for the
    /// end of the flight is dropped, and the settle of their pan does not
    /// start it.
    @Test func aPanDuringTheFlightDropsTheArmedFollow() {
        let controller = MapController()
        let location = Self.chisholmMacLean
        let mapView = sizedMap(controller, zoom: 16, near: location)
        controller.center(on: location, animated: false)
        #expect(controller.userTrackingState == .following)

        controller.userTookTheMap()
        #expect(controller.userTrackingState == .idle)
        controller.mapView(mapView, regionDidChangeAnimated: true)
        #expect(controller.userTrackingState == .idle)
        #expect(mapView.userTrackingMode == .none)
    }

    /// A replacement map view has no tracking mode; the glyph must not go on
    /// claiming the old one's.
    @Test func aReplacementMapForgetsTheOldTrackingMode() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.mapView(mapView, didChange: .follow, animated: false)
        #expect(controller.userTrackingState == .following)

        let replacement = MKMapView()
        controller.mapView = replacement

        #expect(controller.userTrackingState == .idle)
    }

    /// Following, and the fixes stop: said in the web's words, and cleared
    /// when following ends.
    @Test func signalLostWhileFollowingIsSaidAndCleared() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.mapView(mapView, didChange: .follow, animated: false)

        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.locationUnknown))
        #expect(controller.locationMessage == .signalLost)
        #expect(controller.userTrackingState == .following)

        controller.mapView(mapView, didChange: .none, animated: false)
        #expect(controller.locationMessage == nil)
        #expect(controller.userTrackingState == .idle)
    }

    /// And they do come down, on their own.
    @Test func anExpiredMessageIsTakenDown() async {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.messageLifetime = { _ in .milliseconds(20) }
        controller.centerOnUserLocation()
        #expect(controller.locationMessage == .searching)

        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.network))
        #expect(controller.locationMessage == .failed)

        await settles("the failure message expiring") { controller.locationMessage == nil }
    }

    /// The reader opened Settings from the refusal; the message has done its
    /// work.
    @Test func actingOnAMessageTakesItDown() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.centerOnUserLocation()
        controller.mapView(mapView, didFailToLocateUserWithError: CLError(.denied))
        #expect(controller.locationMessage == .denied)

        controller.dismissLocationMessage()

        #expect(controller.locationMessage == nil)
    }
}
