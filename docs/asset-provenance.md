# Recallo 素材授权登记（Asset Provenance）

> 版本：v0.6
>
> 日期：2026-07-25
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

进入实现前还必须给每项素材标记处理方式：

| 处理方式 | 使用条件 |
| --- | --- |
| `reuse_as_is` | 尺寸、背景、状态表达和许可证均满足组件需要 |
| `reuse_with_crop_or_recolor` | 只需裁切、去背景、调色或压缩即可投入使用 |
| `rebuild_in_code` | 复用同一官方角色，以 SwiftUI / CSS 的位移、等比缩放、轻旋转、节奏、代码卡片或粒子组合出新情境；不得镜像 |
| `generate_only_if_missing` | 关键状态没有可用素材，且代码重组仍无法清楚表达时才生成 |

处理顺序固定为：仓库已有素材 → 用户提供并授权素材 → 已登记开源素材 → 关键缺口生成。禁止因为“看起来更统一”而重复生成已具备的动作。

## 2. bundled：仓库实际使用

### 2.1 项目原创素材（无第三方授权问题）

| 位置 | 内容 | 用途 | 授权 |
| --- | --- | --- | --- |
| `拾贝/拾贝/Assets.xcassets/` | iOS 全部图标、吉祥物、装饰图、头像预设（V2*、Tab*、AppIcon 等） | iOS App 界面 | 项目原创，仓库自有 |
| `docs/app-demo-assets/*.svg`（16 个文件） | v0.5 Web 演示的导航图标、吉祥物、背景装饰 | v0.5 `ios-app-demo.html` 历史资产；v0.6 导航改用已登记的 Phosphor 文件 | 项目原创，仓库自有 |
| `docs/product-exploration/assets/*.png`（5 个文件） | v0.5 概念图，以及 v0.6 今日、召回、知识库三张验收截图 | PRD 历史视觉参考与 v0.6 验收记录 | 项目原创，仓库自有 |
| `docs/app-demo-assets/mascot-v06/*.png` | v0.6 早期角色姿态表及 5 个切片 | 历史设计核对与验证证据；当前 Web 运行时不引用 | 依据用户提供的情绪与比例参考生成的项目历史资产 |
| `拾贝/拾贝/Assets.xcassets/RecalloMascot*.imageset/` | 与早期 Web 同源的 5 个角色姿态 | 历史兼容资源；当前 iOS 宠物位不引用 | 项目原创，仓库自有 |
| `docs/ios-app-demo.html` 内联 CSS | 卡面、铅笔涂鸦遮盖层、触控与 Reduce Motion 降级 | v0.6 Web 交互预览 | 项目原创，仓库自有 |

当前十个情境状态统一以用户授权的 `Pick The Shell/IP1-1.svg` 为唯一角色画面，通过位移、等比缩放、轻旋转、节奏、代码原生文件夹 / 卡片和已登记粒子组合为 `idle`、`reacting`、`turning`、`rummaging`、`carrying`、`watching`、`acknowledging`、`thinking`、`sleeping`、`farewell`。禁止镜像、切换旧姿态 PNG、重绘或重新生成角色；旧 PNG 保留只是为了兼容和历史验证。

### 2.2 第三方素材

| 素材 | 版本 / 文件 | 许可证与来源 | 引入位置 | 用途 |
| --- | --- | --- | --- | --- |
| Pow | `1.0.6` | MIT · <https://github.com/EmergeTools/Pow> | `拾贝/拾贝.xcodeproj/project.pbxproj` | iOS 跳跃、升起、闪光及粒子 `changeEffect` |
| Kenney Particle Pack | `1.1`：`star_04.png`、`circle_05.png`、`smoke_06.png` | CC0 · <https://kenney.nl/assets/particle-pack> | `docs/app-demo-assets/kenney-particles/`、`RecalloParticle*.imageset/` | 暖色火花、圆环、烟雾粒子，运行时统一着色 |
| Phosphor Icons Core | Git commit `2b75f3ad12b420c9504ef05df8d2564a28f8500e`：`sun.svg`、`cards-three.svg`、`user-circle.svg`、`plus.svg`、`arrow-up.svg` | MIT · <https://github.com/phosphor-icons/core> | `docs/app-demo-assets/phosphor/` | Web 三栏导航和导入/上拖提示图标 |


### 2.3 用户授权的 Pick The Shell 组件

来源归档：`/data1/yuxiao/recallo-artifacts/799828c/Pick The Shell.zip`（SHA-256 `67c418b7a6cf9b225f531d78c0979951675fe831840a4a9f364fadba5a66cce3`）。用户在本项目对话中明确允许复用；仅提取下列 7 个白名单文件，未导入 `__MACOSX`、`.DS_Store` 或 AppleDouble sidecar。

