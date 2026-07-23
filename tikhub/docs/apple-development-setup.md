# Apple 开发环境配置

## 当前机器状态

- Apple Silicon（`arm64`）
- macOS Sequoia 15.6.1
- 当前只有 Command Line Tools，完整 Xcode 尚未安装
- 因此目前不能运行 SwiftUI iOS 工程、`xcodebuild` 或 `simctl`

macOS 15.6.1 可使用 Xcode 26.3。Xcode 26.4.1 及更高版本需要 macOS Tahoe，不应在当前系统上安装。

## 安装 Xcode

使用能正常工作的 Apple ID 在以下任一位置安装 Xcode：

1. Mac App Store 搜索 `Xcode`。
2. Apple Developer Downloads 下载 Xcode 26.3 的 `.xip`，解压到 `/Applications/Xcode.app`。

安装完成后，在终端运行：

```bash
./scripts/verify-ios-environment.sh
./scripts/setup-ios-simulator.sh
```

脚本会：

- 将 `/Applications/Xcode.app/Contents/Developer` 设为活动开发目录。
- 执行 Xcode 首次初始化。
- 检查并提示安装 iOS Simulator Runtime。
- 创建名为 `AdventureX iPhone` 的 iPhone 模拟器。
- 启动 Simulator。

如果下载不到 Simulator Runtime，在 Xcode 中打开 `Settings > Components`，安装一个 iOS Runtime 后重新运行脚本。

## 项目工具

仓库根目录预留了：

- `.swiftformat`：SwiftFormat 规则。
- `.swiftlint.yml`：SwiftLint 规则。
- `scripts/verify-ios-environment.sh`：Xcode、SDK 与模拟器检查。
- `scripts/setup-ios-simulator.sh`：模拟器创建与启动。

SwiftFormat、SwiftLint、XcodeGen 和 xcbeautify 属于辅助工具，不能替代完整 Xcode。当前 Homebrew 下载源不稳定，等 Xcode 本体可用后再按单包安装：

```bash
brew install swiftformat
brew install swiftlint
brew install xcodegen
brew install xcbeautify
```

## Apple Developer 账号

开发模拟器不需要 Apple Developer Program 会员，也不需要配置签名证书。需要真机安装、TestFlight 或 App Store 发布时，再在 Xcode 的 `Settings > Accounts` 登录账号，并在项目的 `Signing & Capabilities` 选择对应 Team。

不要在仓库中保存 Apple ID、密码、验证码、签名证书或 provisioning profile。
