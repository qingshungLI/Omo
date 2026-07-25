# Recallo v0.6 动画制作、工具与素材清单

> 版本：v0.1
>
> 日期：2026-07-25
>
> 对应 PRD：[`tasks/prd-recallo-2-screenshot-awakening-v0.6.md`](../tasks/prd-recallo-2-screenshot-awakening-v0.6.md)
>
> 动效合同：[`recallo-v06-motion-and-assets.md`](./recallo-v06-motion-and-assets.md)
>
> 素材登记：[`asset-provenance.md`](./asset-provenance.md)

本文把 Recallo 当前的毛球陪伴、召回抽卡、语义擦开、反馈和收卡动画整理为可执行制作清单。目标不是增加更多无意义动效，而是让“从自己的过去取回一张记忆”成为连续、可理解、可跳过的完整动作。

## 1. 当前判断

当前前端已经具备完整功能闭环：卡叠上拖、首张 1800ms / 后续 900ms 召回、语义擦开、三档反馈、检查点、收好与 Reduce Motion 均已有实现。

角色基线已经冻结：`Pick The Shell/IP1-1.svg` 本身就是官方毛球。开屏和全部宠物位必须使用这一张图，十个语义状态只通过 SwiftUI / CSS 的位移、等比缩放、轻旋转、时间节奏，以及与代码原生卡片 / 文件夹的遮挡组合来表达。禁止镜像、切换旧 `RecalloMascot*` PNG、重画或生成新宠物姿态。

主要缺口不是角色素材数量，而是连续空间关系：`rummaging`、`carrying`、`sleeping` 和 `farewell` 需要在同一角色画面下形成“靠近文件夹 -> 翻找 -> 随卡返回 -> 放回文件夹”的可读节奏。仓库早期五张透明 PNG 继续保留为兼容和历史验证证据，但不再是当前运行时输入。

状态标记：

- `DONE`：核心动画已实现，不重做素材；
- `POLISH`：逻辑已存在，需要增强表现；
- `TODO`：缺少关键动作或素材；
- `EVERY`：所有相关动画都必须满足。

## 2. 动画生产总表

