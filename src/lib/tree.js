// Раскладка семейного древа: поколение = строка, порядок внутри строки
// подбирается так, чтобы дети стояли под родителями (метод барицентров).

export function descendantIds(relatives, id) {
  const result = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const r of relatives) {
      if (r.parentIds?.includes(cur) && !result.has(r.id)) {
        result.add(r.id);
        stack.push(r.id);
      }
    }
  }
  return result;
}

export function computeGenerations(relatives) {
  const byId = new Map(relatives.map((r) => [r.id, r]));
  const parentsOf = (r) => (r.parentIds || []).filter((p) => byId.has(p));
  const gen = new Map();

  const visit = (id, path = new Set()) => {
    if (gen.has(id)) return gen.get(id);
    if (path.has(id)) return 0; // защита от циклов в повреждённых данных
    path.add(id);
    const parents = parentsOf(byId.get(id));
    const g = parents.length ? Math.max(...parents.map((p) => visit(p, path))) + 1 : 0;
    path.delete(id);
    gen.set(id, g);
    return g;
  };
  relatives.forEach((r) => visit(r.id));

  // Человек без указанных родителей (например, супруг) встаёт на уровень над своими детьми
  for (const r of relatives) {
    if (parentsOf(r).length) continue;
    const childGens = relatives.filter((c) => c.parentIds?.includes(r.id)).map((c) => gen.get(c.id));
    if (childGens.length) gen.set(r.id, Math.min(...childGens) - 1);
  }

  const min = Math.min(...gen.values());
  for (const [id, g] of gen) gen.set(id, g - min);
  return gen;
}

export function layoutTree(relatives, { nodeW = 92, gapX = 14, rowH = 132 } = {}) {
  if (!relatives.length) return { nodes: [], edges: [], width: 0, height: 0 };

  const gen = computeGenerations(relatives);
  const depth = Math.max(...gen.values()) + 1;
  const rows = Array.from({ length: depth }, () => []);
  relatives.forEach((r) => rows[gen.get(r.id)].push(r));

  const childrenOf = new Map(relatives.map((r) => [r.id, []]));
  relatives.forEach((r) => (r.parentIds || []).forEach((p) => childrenOf.get(p)?.push(r.id)));

  const pos = new Map();
  const index = () => rows.forEach((row) => row.forEach((r, i) => pos.set(r.id, i)));
  const avg = (ids, fallback) => {
    const xs = ids.filter((id) => pos.has(id)).map((id) => pos.get(id));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;
  };

  index();
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let g = 1; g < depth; g++) {
      rows[g].sort((a, b) => avg(a.parentIds || [], pos.get(a.id)) - avg(b.parentIds || [], pos.get(b.id)));
      index();
    }
    for (let g = depth - 2; g >= 0; g--) {
      rows[g].sort((a, b) => avg(childrenOf.get(a.id), pos.get(a.id)) - avg(childrenOf.get(b.id), pos.get(b.id)));
      index();
    }
  }

  const maxCount = Math.max(...rows.map((row) => row.length));
  const width = maxCount * nodeW + (maxCount - 1) * gapX;
  const nodes = [];
  rows.forEach((row, g) => {
    const rowW = row.length * nodeW + (row.length - 1) * gapX;
    const offset = (width - rowW) / 2;
    row.forEach((r, i) => nodes.push({
      relative: r,
      x: offset + i * (nodeW + gapX),
      y: g * rowH,
    }));
  });

  const nodeById = new Map(nodes.map((n) => [n.relative.id, n]));
  const edges = [];
  nodes.forEach((child) => (child.relative.parentIds || []).forEach((pid) => {
    const parent = nodeById.get(pid);
    if (parent) edges.push({ id: `${pid}-${child.relative.id}`, from: parent, to: child });
  }));

  return { nodes, edges, width, height: depth * rowH - (rowH - 96), nodeW };
}
