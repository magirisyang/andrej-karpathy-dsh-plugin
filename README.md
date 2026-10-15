# Andrej Karpathy DSH 插件

**0.3.0 开发预览 · DeepSeek Harness 0.2.0-rc.2**。按任务选择简明中文、SVG、可计算的 HTML 或明确请求的视频，各格式共享一份事实说明。这是独立的 DSH 原生插件，不是官方插件。独立使用时无需 OpenDesign；需要视觉重设计时可连接 OpenDesign 的官方 CLI。

## 安装

### DSH 插件页面（推荐）

打开 DSH 的 **插件** 页面，选择安装插件，在来源输入框粘贴：

```text
github:magirisyang/andrej-karpathy-dsh-plugin
```

点击安装，完成后确认 `andrej-karpathy-dsh-plugin` 已启用；工具列表未刷新时新建会话或重启 DSH。安装会自动注册插件，无需下载源码、编译或手写配置。

本仓库已公开，安装无需 GitHub 账号授权。package.json 的 `private: true` 仅用于防止误发 npm，与 GitHub 可见性无关。

### 命令行安装

桌面版：

```powershell
dsh plugin --profile desktop add github:magirisyang/andrej-karpathy-dsh-plugin
```

若桌面版附带 CLI 尚未加入 PATH：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add github:magirisyang/andrej-karpathy-dsh-plugin
```

Web 版把 `--profile desktop` 换成 `--profile web`。需要固定版本时在来源末尾加 `#v0.3.0`。更新后重启 DSH，以加载新的代码。

### 本地开发安装

仅开发时使用本地 checkout：`dsh plugin --profile desktop add "D:\插件开发\Andrej-Karpathy插件"`。插件需要宿主的 `tools`、`systemPrompt`、`fs`；受限文件服务还需 `sandboxPolicy`。当前支持 DeepSeek Harness **0.2.0-rc.2**。

组合包采用 DSH 标准的 `dsh.bundle.patch` 和 `insert` 配置层。源码入口为可直接加载的 JavaScript，不使用安装时构建脚本。安装机制见 [DSH 官方打包与安装文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish.html)。

## 使用

> 用 Karpathy 插件解释随机森林的空间交叉验证，提供网格示意和能调整网格大小的 HTML。使用模拟数据，并明确说明不是实际 RF 精度。

| 请求 | 默认路由 | 文件 |
| --- | --- | --- |
| 简单概念 | 直接中文回答；文件工具为 text | explanation.md |
| 结构、关系、流程 | diagram | index.html（内嵌图解）与 diagram.svg；页面可导出 PNG |
| 参数变化、滑块、模拟 | html | index.html |
| 明确要求视频/旁白/MP4 | video | 时间轴、渲染脚本；执行后 MP4/SRT |
| 明确要求全部格式 | all | 所有输出 |

`karpathy_route` 只返回规则决策。`karpathy_explain` 生成选定格式；显式 `mode` 优先。默认 `auto` 不因复杂问题自动生成视频。全局提示要求中文、用途与例子优先、首次讲解聚焦 3—5 个关键观点。明确要求使用插件时应实际调用；是否遵循仍取决于当前模型和会话指令。

每个包包含 `knowledge.json`、机械检查 `quality.json`、路径与内容哈希 `manifest.json`。事实说明保存术语、来源、推断/假设、适用范围与模拟参数。模型组织内容，程序校验结构和引用；不自动证明事实正确。中文检查提示长句、部分套话、术语别名及来源缺失，不是国家标准或 ASD-STE100 认证。

### 参考规则与理解阶梯

