import SwiftUI

enum OmoTheme {
    static let surface = Color("OmoSurface")
    static let card = Color("OmoCard")
    static let line = Color("OmoLine")
    static let lineSoft = Color("OmoLineSoft")
    static let text = Color("OmoTextPrimary")
    static let textSoft = Color("OmoTextSecondary")
    static let muted = Color("OmoTextMuted")
    static let faint = Color("OmoTextFaint")
    static let primary = Color("OmoBrandPrimary")
    static let yellow = Color("OmoAccentYellow")
    static let yellowPale = Color("OmoAccentYellowPale")
    static let error = Color("OmoDanger")
    static let success = Color("OmoSuccess")
    static let onPrimary = Color("OmoOnPrimary")
    static let dangerBackground = Color("OmoDangerBackground")
    static let successBackground = Color("OmoSuccessBackground")
    static let sourceBackground = Color("OmoSourceBackground")
    static let inputFocusBackground = Color("OmoInputFocusBackground")
    static let reviewWaitingBackground = Color("OmoReviewWaitingBackground")
    static let reviewInProgressBackground = Color("OmoReviewInProgressBackground")
    static let reviewCompletedBackground = Color("OmoReviewCompletedBackground")
    static let reviewCompletedText = Color("OmoReviewCompletedText")
    static let answerWrongText = Color("OmoAnswerWrongText")
    static let shadow = Color("OmoShadow")
    static let scrim = Color("OmoScrim")
    static let radius: CGFloat = 15
}

struct AppScaffold<Content: View, Trailing: View>: View {
    @ObservedObject var store: AppStore
    let title: String
    var showsTopBar = true
    var showsTabBar = true
    var leadingAction: (() -> Void)?
    let trailing: Trailing
    let content: Content

    init(
        store: AppStore,
        title: String,
        showsTopBar: Bool = true,
        showsTabBar: Bool = true,
        leadingAction: (() -> Void)? = nil,
        @ViewBuilder trailing: () -> Trailing,
        @ViewBuilder content: () -> Content
    ) {
        self.store = store
        self.title = title
        self.showsTopBar = showsTopBar
        self.showsTabBar = showsTabBar
        self.leadingAction = leadingAction
        self.trailing = trailing()
        self.content = content()
    }

    var body: some View {
        ZStack {
            OmoTheme.surface.ignoresSafeArea()
            VStack(spacing: 0) {
                if showsTopBar {
                    TopBar(title: title, leadingAction: leadingAction, trailing: trailing)
                }
                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .foregroundStyle(OmoTheme.text)
    }
}

extension AppScaffold where Trailing == EmptyView {
    init(
        store: AppStore,
        title: String,
        showsTopBar: Bool = true,
        showsTabBar: Bool = true,
        leadingAction: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.init(
            store: store,
            title: title,
            showsTopBar: showsTopBar,
            showsTabBar: showsTabBar,
            leadingAction: leadingAction,
            trailing: { EmptyView() },
            content: content
        )
    }
}

struct TopBar<Trailing: View>: View {
    let title: String
    var leadingAction: (() -> Void)?
    let trailing: Trailing

    var body: some View {
        ZStack {
            Text(title)
                .font(.system(size: 20, weight: .bold))
            HStack {
                if let leadingAction {
                    Button(action: leadingAction) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 20, weight: .semibold))
                            .frame(width: 42, height: 42)
                    }
                    .accessibilityLabel(Text("global.back"))
                }
                Spacer()
                trailing
            }
            .padding(.horizontal, 18)
        }
        .frame(height: 64)
        .background(OmoTheme.surface.opacity(0.94))
    }
}

struct SBCard<Content: View>: View {
    var padding: CGFloat = 25
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            content
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(OmoTheme.card)
        .overlay(
            RoundedRectangle(cornerRadius: OmoTheme.radius, style: .continuous)
                .stroke(OmoTheme.line, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: OmoTheme.radius, style: .continuous))
        .shadow(color: OmoTheme.shadow.opacity(0.05), radius: 15, y: 10)
    }
}

struct StatusPill: View {
    let text: String
    var isDanger = false

    var body: some View {
        Text(text)
            .font(.system(size: 16, weight: .medium))
            .tracking(isDanger ? 0 : 1.6)
            .foregroundStyle(isDanger ? OmoTheme.error : OmoTheme.textSoft)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(isDanger ? OmoTheme.dangerBackground : OmoTheme.yellowPale)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

struct PrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(title)
                if let systemImage {
                    Image(systemName: systemImage)
                }
            }
            .font(.system(size: 16, weight: .medium))
            .frame(maxWidth: .infinity, minHeight: 56)
            .foregroundStyle(OmoTheme.onPrimary)
            .background(disabled ? OmoTheme.primary.opacity(0.45) : OmoTheme.primary)
            .clipShape(RoundedRectangle(cornerRadius: OmoTheme.radius, style: .continuous))
            .shadow(color: OmoTheme.shadow.opacity(disabled ? 0 : 0.10), radius: 8, y: 4)
        }
        .disabled(disabled)
    }
}

struct SecondaryButton: View {
    let title: String
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
            }
            .font(.system(size: 16, weight: .medium))
            .frame(maxWidth: .infinity, minHeight: 56)
            .foregroundStyle(OmoTheme.textSoft)
            .background(OmoTheme.card)
            .overlay(
                RoundedRectangle(cornerRadius: OmoTheme.radius, style: .continuous)
                    .stroke(OmoTheme.line, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: OmoTheme.radius, style: .continuous))
        }
    }
}

struct ProgressBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(OmoTheme.lineSoft)
                Capsule()
                    .fill(OmoTheme.yellow)
                    .frame(width: proxy.size.width * max(0, min(progress, 1)))
            }
        }
        .frame(height: 8)
    }
}

struct KnowledgePointRow: View {
    let index: Int
    let point: KnowledgePoint
    var showsSummary = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 12) {
                Text("\(index + 1)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(OmoTheme.textSoft)
                    .frame(width: 26, height: 26)
                    .background(OmoTheme.yellowPale)
                    .clipShape(Circle())
                Text(point.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(OmoTheme.text)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if showsSummary {
                Text(point.summary)
                    .font(.system(size: 14))
                    .foregroundStyle(OmoTheme.muted)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(3)
                    .padding(.leading, 38)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(OmoTheme.card)
        .overlay(
            RoundedRectangle(cornerRadius: OmoTheme.radius, style: .continuous)
                .stroke(OmoTheme.line, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: OmoTheme.radius, style: .continuous))
        .shadow(color: OmoTheme.shadow.opacity(0.04), radius: 10, y: 5)
    }
}

struct SubmittedToast: View {
    let language: AppLanguage
    let close: () -> Void

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()
            OmoTheme.scrim.opacity(0.16)
                .ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "checkmark")
                    .font(.system(size: 28, weight: .bold))
                    .frame(width: 56, height: 56)
                    .background(OmoTheme.yellow)
                    .clipShape(Circle())
                Text(L10n.string("toast.submitted.title", language: language))
                    .font(.system(size: 22, weight: .bold))
                Text(L10n.string("toast.submitted.body", language: language))
                    .foregroundStyle(OmoTheme.muted)
                PrimaryButton(title: L10n.string("toast.submitted.action", language: language), action: close)
            }
            .padding(24)
            .frame(width: 330)
            .background(OmoTheme.card)
            .clipShape(RoundedRectangle(cornerRadius: OmoTheme.radius, style: .continuous))
            .shadow(color: OmoTheme.shadow.opacity(0.18), radius: 18, y: 8)
        }
    }
}
