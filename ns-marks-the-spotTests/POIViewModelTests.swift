import Testing
@testable import ns_marks_the_spot

@MainActor
struct POIViewModelTests {
    @Test func fetchRemoteWaterfallsPublishesErrorMessage() async {
        let viewModel = POIViewModel {
            throw POIFetcherError.invalidHTTPStatus(503)
        }
        let controller = MapController()

        await viewModel.fetchRemoteWaterfalls(controller: controller)

        #expect(viewModel.waterfallFetchErrorMessage == "Waterfalls are unavailable right now.")
        #expect(viewModel.isFetchingWaterfalls == false)
        #expect(viewModel.points.isEmpty)
        #expect(controller.annotations.isEmpty)
    }

    @Test func fetchRemoteWaterfallsDeduplicatesPointsAndAnnotationsAcrossAppearances() async {
        var fetchCount = 0
        let viewModel = POIViewModel {
            fetchCount += 1
            return [
                PointOfInterest(
                    id: "waterfall-1060",
                    name: "Waterfall #1060 (16.4 m)",
                    latitude: 43.5563,
                    longitude: -65.6997,
                    category: "waterfall"
                )
            ]
        }
        let controller = MapController()

        await viewModel.fetchRemoteWaterfalls(controller: controller)
        await viewModel.fetchRemoteWaterfalls(controller: controller)

        #expect(fetchCount == 1)
        #expect(viewModel.points.count == 1)
        #expect(controller.annotations.count == 1)
        #expect(controller.annotations.first?.id == "waterfall-1060")
    }

    @Test func retryAfterFailureClearsErrorAndAddsAnnotations() async {
        var shouldFail = true
        let viewModel = POIViewModel {
            if shouldFail {
                throw POIFetcherError.serviceError(code: 500, message: "Service unavailable")
            }

            return [
                PointOfInterest(
                    id: "waterfall-1060",
                    name: "Waterfall #1060 (16.4 m)",
                    latitude: 43.5563,
                    longitude: -65.6997,
                    category: "waterfall"
                )
            ]
        }
        let controller = MapController()

        await viewModel.fetchRemoteWaterfalls(controller: controller)
        shouldFail = false
        await viewModel.fetchRemoteWaterfalls(controller: controller, force: true)

        #expect(viewModel.waterfallFetchErrorMessage == nil)
        #expect(viewModel.points.count == 1)
        #expect(controller.annotations.count == 1)
    }

    @Test func syncAnnotationsSkipsExistingAnnotationIDs() {
        let viewModel = POIViewModel {
            []
        }
        let controller = MapController()
        let point = PointOfInterest(
            id: "waterfall-1060",
            name: "Waterfall #1060",
            latitude: 43.5563,
            longitude: -65.6997,
            category: "waterfall"
        )
        viewModel.points = [point]
        controller.addAnnotation(
            MapAnnotation(
                id: point.id,
                latitude: point.latitude,
                longitude: point.longitude,
                title: point.name,
                subtitle: point.category
            )
        )

        viewModel.syncAnnotations(to: controller)

        #expect(controller.annotations.count == 1)
    }
}
