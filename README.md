# Andrej Karpathy DSH 插件

面向 **DeepSeek Harness 0.2.0-rc.2** 的中文讲解插件。借鉴“简明写作 → 图解 → 交互页面 → 讲解视频”的输出思路，把当前会话已有内容变成可阅读、可检查的独立文件。

这是独立实现，不是 Karpathy 或 DeepSeek 官方插件，也不依赖 Open Design。当前版本为 **0.1.0 开发预览**。

## 功能

| 格式 | 产物 | 使用方式 |
| --- | --- | --- |
| 简明中文 | `explanation.md` | 结论、要点、来源与待确认项 |
| 图解 | `diagram.svg` | 明确节点与有向关系；未给关系时只显示要点 |
| 交互 HTML | `index.html` | 搜索要点、展开/收起、打印或保存 PDF |
| 字幕讲解 | `video.html` | 播放、选场景、调时长、导出无音轨 WebM |
| 可编辑数据 | `explanation.json` | 各格式共用的结构化说明 |

**视频边界：** 插件生成 HTML 字幕时间轴；用户在新版 Chrome/Edge 中点击“导出 WebM 视频”后才得到视频文件。录制需保持页面在前台。当前没有 TTS、音轨或 MP4 编码，也没有自动生成有声视频。长段落自动分页，完整文字不会因画布空间不足被丢弃。

中文写作规则借鉴受控语言：结论优先、一句一个意思、主动表达、解释术语，保留条件与单位。它不是 ASD-STE100 英文合规校验器。

## 安装

本地安装（推荐先使用此方式）：

```powershell
dsh plugin --profile desktop add "D:\插件开发\Andrej-Karpathy插件"
```

若 `dsh` 尚未进入 PATH，可使用桌面版附带的 CLI：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "D:\插件开发\Andrej-Karpathy插件"
```

也可在 DSH 桌面版“插件”页面输入本地目录。安装完成后查看插件是否启用；运行中的会话若未刷新工具列表，创建新会话或重启 DSH。

仓库上传到 GitHub 后，可使用下面的地址安装。私有仓库需要本机 GitHub 账号具有读取权限；仓库未创建/上传前此地址不可用。

```powershell
dsh plugin --profile desktop add github:magirisyang/andrej-karpathy-dsh-plugin
```

Web profile 用户将 `desktop` 换为 `web`。运行时必须具有 `tools`、`systemPrompt` 和 `fs` 服务；受限文件服务还需要 `sandboxPolicy`。支持范围严格限制为 0.2.0-rc.2，不自动跳过 DSH 版本检查。

## 使用

在有工作目录的 DSH 会话中输入：

> 使用 Karpathy 讲解插件，把上面的模型输出做成简明中文、图解、交互网页和讲解时间轴。保留原文中的条件与数字，标注来源和待确认项。

或者指定首选格式：

> 用图解解释这段流程，使用 karpathy_explain，mode 设为 diagram。

模型使用已有资料填充结构化说明，再调用 `karpathy_explain`。插件不另接模型 API、不读取隐藏推理、不要求额外模型密钥。每次输出到会话工作目录的 `explanations/<随机编号>/`，不会覆盖原文件。`mode` 选择首选入口；每次仍生成完整五个文件，以保证 HTML 中的格式链接都有效。

如果 DSH 预览器无法打开网页，可在本机浏览器打开生成的 `index.html` 或 `video.html`。允许文件写入的会话权限是必要条件；插件沿用 DSH 的沙箱策略，不自行提升权限。

## 配置

`cordis.patch.yml` 的配置字段：

```yaml
- id: karpathy-explain
  name: andrej-karpathy-dsh-plugin
  config:
    defaultMode: all
    outputDirectory: explanations
```

`defaultMode` 可取 `all`、`text`、`diagram`、`html`、`video`。输出目录必须是安全的相对路径，例如 `reports/explanations`；不接受绝对路径或 `..`。生成页采用固定模板、内容转义与 CSP，不执行模型提供的 HTML/JavaScript。来源链接只允许 HTTP/HTTPS，网页离线运行，不加载 CDN。

## 开发与验证

Node.js 22 或更高版本：

```powershell
npm install --ignore-scripts
npm test
npm run check
npm run demo
npm pack
```

演示输出在 `.artifacts/demo/`。测试包括实际 DSH `defineTool` Schema、Cordis 挂载/卸载与文件服务、创建而不覆盖、取消、沙箱策略传递、输入边界和 HTML/SVG 转义。浏览器的搜索、折叠、播放和 WebM 导出需进行交互验证。

详见 [需求与边界](docs/requirements.md) 和 [验证记录](docs/verification.md)。

## Git 管理

`main` 保存可用版本；功能修改使用 `feat/*` 或 `fix/*` 分支，验证后合并。开发预览通过 `v0.1.0` 标签标识。测试产物、依赖、临时参考源码、凭据和环境文件不提交。GitHub 仓库按用户要求设为私有，不发布 npm 包。
