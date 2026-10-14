# Andrej Karpathy DSH 插件

**0.2.0 开发预览 · DeepSeek Harness 0.2.0-rc.2**。按任务选择简明中文、SVG、可计算的 HTML 或明确请求的视频，各格式共享一份事实说明。这是独立的 DSH 原生实现，不是官方插件；不要求安装 OpenDesign，不修改宿主源码。

## 安装

在 DSH 插件页面输入本地目录，或使用桌面版附带 CLI：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "D:\插件开发\Andrej-Karpathy插件"
```

已配置 PATH 时用 `dsh plugin --profile desktop add <目录>`；Web 用户换为 `--profile web`。安装后确认插件启用；工具列表未刷新时使用新会话或重启 DSH。需要 `tools`、`systemPrompt`、`fs`；受限文件服务还需 `sandboxPolicy`。支持范围固定为 0.2.0-rc.2。

GitHub 上传完成后，授权过的本机 Git 可安装私有仓库：

```powershell
dsh plugin --profile desktop add github:magirisyang/andrej-karpathy-dsh-plugin
```

远端未实际创建/上传前，该地址不可用。

## 使用

> 用 Karpathy 插件解释随机森林的空间交叉验证，提供网格示意和能调整网格大小的 HTML。使用模拟数据，并明确说明不是实际 RF 精度。

| 请求 | 默认路由 | 文件 |
| --- | --- | --- |
| 简单概念 | 直接中文回答；文件工具为 text | explanation.md |
| 结构、关系、流程 | diagram | diagram.svg |
| 参数变化、滑块、模拟 | html | index.html |
| 明确要求视频/旁白/MP4 | video | 时间轴、渲染脚本；执行后 MP4/SRT |
| 明确要求全部格式 | all | 所有输出 |

`karpathy_route` 只返回规则决策。`karpathy_explain` 生成选定格式；显式 `mode` 优先。默认 `auto` 不因复杂问题自动生成视频。全局提示引导模型选择；是否调用工具仍受会话其他指令影响。

每个包包含 `knowledge.json`、机械检查 `quality.json`、路径与内容哈希 `manifest.json`。事实说明保存术语、来源、推断/假设、适用范围与模拟参数。模型组织内容，程序校验结构和引用；不自动证明事实正确。中文检查提示长句、部分套话、术语别名及来源缺失，不是国家标准或 ASD-STE100 认证。

### 可计算的交互

设置 `simulation.kind=spatial_cv` 后，固定种子生成模拟样本。滑块重新计算网格和空间折，再用最近邻分类重算预测正确比例和最近训练点距离。不是仅修改屏幕数字，也没有调用实际随机森林。

支持网格 2—40、2—8 个折、30—300 个样本；样本不足时不显示虚构准确率。目前内置参数模拟仅覆盖空间交叉验证；其他主题的 HTML 是搜索、折叠和阅读页面，不声称具备该主题的计算模型。

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
```

目录必须是安全相对路径。输出通过 DSH 文件服务携带会话目录和原沙箱策略，原子 createIfAbsent。网页采用固定模板、转义和 CSP，不执行源材料或模型的 HTML/JavaScript，不加载 CDN。

Node.js 22+、pnpm 11.7.0：`pnpm install --frozen-lockfile --ignore-scripts`、`pnpm test`、`pnpm run check`、`pnpm run demo`、`pnpm pack`。提交 pnpm-lock.yaml，CI 使用锁文件。演示在 `.artifacts/demo/`。

Git 使用 main、功能分支和版本标签，原 v0.1.0 保留。依赖、视频、测试产物、参考源码和凭据不提交。目标 GitHub 仓库为私有，不发布 npm。

详见 [需求](docs/requirements.md) 与 [验证](docs/verification.md)。
