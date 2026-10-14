export const modes = ['auto', 'all', 'text', 'diagram', 'html', 'video'];

/** Deterministic rules first; an explicit user-selected format wins. */
export function routeTask(request = '', requestedMode = 'auto') {
  if (typeof request !== 'string' || request.length > 8000) throw new Error('request must be text of at most 8000 characters');
  if (!modes.includes(requestedMode)) throw new Error('Unsupported mode');
  if (requestedMode !== 'auto') return { mode: requestedMode, reason: '遵循用户明确指定的格式。', explicitVideo: ['video', 'all'].includes(requestedMode) };
  if (/视频|配音|旁白|mp4|有声|explainer video/iu.test(request)) return { mode: 'video', reason: '用户明确提出视频或旁白需求。', explicitVideo: true };
  if (/四种|全部格式|所有格式/iu.test(request)) return { mode: 'all', reason: '用户明确提出所有输出形式。', explicitVideo: true };
  if (/滑块|调[整节].{0,15}(参数|网格|大小|阈值)|改变.{0,15}(大小|参数)|参数.{0,15}(变化|影响)|交互|模拟|interactive/iu.test(request))
    return { mode: 'html', reason: '需要通过参数变化观察计算或模拟结果。', explicitVideo: false };
  if (/图解|画图|流程|结构|架构|之间.{0,8}关系|空间.{0,8}(关系|划分)|动画|时间演化|diagram/iu.test(request))
    return { mode: 'diagram', reason: '结构、关系或流程用图解更易检查。', explicitVideo: false };
  return { mode: 'text', reason: '默认采用简明中文，避免无必要地产生更多文件。', explicitVideo: false };
}
