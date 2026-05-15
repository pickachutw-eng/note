import { FIREBASE_CONFIG, FIREBASE_CARDS_PATH } from './config.js';
import { els } from './dom.js';
import { state } from './state.js';

function initGraph() {
      const svg = d3.select('#graphSvg');
      state.svg = svg;
      resizeGraph();

      svg.selectAll('*').remove();
      state.gRoot = svg.append('g');
      const defs = svg.append('defs');
      defs.append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', 'rgba(180, 200, 255, 0.72)');
      state.gLinks = state.gRoot.append('g').attr('class', 'links');
      state.gNodes = state.gRoot.append('g').attr('class', 'nodes');
      state.gArrows = state.gRoot.append('g').attr('class', 'arrows');

      state.zoom = d3.zoom()
        .filter((event) => {
          if (event.type === 'wheel') return true;
          if (event.type === 'mousedown') return event.button === 2;
          return true;
        })
        .scaleExtent([0.02, 4])
        .on('start', (event) => {
          if (event.sourceEvent?.button === 2) {
            svg.classed('pan-ready', false).classed('panning', true);
            showMinimap(true);
          }
        })
        .on('end', (event) => {
          svg.classed('panning', false);
          if (event.sourceEvent?.button === 2 || state.minimap.visible) {
            hideMinimapSoon();
          }
        })
        .on('zoom', (event) => {
          state.gRoot.attr('transform', event.transform);
          updateMinimapViewport();
        });

      svg
        .on('contextmenu', (event) => event.preventDefault())
        .on('mousedown.cursorpan', (event) => {
          hideGraphContextMenu();
          if (event.button === 2) {
            const [mx, my] = d3.pointer(event, svg.node());
            const graphPoint = screenToGraphPoint(mx, my);
            state.rightClickMenu.start = { clientX: event.clientX, clientY: event.clientY };
            state.rightClickMenu.point = graphPoint;
            state.rightClickMenu.moved = false;
            svg.classed('pan-ready', true);
            showMinimap(true);
          }
        })
        .on('mousemove.cursorpan', (event) => {
          const start = state.rightClickMenu.start;
          if (!start) return;
          const dx = event.clientX - start.clientX;
          const dy = event.clientY - start.clientY;
          if (Math.hypot(dx, dy) > 6) state.rightClickMenu.moved = true;
        })
        .on('mouseup.cursorpan', (event) => {
          const start = state.rightClickMenu.start;
          const wasRightButton = event.button === 2 && !!start;
          const shouldOpenMenu = wasRightButton && !state.rightClickMenu.moved;
          svg.classed('pan-ready', false).classed('panning', false);
          hideMinimapSoon();
          if (shouldOpenMenu) {
            event.preventDefault();
            event.stopPropagation();
            showGraphContextMenu(event, state.rightClickMenu.point);
          }
          state.rightClickMenu.start = null;
          state.rightClickMenu.moved = false;
        })
        .on('mouseleave.cursorpan', () => {
          state.rightClickMenu.start = null;
          state.rightClickMenu.moved = false;
          svg.classed('pan-ready', false).classed('panning', false);
          hideMinimapSoon();
        });

      svg.call(state.zoom);
      setupGraphContextMenuNativeListeners();
      document.addEventListener('pointerdown', handleGlobalPointerDownForGraphMenu);
      document.addEventListener('contextmenu', handleGlobalContextMenuForGraphMenu, true);
      document.addEventListener('keydown', handleGlobalKeydownForGraphMenu);
      els.newCardFromMapBtn?.addEventListener('click', async () => {
        const point = state.rightClickMenu.point;
        hideGraphContextMenu();
        if (point) await createCardAtGraphPoint(point);
      });
      window.addEventListener('resize', handleResize);
    }

    function setupGraphContextMenuNativeListeners() {
      const wrap = document.getElementById('graphWrap');
      if (!wrap || wrap.dataset.contextMenuReady === '1') return;
      wrap.dataset.contextMenuReady = '1';

      // 用原生 pointer/contextmenu 事件補強 D3 zoom 的右鍵攔截。
      // 右鍵拖曳仍交給 D3 負責平移；只有位移很小的右鍵單擊才開啟選單。
      wrap.addEventListener('pointerdown', handleGraphRightPointerDown, true);
      wrap.addEventListener('pointermove', handleGraphRightPointerMove, true);
      wrap.addEventListener('pointerup', handleGraphRightPointerUp, true);
      wrap.addEventListener('pointercancel', resetGraphRightClickState, true);
      wrap.addEventListener('contextmenu', handleGraphContextMenuNative, true);
    }

    function getGraphPointFromClient(event) {
      const svgNode = state.svg?.node?.();
      if (!svgNode) return { x: state.width / 2, y: state.height / 2 };
      const rect = svgNode.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return screenToGraphPoint(x, y);
    }

    function handleGraphRightPointerDown(event) {
      if (event.button !== 2) return;
      if (els.graphContextMenu?.contains(event.target)) return;
      hideGraphContextMenu();
      state.rightClickMenu.start = { clientX: event.clientX, clientY: event.clientY };
      state.rightClickMenu.point = getGraphPointFromClient(event);
      state.rightClickMenu.moved = false;
    }

    function handleGraphRightPointerMove(event) {
      const start = state.rightClickMenu.start;
      if (!start) return;
      const dx = event.clientX - start.clientX;
      const dy = event.clientY - start.clientY;
      if (Math.hypot(dx, dy) > 6) state.rightClickMenu.moved = true;
    }

    function handleGraphRightPointerUp(event) {
      if (event.button !== 2 || !state.rightClickMenu.start) return;
      if (!state.rightClickMenu.moved) {
        event.preventDefault();
        // 立即顯示，並讓後續 contextmenu 事件只負責阻止瀏覽器預設選單。
        showGraphContextMenu(event, state.rightClickMenu.point || getGraphPointFromClient(event));
      }
    }

    function handleGraphContextMenuNative(event) {
      event.preventDefault();
      event.stopPropagation();
      if (els.graphContextMenu?.contains(event.target)) return;
      const point = state.rightClickMenu.point || getGraphPointFromClient(event);
      if (!state.rightClickMenu.moved) showGraphContextMenu(event, point);
      resetGraphRightClickState({ keepPoint: true });
    }

    function resetGraphRightClickState(options = {}) {
      state.rightClickMenu.start = null;
      state.rightClickMenu.moved = false;
      if (!options.keepPoint) state.rightClickMenu.point = null;
    }

    function screenToGraphPoint(x, y) {
      const transform = d3.zoomTransform(state.svg.node());
      const [gx, gy] = transform.invert([x, y]);
      return { x: gx, y: gy };
    }

    function showGraphContextMenu(event, graphPoint) {
      if (!els.graphContextMenu || !els.newCardFromMapBtn) return;
      const wrap = document.getElementById('graphWrap');
      const rect = wrap.getBoundingClientRect();
      const menu = els.graphContextMenu;
      menu.classList.remove('hidden');
      menu.setAttribute('aria-hidden', 'false');
      const menuW = menu.offsetWidth || 132;
      const menuH = menu.offsetHeight || 46;
      const left = Math.min(Math.max(event.clientX - rect.left, 8), Math.max(8, rect.width - menuW - 8));
      const top = Math.min(Math.max(event.clientY - rect.top, 8), Math.max(8, rect.height - menuH - 8));
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      state.rightClickMenu.point = graphPoint;
    }

    function hideGraphContextMenu() {
      if (!els.graphContextMenu) return;
      els.graphContextMenu.classList.add('hidden');
      els.graphContextMenu.setAttribute('aria-hidden', 'true');
    }

    function handleGlobalPointerDownForGraphMenu(event) {
      if (!els.graphContextMenu || els.graphContextMenu.classList.contains('hidden')) return;
      if (els.graphContextMenu.contains(event.target)) return;
      hideGraphContextMenu();
    }

    function handleGlobalContextMenuForGraphMenu(event) {
      if (!els.graphContextMenu || els.graphContextMenu.classList.contains('hidden')) return;
      if (els.graphContextMenu.contains(event.target)) return;
      if (document.getElementById('graphWrap')?.contains(event.target)) return;
      hideGraphContextMenu();
    }

    function handleGlobalKeydownForGraphMenu(event) {
      if (event.key === 'Escape') hideGraphContextMenu();
    }

    function handleResize() {
      resizeGraph();
      scheduleDetailContentHeightAdjust();
      if (state.simulation) {
        state.simulation.force('center', d3.forceCenter(state.width / 2, state.height / 2).strength(state.force.centerStrength));
        state.simulation.alpha(0.5).restart();
      }
    }

    function resizeGraph() {
      const wrap = document.getElementById('graphWrap');
      state.width = wrap.clientWidth;
      state.height = wrap.clientHeight;
      state.svg.attr('viewBox', `0 0 ${state.width} ${state.height}`);
    }

    function normalizeTitle(str = '') {
      return str.trim().replace(/\.md$/i, '').replace(/^#\s+/, '').trim();
    }

    
    function normalizeLinkKey(str = '') {
      return normalizeTitle(str).toLowerCase();
    }

function extractFirstMarkdownH1(content) {
      const normalized = String(content || '').replace(/\r\n?/g, '\n');
      if (!normalized.trim()) return '';
      const withoutLeadingYaml = normalized.replace(/^---[\s\S]*?---\s*/m, '');
      const fromWhole = withoutLeadingYaml.match(/^#(?!#)\s+(.+?)\s*#?\s*$/m);
      if (fromWhole) return normalizeTitle(fromWhole[1]);
      const body = getBodyAfterMeta(normalized).trim();
      const fromBody = body.match(/^#(?!#)\s+(.+?)\s*#?\s*$/m);
      if (fromBody) return normalizeTitle(fromBody[1]);
      return '';
    }

    function extractTitle(content, fallbackName) {
      // 地圖節點標題一律以 Markdown 內容中的第一個 H1（# 標題）為準；
      // 不讀取 YAML / Firebase 的 title、name、cardTitle 欄位。
      return extractFirstMarkdownH1(content) || normalizeTitle(fallbackName);
    }

    function extractCardId(content, fallbackId) {
      const fmId = content.match(/^---[\s\S]*?\bid:\s*(.+?)\s*$/m);
      if (fmId) {
        return fmId[1].replace(/^['"]|['"]$/g, '').trim();
      }
      return normalizeTitle(fallbackId);
    }

    function extractTags(content) {
      const frontmatterTags = content.match(/^---[\s\S]*?\btags:\s*([^\n]+)$/m);
      const tags = new Set();
      if (frontmatterTags) {
        frontmatterTags[1]
          .replace(/[\[\]]/g, '')
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
          .forEach(t => tags.add(t.replace(/^#/, '')));
      }
      const inline = content.match(/(^|\s)#([\p{L}0-9_\-\/]+)/gu) || [];
      inline.forEach(m => tags.add(m.trim().replace(/^#/, '')));
      return [...tags];
    }

    function extractInternalLinks(content) {
      // 支援三種格式：
      // 1. [卡片名稱](./卡片名稱.md)
      // 2. [卡片名稱.md]
      // 3. 舊格式 [[卡片名稱]]
      const text = String(content || '');
      const links = [];

      const markdownLinkMatches = [...text.matchAll(/\[([^\[\]\n]+)\]\((.+?\.md(?:#.+?)?)\)/gi)];
      markdownLinkMatches.forEach(m => {
        const href = String(m[2] || '').replace(/\\([()])/g, '$1').split('#')[0].trim();
        const fileName = href.split('/').pop() || '';
        const value = normalizeTitle(decodeURIComponent(fileName));
        if (value) links.push(value);
      });

      const directMdMatches = [...text.matchAll(/\[([^\[\]\n]+?\.md)\]/gi)];
      directMdMatches.forEach(m => {
        const fileName = String(m[1] || '').split('/').pop() || '';
        const value = normalizeTitle(decodeURIComponent(fileName));
        if (value) links.push(value);
      });

      const legacyMatches = [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)];
      legacyMatches.forEach(m => {
        const value = normalizeTitle(m[1]);
        if (value) links.push(value);
      });

      return [...new Set(links.filter(Boolean))];
    }

    function getBodyAfterMeta(content) {
      const normalized = String(content || '').replace(/\r\n?/g, '\n');
      if (normalized.includes('\n---\n')) {
        return normalized.split('\n---\n').slice(1).join('\n---\n').trim();
      }
      if (normalized.includes('\n---')) {
        return normalized.split('\n---').slice(1).join('\n---').trim();
      }
      return normalized.trim();
    }

    function stripLeadingTitleHeading(content, title) {
      const normalized = String(content || '').replace(/\r\n?/g, '\n').trim();
      const escapedTitle = String(title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
      const pattern = new RegExp(`^#\\s*${escapedTitle}\\s*\n+`, 'i');
      return normalized.replace(pattern, '').trim();
    }

    function parseMetaValue(content, key) {
      const normalized = String(content || '').replace(/\r\n?/g, '\n');
      const metaBlock = normalized.includes('\n---')
        ? normalized.split('\n---')[0]
        : normalized;
      const line = metaBlock
        .split('\n')
        .map(line => line.trim())
        .find(line => new RegExp(`^${key}\s*:`).test(line));
      if (!line) return '';
      return line.replace(new RegExp(`^${key}\s*:`), '').trim().replace(/^['"]|['"]$/g, '');
    }

    function stripFrontmatter(content) {
      return content.replace(/^---[\s\S]*?---\n?/, '').trim();
    }


function parseCardType(content) {
  const normalized = String(content || '').replace(/\r\n?/g, '\n');

  // 你的卡片格式不是 YAML frontmatter，而是：
  // 標題
  //
  // type: 資料卡
  // ...
  // ---
  // 正文
  // 所以這裡直接讀取第一個 --- 之前的 metadata 區塊
  const metaBlock = normalized.includes('\n---')
    ? normalized.split('\n---')[0]
    : normalized.split(/\n#{1,6}\s+/).slice(0, 1)[0] || normalized;

  const typeLine = metaBlock
    .split('\n')
    .map(line => line.trim())
    .find(line => /^type\s*:/i.test(line));

  if (!typeLine) return 'concept';

  const raw = typeLine.replace(/^type\s*:/i, '').trim().replace(/^['"]|['"]$/g, '');

  if (raw === '概念卡') return 'concept';
  if (raw === '資料卡') return 'source';
  if (raw === '問題卡') return 'question';
  if (raw === '判斷卡') return 'judgment';

  return 'concept';
}

function getVisibleLinks(links, nodeMap) {
  // 只有問題卡隱藏連線；其他卡片照常顯示由 [[其他卡片]] 建立的連線
  return links.filter(link => {
    const s = nodeMap.get(sourceId(link));
    const t = nodeMap.get(targetId(link));
    return s?.type !== 'question' && t?.type !== 'question';
  });
}

function getAllNeighborCount(node) {
  return (node.neighbors && node.neighbors.size) ? node.neighbors.size : (node.refCount || 0) + (node.citeCount || 0);
}

function getNodeRadiusByType(node) {
  const degree = getAllNeighborCount(node);

  if (node.type === 'judgment') {
    // 用明確級距拉開差異，避免多連線判斷卡仍然看起來差不多大
    if (degree >= 12) return 42;
    if (degree >= 9) return 36;
    if (degree >= 6) return 30;
    if (degree >= 4) return 24;
    if (degree >= 2) return 18;
    return 14;
  }

  switch (node.type) {
    case 'concept':
      return 20 + Math.min(16, degree * 1.4);
    case 'question':
      return 15 + Math.min(12, degree * 1.1);
    case 'source':
      // 資料卡維持較輕的視覺權重，但放大到足以穩定顯示標題。
      if (degree >= 12) return 28;
      if (degree >= 9) return 25;
      if (degree >= 6) return 22;
      if (degree >= 4) return 19;
      if (degree >= 2) return 16;
      return 14;
    default:
      return 12 + Math.min(14, degree * 1.2);
  }
}

function getNodeStrokeWidth(node) {
  if (node.type === 'judgment') return 3.2;
  if (node.type === 'question') return 2.2;
  if (node.type === 'source') return 1;
  return 1.4;
}

function getNodeOpacity(node) {
  if (node.type === 'source') return 0.58;
  return 1;
}

function getNodeSymbolPath(node) {
  const r = getNodeRadiusByType(node);
  if (node.type === 'question') {
    return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
  }
  if (node.type === 'judgment') {
    return `M ${-r} ${-r} L ${r} ${-r} L ${r} ${r} L ${-r} ${r} Z`;
  }
  return null;
}

function applyTypeDynamics(nodes) {
  for (const node of nodes) {
    if (node.type === 'concept') {
      node.vx = Math.max(-4, Math.min(4, (node.vx || 0) * 1.012));
      node.vy = Math.max(-4, Math.min(4, (node.vy || 0) * 1.012));
    }
  }
}

function createConceptRepelForce() {
  let nodes = [];
  function force(alpha) {
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      if (a.type !== 'concept') continue;
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        if (b.type !== 'concept') continue;
        let dx = (b.x || 0) - (a.x || 0);
        let dy = (b.y || 0) - (a.y || 0);
        let dist2 = dx * dx + dy * dy;
        if (!dist2) {
          dx = (Math.random() - 0.5) * 0.01;
          dy = (Math.random() - 0.5) * 0.01;
          dist2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(dist2);
        const target = getNodeRadiusByType(a) + getNodeRadiusByType(b) + 70;
        if (dist < target) {
          const strength = (target - dist) / target * 0.22 * alpha;
          const ux = dx / dist;
          const uy = dy / dist;
          b.vx += ux * strength;
          b.vy += uy * strength;
          a.vx -= ux * strength;
          a.vy -= uy * strength;
        }
      }
    }
  }
  force.initialize = _ => { nodes = _ || []; };
  return force;
}

function parseCards(files) {
  const rawCards = files.map(file => {
    const relPath = file.webkitRelativePath || file.name;
    const folder = relPath.includes('/') ? relPath.split('/').slice(0, -1).join('/') : 'root';
    const title = extractTitle(file.content, file.name);
    const cardId = extractCardId(file.content, file.name);
    const tags = extractTags(file.content);
    const links = extractInternalLinks(file.content);
    const rawContent = file.content;
    const content = getBodyAfterMeta(file.content);
    const type = parseCardType(file.content);
    return {
      id: cardId,
      title,
      folder,
      path: relPath,
      firebaseKey: file.firebaseKey || cardId,
      firebaseOriginal: file.firebaseOriginal || null,
      tags,
      rawContent,
      content,
      type,
      links,
      citeCount: 0,
      refCount: links.length,
      neighbors: new Set(),
      incoming: new Set(),
      outgoing: new Set(),
      pinned: false,
    };
  });

  const aliasToId = new Map();
  rawCards.forEach(card => {
    const aliases = new Set([
      normalizeLinkKey(card.title),
      normalizeLinkKey(card.id),
      normalizeLinkKey(card.path.split('/').pop() || ''),
      normalizeLinkKey((card.path.split('/').pop() || '').replace(/\.md$/i, ''))
    ]);
    aliases.forEach(alias => {
      if (alias && !aliasToId.has(alias)) aliasToId.set(alias, card.id);
    });
  });

  const cardIdSet = new Set(rawCards.map(c => c.id));
  const nodeMap = new Map(rawCards.map(c => [c.id, c]));
  const links = [];

  rawCards.forEach(card => {
    card.links.forEach(targetTitle => {
      const targetId = aliasToId.get(normalizeLinkKey(targetTitle));
      if (!targetId || !cardIdSet.has(targetId) || targetId === card.id) return;
      links.push({ source: card.id, target: targetId, kind: 'internal' });
      nodeMap.get(card.id).neighbors.add(targetId);
      nodeMap.get(card.id).outgoing.add(targetId);
      nodeMap.get(targetId).neighbors.add(card.id);
      nodeMap.get(targetId).incoming.add(card.id);
      nodeMap.get(targetId).citeCount += 1;
    });
  });

  rawCards.forEach(card => {
    card.incoming = Array.from(card.incoming || []);
    card.outgoing = Array.from(card.outgoing || []);
    card.group = computeGroup(card, state.groupMode);
  });

  state.rawCards = rawCards;
  state.nodes = rawCards;
  state.links = dedupeLinks(links);
  state.visibleLinks = getVisibleLinks(state.links, nodeMap);
  state.nodeMap = nodeMap;
  state.selectedNodeId = null;
  state.centerNodeId = null;
  state.localGraphRootId = null;
  state.currentMode = 'global';

  applyFiltersAndRender();
  updateStats();
  if (state.selectedNodeId) renderDetail(state.selectedNodeId);
}

function dedupeLinks(links) {
      const seen = new Set();
      return links.filter(link => {
        const key = `${link.source}=>${link.target}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function computeGroup(node, mode) {
      if (mode === 'folder') return node.folder || 'root';
      if (mode === 'tag') return node.tags[0] || '未標籤';
      return '全部';
    }

    function updateGroups() {
      state.nodes.forEach(node => {
        node.group = computeGroup(node, state.groupMode);
      });
    }

    function updateStats() {
      const groups = new Set(state.nodes.map(n => n.group));
      els.statNodes.textContent = String(state.nodes.length);
      els.statLinks.textContent = String((state.visibleLinks || state.links).length);
      els.statGroups.textContent = String(groups.size);
    }

    function getNodeRadius(node) {
      return getNodeRadiusByType(node);
    }

    function getNodeColor(node) {
      if (state.groupMode === 'none') return 'var(--node)';
      return state.colorScale(node.group);
    }

    function buildLocalGraph(rootId, depth = 1) {
      if (!rootId || !state.nodeMap.has(rootId)) return { nodes: state.nodes, links: state.links };
      const visited = new Set([rootId]);
      const queue = [{ id: rootId, d: 0 }];
      while (queue.length) {
        const { id, d } = queue.shift();
        if (d >= depth) continue;
        const node = state.nodeMap.get(id);
        node.neighbors.forEach(nextId => {
          if (!visited.has(nextId)) {
            visited.add(nextId);
            queue.push({ id: nextId, d: d + 1 });
          }
        });
      }
      const nodes = state.nodes.filter(n => visited.has(n.id));
      const links = state.links.filter(l => visited.has(sourceId(l)) && visited.has(targetId(l)));
      return { nodes, links };
    }

    function sourceId(link) {
      return typeof link.source === 'object' ? link.source.id : link.source;
    }

    function targetId(link) {
      return typeof link.target === 'object' ? link.target.id : link.target;
    }

    function resolveInternalCardTarget(target) {
      const raw = String(target || '').trim();
      if (!raw) return null;
      const clean = raw.replace(/^\[\[|\]\]$/g, '').split('#')[0].trim();
      if (!clean) return null;

      for (const node of state.nodes) {
        if (node.id === clean || node.title === clean) return node;
      }
      return null;
    }

    function buildDisplayLinks(visibleLinks, isLocalMode) {
      const pairMap = new Map();
      const display = [];

      visibleLinks.forEach(link => {
        const s = sourceId(link);
        const t = targetId(link);
        const key = `${s}=>${t}`;
        const reverseKey = `${t}=>${s}`;

        if (pairMap.has(reverseKey)) {
          const prev = pairMap.get(reverseKey);
          prev.mutual = true;
          prev.showArrow = false;
          pairMap.delete(reverseKey);
          return;
        }

        const item = { ...link, mutual: false, showArrow: true, key };
        pairMap.set(key, item);
        display.push(item);
      });

      return display;
    }

    function getLinkEndpoints(d) {
      const sx = Number(d.source.x || 0);
      const sy = Number(d.source.y || 0);
      const tx = Number(d.target.x || 0);
      const ty = Number(d.target.y || 0);
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const sourcePad = getNodeRadius(d.source) + 2;
      const targetPad = getNodeRadius(d.target) + (d.showArrow && !d.mutual ? 2 : 3);
      return {
        x1: sx + ux * sourcePad,
        y1: sy + uy * sourcePad,
        x2: tx - ux * targetPad,
        y2: ty - uy * targetPad,
      };
    }

    function getArrowPoints(d) {
      const tx = Number(d.target.x || 0);
      const ty = Number(d.target.y || 0);
      const sx = Number(d.source.x || 0);
      const sy = Number(d.source.y || 0);
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const px = -uy;
      const py = ux;
      const r = getNodeRadius(d.target);
      const tipX = tx - ux * r;
      const tipY = ty - uy * r;
      const arrowLen = 7;
      const arrowWidth = 4;
      const baseX = tipX - ux * arrowLen;
      const baseY = tipY - uy * arrowLen;
      const leftX = baseX + px * arrowWidth;
      const leftY = baseY + py * arrowWidth;
      const rightX = baseX - px * arrowWidth;
      const rightY = baseY - py * arrowWidth;
      return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
    }

    function applyFiltersAndRender() {
      updateGroups();
      let baseNodes = state.nodes;
      let baseLinks = state.links;

      if (state.currentMode === 'local' && state.localGraphRootId) {
        const depth = Number(els.localDepth.value);
        const local = buildLocalGraph(state.localGraphRootId, depth);
        baseNodes = local.nodes;
        baseLinks = local.links;
      }

      const q = state.searchQuery.trim().toLowerCase();
      let finalNodes = baseNodes;
      let finalLinks = baseLinks;
      let finalVisibleLinks = getVisibleLinks(baseLinks, state.nodeMap);

      if (q && state.filterMode === 'filter') {
        const matchedIds = new Set();
        baseNodes.forEach(node => {
          if (matchesQuery(node, q)) {
            matchedIds.add(node.id);
            node.neighbors.forEach(n => matchedIds.add(n));
          }
        });
        finalNodes = baseNodes.filter(n => matchedIds.has(n.id));
        finalLinks = baseLinks.filter(l => matchedIds.has(sourceId(l)) && matchedIds.has(targetId(l)));
        finalVisibleLinks = getVisibleLinks(finalLinks, state.nodeMap);
      }

      // 保留原始 node 物件，讓全域圖計算出的 x/y 座標可被鄰近網路沿用。
      state.activeNodes = finalNodes;
      state.activeLinks = finalLinks;
      state.activeVisibleLinkKeys = new Set(finalVisibleLinks.map(l => `${sourceId(l)}=>${targetId(l)}`));

      renderGraph();
      if (state.minimap.visible) {
        captureGlobalSnapshot();
        renderMinimapSnapshot();
      }
      updateModeChip();
      updateCenterChip();
    }

    function matchesQuery(node, q) {
      return [node.title, node.content, node.folder, ...(node.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(q);
    }

    function nodeIsHighlighted(node) {
      if (!state.searchQuery.trim()) return true;
      return matchesQuery(node, state.searchQuery.trim().toLowerCase());
    }

    function resolveLinksToActiveNodes(links, activeNodeMap) {
      return links
        .map(link => {
          const s = activeNodeMap.get(sourceId(link));
          const t = activeNodeMap.get(targetId(link));
          if (!s || !t) return null;
          return { ...link, source: s, target: t };
        })
        .filter(Boolean);
    }

    function renderGraph() {
      const nodes = state.activeNodes;
      const links = state.activeLinks;
      const activeNodeMap = new Map(nodes.map(n => [n.id, n]));
      const visibleLinks = getVisibleLinks(links, state.nodeMap)
        .filter(l => activeNodeMap.has(sourceId(l)) && activeNodeMap.has(targetId(l)));
      const resolvedVisibleLinks = resolveLinksToActiveNodes(visibleLinks, activeNodeMap);
      const displayLinks = buildDisplayLinks(resolvedVisibleLinks, state.currentMode === 'local');
      const staticLocalMode = state.currentMode === 'local';

      if (state.simulation) {
        state.simulation.stop();
        state.simulation = null;
      }

      nodes.forEach((node, index) => {
        if (!Number.isFinite(node.x)) node.x = state.width / 2 + (Math.random() - 0.5) * 80 + (index % 7) * 4;
        if (!Number.isFinite(node.y)) node.y = state.height / 2 + (Math.random() - 0.5) * 80 + (index % 5) * 4;
      });

      const linkSel = state.gLinks
        .selectAll('line.link-line')
        .data(displayLinks, d => d.key || `${sourceId(d)}=>${targetId(d)}`)
        .join('line')
        .attr('class', 'link-line')
        .attr('stroke-width', d => d.mutual ? 3.2 : 1.2)
        .attr('marker-end', null);

      const arrowSel = state.gArrows
        .selectAll('polygon.arrowhead-shape')
        .data(displayLinks.filter(d => d.showArrow && !d.mutual), d => d.key || `${sourceId(d)}=>${targetId(d)}`)
        .join('polygon')
        .attr('class', 'arrowhead-shape');

      const nodeSel = state.gNodes
        .selectAll('g.node')
        .data(nodes, d => d.id)
        .join(enter => {
          const g = enter.append('g').attr('class', 'node');
          g.append('path').attr('class', 'node-shape');
          g.append('text').attr('class', 'node-label').attr('dy', 4).attr('text-anchor', 'middle');
          return g;
        });

      nodeSel.call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));

      nodeSel.select('.node-shape')
        .attr('d', d => {
          const custom = getNodeSymbolPath(d);
          if (custom) return custom;
          const r = getNodeRadius(d);
          return `M ${-r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0`;
        })
        .attr('fill', d => {
          if (state.filterMode === 'highlight' && state.searchQuery.trim() && !nodeIsHighlighted(d)) {
            return 'var(--node-dim)';
          }
          return getNodeColor(d);
        })
        .style('opacity', d => getNodeOpacity(d))
        .style('stroke-width', d => getNodeStrokeWidth(d))
        .classed('centered', d => d.id === state.centerNodeId)
        .classed('pinned', d => !!d.pinned)
        .classed('type-concept', d => d.type === 'concept')
        .classed('type-question', d => d.type === 'question')
        .classed('type-source', d => d.type === 'source')
        .classed('type-judgment', d => d.type === 'judgment')
        .on('click', (event, d) => {
          event.stopPropagation();
          selectNode(d.id, false);
        })
        .on('mouseenter', function(event, d) {
          d3.select(this.parentNode).classed('hovering', true);
          showTooltip(event, d);
        })
        .on('mousemove', function(event, d) {
          d3.select(this.parentNode).classed('hovering', true);
        })
        .on('mouseleave', function() {
          d3.select(this.parentNode).classed('hovering', false);
          hideTooltip();
        });

      state.gLinks.raise();
      state.gArrows.raise();

      nodeSel.select('text')
        .text(d => truncateLabel(d.title, getNodeRadius(d)))
        .attr('class', d => `node-label type-${d.type}`)
        .style('opacity', d => {
          if (d.type === 'source') return 0.82;
          return getNodeRadius(d) >= 11 ? 1 : 0;
        });

      state.svg.on('click', () => {});

      function tickGraph() {
        if (!staticLocalMode) applyTypeDynamics(nodes);
        linkSel
          .attr('x1', d => getLinkEndpoints(d).x1)
          .attr('y1', d => getLinkEndpoints(d).y1)
          .attr('x2', d => getLinkEndpoints(d).x2)
          .attr('y2', d => getLinkEndpoints(d).y2)
          .attr('stroke-opacity', d => {
            if (!state.selectedNodeId) return d.mutual ? 0.95 : 0.85;
            const a = sourceId(d);
            const b = targetId(d);
            return (a === state.selectedNodeId || b === state.selectedNodeId)
              ? (d.mutual ? 1 : 0.9)
              : (d.mutual ? 0.55 : 0.45);
          });

        arrowSel
          .attr('points', d => getArrowPoints(d))
          .attr('opacity', d => {
            if (!state.selectedNodeId) return 0.92;
            const a = sourceId(d);
            const b = targetId(d);
            return (a === state.selectedNodeId || b === state.selectedNodeId) ? 0.98 : 0.55;
          });

        nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
        updateMinimapViewport();
      }

      if (staticLocalMode) {
        tickGraph();
        return;
      }

      const simulationLinks = resolveLinksToActiveNodes(links, activeNodeMap);
      const linkForce = d3.forceLink(simulationLinks)
        .id(d => d.id)
        .distance(state.force.linkDistance)
        .strength(0.32);

      state.simulation = d3.forceSimulation(nodes)
        .velocityDecay(0.24)
        .force('link', linkForce)
        .force('charge', d3.forceManyBody().strength(d => {
          if (d.type === 'concept') return state.force.charge * 1.35;
          if (d.type === 'source') return state.force.charge * 0.55;
          return state.force.charge;
        }))
        .force('center', d3.forceCenter(state.width / 2, state.height / 2).strength(state.force.centerStrength))
        .force('collision', d3.forceCollide().radius(d => {
          const base = getNodeRadius(d);
          const scale = d.type === 'concept' ? state.force.collisionScale * 1.25 : state.force.collisionScale;
          return base * scale;
        }))
        .force('conceptRepel', createConceptRepelForce());

      state.simulation.on('tick', tickGraph);

      for (let i = 0; i < 40; i += 1) state.simulation.tick();
      tickGraph();

      if (nodes.length) {
        state.simulation.alpha(1).restart();
      }
    }



    function captureGlobalSnapshot() {
      const minimapNodeCount = Math.max(1, state.nodes.length);
      const minimapDensityScale = minimapNodeCount > 220 ? 0.72 : minimapNodeCount > 120 ? 0.84 : 1;
      const nodes = state.nodes
        .filter(node => Number.isFinite(node.x) && Number.isFinite(node.y))
        .map(node => ({
          id: node.id,
          x: node.x,
          y: node.y,
          r: Math.max(0.75, Math.min(1.9, getNodeRadius(node) * 0.04 * minimapDensityScale)),
          color: getNodeColor(node),
          opacity: Math.max(0.42, getNodeOpacity(node) * 0.78),
          active: state.activeNodes.some(activeNode => activeNode.id === node.id),
        }));

      const nodeIds = new Set(nodes.map(node => node.id));
      const links = (state.visibleLinks || state.links)
        .map(link => ({ source: sourceId(link), target: targetId(link) }))
        .filter(link => nodeIds.has(link.source) && nodeIds.has(link.target));

      if (!nodes.length) {
        state.minimap.snapshotNodes = [];
        state.minimap.snapshotLinks = [];
        state.minimap.world = null;
        return;
      }

      const xs = nodes.map(node => node.x);
      const ys = nodes.map(node => node.y);
      const pad = 80;
      const minX = Math.min(...xs) - pad;
      const maxX = Math.max(...xs) + pad;
      const minY = Math.min(...ys) - pad;
      const maxY = Math.max(...ys) + pad;

      state.minimap.snapshotNodes = nodes;
      state.minimap.snapshotLinks = links;
      state.minimap.world = {
        minX,
        maxX: maxX === minX ? minX + 1 : maxX,
        minY,
        maxY: maxY === minY ? minY + 1 : maxY,
      };
    }

    function minimapProject(x, y) {
      const world = state.minimap.world;
      const w = 216;
      const h = 134;
      const pad = 10;
      if (!world) return { x: w / 2, y: h / 2 };
      const worldW = world.maxX - world.minX;
      const worldH = world.maxY - world.minY;
      const scale = Math.min((w - pad * 2) / worldW, (h - pad * 2) / worldH);
      const offsetX = (w - worldW * scale) / 2;
      const offsetY = (h - worldH * scale) / 2;
      return {
        x: offsetX + (x - world.minX) * scale,
        y: offsetY + (y - world.minY) * scale,
      };
    }

    function renderMinimapSnapshot() {
      if (!els.minimapSvg || !state.minimap.world) return;
      const svg = d3.select(els.minimapSvg);
      const nodes = state.minimap.snapshotNodes;
      const nodeMap = new Map(nodes.map(node => [node.id, node]));

      svg.selectAll('*').remove();

      svg.append('g')
        .attr('class', 'minimap-links')
        .selectAll('line')
        .data(state.minimap.snapshotLinks)
        .join('line')
        .attr('class', 'minimap-link')
        .attr('x1', d => minimapProject(nodeMap.get(d.source)?.x || 0, nodeMap.get(d.source)?.y || 0).x)
        .attr('y1', d => minimapProject(nodeMap.get(d.source)?.x || 0, nodeMap.get(d.source)?.y || 0).y)
        .attr('x2', d => minimapProject(nodeMap.get(d.target)?.x || 0, nodeMap.get(d.target)?.y || 0).x)
        .attr('y2', d => minimapProject(nodeMap.get(d.target)?.x || 0, nodeMap.get(d.target)?.y || 0).y);

      svg.append('g')
        .attr('class', 'minimap-nodes')
        .selectAll('circle')
        .data(nodes)
        .join('circle')
        .attr('class', d => `minimap-node${d.active ? ' local-visible' : ''}`)
        .attr('cx', d => minimapProject(d.x, d.y).x)
        .attr('cy', d => minimapProject(d.x, d.y).y)
        .attr('r', d => d.r)
        .attr('fill', d => d.color)
        .attr('fill-opacity', d => d.active ? Math.min(0.98, d.opacity + 0.16) : d.opacity);

      svg.append('rect')
        .attr('class', 'minimap-viewport')
        .attr('id', 'minimapViewport');

      updateMinimapViewport();
    }

    function updateMinimapViewport() {
      if (!state.minimap.visible || !els.minimapSvg || !state.minimap.world || !state.svg) return;
      const transform = d3.zoomTransform(state.svg.node());
      const x0 = transform.invertX(0);
      const y0 = transform.invertY(0);
      const x1 = transform.invertX(state.width);
      const y1 = transform.invertY(state.height);
      const p0 = minimapProject(Math.min(x0, x1), Math.min(y0, y1));
      const p1 = minimapProject(Math.max(x0, x1), Math.max(y0, y1));
      const rectX = Math.max(0, Math.min(p0.x, p1.x));
      const rectY = Math.max(0, Math.min(p0.y, p1.y));
      const rectW = Math.max(4, Math.abs(p1.x - p0.x));
      const rectH = Math.max(4, Math.abs(p1.y - p0.y));
      d3.select(els.minimapSvg).select('#minimapViewport')
        .attr('x', rectX)
        .attr('y', rectY)
        .attr('width', Math.min(216 - rectX, rectW))
        .attr('height', Math.min(134 - rectY, rectH));
    }

    function showMinimap(refreshSnapshot = false) {
      if (!els.minimap) return;
      if (state.minimap.hideTimer) {
        clearTimeout(state.minimap.hideTimer);
        state.minimap.hideTimer = null;
      }
      if (refreshSnapshot || !state.minimap.world) {
        captureGlobalSnapshot();
        renderMinimapSnapshot();
      }
      if (!state.minimap.world) return;
      state.minimap.visible = true;
      els.minimap.classList.add('show');
      els.minimap.setAttribute('aria-hidden', 'false');
      updateMinimapViewport();
    }

    function hideMinimapSoon() {
      if (!els.minimap || !state.minimap.visible) return;
      if (state.minimap.hideTimer) clearTimeout(state.minimap.hideTimer);
      state.minimap.hideTimer = setTimeout(() => {
        state.minimap.visible = false;
        els.minimap.classList.remove('show');
        els.minimap.setAttribute('aria-hidden', 'true');
      }, 650);
    }

    function truncateLabel(text, radius) {
      const max = radius > 18 ? 12 : radius > 12 ? 8 : 5;
      return text.length > max ? text.slice(0, max) + '…' : text;
    }

    function dragStarted(event, d) {
      if (state.simulation && !event.active) state.simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event, d) {
      if (state.simulation && !event.active) state.simulation.alphaTarget(0);
      if (!d.pinned) {
        d.fx = null;
        d.fy = null;
      } else {
        d.fx = d.x;
        d.fy = d.y;
      }
      const rawNode = state.nodeMap.get(d.id);
      if (rawNode) {
        rawNode.fx = d.fx;
        rawNode.fy = d.fy;
      }
    }

    function selectNode(nodeId, openModal = false) {
      state.selectedNodeId = nodeId;
      renderDetail(nodeId);
      if (openModal) openCardModal(nodeId);
      focusNode(nodeId);
    }


function bindRenderedCardLinks(root) {
  if (!root) return;
  root.querySelectorAll('.internal-card-link').forEach(el => {
    if (el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    const getMatchedNode = () => {
      const target = el.getAttribute('data-target') || '';
      return resolveInternalCardTarget(target);
    };
    const openLink = () => {
      if (el.closest('[contenteditable="true"]')) return;
      const matched = getMatchedNode();
      if (!matched) return;
      selectNode(matched.id, false);
    };
    const showPreview = (event) => {
      const matched = getMatchedNode();
      if (!matched) return;
      showTooltip(event, matched);
    };
    el.addEventListener('mouseenter', showPreview);
    el.addEventListener('focus', showPreview);
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('blur', hideTooltip);
    el.addEventListener('click', openLink);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLink();
      }
    });
  });
}


let detailHeightAdjustFrame = null;
let detailLayoutResizeObserver = null;
function scheduleDetailContentHeightAdjust() {
  if (detailHeightAdjustFrame) cancelAnimationFrame(detailHeightAdjustFrame);
  detailHeightAdjustFrame = requestAnimationFrame(() => {
    detailHeightAdjustFrame = null;
    adjustDetailContentHeight();
    requestAnimationFrame(adjustDetailContentHeight);
  });
}

function adjustDetailContentHeight() {
  const panel = els.detailPanel;
  if (!panel) return;
  const contentCard = document.getElementById('detailContentCard');
  const preview = document.getElementById('detailContentPreview');
  const input = document.getElementById('detailContentInput');
  if (!contentCard || (!preview && !input)) return;

  let occupied = 0;
  Array.from(panel.children).forEach(child => {
    if (child === contentCard) return;
    const style = window.getComputedStyle(child);
    occupied += child.offsetHeight;
    occupied += parseFloat(style.marginTop) || 0;
    occupied += parseFloat(style.marginBottom) || 0;
  });

  const panelStyle = window.getComputedStyle(panel);
  const verticalPadding = (parseFloat(panelStyle.paddingTop) || 0) + (parseFloat(panelStyle.paddingBottom) || 0);
  const contentStyle = window.getComputedStyle(contentCard);
  const contentMargins = (parseFloat(contentStyle.marginTop) || 0) + (parseFloat(contentStyle.marginBottom) || 0);
  // 放大內容框：保留底部三角形可見，但減少預留空白。
  // 使用負 buffer 等同讓內容框多吃一點垂直空間。
  const buffer = -28;
  const availableByChildren = panel.clientHeight - verticalPadding - occupied - contentMargins - buffer;

  // 右欄寬度拖曳時，按鈕、引用連結與 YAML 控制列可能重新換行；
  // 以實際畫面位置再保守校正一次，避免內容框高度沿用拖曳前的舊布局。
  const panelRect = panel.getBoundingClientRect();
  const cardRect = contentCard.getBoundingClientRect();
  const belowCards = Array.from(panel.children).filter(child => child !== contentCard);
  const belowHeight = belowCards.reduce((sum, child) => {
    const style = window.getComputedStyle(child);
    return sum + child.offsetHeight + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
  }, 0);
  const availableByViewport = panelRect.bottom - cardRect.top - belowHeight - contentMargins - verticalPadding - buffer;

  const target = Math.max(300, Math.floor(Math.min(availableByChildren, availableByViewport)));
  const editorPanel = document.getElementById('detailContentEditorPanel');
  const editorOpen = !!editorPanel?.classList.contains('show');

  if (editorOpen && preview && input) {
    const editorLabel = editorPanel.querySelector('.content-editor-label');
    const editorPanelStyle = window.getComputedStyle(editorPanel);
    const editorPanelExtra =
      (parseFloat(editorPanelStyle.marginTop) || 0) +
      (parseFloat(editorPanelStyle.paddingTop) || 0) +
      (parseFloat(editorPanelStyle.borderTopWidth) || 0) +
      (editorLabel ? editorLabel.offsetHeight + 7 : 0);
    const previewHeight = Math.max(180, Math.floor(target * 0.52));
    const inputHeight = Math.max(180, target - previewHeight - editorPanelExtra);
    preview.style.height = `${previewHeight}px`;
    input.style.height = `${inputHeight}px`;
  } else {
    if (preview) preview.style.height = `${target}px`;
    if (input) input.style.height = `220px`;
  }
}

function editorPlainTextToMarkdown(root){
  if(!root) return '';
  const clone=root.cloneNode(true);
  clone.querySelectorAll('.internal-card-link').forEach(el=>{ const t=el.getAttribute('data-target')||el.textContent.replace(/^\[|\]$/g,''); el.replaceWith(document.createTextNode('[['+t.trim()+']]')); });
  clone.querySelectorAll('table').forEach(table=>{
    const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('th,td')).map(cell =>
        cell.innerText.replace(/\u00a0/g,' ').replace(/\s*\n\s*/g,'<br>').replace(/\|/g,'\\|').trim()
      )
    ).filter(row => row.length);
    if(!rows.length) { table.remove(); return; }
    const width = Math.max(...rows.map(r => r.length));
    const normalized = rows.map(r => Array.from({length: width}, (_, i) => r[i] || ''));
    const header = normalized[0];
    const body = normalized.slice(1);
    const md = [
      '| ' + header.join(' | ') + ' |',
      '| ' + header.map(()=>'---').join(' | ') + ' |',
      ...body.map(row => '| ' + row.join(' | ') + ' |')
    ].join('\n');
    table.replaceWith(document.createTextNode('\n\n' + md + '\n\n'));
  });
  clone.querySelectorAll('h1,h2,h3,h4').forEach(h=>{ const lv=Number(h.tagName.slice(1)); h.prepend(document.createTextNode('#'.repeat(lv)+' ')); h.append(document.createTextNode('\n\n')); });
  clone.querySelectorAll('li').forEach(li=>{ li.prepend(document.createTextNode('- ')); li.append(document.createTextNode('\n')); });
  clone.querySelectorAll('p,div,blockquote').forEach(el=>el.append(document.createTextNode('\n\n')));
  return clone.innerText.replace(/\u00a0/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
function runWysiwygCommand(command,value=null){ document.execCommand(command,false,value); }
function normalizePastedTableRows(rows){
  const cleanRows = rows
    .map(row => row.map(cell => String(cell || '').replace(/\u00a0/g, ' ').replace(/\s+$/g, '').replace(/^\s+/g, '')))
    .filter(row => row.some(cell => cell.trim()));
  if (!cleanRows.length) return [];
  const width = Math.max(...cleanRows.map(row => row.length));
  return cleanRows.map(row => Array.from({length: width}, (_, i) => row[i] || ''));
}
function buildEditableHtmlTable(rows){
  const normalized = normalizePastedTableRows(rows);
  if (!normalized.length) return '';
  const header = normalized[0];
  const body = normalized.slice(1);
  return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${header.map(cell => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p><br></p>`;
}
function extractTableRowsFromHtml(html){
  if (!html || !/<table[\s>]/i.test(html)) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  return Array.from(table.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(cell => cell.innerText || cell.textContent || ''));
}
function extractTableRowsFromPlainText(text){
  const raw = String(text || '').replace(/\r\n?/g, '\n').trimEnd();
  const lines = raw.split('\n').filter(line => line.trim());
  if (lines.length < 2 || !lines.some(line => line.includes('\t'))) return [];
  return lines.map(line => line.split('\t'));
}
function insertHtmlAtCurrentSelection(html){
  if (!html) return;
  document.execCommand('insertHTML', false, html);
}
function renderDetail(nodeId) {
  const node = state.nodeMap.get(nodeId);
  if (!node) {
    els.detailPanel.innerHTML = '<div class="empty">找不到卡片。</div>';
    return;
  }

  const raw = node.rawContent || '';
  const typeKey = node.type || getTypeKeyByLabel(parseMetaValue(raw, 'type'));
  const domainRaw = parseMetaValue(raw, 'domain') || node.folder || '';
  const timeRaw = parseMetaValue(raw, 'noteCreatedAt') || parseMetaValue(raw, 'createdAt') || '';
  const statusRaw = parseMetaValue(raw, 'status') || (node.done ? '已確認' : '待確認');
  const isDone = statusRaw === '已確認' || node.done === true;
  const displayH1Title = extractFirstMarkdownH1(raw) || node.title || node.id;
  const bodyHtml = renderMarkdown(stripLeadingTitleHeading(getBodyAfterMeta(raw), displayH1Title));
  const incomingNodes = (node.incoming || []).map(id => state.nodeMap.get(id)).filter(Boolean);
  const incomingHtml = incomingNodes.length
    ? incomingNodes.map(refNode => `<span role="button" tabindex="0" class="incoming-card-link" data-target-id="${escapeHtml(refNode.id)}">[${escapeHtml(refNode.title)}]</span>`).join(' ')
    : '<div class="empty">目前沒有其他卡片引用。</div>';

  els.detailPanel.innerHTML = `
    <div class="detail-title detail-controls">
      <div class="detail-h1-title">
        <input id="detailH1TitleInput" class="detail-h1-input" value="${escapeAttr(displayH1Title)}" title="修改 H1 標題；失焦或按 Enter 後同步更新地圖與引用連結" spellcheck="false">
      </div>
      <div class="detail-action-controls">
        <label class="detail-switch-label">
          <span>釘選</span>
          <span class="detail-switch">
            <input type="checkbox" id="detailPinSwitch" ${node.pinned ? 'checked' : ''}>
            <span id="detailPinSlider" class="detail-switch-slider" style="background:${node.pinned ? 'rgba(255, 196, 92, 0.9)' : 'rgba(255,255,255,0.18)'};"></span>
            <span id="detailPinKnob" class="detail-switch-knob" style="left:${node.pinned ? '17px' : '3px'};"></span>
          </span>
        </label>
        <label class="detail-switch-label">
          <span>完成</span>
          <span class="detail-switch">
            <input type="checkbox" id="detailDoneSwitch" ${isDone ? 'checked' : ''}>
            <span id="detailDoneSlider" class="detail-switch-slider" style="background:${isDone ? 'rgba(124, 229, 149, 0.85)' : 'rgba(255,255,255,0.18)'};"></span>
            <span id="detailDoneKnob" class="detail-switch-knob" style="left:${isDone ? '17px' : '3px'};"></span>
          </span>
        </label>
      </div>
    </div>

    <div id="detailContentCard" class="detail-card" style="margin-top:0;">
      <div id="detailContentEditorPanel" class="wysiwyg-toolbar floating" aria-hidden="true">
        <button type="button" class="wysiwyg-btn" data-wysiwyg="formatBlock" data-value="P">段落</button>
        <button type="button" class="wysiwyg-btn" data-wysiwyg="formatBlock" data-value="H2">H2</button>
        <button type="button" class="wysiwyg-btn" data-wysiwyg="formatBlock" data-value="H3">H3</button>
        <span class="wysiwyg-divider"></span>
        <button type="button" class="wysiwyg-btn" data-wysiwyg="bold">B</button>
        <button type="button" class="wysiwyg-btn" data-wysiwyg="italic"><i>I</i></button>
        <button type="button" class="wysiwyg-btn" data-wysiwyg="underline"><u>U</u></button>
        <button type="button" class="wysiwyg-btn" data-wysiwyg="insertUnorderedList">• List</button>
      </div>
      <div id="detailContentPreview" class="content-box wysiwyg-editing" style="margin-top:0;" contenteditable="true" spellcheck="false">${bodyHtml || '<p></p>'}</div>
      <textarea id="detailContentInput" style="display:none;">${escapeHtml(stripLeadingTitleHeading(getBodyAfterMeta(raw), displayH1Title))}</textarea>
    </div>

    <div id="incomingLinksCard" class="detail-card" style="margin-top:14px;">
      <h4>被以下卡片引用</h4>
      <div class="detail-content">${incomingHtml}</div>
    </div>

    <div class="yaml-toggle-row">
      <button id="yamlToggleBtn" type="button" class="yaml-toggle-btn collapsed" aria-expanded="false" title="隱藏／顯示欄位">
        <span class="yaml-toggle-arrow">▾</span>
      </button>
    </div>

    <div id="yamlMetaSection" class="meta-grid yaml-meta-grid collapsed" style="grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; margin-top:8px;">
      <div class="meta-box" style="padding:8px 10px;"><div class="k" style="font-size:10px; margin-bottom:2px;">ID</div><input value="${escapeAttr(node.id)}" readonly title="ID 固定，不可修改" style="width:100%; border:0; border-bottom:1px solid rgba(255,255,255,0.08); background:transparent; color:var(--muted); font-size:12px; outline:none; padding:2px 0; cursor:default;"></div>
      <div class="meta-box" style="padding:8px 10px;"><div class="k" style="font-size:10px; margin-bottom:2px;">卡片時間</div><input class="detail-field-input" data-field="noteCreatedAt" value="${escapeAttr(timeRaw)}" placeholder="自行填寫" style="width:100%; border:0; border-bottom:1px solid rgba(255,255,255,0.14); background:transparent; color:var(--text); font-size:12px; outline:none; padding:2px 0;"></div>
      <div class="meta-box" style="padding:8px 10px;"><div class="k" style="font-size:10px; margin-bottom:2px;">領域</div><select class="detail-field-input" data-field="domain" style="width:100%; border:0; border-bottom:1px solid rgba(255,255,255,0.14); background:rgba(20,24,36,0.96); color:var(--text); font-size:12px; outline:none; padding:2px 0;">${buildOptions(DETAIL_DOMAIN_OPTIONS, domainRaw)}</select></div>
      <div class="meta-box" style="padding:8px 10px;"><div class="k" style="font-size:10px; margin-bottom:2px;">類型</div><select class="detail-field-input" data-field="type" style="width:100%; border:0; border-bottom:1px solid rgba(255,255,255,0.14); background:rgba(20,24,36,0.96); color:var(--text); font-size:12px; outline:none; padding:2px 0;">${buildOptions(DETAIL_TYPE_OPTIONS, typeKey)}</select></div>
    </div>

    <div id="detailDangerZone" class="detail-card detail-danger-zone">
      <button id="deleteCardBtn" type="button" class="danger">刪除卡片</button>
    </div>
  `;

  const currentNodeId = node.id;

  const h1TitleInput = document.getElementById('detailH1TitleInput');
  const commitH1Title = () => {
    if (!h1TitleInput) return;
    const nextTitle = String(h1TitleInput.value || '').trim();
    if (!nextTitle) {
      h1TitleInput.value = displayH1Title;
      return;
    }
    if (nextTitle !== displayH1Title) updateDetailField(currentNodeId, 'title', nextTitle);
  };
  h1TitleInput?.addEventListener('blur', commitH1Title);
  h1TitleInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      h1TitleInput.blur();
    }
    if (e.key === 'Escape') {
      h1TitleInput.value = displayH1Title;
      h1TitleInput.blur();
    }
  });

  const contentInput = document.getElementById('detailContentInput');
  const contentPreview = document.getElementById('detailContentPreview');
  const contentEditorPanel = document.getElementById('detailContentEditorPanel');
  const contentEditBtn = document.getElementById('contentEditBtn');
  const contentPreviewBtn = document.getElementById('contentPreviewBtn');

  const syncWysiwygToMarkdown = () => {
    if (!contentInput || !contentPreview) return;
    const markdown = editorPlainTextToMarkdown(contentPreview);
    contentInput.value = markdown;
    updateDetailField(currentNodeId, 'content', markdown);
    scheduleDetailContentHeightAdjust();
  };
  let savedWysiwygRange = null;
  const ensureFloatingToolbarLayer = () => {
    if (!contentEditorPanel) return;
    // 放到 body 最上層，避免被右欄/卡片容器的 overflow、transform、z-index 裁切。
    if (contentEditorPanel.parentElement !== document.body) document.body.appendChild(contentEditorPanel);
  };
  const hideFloatingToolbar = () => {
    if (!contentEditorPanel) return;
    contentEditorPanel.classList.remove('show');
    contentEditorPanel.setAttribute('aria-hidden', 'true');
  };
  const selectionInsidePreview = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !contentPreview) return false;
    const range = sel.getRangeAt(0);
    const anchor = sel.anchorNode;
    const focus = sel.focusNode;
    return (anchor && contentPreview.contains(anchor)) ||
           (focus && contentPreview.contains(focus)) ||
           contentPreview.contains(range.commonAncestorContainer);
  };
  const getSelectionRect = (range) => {
    const rects = Array.from(range.getClientRects()).filter(r => r.width || r.height);
    if (rects.length) return rects[0];
    const rect = range.getBoundingClientRect();
    if (rect && (rect.width || rect.height)) return rect;
    return null;
  };
  const showFloatingToolbarForSelection = () => {
    if (!contentEditorPanel || !contentPreview || contentPreview.getAttribute('contenteditable') !== 'true') return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !selectionInsidePreview()) { hideFloatingToolbar(); return; }
    const range = sel.getRangeAt(0);
    const rect = getSelectionRect(range);
    if (!rect) { hideFloatingToolbar(); return; }
    savedWysiwygRange = range.cloneRange();
    ensureFloatingToolbarLayer();
    contentEditorPanel.classList.add('show');
    contentEditorPanel.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      if (!contentEditorPanel.classList.contains('show')) return;
      const toolbarRect = contentEditorPanel.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - toolbarRect.width - 8);
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - toolbarRect.width / 2), maxLeft);
      let top = rect.top - toolbarRect.height - 10;
      if (top < 8) top = rect.bottom + 10;
      contentEditorPanel.style.left = `${left}px`;
      contentEditorPanel.style.top = `${Math.max(8, top)}px`;
    });
  };
  const restoreWysiwygSelection = () => {
    if (!savedWysiwygRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedWysiwygRange);
  };
  const showContentEditor = () => {
    if (!contentInput || !contentPreview || !contentEditorPanel) return;
    if (contentPreview.querySelector('.empty')) contentPreview.innerHTML = '<p></p>';
    ensureFloatingToolbarLayer();
    hideFloatingToolbar();
    contentPreview.setAttribute('contenteditable','true');
    contentPreview.classList.add('wysiwyg-editing');
    if (contentEditBtn) contentEditBtn.style.display='none';
    if (contentPreviewBtn) contentPreviewBtn.style.display='inline-flex';
    contentPreview.focus(); scheduleDetailContentHeightAdjust();
  };
  const hideContentEditor = () => {
    if (!contentInput || !contentPreview || !contentEditorPanel) return;
    syncWysiwygToMarkdown();
    contentPreview.setAttribute('contenteditable','false');
    contentPreview.classList.remove('wysiwyg-editing');
    hideFloatingToolbar();
    contentPreview.innerHTML = renderMarkdown(contentInput.value) || '<div class=\"empty\">目前沒有卡片內容。</div>';
    bindRenderedCardLinks(contentPreview);
    if (contentEditBtn) contentEditBtn.style.display='inline-flex';
    if (contentPreviewBtn) contentPreviewBtn.style.display='none'; scheduleDetailContentHeightAdjust();
  };
  // 點選卡片後，內容區直接處於可編輯狀態；不再區分「編輯／完成」按鈕。
  if (contentPreview) {
    if (contentPreview.querySelector('.empty')) contentPreview.innerHTML = '<p></p>';
    contentPreview.setAttribute('contenteditable','true');
    contentPreview.classList.add('wysiwyg-editing');
    bindRenderedCardLinks(contentPreview);
    scheduleDetailContentHeightAdjust();
  }
  contentPreview?.addEventListener('input', () => { syncWysiwygToMarkdown(); showFloatingToolbarForSelection(); });
  contentPreview?.addEventListener('blur', () => { syncWysiwygToMarkdown(); hideFloatingToolbar(); });
  contentPreview?.addEventListener('paste', e => {
    if (!contentPreview || contentPreview.getAttribute('contenteditable') !== 'true') return;
    const data = e.clipboardData;
    if (!data) return;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    const rows = extractTableRowsFromHtml(html);
    const tableRows = rows.length ? rows : extractTableRowsFromPlainText(text);
    if (!tableRows.length) return;
    e.preventDefault();
    insertHtmlAtCurrentSelection(buildEditableHtmlTable(tableRows));
    syncWysiwygToMarkdown();
    hideFloatingToolbar();
    setTimeout(updateMentionPopover, 0);
  });
  contentPreview?.addEventListener('mouseup', () => setTimeout(showFloatingToolbarForSelection, 0));
  contentPreview?.addEventListener('pointerup', () => setTimeout(showFloatingToolbarForSelection, 0));
  contentPreview?.addEventListener('touchend', () => setTimeout(showFloatingToolbarForSelection, 80));
  contentPreview?.addEventListener('keyup', () => setTimeout(showFloatingToolbarForSelection, 0));
  contentEditorPanel?.addEventListener('mousedown', e => e.preventDefault());
  contentEditorPanel?.addEventListener('pointerdown', e => e.preventDefault());
  document.addEventListener('selectionchange', () => {
    if (!contentPreview || contentPreview.getAttribute('contenteditable') !== 'true') return;
    setTimeout(showFloatingToolbarForSelection, 0);
  });
  document.addEventListener('mousedown', e => {
    if (!contentEditorPanel || !contentPreview) return;
    if (contentEditorPanel.contains(e.target) || contentPreview.contains(e.target)) return;
    hideFloatingToolbar();
  });
  window.addEventListener('scroll', hideFloatingToolbar, true);
  window.addEventListener('resize', hideFloatingToolbar);
  contentEditorPanel?.querySelectorAll('[data-wysiwyg]').forEach(btn=>btn.addEventListener('click',()=>{restoreWysiwygSelection();contentPreview?.focus();runWysiwygCommand(btn.dataset.wysiwyg,btn.dataset.value||null);syncWysiwygToMarkdown();setTimeout(showFloatingToolbarForSelection,0);}));


  let mentionRange = null;
  let mentionActiveIndex = 0;
  let mentionMatches = [];
  const mentionPopover = document.createElement('div');
  mentionPopover.className = 'card-mention-popover';
  mentionPopover.setAttribute('aria-hidden', 'true');
  document.body.appendChild(mentionPopover);

  const getTextOffsetRange = (root, start, end) => {
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    let count = 0;
    let startSet = false;
    while ((node = walker.nextNode())) {
      const next = count + node.nodeValue.length;
      if (!startSet && start >= count && start <= next) {
        range.setStart(node, start - count);
        startSet = true;
      }
      if (startSet && end >= count && end <= next) {
        range.setEnd(node, end - count);
        return range;
      }
      count = next;
    }
    if (!startSet) range.selectNodeContents(root);
    range.collapse(false);
    return range;
  };

  const getCaretMentionInfo = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !contentPreview || contentPreview.getAttribute('contenteditable') !== 'true') return null;
    const caretRange = sel.getRangeAt(0);
    if (!contentPreview.contains(caretRange.commonAncestorContainer)) return null;
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(contentPreview);
    beforeRange.setEnd(caretRange.endContainer, caretRange.endOffset);
    const beforeText = beforeRange.toString();
    const triggerIndex = beforeText.lastIndexOf('[[');
    if (triggerIndex < 0) return null;
    const query = beforeText.slice(triggerIndex + 2);
    if (/[\r\n\t\[\]]/.test(query) || query.length > 60) return null;
    return { query, triggerIndex, caretIndex: beforeText.length, range: getTextOffsetRange(contentPreview, triggerIndex, beforeText.length) };
  };

  const hideMentionPopover = () => {
    mentionPopover.classList.remove('show');
    mentionPopover.setAttribute('aria-hidden', 'true');
    mentionRange = null;
    mentionMatches = [];
    mentionActiveIndex = 0;
  };

  const positionMentionPopover = (range) => {
    let rect = null;
    const rects = Array.from(range.getClientRects()).filter(r => r.width || r.height);
    if (rects.length) rect = rects[rects.length - 1];
    if (!rect) rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) rect = contentPreview.getBoundingClientRect();
    requestAnimationFrame(() => {
      const popRect = mentionPopover.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - popRect.width - 8);
      const left = Math.min(Math.max(8, rect.left), maxLeft);
      let top = rect.bottom + 8;
      if (top + popRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - popRect.height - 8);
      mentionPopover.style.left = `${left}px`;
      mentionPopover.style.top = `${top}px`;
    });
  };

  const renderMentionPopover = () => {
    const itemsHtml = mentionMatches.length
      ? mentionMatches.map((card, index) => `
        <button type="button" class="card-mention-item ${index === mentionActiveIndex ? 'active' : ''}" data-index="${index}">
          <svg class="card-mention-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>
          <span>${escapeHtml(card.title || card.id)}</span>
        </button>`).join('')
      : '<div class="card-mention-empty">找不到相符卡片</div>';
    mentionPopover.innerHTML = `<div class="card-mention-hint">Cards</div>${itemsHtml}`;
    mentionPopover.querySelectorAll('.card-mention-item').forEach(btn => {
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => selectMentionCard(Number(btn.dataset.index || 0)));
    });
  };

  const updateMentionPopover = () => {
    const info = getCaretMentionInfo();
    if (!info) { hideMentionPopover(); return; }
    const q = info.query.trim().toLowerCase();
    mentionRange = info.range.cloneRange();
    mentionMatches = state.nodes
      .filter(card => card && card.title)
      .filter(card => !q || card.title.toLowerCase().includes(q) || String(card.id || '').toLowerCase().includes(q))
      .slice(0, 8);
    mentionActiveIndex = Math.min(mentionActiveIndex, Math.max(mentionMatches.length - 1, 0));
    renderMentionPopover();
    mentionPopover.classList.add('show');
    mentionPopover.setAttribute('aria-hidden', 'false');
    positionMentionPopover(info.range);
  };

  function selectMentionCard(index = mentionActiveIndex) {
    const card = mentionMatches[index];
    if (!card || !mentionRange || !contentPreview) return;
    const title = (card.title || card.id || '').trim();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(mentionRange);
    mentionRange.deleteContents();
    const link = document.createElement('span');
    link.className = 'internal-card-link';
    link.setAttribute('role', 'button');
    link.setAttribute('tabindex', '0');
    link.setAttribute('data-target', title);
    link.setAttribute('contenteditable', 'false');
    link.textContent = `[${title}]`;
    const space = document.createTextNode('\u00a0');
    mentionRange.insertNode(space);
    mentionRange.insertNode(link);
    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    hideMentionPopover();
    syncWysiwygToMarkdown();
    contentPreview.focus();
  }

  contentPreview?.addEventListener('input', () => setTimeout(updateMentionPopover, 0));
  contentPreview?.addEventListener('keyup', () => setTimeout(updateMentionPopover, 0));
  contentPreview?.addEventListener('keydown', e => {
    if (!mentionPopover.classList.contains('show')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionActiveIndex = Math.min(mentionActiveIndex + 1, Math.max(mentionMatches.length - 1, 0)); renderMentionPopover(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mentionActiveIndex = Math.max(mentionActiveIndex - 1, 0); renderMentionPopover(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { if (mentionMatches.length) { e.preventDefault(); selectMentionCard(); } }
    else if (e.key === 'Escape') { e.preventDefault(); hideMentionPopover(); }
  });
  contentPreview?.addEventListener('blur', () => setTimeout(() => { if (!mentionPopover.matches(':hover')) hideMentionPopover(); }, 150));

  const yamlToggleBtn = document.getElementById('yamlToggleBtn');
  const yamlMetaSection = document.getElementById('yamlMetaSection');
  yamlToggleBtn?.addEventListener('click', () => {
    const collapsed = !yamlMetaSection?.classList.contains('collapsed');
    yamlMetaSection?.classList.toggle('collapsed', collapsed);
    yamlToggleBtn.classList.toggle('collapsed', collapsed);
    yamlToggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    scheduleDetailContentHeightAdjust();
  });

  document.getElementById('detailPinSwitch')?.addEventListener('change', (e) => {
    togglePinNode(node.id);
    const checked = !!state.nodeMap.get(node.id)?.pinned;
    updateDetailField(node.id, 'pinned', checked);
    e.target.checked = checked;
  });

  document.getElementById('detailDoneSwitch')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    const slider = document.getElementById('detailDoneSlider');
    const knob = document.getElementById('detailDoneKnob');
    if (slider) slider.style.background = checked ? 'rgba(124, 229, 149, 0.85)' : 'rgba(255,255,255,0.18)';
    if (knob) knob.style.left = checked ? '17px' : '3px';
    updateDetailField(node.id, 'status', checked ? '已確認' : '待確認');
  });

  els.detailPanel.querySelectorAll('.detail-field-input').forEach(input => {
    const field = input.getAttribute('data-field');
    const handler = () => updateDetailField(currentNodeId, field, input.value);
    input.addEventListener('change', handler);
    input.addEventListener('blur', handler);
    input.addEventListener('input', handler);
  });

  document.getElementById('deleteCardBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '刪除中…';
    await deleteCard(currentNodeId);
    if (document.body.contains(btn)) {
      btn.disabled = false;
      btn.textContent = '刪除卡片';
    }
  });

  bindRenderedCardLinks(els.detailPanel);

  if (detailLayoutResizeObserver) {
    detailLayoutResizeObserver.disconnect();
    detailLayoutResizeObserver = null;
  }
  if ('ResizeObserver' in window) {
    detailLayoutResizeObserver = new ResizeObserver(scheduleDetailContentHeightAdjust);
    ['.detail-controls', '#incomingLinksCard', '.yaml-toggle-row', '#yamlMetaSection', '#detailDangerZone'].forEach(selector => {
      const target = els.detailPanel.querySelector(selector);
      if (target) detailLayoutResizeObserver.observe(target);
    });
  }

  els.detailPanel.querySelectorAll('.incoming-card-link').forEach(el => {
    const getMatchedNode = () => {
      const targetId = el.getAttribute('data-target-id') || '';
      if (!targetId || !state.nodeMap.has(targetId)) return null;
      return state.nodeMap.get(targetId);
    };
    const openLink = () => {
      const matched = getMatchedNode();
      if (!matched) return;
      selectNode(matched.id, false);
    };
    const showPreview = (event) => {
      const matched = getMatchedNode();
      if (!matched) return;
      showTooltip(event, matched);
    };
    el.addEventListener('mouseenter', showPreview);
    el.addEventListener('focus', showPreview);
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('blur', hideTooltip);
    el.addEventListener('click', openLink);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLink();
      }
    });
  });
}

function openCardModal(nodeId) {
      const node = state.nodeMap.get(nodeId);
      if (!node) return;
      selectNode(nodeId, false);
    }

    function setCenterNode(nodeId) {
      state.centerNodeId = nodeId;
      updateCenterChip();
      const node = state.activeNodes.find(n => n.id === nodeId);
      if (node) {
        node.fx = state.width / 2;
        node.fy = state.height / 2;
        node.pinned = true;
      }
      const raw = state.nodeMap.get(nodeId);
      if (raw) {
        raw.pinned = true;
        raw.fx = state.width / 2;
        raw.fy = state.height / 2;
      }
      renderGraph();
      renderDetail(nodeId);
    }

    function togglePinNode(nodeId) {
      const raw = state.nodeMap.get(nodeId);
      if (!raw) return;
      raw.pinned = !raw.pinned;
      if (!raw.pinned) {
        raw.fx = null;
        raw.fy = null;
      }
      const active = state.activeNodes.find(n => n.id === nodeId);
      if (active) {
        active.pinned = raw.pinned;
        if (raw.pinned) {
          active.fx = active.x;
          active.fy = active.y;
        } else {
          active.fx = null;
          active.fy = null;
        }
      }
      renderGraph();
      renderDetail(nodeId);
    }

    function focusNode(nodeId) {
      const node = state.activeNodes.find(n => n.id === nodeId);
      if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
      const t = d3.zoomTransform(state.svg.node());
      const scale = Math.max(0.7, t.k);
      const x = state.width / 2 - node.x * scale;
      const y = state.height / 2 - node.y * scale;
      state.svg.transition().duration(420).call(state.zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    }

    function updateCenterChip() {
      if (!els.centerChip) return;
      els.centerChip.textContent = `區域中心：${state.centerNodeId || '未設定'}`;
    }

    function updateModeChip() {
      const isLocal = state.currentMode === 'local';
      const root = state.localGraphRootId ? state.nodeMap.get(state.localGraphRootId) : null;
      const label = isLocal
        ? `目前：鄰近網路（${root?.title || state.localGraphRootId || '-'}）`
        : '目前：全域圖';
      if (els.modeChipText) {
        els.modeChipText.textContent = label;
      } else if (els.modeChip) {
        els.modeChip.textContent = label;
      }
      if (els.graphModeSwitch) {
        els.graphModeSwitch.checked = isLocal;
      }
    }

    function setGraphMode(mode, rootId = state.selectedNodeId) {
      if (mode === 'local') {
        const nextRootId = rootId || state.selectedNodeId || state.localGraphRootId;
        if (!nextRootId || !state.nodeMap.has(nextRootId)) {
          if (els.graphModeSwitch) els.graphModeSwitch.checked = false;
          return;
        }
        state.currentMode = 'local';
        state.localGraphRootId = nextRootId;
      } else {
        state.currentMode = 'global';
        state.localGraphRootId = null;
      }
      applyFiltersAndRender();
    }

    function getNodePreviewText(node) {
      if (!node) return '';
      const raw = node.rawContent || node.content || '';
      const body = stripLeadingTitleHeading(getBodyAfterMeta(raw), node.title || '');
      return String(body || '')
        .replace(/^---[\s\S]*?---\n?/, '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]\n]+)\]\((.+?)\)/g, '$1')
        .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target)
        .replace(/[#>*_`|~-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
    }

    function showTooltip(event, d) {
      const preview = escapeHtml(getNodePreviewText(d));
      els.tooltip.innerHTML = `
        <strong>${escapeHtml(d.title || '未命名卡片')}</strong><br>
        <div style="margin-top:6px; line-height:1.5;">${preview || '（無內容）'}</div>
      `;
      els.tooltip.classList.add('show');
    }

    function moveTooltip(event) {
      return;
    }

    function hideTooltip() {
      els.tooltip.classList.remove('show');
    }

    function performTopbarSearch() {
      const query = String(els.topbarSearchInput?.value || '').trim();
      if (!query) {
        els.searchModalSummary.textContent = '請先輸入關鍵字。';
        els.searchModalResults.innerHTML = '<div class="empty">請先輸入關鍵字。</div>';
        els.searchModal.classList.add('show');
        return;
      }

      const q = query.toLowerCase();
      const results = (state.nodes || []).filter(node => matchesQuery(node, q));
      results.sort((a, b) => {
        const aTitle = a.title.toLowerCase().includes(q) ? 1 : 0;
        const bTitle = b.title.toLowerCase().includes(q) ? 1 : 0;
        if (aTitle !== bTitle) return bTitle - aTitle;
        return getAllNeighborCount(b) - getAllNeighborCount(a);
      });

      state.searchQuery = query;
      if (els.searchInput) els.searchInput.value = query;
      applyFiltersAndRender();

      els.searchModalSummary.textContent = `「${query}」共找到 ${results.length} 筆結果。`;
      if (!results.length) {
        els.searchModalResults.innerHTML = '<div class="empty">找不到符合內容。</div>';
      } else {
        els.searchModalResults.innerHTML = results.slice(0, 80).map(node => {
          const rawText = stripLeadingTitleHeading(getBodyAfterMeta(node.rawContent || node.content || ''), node.title)
            .replace(/\s+/g, ' ')
            .trim();
          const snippet = escapeHtml(rawText.slice(0, 140) || '（無內容）');
          const typeLabel = escapeHtml(state.typeConfig[node.type]?.label || '卡片');
          return `
            <div class="search-result-item" data-node-id="${escapeHtml(node.id)}">
              <div class="search-result-title">${escapeHtml(node.title)}</div>
              <div class="search-result-meta">${typeLabel} ・ ${escapeHtml(node.folder || 'root')}</div>
              <div class="search-result-snippet">${snippet}${rawText.length > 140 ? '…' : ''}</div>
            </div>
          `;
        }).join('');

        els.searchModalResults.querySelectorAll('[data-node-id]').forEach(el => {
          el.addEventListener('click', () => {
            const nodeId = el.getAttribute('data-node-id');
            if (!nodeId) return;
            selectNode(nodeId, false);
            closeSearchModal();
          });
        });
      }

      els.searchModal.classList.add('show');
    }

    function closeSearchModal() {
      els.searchModal?.classList.remove('show');
    }

    function getTypeLabel(type) {
      return state.typeConfig[type]?.label || type || '—';
    }

    function openCardListModal() {
      const nodes = [...state.nodes].sort((a, b) => {
        const aTitle = String(a.title || '');
        const bTitle = String(b.title || '');
        return aTitle.localeCompare(bTitle, 'zh-Hant');
      });

      els.cardListSummary.textContent = nodes.length
        ? `目前共讀取 ${nodes.length} 張卡片。點擊任一卡片可選取並在右欄顯示。`
        : '尚未讀取卡片。';

      if (!nodes.length) {
        els.cardListResults.innerHTML = '<div class="empty">尚未讀取卡片。請先從設定面板選取 Markdown 資料夾。</div>';
      } else {
        els.cardListResults.innerHTML = `
          <div class="card-list-table-wrap">
            <table class="card-list-table">
              <thead>
                <tr>
                  <th style="width: 28%;">ID</th>
                  <th>標題</th>
                  <th style="width: 18%;">類型</th>
                </tr>
              </thead>
              <tbody>
                ${nodes.map(node => `
                  <tr data-card-id="${escapeHtml(node.id)}">
                    <td class="card-list-id">${escapeHtml(node.id || '—')}</td>
                    <td>${escapeHtml(node.title || '未命名卡片')}</td>
                    <td>${escapeHtml(getTypeLabel(node.type))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

        els.cardListResults.querySelectorAll('[data-card-id]').forEach(row => {
          row.addEventListener('click', () => {
            const nodeId = row.getAttribute('data-card-id');
            if (nodeId && state.nodeMap.has(nodeId)) {
              selectNode(nodeId, false);
              closeCardListModal();
            }
          });
        });
      }

      els.cardListModal.classList.add('show');
    }

    function closeCardListModal() {
      els.cardListModal?.classList.remove('show');
    }


    function getCardTotalLinkCount(node) {
      const outgoingCount = Array.isArray(node.outgoing) ? node.outgoing.length : Number(node.refCount || 0);
      const incomingCount = Array.isArray(node.incoming) ? node.incoming.length : Number(node.citeCount || 0);
      return outgoingCount + incomingCount;
    }

    function openLinkStatsModal() {
      const totalCards = state.nodes.length;
      const linkCounts = state.nodes.map(node => getCardTotalLinkCount(node));
      const denseCards = linkCounts.filter(count => count > 5).length;
      const linkedCards = linkCounts.filter(count => count > 0).length;
      const unlinkedCards = Math.max(0, totalCards - linkedCards);
      const completionRate = totalCards ? linkedCards / totalCards : 0;
      const completionText = `${(completionRate * 100).toFixed(1)}%`;

      els.linkStatsSummary.textContent = totalCards
        ? `目前共讀取 ${totalCards} 張卡片；完成率為 ${completionText}。`
        : '尚未讀取卡片。';

      if (!totalCards) {
        els.linkStatsResults.innerHTML = '<div class="empty">尚未讀取卡片。請先從設定面板選取 Markdown 資料夾。</div>';
      } else {
        els.linkStatsResults.innerHTML = `
          <div class="link-stats-grid">
            <div class="link-stat-box">
              <div class="value">${denseCards}</div>
              <div class="label">密集連結卡片數<br>總連結 &gt; 5</div>
            </div>
            <div class="link-stat-box">
              <div class="value">${linkedCards}</div>
              <div class="label">有連結卡片數<br>至少有 1 個入鏈或出鏈</div>
            </div>
            <div class="link-stat-box">
              <div class="value">${unlinkedCards}</div>
              <div class="label">未連結卡片數<br>沒有入鏈也沒有出鏈</div>
            </div>
            <div class="link-stat-box">
              <div class="value">${completionText}</div>
              <div class="label">完成率<br>有連結卡片數 ÷ 總卡片數</div>
            </div>
          </div>
          <div class="link-stats-note">此處的「總連結」以每張卡片的出鏈數加上被引用數計算；互相引用會計為兩個方向的連結。</div>
        `;
      }

      els.linkStatsModal.classList.add('show');
    }

    function closeLinkStatsModal() {
      els.linkStatsModal?.classList.remove('show');
    }

    function clearAll() {
      state.rawCards = [];
      state.nodes = [];
      state.links = [];
      state.visibleLinks = [];
      state.activeNodes = [];
      state.activeLinks = [];
      state.activeVisibleLinkKeys = new Set();
      state.nodeMap = new Map();
      state.selectedNodeId = null;
      state.centerNodeId = null;
      state.localGraphRootId = null;
      state.currentMode = 'global';
      state.minimap.snapshotNodes = [];
      state.minimap.snapshotLinks = [];
      state.minimap.world = null;
      state.minimap.visible = false;
      if (els.minimap) {
        els.minimap.classList.remove('show');
        els.minimap.setAttribute('aria-hidden', 'true');
      }
      if (els.minimapSvg) d3.select(els.minimapSvg).selectAll('*').remove();
      updateStats();
      updateCenterChip();
      updateModeChip();
      els.detailPanel.innerHTML = '<div class="empty">尚未選取卡片。匯入資料後，點擊圖上的節點即可在右欄查看內容。</div>';
      if (state.simulation) state.simulation.stop();
      state.gLinks.selectAll('*').remove();
      state.gNodes.selectAll('*').remove();
      state.gArrows.selectAll('*').remove();
    }

    async function readFilesFromInput(fileList) {
      try {
        const mdFiles = [...fileList].filter(file => file.name.toLowerCase().endsWith('.md'));
        els.detailPanel.innerHTML = `<div class="empty">正在讀取 ${mdFiles.length} 張 Markdown 卡片……</div>`;
        if (!mdFiles.length) {
          els.detailPanel.innerHTML = '<div class="empty">沒有讀到 .md 卡片檔案。請確認選取的是包含 Markdown 卡片的資料夾。</div>';
          return;
        }
        const results = await Promise.all(mdFiles.map(file => readFileAsText(file).then(content => ({
          name: file.name,
          webkitRelativePath: file.webkitRelativePath || file.name,
          content,
        }))));
        parseCards(results);
        if (!results.length) {
          els.detailPanel.innerHTML = '<div class="empty">沒有可載入的卡片。</div>';
        }
      } catch (error) {
        console.error('讀取卡片失敗：', error);
        els.detailPanel.innerHTML = `<div class="empty">讀取卡片時發生錯誤：${escapeHtml(error?.message || String(error))}</div>`;
        alert(`讀取卡片時發生錯誤：${error?.message || error}`);
      }
    }

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsText(file, 'utf-8');
      });
    }

    function syncLocalDepthInputs(fromRange = true) {
      const value = fromRange ? els.localDepth.value : els.localDepthValue.value;
      els.localDepth.value = value;
      els.localDepthValue.value = value;
    }

    function applyForceSettings() {
      state.force.charge = Number(els.chargeRange.value);
      state.force.linkDistance = Number(els.linkDistanceRange.value);
      state.force.centerStrength = Number(els.centerForceRange.value);
      state.force.collisionScale = Number(els.collisionRange.value);
      applyFiltersAndRender();
    }

    function resetForceSettings() {
      state.force = { charge: -180, linkDistance: 90, centerStrength: 0.08, collisionScale: 1.6 };
      els.chargeRange.value = state.force.charge;
      els.linkDistanceRange.value = state.force.linkDistance;
      els.centerForceRange.value = state.force.centerStrength;
      els.collisionRange.value = state.force.collisionScale;
      applyFiltersAndRender();
    }

    let markdownItRenderer = null;

    function getMarkdownItRenderer() {
      if (markdownItRenderer) return markdownItRenderer;
      if (typeof window === 'undefined' || typeof window.markdownit !== 'function') return null;

      const md = window.markdownit({
        html: false,
        linkify: true,
        breaks: true,
        typographer: false
      });
      md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table class="md-table">';
      md.renderer.rules.table_close = () => '</table></div>';
      markdownItRenderer = md;
      return markdownItRenderer;
    }

    function renderMarkdown(content = '') {
      const normalized = String(content || '').replace(/\r\n?/g, '\n');
      const md = getMarkdownItRenderer();
      if (md) {
        try {
          return enhanceRenderedMarkdownLinks(md.render(normalized));
        } catch (error) {
          console.warn('markdown-it 渲染失敗，改用內建簡易渲染器：', error);
        }
      }
      return renderMarkdownFallback(normalized);
    }

    function getMarkdownCardTargetFromHref(href = '') {
      const cleanHref = String(href || '').replace(/\\([()])/g, '$1').split('#')[0].trim();
      if (!cleanHref || !/\.md$/i.test(cleanHref)) return '';
      const fileName = cleanHref.split('/').pop() || '';
      if (!fileName) return '';
      try {
        return normalizeTitle(decodeURIComponent(fileName));
      } catch (_) {
        return normalizeTitle(fileName);
      }
    }

    function buildInternalCardLinkElement(target, label = target) {
      const span = document.createElement('span');
      span.setAttribute('role', 'button');
      span.setAttribute('tabindex', '0');
      span.className = 'internal-card-link';
      span.dataset.target = target;
      span.textContent = `[${normalizeTitle(String(label || target))}]`;
      return span;
    }

    function replaceWikiLinksInTextNode(textNode) {
      const text = textNode.nodeValue || '';
      const wikiLinkPattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
      if (!wikiLinkPattern.test(text)) return;
      wikiLinkPattern.lastIndex = 0;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match;
      while ((match = wikiLinkPattern.exec(text))) {
        if (match.index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
        const target = normalizeTitle(String(match[1] || '').trim());
        if (target) fragment.append(buildInternalCardLinkElement(target, match[2] || target));
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
      textNode.replaceWith(fragment);
    }

    function enhanceRenderedMarkdownLinks(html = '') {
      if (typeof document === 'undefined') return html;
      const template = document.createElement('template');
      template.innerHTML = html;

      template.content.querySelectorAll('a[href]').forEach(anchor => {
        const target = getMarkdownCardTargetFromHref(anchor.getAttribute('href') || '');
        if (target) {
          anchor.replaceWith(buildInternalCardLinkElement(target, anchor.textContent || target));
          return;
        }
        anchor.classList.add('external-link');
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
      });

      const linkedTextNodes = [];
      const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!/\[\[[^\]]+\]\]/.test(node.nodeValue || '')) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (parent?.closest('a, code, pre, .internal-card-link')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) linkedTextNodes.push(walker.currentNode);
      linkedTextNodes.forEach(replaceWikiLinksInTextNode);

      return template.innerHTML;
    }

    function renderMarkdownFallback(content = '') {
      const normalized = String(content || '').replace(/\r\n?/g, '\n');
      const lines = normalized.split('\n');
      const blocks = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) {
          i += 1;
          continue;
        }

        if (/^\s*---\s*$/.test(line)) {
          blocks.push('<hr class="md-hr">');
          i += 1;
          continue;
        }

        if (/^```/.test(line.trim())) {
          const lang = line.trim().slice(3).trim();
          const codeLines = [];
          i += 1;
          while (i < lines.length && !/^```/.test(lines[i].trim())) {
            codeLines.push(lines[i]);
            i += 1;
          }
          if (i < lines.length) i += 1;
          blocks.push(`<pre><code class="lang-${escapeAttr(lang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
          continue;
        }

        if (isMarkdownTable(lines, i)) {
          const tableLines = [];
          tableLines.push(lines[i], lines[i + 1]);
          i += 2;
          while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
            tableLines.push(lines[i]);
            i += 1;
          }
          blocks.push(renderMarkdownTable(tableLines));
          continue;
        }

        const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
          i += 1;
          continue;
        }

        if (/^\s*[-*]\s+/.test(line)) {
          const items = [];
          while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
            i += 1;
          }
          blocks.push(`<ul>${items.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
          continue;
        }

        if (/^\s*\d+\.\s+/.test(line)) {
          const items = [];
          while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
            i += 1;
          }
          blocks.push(`<ol>${items.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ol>`);
          continue;
        }

        if (/^>\s?/.test(line)) {
          const quote = [];
          while (i < lines.length && /^>\s?/.test(lines[i])) {
            quote.push(lines[i].replace(/^>\s?/, ''));
            i += 1;
          }
          blocks.push(`<blockquote>${quote.map(q => renderInlineMarkdown(q)).join('<br>')}</blockquote>`);
          continue;
        }

        const para = [];
        while (
          i < lines.length &&
          lines[i].trim() &&
          !/^(#{1,4})\s+/.test(lines[i]) &&
          !/^\s*[-*]\s+/.test(lines[i]) &&
          !/^\s*\d+\.\s+/.test(lines[i]) &&
          !/^>\s?/.test(lines[i]) &&
          !/^```/.test(lines[i].trim()) &&
          !isMarkdownTable(lines, i)
        ) {
          para.push(lines[i]);
          i += 1;
        }
        blocks.push(`<p>${renderInlineMarkdown(para.join('\n'))}</p>`);
      }

      return blocks.join('');
    }

    function isMarkdownTable(lines, index) {
      if (index + 1 >= lines.length) return false;
      const header = lines[index];
      const separator = lines[index + 1];
      return /^\s*\|.*\|\s*$/.test(header) && /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*$/.test(separator);
    }

    function renderMarkdownTable(tableLines) {
      const rows = tableLines.map(parseMarkdownTableRow);
      const headers = rows[0] || [];
      const bodyRows = rows.slice(2);
      return `
        <div class="md-table-wrap">
          <table class="md-table">
            <thead><tr>${headers.map(cell => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr></thead>
            <tbody>
              ${bodyRows.map(row => `<tr>${row.map(cell => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function parseMarkdownTableRow(line) {
      return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());
    }

    function renderInlineMarkdown(text = '') {
      let out = escapeHtml(String(text));
      out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      out = out.replace(/\[([^\[\]\n]+)\]\((.+?\.md(?:#.+?)?)\)/gi, (_, label, href) => {
        const cleanHref = String(href || '').replace(/\\([()])/g, '$1').split('#')[0].trim();
        const fileName = cleanHref.split('/').pop() || '';
        const target = normalizeTitle(decodeURIComponent(fileName));
        const cleanLabel = normalizeTitle(String(label || target));
        return `<span role="button" tabindex="0" class="internal-card-link" data-target="${escapeHtml(target)}">[${escapeHtml(cleanLabel)}]</span>`;
      });
      out = out.replace(/\[([^\[\]\n]+?\.md)\](?!\()/gi, (_, fileLabel) => {
        const fileName = String(fileLabel || '').split('/').pop() || '';
        const target = normalizeTitle(decodeURIComponent(fileName));
        const cleanLabel = normalizeTitle(fileName);
        return `<span role="button" tabindex="0" class="internal-card-link" data-target="${escapeHtml(target)}">[${escapeHtml(cleanLabel)}]</span>`;
      });
      out = out.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
        const label = alias || target;
        const cleanLabel = normalizeTitle(String(label || target));
        return `<span role="button" tabindex="0" class="internal-card-link" data-target="${escapeHtml(target)}">[${escapeHtml(cleanLabel)}]</span>`;
      });
      return out;
    }

    function hasFirebaseConfig(config = {}) {
      return Boolean(config.databaseURL && config.apiKey && config.projectId);
    }

    function getFirebaseDatabase() {
      if (!window.firebase) {
        throw new Error('Firebase SDK 尚未載入。請確認網路連線，或改用本機伺服器開啟此 HTML。');
      }
      if (!hasFirebaseConfig(FIREBASE_CONFIG)) {
        throw new Error('尚未填入 Firebase 設定。請在 HTML 內的 FIREBASE_CONFIG 填入 apiKey、databaseURL、projectId 等資訊。');
      }
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      return firebase.database();
    }

    function pickFirstValue(obj, keys, fallback = '') {
      for (const key of keys) {
        if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
          return obj[key];
        }
      }
      return fallback;
    }


    const DETAIL_TYPE_OPTIONS = [
      { value: 'concept', label: '概念卡' },
      { value: 'question', label: '問題卡' },
      { value: 'source', label: '資料卡' },
      { value: 'judgment', label: '判斷卡' },
    ];
    const DETAIL_DOMAIN_OPTIONS = ['自我', '理論', '宇宙', '未來', '事件'];
    const firebaseSaveTimers = new Map();

    function escapeFirebaseKey(key = '') {
      return String(key || '').trim().replace(/[.#$\/[\]]/g, '_') || makeTimestampId();
    }

    function makeTimestampId(date = new Date()) {
      const pad = n => String(n).padStart(2, '0');
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    }

    function makeUniqueTimestampId(date = new Date()) {
      let cursor = new Date(date);
      let id = makeTimestampId(cursor);
      while (state.nodeMap.has(id)) {
        cursor = new Date(cursor.getTime() + 1000);
        id = makeTimestampId(cursor);
      }
      return id;
    }

    async function createCardAtGraphPoint(point) {
      const id = makeUniqueTimestampId();
      const title = '未命名卡片';
      const type = 'concept';
      const rawContent = '---\n'
        + 'id: ' + id + '\n'
        + 'type: ' + getTypeLabelByKey(type) + '\n'
        + 'domain: \n'
        + 'status: 待確認\n'
        + 'noteCreatedAt: \n'
        + 'createdAt: \n'
        + '---\n'
        + '# ' + title + '\n\n';
      const node = {
        id,
        title,
        folder: '',
        path: title + '.md',
        firebaseKey: escapeFirebaseKey(id),
        firebaseOriginal: null,
        tags: [],
        rawContent,
        content: getBodyAfterMeta(rawContent),
        type,
        links: [],
        citeCount: 0,
        refCount: 0,
        neighbors: new Set(),
        incoming: [],
        outgoing: [],
        pinned: false,
        x: Number.isFinite(point?.x) ? point.x : state.width / 2,
        y: Number.isFinite(point?.y) ? point.y : state.height / 2,
      };
      node.group = computeGroup(node, state.groupMode);

      state.rawCards.push(node);
      state.nodes.push(node);
      state.nodeMap.set(node.id, node);
      state.selectedNodeId = node.id;
      state.centerNodeId = node.id;
      state.currentMode = 'global';
      state.localGraphRootId = null;
      if (els.graphModeSwitch) els.graphModeSwitch.checked = false;

      rebuildLinkState();
      updateGroups();
      applyFiltersAndRender();
      updateStats();
      updateCenterChip();
      renderDetail(node.id);
      focusNode(node.id);

      try {
        const db = getFirebaseDatabase();
        await db.ref(FIREBASE_CARDS_PATH + '/' + node.firebaseKey).set(buildFirebasePayload(node));
      } catch (error) {
        console.error('新增卡片儲存至 Firebase 失敗：', error);
        alert('卡片已在目前畫面建立，但儲存至 Firebase 時發生錯誤：' + (error?.message || error));
      }
    }

    function getTypeLabelByKey(typeKey = '') {
      return state.typeConfig[typeKey]?.label || DETAIL_TYPE_OPTIONS.find(item => item.value === typeKey)?.label || typeKey || '概念卡';
    }

    function getTypeKeyByLabel(label = '') {
      const raw = String(label || '').trim();
      const found = DETAIL_TYPE_OPTIONS.find(item => item.value === raw || item.label === raw);
      return found?.value || 'concept';
    }

    function buildOptions(options, currentValue) {
      const values = new Set(options.map(option => typeof option === 'string' ? option : option.value));
      const normalizedOptions = [...options];
      if (currentValue && !values.has(currentValue)) normalizedOptions.unshift(currentValue);
      return normalizedOptions.map(option => {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? option : option.label;
        return `<option value="${escapeAttr(value)}" ${value === currentValue ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      }).join('');
    }

    function setMetaValue(content, key, value) {
      const normalized = String(content || '').replace(/\r\n?/g, '\n');
      const safeValue = String(value ?? '').trim();
      const parts = normalized.includes('\n---') ? normalized.split('\n---') : [normalized, ''];
      let metaBlock = parts[0] || '';
      const rest = parts.length > 1 ? parts.slice(1).join('\n---') : '';
      const linePattern = new RegExp(`^${key}\\s*:.*$`, 'im');
      if (linePattern.test(metaBlock)) {
        metaBlock = metaBlock.replace(linePattern, `${key}: ${safeValue}`);
      } else {
        metaBlock = `${metaBlock.trim()}\n${key}: ${safeValue}`.trim();
      }
      return rest ? `${metaBlock}\n---${rest}` : `${metaBlock}\n---\n`;
    }

    function setLeadingTitle(content, title) {
      const normalized = String(content || '').replace(/\r\n?/g, '\n');
      const safeTitle = String(title || '').trim() || '未命名卡片';
      if (/^#\s+.+$/m.test(normalized)) {
        return normalized.replace(/^#\s+.+$/m, `# ${safeTitle}`);
      }
      if (normalized.includes('\n---\n')) {
        const [meta, ...bodyParts] = normalized.split('\n---\n');
        return `${meta}\n---\n# ${safeTitle}\n\n${bodyParts.join('\n---\n').replace(/^\s+/, '')}`;
      }
      return `# ${safeTitle}\n\n${normalized}`;
    }

    function setBodyContent(content, title, body) {
      const normalized = String(content || '').replace(/\r\n?/g, '\n');
      const safeTitle = String(title || '').trim() || '未命名卡片';
      const safeBody = String(body ?? '').replace(/\r\n?/g, '\n').trim();
      const nextBody = `# ${safeTitle}\n\n${safeBody}`.trimEnd();

      if (normalized.includes('\n---\n')) {
        const [meta] = normalized.split('\n---\n');
        return `${meta}\n---\n${nextBody}`;
      }
      if (normalized.includes('\n---')) {
        const [meta] = normalized.split('\n---');
        return `${meta}\n---\n${nextBody}`;
      }
      return nextBody;
    }

    function rebuildLinkState() {
      const aliasToId = new Map();
      state.nodes.forEach(card => {
        const aliases = new Set([
          normalizeLinkKey(card.title),
          normalizeLinkKey(card.id),
          normalizeLinkKey((card.path || '').split('/').pop() || ''),
          normalizeLinkKey(((card.path || '').split('/').pop() || '').replace(/\.md$/i, ''))
        ]);
        aliases.forEach(alias => {
          if (alias && !aliasToId.has(alias)) aliasToId.set(alias, card.id);
        });
        card.neighbors = new Set();
        card.incoming = [];
        card.outgoing = [];
        card.citeCount = 0;
      });

      const cardIdSet = new Set(state.nodes.map(card => card.id));
      const links = [];
      state.nodes.forEach(card => {
        (card.links || []).forEach(targetTitle => {
          const targetId = aliasToId.get(normalizeLinkKey(targetTitle));
          if (!targetId || !cardIdSet.has(targetId) || targetId === card.id) return;
          links.push({ source: card.id, target: targetId, kind: 'internal' });
          card.neighbors.add(targetId);
          card.outgoing.push(targetId);
          const target = state.nodeMap.get(targetId);
          if (target) {
            if (!(target.neighbors instanceof Set)) target.neighbors = new Set(target.neighbors || []);
            target.neighbors.add(card.id);
            target.incoming = Array.isArray(target.incoming) ? target.incoming : [];
            target.incoming.push(card.id);
            target.citeCount = (target.citeCount || 0) + 1;
          }
        });
      });
      state.links = dedupeLinks(links);
      state.visibleLinks = getVisibleLinks(state.links, state.nodeMap);
    }

    function getStableAngleFromId(id = '') {
      const text = String(id || '');
      let hash = 0;
      for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      const degrees = Math.abs(hash % 360);
      return degrees * Math.PI / 180;
    }

    function recalcNodePositionAfterNewLinks(node, previousOutgoingIds = []) {
      if (!node || node.pinned) return false;
      const beforeSet = new Set((previousOutgoingIds || []).map(String));
      const currentOutgoing = Array.isArray(node.outgoing) ? node.outgoing.map(String) : [];
      const addedOutgoing = currentOutgoing.filter(id => id && !beforeSet.has(id));
      if (!addedOutgoing.length) return false;

      const neighborIds = [...new Set([
        ...currentOutgoing,
        ...(Array.isArray(node.incoming) ? node.incoming.map(String) : []),
      ])].filter(id => id && id !== node.id);

      const neighborNodes = neighborIds
        .map(id => state.nodeMap.get(id))
        .filter(n => n && Number.isFinite(n.x) && Number.isFinite(n.y));
      if (!neighborNodes.length) return false;

      const cx = neighborNodes.reduce((sum, n) => sum + n.x, 0) / neighborNodes.length;
      const cy = neighborNodes.reduce((sum, n) => sum + n.y, 0) / neighborNodes.length;
      const angle = getStableAngleFromId(node.id + ':' + addedOutgoing.join('|'));
      const radius = Math.max(72, Math.min(150, state.force.linkDistance * 0.72));

      node.x = cx + Math.cos(angle) * radius;
      node.y = cy + Math.sin(angle) * radius;
      node.vx = 0;
      node.vy = 0;
      node.fx = null;
      node.fy = null;
      return true;
    }

    function buildFirebasePayload(node) {
      const raw = node.rawContent || '';
      const h1Title = extractTitle(raw, node.id);
      node.title = h1Title;
      return {
        id: node.id,
        title: h1Title,
        type: getTypeLabelByKey(node.type),
        typeKey: node.type || 'concept',
        domain: parseMetaValue(raw, 'domain') || node.folder || '',
        noteCreatedAt: parseMetaValue(raw, 'noteCreatedAt') || parseMetaValue(raw, 'createdAt') || '',
        createdAt: parseMetaValue(raw, 'noteCreatedAt') || parseMetaValue(raw, 'createdAt') || '',
        status: parseMetaValue(raw, 'status') || (node.done ? '已確認' : '待確認'),
        rawContent: raw,
        content: stripLeadingTitleHeading(getBodyAfterMeta(raw), h1Title || ''),
        pinned: !!node.pinned,
        updatedAt: new Date().toISOString(),
      };
    }

    function scheduleFirebaseCardSave(node, delay = 420) {
      if (!node) return;
      const key = escapeFirebaseKey(node.firebaseKey || node.id);
      node.firebaseKey = key;
      if (firebaseSaveTimers.has(key)) clearTimeout(firebaseSaveTimers.get(key));
      const timer = setTimeout(async () => {
        firebaseSaveTimers.delete(key);
        try {
          const db = getFirebaseDatabase();
          await db.ref(`${FIREBASE_CARDS_PATH}/${key}`).update(buildFirebasePayload(node));
        } catch (error) {
          console.error('Firebase 即時儲存失敗：', error);
        }
      }, delay);
      firebaseSaveTimers.set(key, timer);
    }

    function renameNodeId(node, nextId) {
      const oldId = node.id;
      const cleanId = String(nextId || '').trim();
      if (!cleanId || cleanId === oldId) return oldId;
      if (state.nodeMap.has(cleanId)) {
        alert('已有同 ID 卡片，請改用其他 ID。');
        return oldId;
      }
      state.nodeMap.delete(oldId);
      node.id = cleanId;
      node.firebaseKey = escapeFirebaseKey(node.firebaseKey || oldId);
      state.nodeMap.set(cleanId, node);
      state.selectedNodeId = cleanId;
      state.centerNodeId = state.centerNodeId === oldId ? cleanId : state.centerNodeId;
      state.localGraphRootId = state.localGraphRootId === oldId ? cleanId : state.localGraphRootId;
      state.links.forEach(link => {
        if (sourceId(link) === oldId) link.source = cleanId;
        if (targetId(link) === oldId) link.target = cleanId;
      });
      state.nodes.forEach(card => {
        card.incoming = (card.incoming || []).map(id => id === oldId ? cleanId : id);
        card.outgoing = (card.outgoing || []).map(id => id === oldId ? cleanId : id);
        if (card.neighbors instanceof Set && card.neighbors.has(oldId)) {
          card.neighbors.delete(oldId);
          card.neighbors.add(cleanId);
        }
      });
      return cleanId;
    }

    function escapeRegExp(value = '') {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function replaceCardTitleReferences(content, oldTitle, newTitle) {
      let text = String(content || '').replace(/\r\n?/g, '\n');
      const oldName = normalizeTitle(oldTitle);
      const nextName = normalizeTitle(newTitle);
      if (!oldName || !nextName || oldName === nextName) return text;
      const oldEsc = escapeRegExp(oldName);
      const encodedOld = encodeURIComponent(oldName);
      const encodedOldEsc = escapeRegExp(encodedOld);
      const mdOld = oldName + '.md';
      const mdNew = nextName + '.md';
      const mdOldEsc = escapeRegExp(mdOld);

      text = text.replace(new RegExp('\\[\\[' + oldEsc + '(#[^\\]|]+)?(?:\\|[^\\]]+)?\\]\\]', 'g'), (_, anchor = '') => '[[' + nextName + (anchor || '') + ']]');

      text = text.replace(/\[([^\]\n]+)\]\(([^)]+?\.md(?:#[^)]+)?)\)/gi, (match, label, href) => {
        const cleanHref = String(href || '').replace(/\\([()])/g, '$1');
        const [pathPart, hashPart = ''] = cleanHref.split('#');
        const parts = pathPart.split('/');
        const fileName = decodeURIComponent(parts.pop() || '');
        if (normalizeTitle(fileName) !== oldName && normalizeTitle(fileName.replace(/\.md$/i, '')) !== oldName) return match;
        parts.push(encodeURIComponent(mdNew));
        const nextHref = parts.join('/') + (hashPart ? '#' + hashPart : '');
        return '[' + nextName + '](' + nextHref + ')';
      });

      text = text.replace(new RegExp('\\[' + mdOldEsc + '\\]', 'gi'), '[' + mdNew + ']');
      if (encodedOld && encodedOld !== oldName) {
        text = text.replace(new RegExp(encodedOldEsc + '\\.md', 'g'), encodeURIComponent(nextName) + '.md');
      }
      return text;
    }

    function renameCardTitleAndReferences(node, nextTitle) {
      if (!node) return false;
      const oldTitle = extractFirstMarkdownH1(node.rawContent || '') || node.title || node.id;
      const cleanNextTitle = normalizeTitle(nextTitle) || '未命名卡片';
      if (normalizeTitle(oldTitle) === cleanNextTitle) return false;

      node.title = cleanNextTitle;
      node.path = node.path ? node.path.replace(/[^/\\]+\.md$/i, cleanNextTitle + '.md') : cleanNextTitle + '.md';
      node.rawContent = setLeadingTitle(node.rawContent || '', cleanNextTitle);
      node.content = getBodyAfterMeta(node.rawContent || '');

      state.nodes.forEach(card => {
        if (!card || card.id === node.id) return;
        const before = card.rawContent || '';
        const after = replaceCardTitleReferences(before, oldTitle, cleanNextTitle);
        if (after !== before) {
          card.rawContent = after;
          card.content = getBodyAfterMeta(after);
          card.links = extractInternalLinks(after);
          card.refCount = card.links.length;
          card.group = computeGroup(card, state.groupMode);
          scheduleFirebaseCardSave(card, 120);
        }
      });

      node.links = extractInternalLinks(node.rawContent || '');
      node.refCount = node.links.length;
      rebuildLinkState();
      return true;
    }
    function updateDetailField(nodeId, field, value) {
      let node = state.nodeMap.get(nodeId);
      if (!node) return;
      const rawValue = String(value ?? '').trim();
      let shouldRerenderDetail = false;
      let shouldReapplyGraph = false;
      if (field === 'id') {
        return;
      } else if (field === 'title') {
        if (!rawValue) return;
        const changed = renameCardTitleAndReferences(node, rawValue);
        shouldRerenderDetail = changed;
        shouldReapplyGraph = changed;
      } else if (field === 'type') {
        node.type = rawValue || 'concept';
        node.rawContent = setMetaValue(node.rawContent || '', 'type', getTypeLabelByKey(node.type));
      } else if (field === 'domain') {
        node.folder = rawValue || node.folder || 'root';
        node.rawContent = setMetaValue(node.rawContent || '', 'domain', rawValue);
      } else if (field === 'content') {
        const previousOutgoingIds = Array.isArray(node.outgoing) ? [...node.outgoing] : [];
        node.rawContent = setBodyContent(node.rawContent || '', node.title, value);
        node.title = extractTitle(node.rawContent || '', node.id) || node.title || '未命名卡片';
        node.links = extractInternalLinks(node.rawContent || '');
        node.refCount = node.links.length;
        rebuildLinkState();
        recalcNodePositionAfterNewLinks(node, previousOutgoingIds);
        // 內容新增/移除 [[卡片連結]] 後，必須重新套用目前模式與篩選，
        // 讓 state.activeLinks / activeVisibleLinkKeys 同步更新，連線才會立即出現在地圖上。
        shouldReapplyGraph = true;
      } else if (field === 'noteCreatedAt') {
        node.rawContent = setMetaValue(node.rawContent || '', 'noteCreatedAt', rawValue);
        node.rawContent = setMetaValue(node.rawContent || '', 'createdAt', rawValue);
      } else if (field === 'status') {
        node.done = rawValue === '已確認';
        node.rawContent = setMetaValue(node.rawContent || '', 'status', rawValue);
      } else if (field === 'pinned') {
        node.pinned = !!value;
      }
      node.content = getBodyAfterMeta(node.rawContent || '');
      node.group = computeGroup(node, state.groupMode);
      state.visibleLinks = getVisibleLinks(state.links, state.nodeMap);
      updateGroups();
      if (shouldReapplyGraph) {
        applyFiltersAndRender();
      } else {
        renderGraph();
      }
      updateStats();
      scheduleFirebaseCardSave(node);
      if (shouldRerenderDetail && state.selectedNodeId === node.id) renderDetail(node.id);
    }

    async function deleteCard(nodeId) {
      const node = state.nodeMap.get(nodeId);
      if (!node) return;
      const confirmed = confirm(`確定要刪除「${node.title || node.id}」嗎？這個動作會從 Firebase 卡片庫移除，且無法復原。`);
      if (!confirmed) return;

      const key = escapeFirebaseKey(node.firebaseKey || node.id);
      if (firebaseSaveTimers.has(key)) {
        clearTimeout(firebaseSaveTimers.get(key));
        firebaseSaveTimers.delete(key);
      }

      try {
        const db = getFirebaseDatabase();
        await db.ref(`${FIREBASE_CARDS_PATH}/${key}`).remove();
      } catch (error) {
        console.error('刪除 Firebase 卡片失敗：', error);
        alert(`刪除卡片時發生錯誤：${error?.message || error}`);
        return;
      }

      state.nodes = state.nodes.filter(card => card.id !== node.id);
      state.rawCards = state.rawCards.filter(card => card.id !== node.id);
      state.nodeMap.delete(node.id);
      state.links = state.links.filter(link => sourceId(link) !== node.id && targetId(link) !== node.id);
      state.visibleLinks = getVisibleLinks(state.links, state.nodeMap);

      if (state.selectedNodeId === node.id) state.selectedNodeId = null;
      if (state.centerNodeId === node.id) state.centerNodeId = null;
      if (state.localGraphRootId === node.id) {
        state.localGraphRootId = null;
        state.currentMode = 'global';
      }

      rebuildLinkState();
      updateGroups();
      applyFiltersAndRender();
      updateStats();
      updateCenterChip();
      hideTooltip();
      els.detailPanel.innerHTML = '<div class="empty">卡片已刪除。</div>';
      alert('卡片已刪除。');
    }

    function normalizeCardTypeForMarkdown(type = '') {
      const raw = String(type || '').trim();
      const map = {
        concept: '概念卡',
        source: '資料卡',
        question: '問題卡',
        judgment: '判斷卡',
        '概念卡': '概念卡',
        '資料卡': '資料卡',
        '問題卡': '問題卡',
        '判斷卡': '判斷卡',
      };
      return map[raw] || raw || '概念卡';
    }

    function normalizeFirebaseDataToList(data) {
      if (!data) return [];
      if (Array.isArray(data)) {
        return data.filter(Boolean).map((value, index) => ({ key: String(index), value }));
      }
      if (data.cards && typeof data.cards === 'object') {
        return normalizeFirebaseDataToList(data.cards);
      }
      return Object.entries(data).map(([key, value]) => ({ key, value }));
    }

    function buildMarkdownFromFirebaseCard(card, key) {
      const value = (card && typeof card === 'object') ? card : { content: String(card || '') };
      const id = String(pickFirstValue(value, ['id', 'cardId', '_id'], key)).trim() || key;
      const type = normalizeCardTypeForMarkdown(pickFirstValue(value, ['type', 'cardType'], '概念卡'));
      const domain = String(pickFirstValue(value, ['domain', '領域', 'field', 'category', 'folder'], 'firebase')).trim() || 'firebase';
      const status = String(pickFirstValue(value, ['status', 'state', '確認狀態'], '')).trim();
      const createdAt = String(pickFirstValue(value, ['noteCreatedAt', 'createdAt', 'createdDate', 'date', '生成日期', '筆記生成日期'], '')).trim();
      const raw = String(pickFirstValue(value, ['rawContent', 'markdown', 'md'], '') || '').replace(/\r\n?/g, '\n');
      const body = String(pickFirstValue(value, ['content', 'body', 'text', '正文'], '') || '').replace(/\r\n?/g, '\n');
      const fallbackTitle = normalizeTitle(id) || '未命名卡片';
      const firebaseTitle = normalizeTitle(String(pickFirstValue(value, ['title', 'name', 'cardTitle'], '') || ''));
      const makeMeta = () => '---\n' + 'id: ' + id + '\n' + 'type: ' + type + '\n' + 'domain: ' + domain + '\n' + 'status: ' + status + '\n' + 'noteCreatedAt: ' + createdAt + '\n' + 'createdAt: ' + createdAt + '\n' + '---\n';
      const hasH1 = text => !!extractFirstMarkdownH1(text);
      const hasFrontmatter = text => /^---[\s\S]*?---\n?/m.test(String(text || ''));
      const rawH1 = extractFirstMarkdownH1(raw);
      const bodyH1 = extractFirstMarkdownH1(body);

      // 標題判定原則：優先採用 Markdown 本文自己的 H1。
      // 若 rawContent 的 H1 看起來只是舊 title 欄位產生的殘留，而 content/body 有另一個 H1，改採 content/body。
      if (bodyH1 && (!rawH1 || (firebaseTitle && rawH1 === firebaseTitle && bodyH1 !== rawH1))) {
        const meta = hasFrontmatter(raw) ? (raw.match(/^---[\s\S]*?---\n?/m)?.[0] || makeMeta()) : makeMeta();
        return meta + body.trim();
      }

      if (raw.trim()) {
        if (hasH1(raw) && hasFrontmatter(raw)) return raw.trim();
        if (hasH1(raw)) return makeMeta() + raw.trim();
        return makeMeta() + '# ' + fallbackTitle + '\n\n' + raw.trim();
      }

      if (bodyH1) return makeMeta() + body.trim();
      return makeMeta() + '# ' + fallbackTitle + '\n\n' + body.trim();
    }

    function normalizeFirebaseCards(data) {
      return normalizeFirebaseDataToList(data).map(({ key, value }) => {
        const card = (value && typeof value === 'object') ? value : { content: String(value || '') };
        const domain = String(pickFirstValue(card, ['domain', '領域', 'field', 'category', 'folder'], 'firebase')).trim() || 'firebase';
        const content = buildMarkdownFromFirebaseCard(card, key);
        const displayTitle = extractTitle(content, String(pickFirstValue(card, ['id', 'cardId', '_id'], key)).trim() || key);
        return {
          name: `${displayTitle}.md`,
          webkitRelativePath: `${domain}/${displayTitle}.md`,
          content,
          firebaseKey: key,
          firebaseOriginal: card,
        };
      });
    }

    async function loadFirebaseCards() {
      const btn = els.loadDemoBtn;
      const oldText = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = '讀取 Firebase 中…';
        els.detailPanel.innerHTML = '<div class="empty">正在讀取 Firebase Realtime Database 卡片庫……</div>';

        const db = getFirebaseDatabase();
        const snapshot = await db.ref(FIREBASE_CARDS_PATH).once('value');
        const data = snapshot.val();
        const files = normalizeFirebaseCards(data);

        if (!files.length) {
          clearAll();
          els.detailPanel.innerHTML = `<div class="empty">Firebase 路徑 /${escapeHtml(FIREBASE_CARDS_PATH)} 沒有讀到卡片資料。</div>`;
          return;
        }

        parseCards(files);
        els.detailPanel.innerHTML = `<div class="empty">已從 Firebase Realtime Database 載入 ${files.length} 張卡片。點擊圖上的節點即可在右欄查看內容。</div>`;
        openCardListModal();
      } catch (error) {
        console.error('讀取 Firebase 卡片庫失敗：', error);
        const message = error?.message || String(error);
        els.detailPanel.innerHTML = `<div class="empty">讀取 Firebase 卡片庫時發生錯誤：${escapeHtml(message)}</div>`;
        alert(`讀取 Firebase 卡片庫時發生錯誤：${message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    }

    function escapeHtml(str = '') {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeAttr(str = '') {
      return escapeHtml(str);
    }


    function clampDetailWidth(width) {
      const appWidth = els.app?.clientWidth || window.innerWidth;
      const minWidth = 280;
      const maxWidth = Math.max(minWidth, Math.min(720, appWidth - 240));
      return Math.max(minWidth, Math.min(maxWidth, width));
    }

    function setDetailWidth(width) {
      const safeWidth = clampDetailWidth(width);
      els.app?.style.setProperty('--detail-width', `${safeWidth}px`);
      try {
        localStorage.setItem('cardMapDetailWidth', String(Math.round(safeWidth)));
      } catch (err) {}
      handleResize();
      scheduleDetailContentHeightAdjust();
    }

    function restoreDetailWidth() {
      if (window.innerWidth <= 1024) return;
      let saved = null;
      try {
        saved = Number(localStorage.getItem('cardMapDetailWidth'));
      } catch (err) {}
      if (saved && Number.isFinite(saved)) {
        setDetailWidth(saved);
      }
    }

    function initColumnResizer() {
      const resizer = els.columnResizer;
      if (!resizer || !els.app) return;

      let dragging = false;

      const onMove = (clientX) => {
        const rect = els.app.getBoundingClientRect();
        const nextWidth = rect.right - clientX;
        setDetailWidth(nextWidth);
      };

      const stopDrag = () => {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', stopDrag);
      };

      const handleMouseMove = (event) => {
        if (!dragging) return;
        onMove(event.clientX);
      };

      resizer.addEventListener('mousedown', (event) => {
        if (window.innerWidth <= 1024) return;
        dragging = true;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', stopDrag);
        event.preventDefault();
      });

      window.addEventListener('resize', () => {
        if (window.innerWidth <= 1024) return;
        const current = parseFloat(getComputedStyle(els.app).getPropertyValue('--detail-width'));
        if (Number.isFinite(current)) setDetailWidth(current);
        scheduleDetailContentHeightAdjust();
      });
    }

    function openSidebar() {
      document.body.classList.add('sidebar-open');
    }

    function closeSidebar() {
      document.body.classList.remove('sidebar-open');
    }

    function toggleSidebar() {
      document.body.classList.toggle('sidebar-open');
    }

    function bindEvents() {
      els.folderInput.addEventListener('change', async (e) => {
        if (!e.target.files?.length) return;
        await readFilesFromInput(e.target.files);
        e.target.value = '';
      });

      els.openSettingsBtn.addEventListener('click', toggleSidebar);
      els.closeSettingsBtn.addEventListener('click', closeSidebar);
      els.sidebarBackdrop.addEventListener('click', closeSidebar);
      els.topbarSearchBtn.addEventListener('click', performTopbarSearch);
      els.closeSearchModalBtn.addEventListener('click', closeSearchModal);
      els.cardListBtn.addEventListener('click', openCardListModal);
      els.closeCardListModalBtn.addEventListener('click', closeCardListModal);
      els.cardListModal.addEventListener('click', (e) => {
        if (e.target === els.cardListModal) closeCardListModal();
      });
      els.linkStatsBtn.addEventListener('click', openLinkStatsModal);
      els.closeLinkStatsModalBtn.addEventListener('click', closeLinkStatsModal);
      els.linkStatsModal.addEventListener('click', (e) => {
        if (e.target === els.linkStatsModal) closeLinkStatsModal();
      });
      els.searchModal.addEventListener('click', (e) => {
        if (e.target === els.searchModal) closeSearchModal();
      });
      els.topbarSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performTopbarSearch();
      });

      els.graphModeSwitch?.addEventListener('change', (e) => {
        setGraphMode(e.target.checked ? 'local' : 'global', state.selectedNodeId);
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeSidebar();
          closeSearchModal();
          closeCardListModal();
        }
      });

      els.loadDemoBtn.addEventListener('click', loadFirebaseCards);
      els.clearBtn.addEventListener('click', clearAll);

      els.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value || '';
        applyFiltersAndRender();
      });

      els.filterMode.addEventListener('change', (e) => {
        state.filterMode = e.target.value;
        applyFiltersAndRender();
      });

      els.groupMode.addEventListener('change', (e) => {
        state.groupMode = e.target.value;
        applyFiltersAndRender();
        updateStats();
        if (state.selectedNodeId) renderDetail(state.selectedNodeId);
      });

      els.localDepth.addEventListener('input', () => {
        syncLocalDepthInputs(true);
        if (state.currentMode === 'local') applyFiltersAndRender();
      });
      els.localDepthValue.addEventListener('input', () => {
        syncLocalDepthInputs(false);
        if (state.currentMode === 'local') applyFiltersAndRender();
      });

      els.focusLocalBtn?.addEventListener('click', () => {
        setGraphMode('local', state.selectedNodeId);
      });

      els.showAllBtn?.addEventListener('click', () => {
        setGraphMode('global');
      });

      els.applyForceBtn.addEventListener('click', applyForceSettings);
      els.resetForceBtn.addEventListener('click', resetForceSettings);

    }

    initGraph();
    bindEvents();
    initColumnResizer();
    restoreDetailWidth();
    updateCenterChip();
    updateModeChip();
