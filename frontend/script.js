'use strict';

/* ── State ────────────────────────────────────────────────────────────── */
let allCards = [];
let rawCards = [];
let activeRawId = null;

/* ── DOM refs ──────────────────────────────────────────────────────────── */
const tabBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');

const rawCardList = document.getElementById('rawCardList');
const rawUploadInput = document.getElementById('rawUploadInput');

const editForm = document.getElementById('editForm');
const cardId = document.getElementById('cardId');
const cardTitle = document.getElementById('cardTitle');
const cardType = document.getElementById('cardType');
const cardRelated = document.getElementById('cardRelated');
const cardTags = document.getElementById('cardTags');
const cardImage = document.getElementById('cardImage');
const cardFront = document.getElementById('cardFront');
const cardBack = document.getElementById('cardBack');
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
  loadRawCards();
});

/* ── Raw Cards ─────────────────────────────────────────────────────────── */
async function loadRawCards() {
  try {
    const res = await fetch('/api/raw-cards');
    rawCards = await res.json();
    renderRawList();
  } catch (e) {
    rawCardList.innerHTML = '<li class="empty-hint">載入失敗，請確認伺服器正在運行</li>';
  }
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
  renderRawList();
  const card = rawCards.find(c => c.id === id);
  if (!card) return;

  // Auto-fill form from raw card content
  cardId.value = id;  // id is the filename without the .md extension
  cardTitle.value = card.title;

  // Try to extract front/back sections from raw markdown
  const content = card.content || '';
  const frontMatch = content.match(/##\s*(正面|Front)[^\n]*\n([\s\S]*?)(?=##|$)/i);
  const backMatch = content.match(/##\s*(反面|Back)[^\n]*\n([\s\S]*?)(?=##|$)/i);
  const tagsMatch = content.match(/##\s*(標籤|Tags)[^\n]*\n([\s\S]*?)(?=##|$)/i);

  cardFront.value = frontMatch ? frontMatch[2].trim() : content;
  cardBack.value = backMatch ? backMatch[2].trim() : '';
  cardTags.value = tagsMatch ? tagsMatch[2].trim() : '';
  cardType.value = '';
  cardRelated.value = '';
  hideMsg();
}

/* ── Raw Upload ────────────────────────────────────────────────────────── */
rawUploadInput.addEventListener('change', async () => {
  const files = Array.from(rawUploadInput.files);
  if (!files.length) return;
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    await fetch('/api/raw-cards/upload', { method: 'POST', body: formData });
  }
  rawUploadInput.value = '';
  await loadRawCards();
});

/* ── Image Upload ──────────────────────────────────────────────────────── */
imageUploadBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success) {
    cardImage.value = data.url;
    imageFilename.textContent = file.name;
    imagePreview.src = data.url;
    imagePreview.hidden = false;
  }
});

/* ── Edit Form ─────────────────────────────────────────────────────────── */
clearFormBtn.addEventListener('click', () => {
  editForm.reset();
  cardImage.value = '';
  imageFilename.textContent = '未選擇';
  imagePreview.hidden = true;
  activeRawId = null;
  renderRawList();
  hideMsg();
});

editForm.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    id: cardId.value.trim(),
    title: cardTitle.value.trim(),
    type: cardType.value.trim(),
    related: cardRelated.value,
    tags: cardTags.value,
    image: cardImage.value,
    front: cardFront.value.trim(),
    back: cardBack.value.trim(),
  };
  try {
    const res = await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) showMsg('✅ 卡片已儲存！', 'success');
    else showMsg('❌ 儲存失敗：' + (data.error || ''), 'error');
  } catch (err) {
    showMsg('❌ 網路錯誤', 'error');
  }
});

/* ── Card Map ──────────────────────────────────────────────────────────── */
async function loadProcessedCards() {
  try {
    const res = await fetch('/api/cards');
    allCards = await res.json();
    populateTypeFilter();
    renderCards(allCards);
  } catch (e) {
    cardsGrid.innerHTML = '<div class="no-results">載入失敗，請確認伺服器正在運行</div>';
  }
}

function populateTypeFilter() {
  const types = [...new Set(allCards.map(c => c.type).filter(Boolean))];
  typeFilter.innerHTML = '<option value="">全部類型</option>';
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    typeFilter.appendChild(opt);
  });
}

function renderCards(cards) {
  cardCount.textContent = `顯示 ${cards.length} / ${allCards.length} 張`;
  if (cards.length === 0) {
    cardsGrid.innerHTML = '<div class="no-results">找不到符合的卡片</div>';
    return;
  }
  cardsGrid.innerHTML = cards.map(card => `
    <div class="card" onclick="this.classList.toggle('flipped')">
      <div class="card-inner">
        <div class="card-front">
          <h3>${esc(card.title)}</h3>
          <p>${esc(card.front || '')}</p>
          <div class="card-meta">
            ${card.type ? `<span class="card-type">${esc(card.type)}</span>` : ''}
            ${(card.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
          </div>
        </div>
        <div class="card-back">
          <p>${esc(card.back || '')}</p>
        </div>
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
      (c.front || '').toLowerCase().includes(term) ||
      (c.back || '').toLowerCase().includes(term) ||
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