| 环节 | 动画与目标 | 制作工具 | 实现方法 | 所需素材 | 状态 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| 素材整理 | 冻结 `IP1-1.svg` 画布、边界和校验值 | `sha256sum`、ImageMagick 只读检查 | iOS `RecallMascotShell` 与 Web 副本保持同字节；不裁切新姿态 | `IP1-1.svg` | DONE | - |
| 首页待机 | 低频呼吸、轻移或发呆节奏 | SwiftUI `Task`、CSS keyframes | 每 8-14 秒最多一次；操作中、低电量和 Reduce Motion 下停止 | 同一 `IP1-1.svg` | POLISH | P1 |
| 点击毛球 | 一次轻回应 | SwiftUI、CSS | 280-420ms 等比缩放、轻位移与小角度旋转后回位；不发奖励 | 同一 `IP1-1.svg` | POLISH | P1 |
| 卡叠入口 | 轻压、上拖、倾斜、取消回弹 | SwiftUI Gesture、CSS | 长按缩至 0.97；上拖约 28pt；倾斜不超过正负 4 度 | 卡片代码绘制 | DONE | - |
| 抽卡蓄力 | 卡叠压缩、毛球朝文件夹轻移 | SwiftUI `withAnimation`、触觉反馈 | 0-150ms；卡叠缩至 0.96；角色位移与轻旋转，不镜像 | 同一 `IP1-1.svg` | POLISH | P0 |
| 靠近文件夹 | 毛球位移建立空间连续性 | SwiftUI / CSS keyframes | 150-360ms；沿短路径平移、轻缩放和轻旋转，不换帧 | 同一 `IP1-1.svg` | POLISH | P0 |
| 翻找卡片 | 毛球短距离往返、文件夹内卡片错位 | SwiftUI、CSS | 360-600ms；角色轻移 / 轻旋转；文件夹内卡片产生 2-3pt 不同步位移 | 同一 `IP1-1.svg` + `RecallFolder` | POLISH | P0 |
| 随卡返回 | 毛球和卡片作为同一容器移动，接近中央后分离 | SwiftUI `ZStack`、Path、CSS | 600-900ms；角色和卡片共用路径，落位前解除绑定 | 同一 `IP1-1.svg` + 代码原生卡片 | POLISH | P0 |
| 毛线轨迹 | 用轨迹表达记忆被召回，不表达概率 | SwiftUI Canvas、`Path.trim`、Web Canvas | 600-1180ms；统一使用中性灰白轨迹，settle 前不泄露稀有度 | 现有 Glow / Spark；路径代码生成 | POLISH | P0 |
| 卡面落定 | 卡片归正、轻回弹、材质出现 | SwiftUI Spring、CSS keyframes | 1180-1550ms；旋转约 3 度回到 0；缩放 1.04 回到 1 | 卡面代码绘制；稀有度纹理可选 | POLISH | P0 |
| 稀有度亮标 | 稀有度与掌握状态依次淡入 | Pow Shine、SwiftUI transition | 1550-1800ms；只闪光一次；三档时长一致 | 现有粒子；可选材质 Alpha | POLISH | P0 |
| 跳过抽卡 | 立即进入主动回忆，取消旧时间轴 | SwiftUI 可取消 Task | 取消当前阶段任务，直接进入 `recall` | 无 | DONE | - |
| 后续抽卡 | 缩短为 900ms，避免重复完整仪式 | 同首张抽卡工具 | 保留取卡、短轨迹、落定和提示 | 复用首张素材 | POLISH | P0 |
| 主动回忆 | 毛球安静注视，停顿较久只轻移一次 | SwiftUI Task | 停顿约 6-8 秒后短暂位移 / 轻旋转；不循环催促 | 同一 `IP1-1.svg` | POLISH | P1 |
| 语义擦开 | 26pt 自由路径，覆盖 45% 后揭示 | SwiftUI Canvas、Web Canvas | `destinationOut`；12x7 覆盖网格 | 遮盖层代码绘制 | DONE | - |
| 记忆修复 | 铅笔碎屑从最后触点飞回卡框 | Canvas、Pow Spray | 6-10 个碎屑；300-450ms；只播放一次 | 复用 Spark / Puff | TODO | P0 |
| 反馈：记得 | 小跳和暖黄粒子 | Pow Jump / Spray | 同一角色短上移；单次播放，不循环、不连击 | `IP1-1.svg` / Spark | DONE | - |
| 反馈：模糊 | 角色轻侧倾、卡框柔和呼吸一次 | SwiftUI | 一次轻旋转和一次呼吸，不持续闪烁 | 同一 `IP1-1.svg` | POLISH | P1 |
| 反馈：忘记 | 角色下沉并略缩小 | SwiftUI | 不震屏、不使用惩罚色 | 同一 `IP1-1.svg` | POLISH | P1 |
| 检查点 | 下一张露边，用户决定继续或收好 | SwiftUI transition | 下一张卡露出约 12-18pt；不自动连播 | 卡片代码绘制 + `IP1-1.svg` | DONE | - |
| 收卡 | 卡片插入文件夹并完成遮挡 | SwiftUI `mask`、`zIndex` | 卡片缩至约 0.82，进入文件夹前后层之间 | 文件夹使用代码分层 | TODO | P0 |
| 告别 | 文件夹闭合、毛球随收卡方向轻移 | SwiftUI Spring | 文件夹回弹一次；角色轻移 / 轻旋转后停稳；总时长约 650-700ms | 同一 `IP1-1.svg` | POLISH | P0 |
| 暂停/夜间 | 下沉、略缩小与极慢呼吸 | SwiftUI | Reduce Motion 下完全静态 | 同一 `IP1-1.svg` | POLISH | P0 |
| Reduce Motion | 保留状态与结果，移除非必要位移、粒子和旋转 | `accessibilityReduceMotion`、CSS media query | 召回统一为约 180ms 淡入；轨迹和粒子关闭 | 无 | EVERY | P0 |
| 素材一致性 | 防止 Web / iOS 角色文件漂移 | `sha256sum`、静态 guard | 两份 `IP1-1.svg` SHA-256 必须一致；不新增角色 PNG | `IP1-1.svg` | EVERY | P0 |
| 素材登记 | 保留授权、处理与校验记录 | `sha256sum`、Markdown | 登记来源、授权、原文件、派生方式、使用位置和 SHA-256 | 所有进入 App 的文件 | EVERY | P0 |
| Web 验收 | 375px、鼠标、触摸、键盘与 Reduce Motion | Playwright、ffmpeg | 完成全流程并保存截图或视频证据 | 无 | EVERY | P0 |
| iOS 验收 | 编译、模拟器、VoiceOver、动态字体和掉帧检查 | Xcode、Accessibility Inspector、Instruments | 测试中断恢复、低电量和 Reduce Motion | 无 | EVERY | 发布前 |

