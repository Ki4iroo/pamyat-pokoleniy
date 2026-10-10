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

// Семейная ячейка: родители + их общие дети. Супруги — те, у кого есть общий ребёнок.
export function layoutTree(relatives, { nodeW = 92, gapX = 14, rowH = 132 } = {}) {
  if (!relatives.length) return { nodes: [], units: [], width: 0, height: 0 };

  const byId = new Map(relatives.map((r) => [r.id, r]));
  const parentsIn = (r) => (r.parentIds || []).filter((p) => byId.has(p));
  const gen = computeGenerations(relatives);
  const depth = Math.max(...gen.values()) + 1;

  const partners = new Map(relatives.map((r) => [r.id, new Set()]));
  const childrenOf = new Map(relatives.map((r) => [r.id, []]));
  const unitMap = new Map();
  for (const r of relatives) {
    const ps = parentsIn(r);
    ps.forEach((p) => childrenOf.get(p).push(r.id));
    if (ps.length === 2) {
      partners.get(ps[0]).add(ps[1]);
      partners.get(ps[1]).add(ps[0]);
    }
    if (ps.length) {
      const key = [...ps].sort().join('|');
      if (!unitMap.has(key)) unitMap.set(key, { id: key, parents: ps, children: [] });
      unitMap.get(key).children.push(r.id);
    }
  }

  const rows = Array.from({ length: depth }, () => []);
  relatives.forEach((r) => rows[gen.get(r.id)].push(r.id));
  const pos = new Map();
  const index = () => rows.forEach((row) => row.forEach((id, i) => pos.set(id, i)));
  index();

  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const byBirth = (a, b) => (byId.get(a).birthDate || '').localeCompare(byId.get(b).birthDate || '');

  const orderRow = (g, useChildren) => {
    const groups = new Map(); // key -> { members, bary }
    const attached = new Map(); // id партнёра -> супруги без родителей, встающие рядом
    const groupOf = new Map();

    for (const id of rows[g]) {
      const ps = parentsIn(byId.get(id));
      if (ps.length) {
        const key = 'p:' + [...ps].sort().join('|');
        if (!groups.has(key)) groups.set(key, { members: [], bary: avg(ps.map((p) => pos.get(p))) });
        groups.get(key).members.push(id);
        groupOf.set(id, key);
        continue;
      }
      const rowPartners = [...partners.get(id)].filter((p) => gen.get(p) === g);
      const anchor = rowPartners.find((p) => parentsIn(byId.get(p)).length);
      if (anchor) {
        if (!attached.has(anchor)) attached.set(anchor, []);
        attached.get(anchor).push(id);
        continue;
      }
      // Пара (или одиночка) без родителей — общая группа
      const couple = [id, ...rowPartners.filter((p) => !parentsIn(byId.get(p)).length)].sort();
      const key = 'c:' + couple[0];
      if (!groups.has(key)) {
        const kids = couple.flatMap((c) => childrenOf.get(c)).filter((k) => gen.get(k) === g + 1);
        const bary = useChildren && kids.length ? avg(kids.map((k) => pos.get(k))) : avg(couple.map((c) => pos.get(c)));
        groups.set(key, { members: [], bary });
      }
      groups.get(key).members.push(id);
      groupOf.set(id, key);
    }

    const sorted = [...groups.entries()].sort((a, b) => a[1].bary - b[1].bary);
    const groupRank = new Map(sorted.map(([key], i) => [key, i]));

    // Внутри группы: тот, чей супруг левее, — к левому краю, правее — к правому
    const side = (id) => {
      if (attached.has(id)) return 1;
      const own = groupRank.get(groupOf.get(id));
      const other = [...partners.get(id)].map((p) => groupRank.get(groupOf.get(p))).find((r) => r !== undefined && r !== own);
      return other === undefined ? 0 : Math.sign(other - own);
    };

    const result = [];
    for (const [, { members }] of sorted) {
      members.sort((a, b) => side(a) - side(b) || byBirth(a, b));
      for (const id of members) result.push(id, ...(attached.get(id) || []));
    }
    rows[g] = result;
    index();
  };

  for (let iter = 0; iter < 3; iter++) {
    for (let g = 0; g < depth; g++) orderRow(g, iter > 0);
  }

  // Координаты: ряд за рядом, дети стараются встать под своими родителями
  const step = nodeW + gapX;
  const x = new Map();
  rows[0].forEach((id, i) => x.set(id, i * step));
  for (let g = 1; g < depth; g++) {
    let cursor = -Infinity;
    let i = 0;
    const row = rows[g];
    while (i < row.length) {
      // Непрерывный блок одной ячейки (братья/сёстры + пристыкованные супруги)
      const key = [...parentsIn(byId.get(row[i]))].sort().join('|');
      let j = i + 1;
      while (j < row.length) {
        const ps = parentsIn(byId.get(row[j]));
        if (ps.length && [...ps].sort().join('|') !== key) break;
        if (!ps.length && !key) break;
        j++;
      }
      const block = row.slice(i, j);
      const width = block.length * step - gapX;
      const ps = parentsIn(byId.get(row[i]));
      const desired = ps.length ? avg(ps.map((p) => x.get(p) + nodeW / 2)) - width / 2 : cursor;
      const left = Math.max(desired, cursor === -Infinity ? desired : cursor);
      block.forEach((id, k) => x.set(id, left + k * step));
      cursor = left + width + gapX;
      i = j;
    }
  }

  const minX = Math.min(...x.values());
  const nodes = relatives.map((r) => ({ relative: r, x: x.get(r.id) - minX, y: gen.get(r.id) * rowH }));
  const width = Math.max(...nodes.map((n) => n.x)) + nodeW;
  const nodeById = new Map(nodes.map((n) => [n.relative.id, n]));
  const units = [...unitMap.values()].map((u) => ({
    id: u.id,
    parents: u.parents.map((p) => nodeById.get(p)),
    children: u.children.map((c) => nodeById.get(c)),
  }));

  return { nodes, units, width, height: depth * rowH - (rowH - 96), nodeW };
}