| 原文件 → Asset 名 | 处理方式 | 实际用途 / 技术说明 |
| --- | --- | --- |
| `IP1-1.svg` → `RecallMascotShell`；Web 同字节副本 `docs/app-demo-assets/mascot-v06/IP1-1.svg` | `reuse_as_is` | iOS 开屏、全部宠物位与 Web 演示的唯一角色画面；原 SVG 为 raster-in-SVG，未声明矢量保留 |
| `收藏夹-1.svg` → `RecallFolder` | `reuse_with_crop_or_recolor` | 首页记忆卡文件夹；原 SVG 为 raster-in-SVG，未声明矢量保留 |
| `题卡组.svg` → `RecallCardStack` | `reuse_as_is` | 首页可拖动的召回卡叠；保留矢量表示 |
| `题卡-1.svg` → `RecallCardSurface` | `reuse_as_is` | 卡叠前景纸面；保留矢量表示 |
| `滑动条.svg` → `RecallRevealTrack` | `reuse_as_is` | 语义刮开进度提示；保留矢量表示 |
| `上传icon-1.svg` → `CaptureUploadIcon` | `reuse_as_is` | 截图导入入口；保留矢量表示 |
| `展开icon-1.svg` → `RecallExpandIcon` | `reuse_as_is` | 直接揭晓入口；保留矢量表示 |

`AppIcon.appiconset/shibei-app-icon.png` 是 `IP1-1.svg` 的授权派生：在服务器用 GdkPixbuf 按原始 `170×170 viewBox`、clip 与 transform 渲染，缩放为 `820×820` 后居中合成到设计系统 `#E8EBBD` 背景。输出为 `1024×1024` RGB PNG、无 Alpha；内容边界 `(136, 102, 882, 915)`，最小安全边距 `102px`。

## 3. considered：白名单内、评估中（未导入）