## 3. 抽卡时间轴合同

### 3.1 首张完整召回：1800ms

| 时间窗 | 阶段 | 卡片 | 毛球 | 效果 |
| --- | --- | --- | --- | --- |
| 0-150ms | `compress` | 卡叠压缩，顶部卡下沉 4-6pt | 转头看向文件夹 | 轻触觉；背景只轻微降亮度 |
| 150-600ms | `rise` | 封存卡保持不可见，随后升起 | 同一角色位移靠近、轻旋转表达翻找 | 卡片不是随机抽中，调度结果已确定 |
| 600-1180ms | `orbit` | 卡片跟随毛球返回并升起 | 同一角色与卡片共同位移，到中央后分离 | 中性轨迹完成一圈，不泄露稀有度 |
| 1180-1550ms | `settle` | 卡片归正、回弹，等级材质与徽标第一次出现 | 切换等待姿态 | 不显示答案或完整截图 |
| 1550-1800ms | `cue` | 稀有度与掌握状态淡入 | 放下卡片并注视 | Shine 只播放一次，出现“试着想起它” |

用户可以在任意阶段点击“跳过过场”。跳过必须取消当前动画 Task，并直接落在主动回忆界面。

### 3.2 后续召回：900ms

| 时间窗 | 内容 |
| --- | --- |
| 0-100ms | 卡叠轻压 |
| 100-330ms | 毛球取出下一张 |
| 330-560ms | 短毛线轨迹 |
| 560-740ms | 卡面落定 |
| 740-900ms | 稀有度和主动回忆提示出现 |

后续召回不重复完整光迹仪式。每张卡结束后先进入检查点，由用户选择继续或收好。

## 4. 稀有度材质

稀有度在进入动画前已经由内容规则确定。动画只呈现价值层级，不模拟随机概率。

| 稀有度 | 卡框与纸张 | 轨迹 | 落定反馈 | 新素材需求 |
| --- | --- | --- | --- | --- |
| R | 奶油纸张、石墨线 | settle 前统一中性灰白单线 | 一次轻回弹 | 无强制素材 |
| SR | 双层卡纸、珊瑚描边 | settle 前统一中性灰白单线 | 一次短流光 | 可选珊瑚纸边 Alpha |
| SSR | 暖金纤维、克制珠光 | settle 前统一中性灰白单线 | 柔和纤维聚拢 | 可选暖金纤维 Alpha |

三档持续时间必须一致。禁止概率数字、保底、卡包、转盘、近失误和“差一点 SSR”。

## 5. 最小角色素材包

当前且唯一的角色素材是：

```text
Pick The Shell/IP1-1.svg
├── iOS: RecallMascotShell.imageset/IP1-1.svg
└── Web: docs/app-demo-assets/mascot-v06/IP1-1.svg
```

