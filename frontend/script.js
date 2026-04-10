'use strict';

/* ── Storage Keys ──────────────────────────────────────────────────────── */
const LS_RAW = 'carddb_raw';
const LS_PROCESSED = 'carddb_processed';

/* ── Storage helpers ───────────────────────────────────────────────────── */
function storageGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
}
function storageSave(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

/* ── State ────────────────────────────────────────────────────────────── */
let allCards = [];
let rawCards = [];
let activeRawId = null;
let activeEditedId = null;

/* ── DOM refs ──────────────────────────────────────────────────────────── */
const tabBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');

const rawCardList = document.getElementById('rawCardList');
const editedCardList = document.getElementById('editedCardList');
const rawUploadInput = document.getElementById('rawUploadInput');
const newCardBtn = document.getElementById('newCardBtn');

const editForm = document.getElementById('editForm');
const editPanelTitle = document.getElementById('editPanelTitle');
const sourceCardBadge = document.getElementById('sourceCardBadge');
const sourceCardLabel = document.getElementById('sourceCardLabel');
const cardId = document.getElementById('cardId');
const cardSourceId = document.getElementById('cardSourceId');
const cardTitle = document.getElementById('cardTitle');
const cardType = document.getElementById('cardType');
const cardRelated = document.getElementById('cardRelated');
const cardTags = document.getElementById('cardTags');
const cardImage = document.getElementById('cardImage');
const cardContent = document.getElementById('cardContent');
const imageInput = document.getElementById('imageInput');
const imageUploadBtn = document.getElementById('imageUploadBtn');
const imageFilename = document.getElementById('imageFilename');
const imagePreview = document.getElementById('imagePreview');
const clearFormBtn = document.getElementById('clearFormBtn');
const formMsg = document.getElementById('formMsg');

const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
const resetFilterBtn = document.getElementById('resetFilterBtn');
const cardsGrid = document.getElementById('cardsGrid');
const cardCount = document.getElementById('cardCount');
const editPanel = document.querySelector('.edit-panel');

/* ── Tab Navigation ────────────────────────────────────────────────────── */
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'map') refreshMapTab();
  });
});

