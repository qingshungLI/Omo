import SwiftUI
import UIKit

/// Generic transparent-PNG frame-atlas player for future Omo motion clips.
///
/// An atlas is one imageset containing `columns x rows` equal cells; the
/// first `frameCount` cells (row-major order) are used. A standalone poster,
/// identical to the first atlas cell, is shown synchronously while slicing is
/// in progress or when slicing fails. Frames are cropped lazily on first play
/// and cached per atlas descriptor, so repeat plays do not decode or slice
/// again. Playback runs at 18–24 fps through TimelineView and is interruptible:
/// removing the view cancels playback immediately, and call-site state changes
/// can swap the atlas mid-sequence.
///
/// Reduce Motion: only the standalone poster is shown, with a fade-in of at
/// most 180ms. The atlas is not loaded or sliced on that path.
struct OmoFrameAtlasPlayer: View {
    let assetName: String
    let posterAssetName: String
    let columns: Int
    let rows: Int
    let frameCount: Int
    let fps: Double
    let loop: Bool

    @Environment(\.accessibilityReduceMotion)
    private var reduceMotion
    @State private var frames: [UIImage] = []
    @State private var startDate = Date()

    private var clampedFPS: Double {
        min(24, max(18, fps))
    }

    private var assetDescriptor: String {
        "\(assetName)#\(columns)x\(rows)#\(frameCount)"
    }

    private var playbackDescriptor: String {
        "\(assetDescriptor)#reduceMotion=\(reduceMotion)"
    }

    var body: some View {
        Group {
            if reduceMotion {
                posterView
                    .transition(.opacity)
            } else {
                TimelineView(.periodic(from: .now, by: 1 / clampedFPS)) { context in
                    frameView(at: context.date)
                }
            }
        }
        .animation(.easeOut(duration: 0.18), value: reduceMotion)
        .task(id: playbackDescriptor) {
            guard !reduceMotion else { return }
            guard frames.isEmpty else { return }
            let loaded = await OmoFrameAtlasStore.shared.frames(
                assetName: assetName,
                columns: columns,
                rows: rows,
                frameCount: frameCount
            )
            guard !Task.isCancelled else { return }
            frames = loaded
            startDate = Date()
        }
        .accessibilityHidden(true)
    }

    private var posterView: some View {
        Image(posterAssetName)
            .resizable()
            .scaledToFit()
    }

    @ViewBuilder
    private func frameView(at date: Date) -> some View {
        if frames.isEmpty {
            posterView
        } else {
            let elapsed = max(0, date.timeIntervalSince(startDate))
            let rawIndex = Int(elapsed * clampedFPS)
            let index = loop
                ? rawIndex % frames.count
                : min(rawIndex, frames.count - 1)
            Image(uiImage: frames[index])
                .resizable()
                .scaledToFit()
        }
    }
}

/// Lazy, cached frame-atlas slicer. Cropping runs on this actor, off the
/// main actor; results are shared across every player instance.
private actor OmoFrameAtlasStore {
    static let shared = OmoFrameAtlasStore()

    private var cache: [String: [UIImage]] = [:]

    func frames(
        assetName: String,
        columns: Int,
        rows: Int,
        frameCount: Int
    ) -> [UIImage] {
        let key = "\(assetName)#\(columns)x\(rows)#\(frameCount)"
        if let cached = cache[key] {
            return cached
        }
        let sliced = Self.slice(
            assetName: assetName,
            columns: columns,
            rows: rows,
            frameCount: frameCount
        )
        cache[key] = sliced
        return sliced
    }

    private static func slice(
        assetName: String,
        columns: Int,
        rows: Int,
        frameCount: Int
    ) -> [UIImage] {
        guard columns > 0, rows > 0, frameCount > 0,
              let image = UIImage(named: assetName),
              let cgImage = image.cgImage else { return [] }
        let cellWidth = cgImage.width / columns
        let cellHeight = cgImage.height / rows
        guard cellWidth > 0, cellHeight > 0 else { return [] }
        var result: [UIImage] = []
        result.reserveCapacity(frameCount)
        for index in 0..<frameCount {
            let column = index % columns
            let row = index / columns
            guard row < rows else { break }
            let rect = CGRect(
                x: column * cellWidth,
                y: row * cellHeight,
                width: cellWidth,
                height: cellHeight
            )
            guard let cropped = cgImage.cropping(to: rect) else { continue }
            result.append(
                UIImage(
                    cgImage: cropped,
                    scale: image.scale,
                    orientation: image.imageOrientation
                )
            )
        }
        return result
    }
}
