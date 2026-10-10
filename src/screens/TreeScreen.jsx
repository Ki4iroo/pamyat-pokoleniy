import { useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { layoutTree } from '../lib/tree';
import { haptic } from '../lib/telegram';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { TreeIcon } from '../components/Icons';

const NODE_H = 96; // высота карточки узла, см. .tree-node в CSS
const PAD = 16;

export default function TreeScreen() {
  const { relatives, t } = useStore();
  const navigate = useNavigate();
  const scrollRef = useRef(null);

  const { nodes, edges, width, height, nodeW } = useMemo(() => layoutTree(relatives), [relatives]);
  const hasLinks = edges.length > 0;

  // Широкое древо открываем по центру
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [width]);

  if (!relatives.length) {
    return (
      <>
        <Header title={t('tree')} />
        <EmptyState icon={<TreeIcon />} text={t('noRelatives')} />
      </>
    );
  }

  return (
    <>
      <Header title={t('tree')} />
      {!hasLinks && <p className="muted center tree-hint">{t('treeHint')}</p>}

      <div className="tree-scroll" ref={scrollRef}>
        <div className="tree-canvas" style={{ width: width + PAD * 2, height: height + PAD * 2 }}>
          <svg className="tree-lines" width={width + PAD * 2} height={height + PAD * 2}>
            {edges.map(({ id, from, to }) => {
              const x1 = from.x + nodeW / 2 + PAD;
              const y1 = from.y + NODE_H + PAD;
              const x2 = to.x + nodeW / 2 + PAD;
              const y2 = to.y + PAD;
              const midY = (y1 + y2) / 2;
              return <path key={id} d={`M${x1},${y1} V${midY} H${x2} V${y2}`} />;
            })}
          </svg>

          {nodes.map(({ relative: r, x, y }) => (
            <button
              key={r.id}
              className="tree-node"
              style={{ left: x + PAD, top: y + PAD, width: nodeW, height: NODE_H }}
              onClick={() => { haptic('light'); navigate(`/relative/${r.id}`); }}
            >
              <Avatar name={r.name} photo={r.photo} size={44} />
              <span className="tree-node__name">{r.name.split(' ')[0]}</span>
              {r.relation && <span className="tree-node__rel">{r.relation}</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
