/** Offline, seeded toy classification. This is NOT a random-forest experiment. */
export function spatialModel(parameters) {
  const { gridSize, folds, holdoutFold, seed, pointCount } = parameters;
  if (!Number.isFinite(gridSize) || gridSize < 2 || gridSize > 40) throw new Error('gridSize must be 2..40');
  if (!Number.isInteger(folds) || folds < 2 || folds > 8 || !Number.isInteger(holdoutFold) || holdoutFold < 0 || holdoutFold >= folds) throw new Error('Invalid folds');
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647 || !Number.isInteger(pointCount) || pointCount < 30 || pointCount > 300) throw new Error('Invalid dataset parameters');
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const points = Array.from({ length: pointCount }, (_, id) => {
    const x = random() * 100, y = random() * 100;
    const cellX = Math.floor(x / gridSize), cellY = Math.floor(y / gridSize);
    const fold = ((Math.imul(cellX + 1, 73856093) ^ Math.imul(cellY + 1, 19349663) ^ seed) >>> 0) % folds;
    const label = Math.sin(x / 8) + Math.cos(y / 8) + Math.sin(y / 5) > 0 ? 1 : 0;
    return { id, x, y, cellX, cellY, fold, label };
  });
  const train = points.filter(p => p.fold !== holdoutFold), validation = points.filter(p => p.fold === holdoutFold);
  let correct = 0, sumDistance = 0;
  const evaluated = validation.map(point => {
    let nearest, squared = Infinity;
    for (const candidate of train) {
      const distance = (point.x - candidate.x) ** 2 + (point.y - candidate.y) ** 2;
      if (distance < squared) { squared = distance; nearest = candidate; }
    }
    if (nearest) { if (nearest.label === point.label) correct++; sumDistance += Math.sqrt(squared); }
    return { ...point, prediction: nearest?.label ?? null, nearestDistance: nearest ? Math.sqrt(squared) : null };
  });
  return {
    points, train, validation: evaluated,
    accuracy: train.length && validation.length ? correct / validation.length : null,
    meanNearestDistance: train.length && validation.length ? sumDistance / validation.length : null,
    parameters: { ...parameters },
  };
}

export function spatialSvg(result) {
  const { gridSize, holdoutFold } = result.parameters;
  const scale = 5, margin = 40, size = 500;
  let grid = '';
  for (let position = 0; position <= 100; position += gridSize) {
    const coordinate = margin + position * scale;
    grid += `<path d="M${coordinate},${margin}V${margin + size} M${margin},${coordinate}H${margin + size}" stroke="#d3dde4" fill="none"/>`;
  }
  const dots = result.points.map(point => `<circle cx="${margin + point.x * scale}" cy="${margin + point.y * scale}" r="4" fill="${point.fold === holdoutFold ? '#e87936' : '#0e766e'}"><title>样本 ${point.id}；空间折 ${point.fold + 1}；模拟类别 ${point.label}</title></circle>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 640" role="img" aria-labelledby="spatial-title"><title id="spatial-title">模拟空间交叉验证；橙色为验证样本，绿色为训练样本</title><rect width="600" height="640" fill="white"/>${grid}${dots}<text x="40" y="575" font-size="18">模拟数据 · 网格 ${gridSize} · 验证折 ${holdoutFold + 1}</text><text x="40" y="610" font-size="16">训练 ${result.train.length} / 验证 ${result.validation.length}；最近邻分类演示</text></svg>`;
}
