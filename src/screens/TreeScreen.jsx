import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { layoutTree } from '../lib/tree';
import { haptic } from '../lib/telegram';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { MinusIcon, PlusIcon, TreeIcon } from '../components/Icons';

const NODE_W = 104;
const NODE_H = 124; // высота карточки узла, см. .tree-node в CSS
const PAD = 20;
const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.25];

const year = (iso) => (iso ? new Date(iso).getFullYear() : null);

function lifeYears(r) {
  const b = year(r.birthDate);
  const d = year(r.deathDate);
  if (b && d) return `${b}–${d}`;
  if (b) return String(b);
  if (d) return `† ${d}`;
  return '';
}

export default function TreeScreen() {
  const { relatives, t } = useStore();
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const [zoomIndex, setZoomIndex] = useState(ZOOM_STEPS.indexOf(1));
  const zoom = ZOOM_STEPS[zoomIndex];

  const { nodes, units, width, height } = useMemo(
    () => layoutTree(relatives, { nodeW: NODE_W, gapX: 16, rowH: NODE_H + 52 }),
    [relatives],
  );
  const hasLinks = units.length > 0;
  const canvasW = width + PAD * 2;
  const canvasH = height - 96 + NODE_H + PAD * 2; // layoutTree считает высоту для узла 96px

  // При открытии и смене масштаба держим древо по центру
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [width, zoom]);

  if (!relatives.length) {
    return (
      <>
        <Header title={t('tree')} />
        <EmptyState icon={<TreeIcon />} text={t('noRelatives')} />
      </>
    );
  }

  const changeZoom = (delta) => {
    const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex + delta));
    if (next !== zoomIndex) { haptic('light'); setZoomIndex(next); }
  };

  return (
    <>
      <Header title={t('tree')} />
      {!hasLinks && <p className="muted center tree-hint">{t('treeHint')}</p>}

      <div className="tree-scroll" ref={scrollRef}>
        {/* Внешний блок задаёт реальный размер для прокрутки, внутренний масштабируется */}
        <div className="tree-sizer" style={{ width: canvasW * zoom, height: canvasH * zoom }}>
          <div className="tree-canvas" style={{ width: canvasW, height: canvasH, transform: `scale(${zoom})` }}>
            <svg className="tree-lines" width={canvasW} height={canvasH}>
              {units.map((u) => <UnitLines key={u.id} unit={u} />)}
            </svg>

            {nodes.map(({ relative: r, x, y }) => (
              <button
                key={r.id}
                className={'tree-node' + (r.deathDate ? ' tree-node--past' : '')}
                style={{ left: x + PAD, top: y + PAD, width: NODE_W, height: NODE_H }}
                onClick={() => { haptic('light'); navigate(`/relative/${r.id}`); }}
              >
                <span className={'tree-node__photo' + (r.photo ? ' tree-node__photo--has' : '')}>
                  <Avatar name={r.name} photo={r.photo} size={60} />
                </span>
                <span className="tree-node__name">{r.name.split(' ')[0]}</span>
                <span className="tree-node__rel">{lifeYears(r) || r.relation || ' '}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tree-zoom">
        <button className="icon-btn" onClick={() => changeZoom(-1)} disabled={zoomIndex === 0} aria-label={t('zoomOut')}>
          <MinusIcon />
        </button>
        <span className="tree-zoom__value">{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" onClick={() => changeZoom(1)} disabled={zoomIndex === ZOOM_STEPS.length - 1} aria-label={t('zoomIn')}>
          <PlusIcon />
        </button>
      </div>
    </>
  );
}

const cx = (n) => n.x + NODE_W / 2 + PAD;

// Линии семейной ячейки: перемычка между родителями, от её середины — шина к детям
function UnitLines({ unit }) {
  const parentBottom = Math.max(...unit.parents.map((p) => p.y)) + NODE_H + PAD;
  const childTop = Math.min(...unit.children.map((c) => c.y)) + PAD;
  const gap = childTop - parentBottom;
  const coupleY = parentBottom + gap * 0.3;
  const busY = parentBottom + gap * 0.65;
  const anchor = unit.parents.reduce((s, p) => s + cx(p), 0) / unit.parents.length;
  const xs = [anchor, ...unit.children.map(cx)];

  const d = [
    ...unit.parents.map((p) => `M${cx(p)},${p.y + NODE_H + PAD} V${coupleY}`),
    unit.parents.length > 1 && `M${Math.min(...unit.parents.map(cx))},${coupleY} H${Math.max(...unit.parents.map(cx))}`,
    `M${anchor},${coupleY} V${busY}`,
    `M${Math.min(...xs)},${busY} H${Math.max(...xs)}`,
    ...unit.children.map((c) => `M${cx(c)},${busY} V${c.y + PAD}`),
  ].filter(Boolean).join(' ');

  return <path d={d} />;
}