/* ── Init ──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadBothLists();
});

/* ── ID Generation ─────────────────────────────────────────────────────── */
function generateTimeId() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}${mo}${d}${h}${mi}${s}`;
}

/* ── Load Both Lists ───────────────────────────────────────────────────── */
function loadBothLists() {
  loadRawCards();
  loadEditedCards();
}

/* ── Raw Cards (localStorage) ──────────────────────────────────────────── */
function loadRawCards() {
  const processed = storageGet(LS_PROCESSED);
  const editedIds = new Set(processed.map(c => c.id));
  rawCards = storageGet(LS_RAW).filter(c => !editedIds.has(c.id));
  renderRawList();
}

function renderRawList() {
  if (rawCards.length === 0) {
    rawCardList.innerHTML = '<li class="empty-hint">尚無原始卡片，請上傳 MD 檔</li>';
    return;
  }
  rawCardList.innerHTML = rawCards.map(card => `
    <li class="card-list-item${activeRawId === card.id ? ' active' : ''}" data-id="${esc(card.id)}">
      <div class="item-title">${esc(card.title)}</div>
      <div class="item-filename">${esc(card.filename)}</div>
    </li>
  `).join('');
  rawCardList.querySelectorAll('.card-list-item').forEach(li => {
    li.addEventListener('click', () => selectRawCard(li.dataset.id));
  });
}

function selectRawCard(id) {
  activeRawId = id;
  activeEditedId = null;
  renderRawList();
  renderEditedList();
  const card = rawCards.find(c => c.id === id);
  if (!card) return;

  cardId.value = id;
  cardSourceId.value = id;
  cardTitle.value = card.title;

  // Extract content from raw markdown (try to get the body after any headers)
  const content = card.content || '';
  const contentMatch = content.match(/##\s*(?:內容|Content)[^\n]*\n([\s\S]*?)(?=##|$)/i);
  cardContent.value = contentMatch ? contentMatch[1].trim() : content.replace(/^#[^\n]*\n/, '').trim();
  cardType.value = '';
  cardRelated.value = '';
  cardTags.value = '';
  cardImage.value = '';
  imageFilename.textContent = '未選擇';
  imagePreview.hidden = true;
  editPanelTitle.textContent = '編輯卡片';
  sourceCardBadge.hidden = false;
  sourceCardLabel.textContent = card.title + ' (' + card.filename + ')';
  hideMsg();
  editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Edited Cards (localStorage) ──────────────────────────────────────── */
function loadEditedCards() {
  allCards = storageGet(LS_PROCESSED);
  renderEditedList();
}

function renderEditedList() {
  if (allCards.length === 0) {
    editedCardList.innerHTML = '<li class="empty-hint">尚無已編輯卡片</li>';
    return;
  }
  editedCardList.innerHTML = allCards.map(card => `
    <li class="card-list-item${activeEditedId === card.id ? ' active' : ''}" data-id="${esc(card.id)}">
      <div class="item-title">${esc(card.title)}</div>
      <div class="item-filename">${esc(card.type || '未分類')}${card.sourceId ? ` · 來自 ${esc(card.sourceId)}` : ''}</div>
    </li>
  `).join('');
  editedCardList.querySelectorAll('.card-list-item').forEach(li => {
    li.addEventListener('click', () => selectEditedCard(li.dataset.id));
  });
}

function selectEditedCard(id) {
  activeEditedId = id;
  activeRawId = null;
  renderRawList();
  renderEditedList();
  const card = allCards.find(c => c.id === id);
  if (!card) return;

  cardId.value = card.id;
  cardSourceId.value = card.sourceId || '';
  cardTitle.value = card.title;
  cardType.value = card.type || '';
  cardRelated.value = (card.related || []).join(', ');
  cardTags.value = (card.tags || []).join(', ');
  cardContent.value = card.content || '';
  cardImage.value = card.image || '';
  if (card.image) {
    imagePreview.src = card.image;
    imagePreview.hidden = false;
    imageFilename.textContent = '已設定圖片';
  } else {
    imagePreview.hidden = true;
    imageFilename.textContent = '未選擇';
  }
  editPanelTitle.textContent = '編輯卡片';
  if (card.sourceId) {
    sourceCardBadge.hidden = false;
    sourceCardLabel.textContent = card.sourceId;
  } else {
    sourceCardBadge.hidden = true;
  }
  hideMsg();
  editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Raw Upload (FileReader to localStorage) ───────────────────────────── */
rawUploadInput.addEventListener('change', () => {
  const files = Array.from(rawUploadInput.files);
  if (!files.length) return;
  let pending = files.length;
  const existing = storageGet(LS_RAW);

  files.forEach(file => {
    if (!file.name.toLowerCase().endsWith('.md')) {
      pending--;
      if (!pending) finish();
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target.result;
      const id = file.name.replace(/\.md$/i, '');
      const firstLine = content.split('\n').find(l => l.trim().startsWith('# '));
      const title = firstLine ? firstLine.replace(/^# /, '').trim() : id;
      const idx = existing.findIndex(c => c.id === id);
      const card = { id, filename: file.name, title, content };
      if (idx >= 0) existing[idx] = card; else existing.push(card);
      pending--;
      if (!pending) finish();
    };
    reader.onerror = () => { pending--; if (!pending) finish(); };
    reader.readAsText(file);
  });

  function finish() {
    storageSave(LS_RAW, existing);
    rawUploadInput.value = '';
    loadBothLists();
  }
});

/* ── New Card Button ───────────────────────────────────────────────────── */
newCardBtn.addEventListener('click', () => {
  activeRawId = null;
  activeEditedId = null;
  renderRawList();
  renderEditedList();
  editForm.reset();
  cardId.value = generateTimeId();
  cardSourceId.value = '';
  cardImage.value = '';
  imageFilename.textContent = '未選擇';
  imagePreview.hidden = true;
  editPanelTitle.textContent = '創建新卡片';
  sourceCardBadge.hidden = true;
  hideMsg();
  editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  cardTitle.focus();
});

/* ── Image Upload ──────────────────────────────────────────────────────── */
imageUploadBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    cardImage.value = dataUrl;
    imageFilename.textContent = file.name;
    imagePreview.src = dataUrl;
    imagePreview.hidden = false;
  };
  reader.readAsDataURL(file);
});

/* ── Edit Form ─────────────────────────────────────────────────────────── */
clearFormBtn.addEventListener('click', () => {
  editForm.reset();
  cardSourceId.value = '';
  cardImage.value = '';
  imageFilename.textContent = '未選擇';
  imagePreview.hidden = true;
  activeRawId = null;
  activeEditedId = null;
  editPanelTitle.textContent = '編輯卡片';
  sourceCardBadge.hidden = true;
  renderRawList();
  renderEditedList();
  hideMsg();
});

editForm.addEventListener('submit', e => {
  e.preventDefault();
  const payload = {
    id: cardId.value.trim(),
    title: cardTitle.value.trim(),
    type: cardType.value,
    related: cardRelated.value.split(',').map(s => s.trim()).filter(Boolean),
    tags: cardTags.value.split(',').map(s => s.trim()).filter(Boolean),
    image: cardImage.value,
    content: cardContent.value.trim(),
    sourceId: cardSourceId.value.trim(),
  };
  if (!payload.id || !payload.title) {
    showMsg('❌ ID 和標題為必填欄位', 'error');
    return;
  }
  try {
    const now = new Date().toISOString();
    const cards = storageGet(LS_PROCESSED);
    const idx = cards.findIndex(c => c.id === payload.id);
    if (idx >= 0) {
      cards[idx] = { ...cards[idx], ...payload, updatedAt: now };
    } else {
      cards.push({ ...payload, createdAt: now, updatedAt: now });
    }
    storageSave(LS_PROCESSED, cards);
    showMsg('✅ 卡片已儲存！', 'success');
    activeEditedId = payload.id;
    activeRawId = null;
    loadBothLists();
  } catch (err) {
    showMsg('❌ 儲存失敗', 'error');
  }
});

/* ── Card Map ──────────────────────────────────────────────────────────── */
function refreshMapTab() {
  allCards = storageGet(LS_PROCESSED);
  renderCards(allCards);
}

function renderCards(cards) {
  cardCount.textContent = `顯示 ${cards.length} / ${allCards.length} 張`;
  if (cards.length === 0) {
    cardsGrid.innerHTML = '<div class="no-results">找不到符合的卡片</div>';
    return;
  }
  cardsGrid.innerHTML = cards.map(card => `
    <div class="card">
      <h3>${esc(card.title)}</h3>
      <p class="card-content-text">${esc(card.content || '')}</p>
      <div class="card-meta">
        ${card.type ? `<span class="card-type">${esc(card.type)}</span>` : ''}
        ${(card.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function applyFilters() {
  const term = searchInput.value.toLowerCase();
  const type = typeFilter.value;
  const filtered = allCards.filter(c => {
    const matchSearch = !term ||
      (c.title || '').toLowerCase().includes(term) ||
      (c.content || '').toLowerCase().includes(term) ||
      (c.tags || []).some(t => t.toLowerCase().includes(term));
    const matchType = !type || c.type === type;
    return matchSearch && matchType;
  });
  renderCards(filtered);
}

searchInput.addEventListener('input', applyFilters);
typeFilter.addEventListener('change', applyFilters);
resetFilterBtn.addEventListener('click', () => {
  searchInput.value = '';
  typeFilter.value = '';
  renderCards(allCards);
});

/* ── Helpers ───────────────────────────────────────────────────────────── */
const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, m => HTML_ESCAPE_MAP[m]);
}

function showMsg(text, type) {
  formMsg.textContent = text;
  formMsg.className = 'form-msg ' + type;
}

function hideMsg() {
  formMsg.className = 'form-msg';
}
