# 参考规则与实现范围

本插件参考下列三个独立项目。它们不代表 Andrej Karpathy 或这些项目作者对本插件的背书。

| 项目 | 采用的规则 | 当前实现 |
| --- | --- | --- |
| [karpathy-output-style](https://github.com/ashryaagr/karpathy-output-style) | 先回答读者问题；常用词、主动句；格式服务于理解；实际检查成果 | 会话提示、中文机械检查、真实 SVG/PNG、可操作 HTML、实际渲染后才交付的视频 |
| [comprehension-ladder](https://github.com/bowen31337/comprehension-ladder) | 同一份核心观点、机制、不确定性和例子；文字→图→交互→视频逐层升级 | 共享 knowledge.json，example、steps、事实关联；不确定箭头虚线；步骤切换高亮；返回 rung/nextModes，升级由用户选择 |
| [document-style-guide](https://github.com/ruanyf/document-style-guide) | 中文短句、主题先行、统一术语、中英文间距、半角数字、数值单位与中文标点 | 中文提示与 quality.json 建议；原文不自动改写，数值、否定和限定词保留 |

`writingStrictness` 默认 80，取值 0—100，调整中文机械检查强度；不是质量分数或 ASD-STE100 合规百分比。英文单词计数不直接用于中文。机械检查只能提示，不能核验科学事实，也不能证明模型完全遵守写作规则。

图解采用可编辑 SVG，OpenDesign 可改进阅读页；尚未提供经过导入验证的 Excalidraw 文件。视频采用已实现的离线分镜、淡入、旁白和字幕，尚未实现 Manim 的复杂机制动画。参数模拟只有明确实现的空间交叉验证模型；一般流程使用可见步骤切换，不冒称具有该主题的计算模型。

参考项目的提示与代码按其 MIT 许可使用，中文文档规范由原作者声明为公共领域。本实现根据规则自行编写，未整包复制这些技能，也未分发完整 ASD-STE100 标准。原始许可与贡献者信息以各上游仓库为准。