两份运行时文件必须同字节、同 SHA-256。`idle`、`reacting`、`turning`、`rummaging`、`carrying`、`watching`、`acknowledging`、`thinking`、`sleeping`、`farewell` 全部由这一张图配合位移、等比缩放、轻旋转、时间节奏，以及代码原生卡片 / 文件夹组合表达。

仓库现有 `RecalloMascotIdle`、`RecalloMascotTilt`、`RecalloMascotThinking`、`RecalloMascotHop`、`RecalloMascotSuccess` 和 Web 同源 PNG 保留为兼容及历史验证证据；当前运行时不得引用，也不删除。P0 / P1 均不再补画、裁切或生成新的宠物姿态。

## 6. 素材技术规格

| 项目 | 规格 |
| --- | --- |
| 格式 | 原始 `IP1-1.svg`；不转换为新角色 PNG，不使用 GIF 运行时 |
| 原始画布 | 保留 SVG `170×170 viewBox`、clip 与 transform |
| 角色占比 | 按原 SVG 完整呈现；只允许容器裁切 |
| 基线 | 由统一组件容器和锚点控制，不改写 SVG 内部 |
| 朝向 | 始终使用原图朝向；禁止镜像 |
| 阴影 | 不烘焙固定投影；运行时统一生成 |
| 背景与文字 | 不包含 |
| 分层 | 卡片、文件夹、问号、爱心和提示符尽量独立 |
| Web / iOS | 使用同字节 `IP1-1.svg`；通过 SHA-256 和静态 guard 防漂移 |
| 状态变换 | 只允许位移、等比缩放、轻旋转与节奏；禁止非等比变形和换图 |

文件夹不制作成单张位图。运行时拆成背板、卡片插槽和前盖三个 SwiftUI / CSS 层，才能完成插入与遮挡。

## 7. 工具选择

| 工具 | 用途 | 使用位置 | 是否新增依赖 |
| --- | --- | --- | --- |
| `sha256sum` | 确认 Web / iOS 两份 `IP1-1.svg` 同字节 | `bridge-amax` | 否 |
| ImageMagick / GdkPixbuf | 只读检查 SVG 渲染边界及 AppIcon 历史派生 | `bridge-amax` | 否 |
| Figma / Smart Animate | 关键帧和遮挡关系预演 | 设计阶段 | 否 |
| SwiftUI | 卡片、文件夹、角色和转场 | iOS | 已有 |
| SwiftUI Canvas / `Path.trim` | 毛线轨迹、刮开和碎屑路径 | iOS | 已有 |
| Pow 1.0.6 | 单次 shine、jump、spray | iOS | 已锁定 |
| CSS keyframes / Web Animations API | Web 过场和同一角色的位移、等比缩放、轻旋转 | Web 演示 | 已有能力 |
| Web Canvas | Web 毛线轨迹、刮开和粒子 | Web 演示 | 已有能力 |
| Playwright | 375px、触摸、键盘和 Reduce Motion 验收 | `bridge-amax` | 已有测试路线 |
| ffmpeg | 录屏转 MP4 / GIF 供对比 | `bridge-amax` | 工具层，不进入产品 |
| Xcode Simulator / Instruments | 编译、真机尺寸和性能检查 | macOS runner | 发布前需要 |

MVP 不引入 After Effects 运行时、Lottie、Rive、Spine、Unity、Unreal、Blender 或新的粒子库。After Effects 可以制作概念预览，但不能成为产品运行依赖。

## 8. 制作与实现流程

