import SwiftUI

struct V2SplashView: View {
    @Environment(\.accessibilityReduceMotion)
    private var reduceMotion

    var body: some View {
        GeometryReader { geometry in
            V2Color.pageGreenBackground
                .ignoresSafeArea()

            VStack(spacing: Metrics.messageTopSpacing) {
                V2RecallMascotView(state: .idle, reduceMotion: reduceMotion)
                    .frame(width: Metrics.mascotWidth, height: Metrics.mascotHeight)

                Text(Metrics.messageText)
                    .font(Metrics.messageFont)
                    .foregroundStyle(Metrics.messageColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.9)
            }
            .frame(maxWidth: .infinity)
            .position(
                x: geometry.size.width / 2,
                y: geometry.size.height * Metrics.contentCenterYRatio
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel("哦莫 正在启动")
    }
}

private enum Metrics {
    static let messageText = "让知识不只被收藏。"
    static let mascotWidth: CGFloat = 220
    static let mascotHeight: CGFloat = 220
    static let contentCenterYRatio: CGFloat = 0.50
    static let messageTopSpacing: CGFloat = V2Spacing.lg
    static let messageFont = Font.system(size: 24, weight: .bold, design: .default)
    static let messageColor = Color(hex: 0x969855)
}

#Preview {
    V2SplashView()
}
