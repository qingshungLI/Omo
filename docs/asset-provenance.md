# Omo 素材来源与授权

本表只登记公开 App 会打包或直接调用的素材。真实测试截图、模型请求与响应、原始生成视频、私有存储位置和内部服务信息不进入公开仓库。

## 当前 App 使用

### Omo 十姿态

- 来源：用户提供并明确授权用于 Omo 产品的角色姿态参考图。
- 处理：裁切、去背景、统一为 512×512 透明 PNG，校准角色高度与脚底基线。
- 使用：主页回应、召回、反馈、收卡、空状态和默认头像。
- 文件：

| Imageset | SHA-256 |
|---|---|
| `OmoPoseApprove` | `274ff0c37be73e6f5bd9551c9f37d2d0f6caf84241f555a76631db61b4344b81` |
| `OmoPoseConfused` | `2a1b468b251e7d2dd8a72aab005b0a93830766c14aa137ed3d55d3e6bf3ae693` |
| `OmoPoseDazed` | `bbe666aa6df5145e89a78c73aa5fe663c6785fe4095e691e132567159d2191db` |
| `OmoPoseDejected` | `30221676fd181d8d038b6a6a2e940b1920bdef8bcc367cbf1d060a0ab450d720` |
| `OmoPoseFarewell` | `d3929247e65a77465edac85fe12d90f7cfe04a005a4b4f3727e3e2ea6570542f` |
| `OmoPoseHeart` | `8e5dfd62e49df7037bd820749b014ef544c44da08676d0b81efa78346f72622a` |
| `OmoPoseRun` | `98e06674020149721a991bf69b901905cb25e00332bca71efb56db219ed1a568` |
| `OmoPoseShy` | `464306e79ec0a15bdf85dbb0fb1e18b5ddd7ea2505e88c7df62357a7626496e2` |
| `OmoPoseSmirk` | `542f758365c2ae00ce73d9191679831922bd56fd512a0ce2868f60d532799d72` |
| `OmoPoseStretch` | `51a450a2a9876df86986e7a685419ff2b117242cb84934082bcf4a2d693fa56d` |

### 召回界面 SVG

- 来源：从本仓库已审核的历史 Git blob 恢复，不来自外部素材包。
- 修改：仅恢复缺失文件与 `Contents.json` 引用，不重绘。
- 文件：`CaptureUploadIcon`、`RecallCardStack`、`RecallCardSurface`、`RecallExpandIcon`、`RecallFolder`、`RecallRevealTrack`。
- 校验：由 `Omo/Scripts/frontend_static_guard.py` 与 `tools/asset-catalog-guard.mjs` 在集成提交中逐项验证。

### Pow

- 项目：[EmergeTools/Pow](https://github.com/EmergeTools/Pow)
- 许可证：MIT。
- 锁定版本：`1.0.6`。
- 使用：可中断的跳跃、微粒与轻量反馈效果。

### Omo 动作 atlas

- 来源：用户授权的 Omo 姿态图经 Wan 2.6 I2V 生成动作，之后离线裁取稳定段、去背景并统一校色。
- 提交范围：公开仓库只保留 App 使用的透明 atlas 与首帧 poster；原视频、生成请求、生成响应和内部验收报告不公开。
- 首帧 poster：已进入 App，用于动画加载占位、Reduce Motion 静态呈现和解码失败回退。

| Imageset | 用途 | 帧参数 | SHA-256 |
|---|---|---|---|
| `OmoMotionRunAtlas` | 跑向文件夹、取下一张与收卡 | 24 fps；32 帧；6×6 atlas | `778e7871e65b84ebf9855baeab1b9f3c4440d0d9e0f97d55753f51885a873946` |
| `OmoMotionRummageAtlas` | 在文件夹中翻找旧内容 | 24 fps；32 帧；6×6 atlas | `ad7147e4d5ff580d213c2ee9b1c1c4efe281b1ae91f85803afdb514e38414c1c` |
| `OmoMotionCarryReturnAtlas` | 抱卡返回并衔接卡片升起 | 24 fps；10 帧；6×2 atlas | `3543d05f7d1d0d6ec43b1fcc18066a78e267004da7404f7b8dea9cde0eb6dc97` |
| `OmoMotionRunPoster` | Run 动画加载、Reduce Motion 与失败回退 | 首帧 poster | `4f7b9d3486ade0fd6ecba14dd000ffc1b2f79f4393a8f9355450ef3fa0945607` |
| `OmoMotionRummagePoster` | Rummage 动画加载、Reduce Motion 与失败回退 | 首帧 poster | `68b2d045d5a71f667ee79f5de5423b3504db3270205d64ffd0dfe628cec995bc` |
| `OmoMotionCarryReturnPoster` | Carry Return 动画加载、Reduce Motion 与失败回退 | 首帧 poster | `0193b1ece36d2db7f94c510adbe88e92547cbc489465b1ed11307f19557ca2a4` |

## 合并门槛

- 没有明确来源或授权状态的素材不得进入 App target。
- 外部开源素材必须记录原项目链接、许可证、锁定版本和修改方式。
- 用户授权素材只提交产品所需派生文件，不提交原始参考图。
- 生成素材只提交最终派生资源，不提交原视频、生成请求或响应。
- 新增或替换文件后运行素材完整性与公开树敏感信息检查。