已参考 [karpathy-output-style](https://github.com/ashryaagr/karpathy-output-style)、[comprehension-ladder](https://github.com/bowen31337/comprehension-ladder) 和 [阮一峰中文文档规范](https://github.com/ruanyf/document-style-guide)，具体对应关系见 [参考规则](docs/references.md)。不是只添加引用：统一说明中保存 `example`、机制 `steps`、`edges.certainty` 和 `edges.factIds`；例子和步骤进入文本、页面与视频。可能、假设或关联待核验事实的关系使用虚线和文字标记。

`writingStrictness` 默认 80，控制中文建议检查的强度，不表示事实准确率或英文标准合规率。工具返回 `rung` 与可选 `nextModes`；是否升级到图、交互或视频由用户决定，不自动启动全部格式。

### 图解预览与交付

图解模式主文件改为 `index.html`，直接内嵌真实 SVG。关系筛选可以一次只看一条箭头；“导出完整 PNG 图解”用浏览器实际渲染 SVG，保留全部框、箭头和说明，不截断长图。复杂图仍可能有走线交叠，可逐条查看或交给 OpenDesign 重新设计。

默认开启 `autoPresent`：宿主提供会话投影与结果事件时，在成功的工具结果之后写入 DSH 与 `present` 相同的持久化交付事件。失败或取消不交付。返回的 `delivery.status=queued` 表示排队等待成功结果，不能据此声称已经视觉验收；`needs-present` 或 `disabled` 时，模型应使用 `delivery.files` 调用现有 `present`。文件生成、交付和视觉检查是不同状态。

页面先给结论和图解，默认展开前三个要点；其余内容、来源、术语与适用条件保留在可展开区域。不要把文件名与函数名堆成首次讲解。没有实际打开页面时，不得宣称图片完整或检查通过。

### OpenDesign 连接与视觉重设计

先从 [OpenDesign 官方项目](https://github.com/nexu-io/open-design) 安装并启动应用。Windows 标准安装位置中的官方 CLI 会自动识别；其他位置可指定 `--node-entry <官方 daemon-cli.mjs 路径>`，已有 `od` 也可用 `--od` 指定。若选择 DSH 为设计代理，按官方方式运行 `od agent setup deepseek-harness`；设计任务使用 OpenDesign 已配置的代理和凭证，不保证复用当前 DSH 会话或模型。

在 DSH 里说：

> 用 Karpathy 和 OpenDesign 向普通读者解释这个项目。先给一个例子和关键步骤，再把阅读页导入 OpenDesign 改进视觉设计，保留来源和限制。

模型应传 `designBackend=opendesign`。工具先生成可独立阅读的原生页面、设计约定、任务说明和固定 CLI 连接脚本，返回 `openDesignCommand` 与 `openDesignDesignCommand`，均经 DSH 原有 shell/job 执行。**生成这些文件不代表 OpenDesign 已经运行。**

- 执行 `openDesignCommand`：复制到生成目录中的 `opendesign-work/`，通过官方 `od project import-folder` 导入；收到真实 project.id 才记录成功。原始页面与事实文件保留。
- 执行 `openDesignDesignCommand`：导入后，用官方 `od run start` 启动已配置代理的设计任务；收到 runId 才说“已启动”，随后用 `od run info` 检查。这里可能产生配置代理的模型用量。
- 在连接命令后加 `--png`：使用 `od export` 实际导出 PNG；已有设计任务必须先返回 succeeded，且成果没有被判为无效。导出后仍须视觉检查。

桌面版可能要求通过应用自身授权选择目录。遇到 `desktop import token rejected` 时，在 OpenDesign 的“打开文件夹”中选择生成包内的 `opendesign-work`；再给连接命令加 `--project <已导入的项目ID>` 继续。不会禁用桌面认证或私自获取令牌。默认使用应用已配置的代理，可用 `openDesignAgent` 或命令的 `--agent` 明确指定；是否支持 DSH 代理取决于 OpenDesign 和 DSH 的实际版本。

可给连接命令加 `--daemon-url http://127.0.0.1:<端口>`、`--od <CLI路径>`。任务说明在 `opendesign-brief.md`，视觉约定在 `design.md`。保存的 `opendesign-state.json` 用于继续已有项目，重复连接不重新导入或覆盖设计副本。导出不覆盖已有 PNG。

未安装、认证失败、代理配置缺失或网络失败时，报告真实错误并仍交付原生页面。不会为安装插件自动安装 OpenDesign，不绕过其导入授权，不把固定模板说成 OpenDesign 设计成果。OpenDesign 模式的包始终自包含，`reuseFrom` 不继承其他目录的文件。

### 可计算的交互

设置 `simulation.kind=spatial_cv` 后，固定种子生成模拟样本。滑块重新计算网格和空间折，再用最近邻分类重算预测正确比例和最近训练点距离。不是仅修改屏幕数字，也没有调用实际随机森林。

支持网格 2—40、2—8 个折、30—300 个样本；样本不足时不显示虚构准确率。目前内置参数模拟仅覆盖空间交叉验证；其他主题的 HTML 可用 `steps` 提供逐步讲解与节点/箭头高亮，也保留搜索、折叠和阅读功能，不声称具备该主题的计算模型。

### 多轮复用

读取旧 `knowledge.json` 后组织新内容，传 `reuseFrom` 为旧 `manifest.json` 所在目录。清单和文件当前字节都匹配时，复用未变化文件；变化内容生成新版本，原产物保留。重复相同请求零写入，不靠修改时间判断复用，不覆盖用户改过的缓存。

共享时可不传 `reuseFrom`，生成自包含目录。带复用链接的网页引用旧目录文件，分享时须保留这些依赖。

## 中文旁白 MP4

video 返回 `videoCommand` 和固定资源 `render-video.py`、`narrate.py`、`requirements-video.txt`。模型继续通过 DSH 原有 shell/job 执行，沿用原有沙箱和审批；插件不直接绕过它们启动进程。

Windows 使用系统慧慧中文语音、Pillow、FFmpeg。无需云语音密钥，不上传内容。先用 DSH 工作区依赖工具定位 Python；缺少依赖时安装到生成包内，不用系统环境：

```powershell
python -m pip install --target explanations/<编号>/video-deps -r explanations/<编号>/requirements-video.txt
python explanations/<编号>/render-video.py --knowledge explanations/<编号>/knowledge.json --output explanations/<编号>/explanation.mp4 --work explanations/<编号>/render-work --dependency-dir explanations/<编号>/video-deps
```

替换实际 Python 路径和包编号。已有 FFmpeg 可用 `--ffmpeg`；另支持 `--font`、`--voice`、`--rate -3..3`。执行后确认真实 MP4/SRT，再用 DSH `present` 交付，不能把 HTML 或未执行脚本当作 MP4。

按场景输出进度并保存缓存；修改一段时可复用其他段。中断后重新执行同一命令，复用完成场景。相同内容及依赖且哈希一致时复用最终视频，否则已有视频保留，用新输出名。

目前视频为分镜幻灯片、淡入、中文旁白、烧录字幕和 SRT。字幕按语音时长与实际片段边界安排，不是逐字强制对齐。尚无 Manim/HyperFrames 复杂机制动画。中文 MP4 只在 Windows 验证；浏览器时间轴可导出无音轨 WebM。

## 配置与开发

```yaml
- id: karpathy-explain
  name: andrej-karpathy-dsh-plugin
  config:
    defaultMode: auto
    outputDirectory: explanations
    designBackend: auto
    autoPresent: true
    writingStrictness: 80
    openDesignAgent: ""
```

目录必须是安全相对路径。输出通过 DSH 文件服务携带会话目录和原沙箱策略，原子 createIfAbsent。网页采用固定模板、转义和 CSP，不执行源材料或模型的 HTML/JavaScript，不加载 CDN。

Node.js 22+、pnpm 11.7.0：`pnpm install --frozen-lockfile --ignore-scripts`、`pnpm test`、`pnpm run check`、`pnpm run demo`、`pnpm pack`。提交 pnpm-lock.yaml，CI 使用锁文件。演示在 `.artifacts/demo/`。

Git 使用 main、功能分支和版本标签，原 v0.1.0 保留。依赖、视频、测试产物、参考源码和凭据不提交。GitHub 仓库公开；npm 发布仍禁用。

详见 [需求](docs/requirements.md) 与 [验证](docs/verification.md)。
