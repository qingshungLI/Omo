# Recallo 素材授权登记（Asset Provenance）

> 版本：v0.6
>
> 日期：2026-07-24
>
> 对应规格：[`recallo-v06-motion-and-assets.md`](./recallo-v06-motion-and-assets.md) §7
>
> 维护规则：本文件与仓库实际文件一一对应。**只登记仓库实际使用（bundled）或明确评估中（considered）的素材；不得宣称使用了未实际导入的素材。** 新增素材必须先补登记再入库。

## 1. 状态定义

| 状态 | 含义 |
| --- | --- |
| bundled | 文件已在仓库内，并被产品或文档实际引用 |
| considered | 白名单允许、正在评估，但仓库内尚未导入任何文件 |
| excluded | 明确不引入 |

## 2. bundled：仓库实际使用

### 2.1 项目原创素材（无第三方授权问题）

| 位置 | 内容 | 用途 | 授权 |
| --- | --- | --- | --- |
| `拾贝/拾贝/Assets.xcassets/` | iOS 全部图标、吉祥物、装饰图、头像预设（V2*、Tab*、AppIcon 等） | iOS App 界面 | 项目原创，仓库自有 |
| `docs/app-demo-assets/*.svg`（16 个文件） | v0.5 Web 演示的导航图标、吉祥物、背景装饰 | v0.5 `ios-app-demo.html` 引用；v0.6 起 demo 改为内联实现，本目录保留为历史资产 | 项目原创，仓库自有 |
| `docs/product-exploration/assets/*.png`（2 个文件） | v0.5 概念图与验收截图 | PRD §12 历史视觉参考 | 项目原创，仓库自有 |
| `docs/ios-app-demo.html` 内联 SVG / CSS | v0.6 毛球角色、三 Tab 图标、卡面、铅笔涂鸦遮盖层、颗粒纹理 | v0.6 Web 交互预览 | 项目原创，仓库自有 |

### 2.2 第三方素材

当前仓库内 **没有任何 bundled 的第三方素材**。下表留作新增登记格式：

| 素材 | 版本 / 文件 | 许可证 | 引入位置 | 用途 |
| --- | --- | --- | --- | --- |
| （暂无） | — | — | — | — |

## 3. considered：白名单内、评估中（未导入）

| 素材 | 许可证 | 允许范围 | 当前状态 |
| --- | --- | --- | --- |
| Pow（mattbreda/pow，iOS 粒子库） | MIT | **仅 iOS 运行时**的少量粒子反馈；Web 预览不引入 | 未导入；仅在需要“记得”时刻的轻粒子时评估，需登记版本与文件 |
| Kenney Particle Pack | CC0 | 最多少量粒子贴图（如 star / circle 基础粒子） | 未导入；若 Pow 自带粒子不足再评估，需登记具体 PNG 文件名 |
| Phosphor Icons Core | MIT | Web 端 SVG 图标候选，按需内联并保留许可注释 | 未导入；v0.6 demo 目前使用原创内联 SVG，若改用 Phosphor 需逐图标登记 |

## 4. excluded：明确不引入

| 素材 / 类别 | 原因 |
| --- | --- |
| Lottie / Rive 及其动效文件 | MVP 不引入动效运行时；毛球与卡面动效用 SwiftUI / CSS 自研 |
| 原神、炉石传说等第三方游戏的任何资产（图、音效、字体、卡面） | 仅借鉴揭晓节奏与卡面层级；不复刻、不描摹、不导出 |
| 无明确许可证的网络图片、图标包、表情包 | 授权不清，一律不进仓库 |

## 5. 新增素材流程

1. 确认许可证在 §3 白名单内，或为项目原创；
2. 在本文件按状态登记：来源、版本、许可证、引入位置、用途；
3. 第三方素材保留许可证文本或注释；
4. 审查时核对：`git ls-files` 中的素材文件与本表一一对应，多退少补。

## 6. 当前核对基线（v0.6）

- `docs/ios-app-demo.html`：无外部素材引用（无 `/app-demo-assets/`、无外链字体 / 图片 / 脚本），全部视觉为内联原创 SVG + CSS；
- iOS 端：仅使用 `Assets.xcassets` 内原创资产，未添加 Pow / Kenney / 任何 Swift 粒子依赖；
- 全仓库无 Lottie（`.json` 动效）、无 Rive（`.riv`）文件。
