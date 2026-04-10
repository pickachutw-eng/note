'use strict';

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
const cardId = document.getElementById('cardId');
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

/* ── Tab Navigation ────────────────────────────────────────────────────── */
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'map') loadProcessedCards();
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
  return `${y}${mo}${d}${h}${mi}`;
}

/* ── Load Both Lists ───────────────────────────────────────────────────── */
async function loadBothLists() {
  await Promise.all([loadRawCards(), loadEditedCards()]);
}

/* ── Raw Cards ─────────────────────────────────────────────────────────── */
async function loadRawCards() {
  try {
    const res = await fetch('/api/raw-cards');
    rawCards = await res.json();
  } catch (e) {
    rawCards = [];
  }
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
  hideMsg();
}

/* ── Edited Cards ──────────────────────────────────────────────────────── */
async function loadEditedCards() {
  try {
    const res = await fetch('/api/cards');
    allCards = await res.json();
  } catch (e) {
    allCards = [];
  }
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
      <div class="item-meta">${esc(card.type || '')} ${card.id}</div>
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
  hideMsg();
}

/* ── Raw Upload ────────────────────────────────────────────────────────── */
rawUploadInput.addEventListener('change', async () => {
  const files = Array.from(rawUploadInput.files);
  if (!files.length) return;
  const formData = new FormData();
  for (const file of files) {
    formData.append('file', file);
    try {
      await fetch('/api/raw-cards/upload', { method: 'POST', body: formData });
    } catch (e) {
      // ignore individual failures
    }
    formData.delete('file');
  }
  rawUploadInput.value = '';
  await loadRawCards();
});

/* ── New Card Button ───────────────────────────────────────────────────── */
newCardBtn.addEventListener('click', () => {
  activeRawId = null;
  activeEditedId = null;
  renderRawList();
  renderEditedList();
  editForm.reset();
  cardId.value = generateTimeId();
  cardImage.value = '';
  imageFilename.textContent = '未選擇';
  imagePreview.hidden = true;
  hideMsg();
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
  cardImage.value = '';
  imageFilename.textContent = '未選擇';
  imagePreview.hidden = true;
  activeRawId = null;
  activeEditedId = null;
  renderRawList();
  renderEditedList();
  hideMsg();
});

editForm.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    id: cardId.value.trim(),
    title: cardTitle.value.trim(),
    type: cardType.value,
    related: cardRelated.value.split(',').map(s => s.trim()).filter(Boolean),
    tags: cardTags.value.split(',').map(s => s.trim()).filter(Boolean),
    image: cardImage.value,
    content: cardContent.value.trim(),
  };
  if (!payload.id || !payload.title) {
    showMsg('❌ ID 和標題為必填欄位', 'error');
    return;
  }
  try {
    const res = await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Server error');
    showMsg('✅ 卡片已儲存！', 'success');
    activeEditedId = payload.id;
    activeRawId = null;
    await loadBothLists();
  } catch (err) {
    showMsg('❌ 儲存失敗', 'error');
  }
});

/* ── Card Map ──────────────────────────────────────────────────────────── */
async function loadProcessedCards() {
  try {
    const res = await fetch('/api/cards');
    allCards = await res.json();
    renderCards(allCards);
  } catch (e) {
    cardsGrid.innerHTML = '<div class="no-results">載入失敗</div>';
  }
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