1. 冻结 `IP1-1.svg` 原始画布、SHA-256、容器锚点和抽卡时间轴；
2. 将同字节 `IP1-1.svg` 接入 Web 与 iOS，旧角色 PNG 仅保留兼容，不再被运行时引用；
3. 以单一状态组件实现十个状态，动作只用位移、等比缩放、轻旋转和时间节奏；
4. 用代码原生卡片、文件夹、问号、爱心和粒子表达场景，不改画角色；
5. 在 Web Demo 中验证路径、遮挡、速度和 375px 布局；
6. 在 SwiftUI 中复用同一状态合同，禁止镜像和换图；
7. 验证跳过、取消、后台恢复、低电量和 Reduce Motion 路径；
8. 运行 Web、静态 guard、两份 SVG 哈希和素材登记检查；
9. 在 macOS runner 完成 Xcode、Simulator、VoiceOver、动态字体和 Instruments 验收；
10. 形成录屏证据、更新验证文档后再合并。

## 9. 并行分工

| 负责人 | 所有权 | 交付物 |
| --- | --- | --- |
| Kimi Code | Web CSS / Canvas 动画与 Playwright 证据 | Web 抽卡、单一 IP1 状态、毛线轨迹、375px 验收 |
| Codex subagent | SwiftUI 单一 IP1 状态组件、抽卡时间轴、文件夹遮挡、Reduce Motion 与可访问性 | iOS 动画代码、静态守卫、合同测试 |
| Codex | 状态合同、素材授权、交叉审查、服务器集成和最终验收 | 单一集成提交、测试报告、文档与 GitHub 同步 |

所有代码、素材处理脚本和 Web 测试在 `bridge-amax` 隔离 worktree 中执行。`bridge-amax` 是 Linux，不能运行 Xcode Simulator；正式 iOS 编译必须使用 macOS CI runner，或者由用户明确授权的 Mac 构建环境完成。

## 10. 验收清单

### 动画行为

- [ ] 首张完整过场总时长约 1800ms；
- [ ] 后续过场总时长约 900ms；
- [ ] Reduce Motion 约 180ms 淡入，不播放轨迹和粒子；
- [ ] 任意阶段可跳过，旧 Task 被取消；
- [ ] 靠近、翻找、随卡返回和收卡以同一 `IP1-1.svg` 形成连续空间关系；
- [ ] R / SR / SSR 只改变材质和轨迹，不改变概率或时长；
- [ ] 记得 / 模糊 / 忘记反馈只播放一次；
- [ ] 用户停止复习时没有自动连抽；
- [ ] 后台退出和恢复不会重复抽卡或重复提交反馈。

### 素材

- [ ] Web / iOS 两份 `IP1-1.svg` SHA-256 一致；
- [ ] 开屏与全部宠物位只引用 `RecallMascotShell` / `IP1-1.svg`；
- [ ] 没有镜像、非等比变形或旧 `RecalloMascot*` PNG 运行时引用；
- [ ] 没有生成、补画或裁切新的宠物姿态；
- [ ] 没有整包导入第三方素材；
- [ ] 每个素材已登记来源、授权、派生方式和 SHA-256；
- [ ] Web 与 iOS 共用同一原始角色内容；
- [ ] 不包含授权不清的音效、字体、卡面或第三方游戏资产。

### 可访问性与性能

- [ ] VoiceOver 可以跳过抽卡、完整揭示和提交反馈；
- [ ] 动态字体不会遮挡主要按钮；
- [ ] 低电量模式停止空闲动作和非必要粒子；
- [ ] Reduce Motion 不移除状态、结果或操作能力；
- [ ] 375px 宽度无横向溢出；
- [ ] iOS 真机尺寸无明显掉帧和离屏渲染问题。

## 11. 禁止项

- 不使用概率数字、保底、卡包、转盘、十连和近失误；
- 不用全屏爆炸、循环闪光和不断升级的刺激；
- 不把原始截图或答案放在抽卡过场中提前泄露；
- 不用假进度条或不能真实结束的“AI 正在努力”动画；
- 不因忘记而降级、摧毁或让卡片枯萎；
- 不为已有动作重复生成一套不同风格角色；
- 不镜像 `IP1-1.svg`，不通过换图伪造新的角色姿态；
- 不在 MVP 引入 Lottie、Rive 或新的动画运行时。