| 素材 | 状态与授权 | 当前决策 |
| --- | --- | --- |
| 用户在 2026-07-24 对话中提供的毛球动作表、三视图、六场景配色图和刮卡示意图 | 用户明确授权本项目直接裁切、去背景、调色、组合和复用 | `considered`；仅作为历史视觉参考。当前官方角色已冻结为 `IP1-1.svg`，不再从这些图生成或裁切新的宠物姿态 |
| [Agent UI Atlas](https://github.com/starvingarc/agent-ui-atlas) | Atlas 汇编内容为 CC BY 4.0；其中链接项目、截图、品牌与素材仍按各自许可证 | 仅作设计检索索引，提炼留白、材质、线条与可打断动效原则；不导入 Atlas 或其链接项目素材 |

当前没有处于 `considered` 状态的第三方运行时素材；新增候选必须先登记后导入。

## 4. excluded：明确不引入

| 素材 / 类别 | 原因 |
| --- | --- |
| Lottie / Rive 及其动效文件 | MVP 不引入动效运行时；毛球与卡面动效用 SwiftUI / CSS 自研 |
| 原神、炉石传说等第三方游戏的任何资产（图、音效、字体、卡面） | 仅借鉴揭晓节奏与卡面层级；不复刻、不描摹、不导出 |
| 无明确许可证的网络图片、图标包、表情包 | 授权不清，一律不进仓库 |

## 5. 新增素材流程

1. 确认许可证在 §3 白名单内，或为项目原创；
2. 标记 `reuse_as_is`、`reuse_with_crop_or_recolor`、`rebuild_in_code` 或 `generate_only_if_missing`；
3. 在本文件按状态登记：来源、版本、许可证或用户授权、原文件、处理方式、引入位置、用途；
4. 第三方素材保留许可证文本或注释；
5. 对新增或改动文件生成 SHA-256；
6. 审查时核对：`git ls-files` 中的素材文件与本表一一对应，多退少补。

## 6. 当前核对基线（v0.6）

- Web 端：所有宠物状态只引用 `docs/app-demo-assets/mascot-v06/IP1-1.svg` 与 5 个 Phosphor 原始 SVG，无外链字体、图片或脚本；
- iOS 端：开屏及全部宠物位只通过 `RecallMascotShell` 引用 `IP1-1.svg`；Pow 精确锁定 `1.0.6`，粒子只使用 3 个已登记 Kenney 文件；
- 十个毛球情境状态通过同一 `IP1-1.svg` 和代码原生位移、等比缩放、轻旋转及节奏组合；禁止镜像，不新增或切换角色位图；
- 用户参考图与 Agent UI Atlas 均未被整包导入；如后续产生实际派生文件，必须在本表补原文件、处理方式与校验值；
- 全仓库无 Lottie（`.json` 动效）、无 Rive（`.riv`）文件。

## 7. 文件校验值（SHA-256）

下列旧姿态 PNG 校验值保留为历史验证证据；当前 Web 与 iOS 运行时均不把它们作为宠物状态来源。

| 文件 | SHA-256 |
| --- | --- |
| `mascot-v06/recallo-mascot-poses-v06-chroma.png` | `99de6a92e67bba6827d259e2ed542cbf113258f355a5558d55f44acb5685ae4f` |
| `mascot-v06/recallo-mascot-poses-v06.png` | `401a45f794927bebc271afae1b39669476c3c51ffa79166a5aa2cac1bef01afe` |
| `mascot-v06/recallo-mascot-idle.png` | `d62db1c37841d1d229b4c16b61965b482aae3e72daeb63add04e2a477da594c4` |
| `mascot-v06/recallo-mascot-thinking.png` | `d868f2fb3b750638b24107c7f137e83cf28c29cc67996da919c8c758e5fc24be` |
| `mascot-v06/recallo-mascot-tilt.png` | `0151f61ba6d48d2b436ef6f832101b0115df5df1252cb3a14bee3d05e1b444b2` |
| `mascot-v06/recallo-mascot-hop.png` | `1b469d65d90055c17f0d163e95b57a4435e49e47689b6fa3ac3430a6689f0252` |
| `mascot-v06/recallo-mascot-success.png` | `bc09d6438649b8a920a94d1b5195bbe1a46b27dda5b2e66db1ef94d412470a9c` |
| `kenney-particles/star_04.png` | `6485ac16c773663bd39346f3bedae04465ac14c661eb47cc5cfa935cdbf6c2ec` |
| `kenney-particles/circle_05.png` | `925b8ac284436f74f9cadf0ecd058da1c08fba65c098e4e34fd220603022f02e` |
| `kenney-particles/smoke_06.png` | `d988b03bb46797be913333f06b26ff2aad55ec082cfb7d3d18ce86ccb71559b5` |
| `phosphor/sun.svg` | `e031ec2d8c1b33f243e698a935c0252b75ab612966d111177d5ab1c680293606` |
| `phosphor/cards-three.svg` | `b9b28b5fd8badf13603aae3cbff72f1080adbfebc45734384b8286c26970e8f3` |
| `phosphor/user-circle.svg` | `96cc02045d8e1db183681f90ee21883b2cc45ce941a8ac5af5a6fa47bdd01f4b` |
| `phosphor/plus.svg` | `96b24cf8fd7305767791d43231271c47d24f2be856eb2a474df0e67a80840f2f` |
| `phosphor/arrow-up.svg` | `203081bc75bac0f1296da11e1225cd2315d8ae996b63a31f6ce133f3cd170bc5` |

### Pick The Shell 与 AppIcon

| 文件 | SHA-256 |
| --- | --- |
| `RecallMascotShell.imageset/IP1-1.svg` | `94c141133f0ad3e548a5d674eddb50ab294a256533ca92fd1fee0fda9f50b6a8` |
| `docs/app-demo-assets/mascot-v06/IP1-1.svg` | `94c141133f0ad3e548a5d674eddb50ab294a256533ca92fd1fee0fda9f50b6a8` |
| `RecallFolder.imageset/收藏夹-1.svg` | `f3fbcbc4210aee8da0a03bf02252bdb09f54f794f450ebf0c8aefb1be09dd73b` |
| `RecallCardStack.imageset/题卡组.svg` | `ffe512a2d7324ce85e36ee581a399823e005601d16d2b655cbe063d5d5ff8a75` |
| `RecallCardSurface.imageset/题卡-1.svg` | `aab7aff8bae3a21d7b7c0df96442fa633f42deaa047a1d07840b45e92c03a831` |
| `RecallRevealTrack.imageset/滑动条.svg` | `55d2e7b7a977cde6c8aa477827cdabcbbcb4e06024e562942b64a851187b9606` |
| `CaptureUploadIcon.imageset/上传icon-1.svg` | `a17487a9223f4af719476fdaa2397a904fcc08b5d8b09ea2b1090104b76f9391` |
| `RecallExpandIcon.imageset/展开icon-1.svg` | `b1d85c8cf323fd1615f083a204313b18db96f278bc6a88819840d4863fbebd19` |
| `AppIcon.appiconset/shibei-app-icon.png` | `d5786a833ca952296fb0fd14d49a5acc98827fc77ecce16934ae1a9e30de13f5` |
