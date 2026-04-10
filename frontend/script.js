'use strict';

// ── Firebase 初始化 (使用 Realtime Database) ───────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  child 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";

// 這裡維持你的設定
const firebaseConfig = {
  apiKey: "AIzaSyAWBPlP6kJdZsZ2fiOZuycYnTcNY2Xasys",
  authDomain: "notes-97961.firebaseapp.com",
  databaseURL: "https://notes-97961-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "notes-97961",
  storageBucket: "notes-97961.firebasestorage.app",
  messagingSenderId: "953339062268",
  appId: "1:953339062268:web:d5c3f1ce74a814098f7479"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const dbRef = ref(db);

// ── Local Storage Keys ───────────────────────────────────────────────
const LOCAL_RAW_CARDS_KEY = 'rawCardsDrafts';

// ── State ────────────────────────────────────────────────────────────
let allCards = [];   
let rawCards = [];   
let activeRawId = null;
let activeEditedId = null;

// ── DOM refs ─────────────────────────────────────────────────────────
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

// ── Init ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  if (cardId) cardId.value = generateTimeId();
  loadRawCardsFromLocal();
  renderRawList();
  await loadEditedCards();
});

// ── Event Binding ────────────────────────────────────────────────────
function bindEvents() {
  tabBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById('tab-' + btn.dataset.tab);
      if (target) target.classList.add('active');
      if (btn.dataset.tab === 'map') {
        renderCards(allCards); 
      }
    });
  });

  if (rawUploadInput) rawUploadInput.addEventListener('change', handleRawUpload);
  if (newCardBtn) newCardBtn.addEventListener('click', prepareNewCardForm);
  if (imageUploadBtn) imageUploadBtn.addEventListener('click', () => imageInput?.click());
  if (imageInput) imageInput.addEventListener('change', handleImageSelect);
  if (clearFormBtn) clearFormBtn.addEventListener('click', clearForm);
  if (editForm) editForm.addEventListener('submit', handleSaveCard);
  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (typeFilter) typeFilter.addEventListener('change', applyFilters);
  if (resetFilterBtn) {
    resetFilterBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (typeFilter) typeFilter.value = '';
      renderCards(allCards);
    });
  }
}

// ── 核心功能：Firebase 載入 (RTDB 版) ──────────────────────────────────
async function loadEditedCards() {
  try {
    const snapshot = await get(child(dbRef, 'cards'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      allCards = Object.values(data);
      // 按時間戳降冪排序
      allCards.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } else {
      allCards = [];
    }
    renderEditedList();
  } catch (e) {
    console.error("載入失敗:", e);
    allCards = [];
    if (editedCardList) editedCardList.innerHTML = '<li class="empty-hint">載入失敗</li>';
  }
}

// ── 核心功能：Firebase 儲存 (RTDB 版) ──────────────────────────────────
async function handleSaveCard(e) {
  e.preventDefault();

  const payload = {
    id: (cardId?.value || '').trim(),
    title: (cardTitle?.value || '').trim(),
    type: cardType?.value || '',
    related: (cardRelated?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    tags: (cardTags?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    image: (cardImage?.value || '').trim(),
    content: (cardContent?.value || '').trim(),
    updatedAt: Date.now() // RTDB 直接存數字時間戳
  };

  if (!payload.id || !payload.title) {
    showMsg('❌ ID 和標題為必填', 'error');
    return;
  }

  try {
    // 儲存到路徑 cards/ID
    await set(ref(db, 'cards/' + payload.id), payload);

    if (activeRawId) {
      removeRawCardFromLocal(activeRawId);
      activeRawId = null;
      renderRawList();
    }

    activeEditedId = payload.id;
    await loadEditedCards();
    showMsg('✅ 已成功儲存到 Realtime Database', 'success');
  } catch (err) {
    console.error(err);
    showMsg(`❌ 儲存失敗：${err.message}`, 'error');
  }
}

// ── Markdown 解析與本機暫存 ──────────────────────────────────────────
async function handleRawUpload(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    const text = await file.text();
    const parsed = parseMarkdownCard(text, file.name);
    rawCards.unshift({
      localId: `raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceName: file.name,
      ...parsed,
      uploadedAt: Date.now()
    });
  }
  saveRawCardsToLocal();
  renderRawList();
  event.target.value = '';
  showMsg('✅ 原始卡片已加入本機暫存', 'success');
}

function parseMarkdownCard(text, filename) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let title = '', type = '', related = [], tags = [], image = '', contentStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!title && line.startsWith('# ')) { title = line.replace(/^#\s+/, '').trim(); continue; }
    if (/^type\s*:/i.test(line)) { type = line.split(':').slice(1).join(':').trim(); continue; }
    if (/^related\s*:/i.test(line)) { related = line.split(':').slice(1).join(':').split(',').map(s => s.trim()).filter(Boolean); continue; }
    if (/^tags\s*:/i.test(line)) { tags = line.split(':').slice(1).join(':').split(',').map(s => s.trim()).filter(Boolean); continue; }
    if (/^image\s*:/i.test(line)) { image = line.split(':').slice(1).join(':').trim(); continue; }
    if (line === '---') { contentStartIndex = i + 1; break; }
  }
  return { title: title || filename.replace(/\.md$/i, ''), type, related, tags, image, content: lines.slice(contentStartIndex).join('\n').trim() || text.trim() };
}

// ── 介面渲染與輔助函數 ────────────────────────────────────────────────
function renderRawList() {
  if (!rawCardList) return;
  rawCardList.innerHTML = rawCards.length === 0 ? '<li class="empty-hint">尚無原始卡片</li>' :
    rawCards.map(c => `<li class="card-list-item${activeRawId === c.localId ? ' active' : ''}" onclick="selectRawCard('${c.localId}')">
      <div class="item-title">${esc(c.title)}</div><div class="item-meta">原始｜${esc(c.sourceName)}</div>
    </li>`).join('');
}

window.selectRawCard = (localId) => {
  activeRawId = localId; activeEditedId = null;
  const card = rawCards.find(c => c.localId === localId);
  if (card) fillForm({ ...card, id: generateTimeId() });
  renderRawList(); renderEditedList();
};

function renderEditedList() {
  if (!editedCardList) return;
  editedCardList.innerHTML = allCards.length === 0 ? '<li class="empty-hint">尚無已編輯卡片</li>' :
    allCards.map(c => `<li class="card-list-item${activeEditedId === c.id ? ' active' : ''}" onclick="selectEditedCard('${c.id}')">
      <div class="item-title">${esc(c.title)}</div><div class="item-meta">${esc(c.type)} ${esc(c.id)}</div>
    </li>`).join('');
}

window.selectEditedCard = (id) => {
  activeEditedId = id; activeRawId = null;
  const card = allCards.find(c => c.id === id);
  if (card) fillForm(card);
  renderRawList(); renderEditedList();
};

function fillForm(card) {
  if (cardId) cardId.value = card.id || '';
  if (cardTitle) cardTitle.value = card.title || '';
  if (cardType) cardType.value = card.type || '';
  if (cardRelated) cardRelated.value = (card.related || []).join(', ');
  if (cardTags) cardTags.value = (card.tags || []).join(', ');
  if (cardImage) {
    cardImage.value = card.image || '';
    imageFilename.textContent = card.image ? `已記錄：${card.image}` : '未選擇';
  }
  if (cardContent) cardContent.value = card.content || '';
}

function renderCards(cards) {
  if (!cardsGrid) return;
  cardCount.textContent = `顯示 ${cards.length} / ${allCards.length} 張`;
  cardsGrid.innerHTML = cards.length === 0 ? '<div class="no-results">找不到卡片</div>' :
    cards.map(c => `<div class="card"><h3>${esc(c.title)}</h3><p>${esc(c.content)}</p>
      <div class="card-meta">${c.type ? `<span class="card-type">${esc(c.type)}</span>` : ''}
      ${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>`).join('');
}

function applyFilters() {
  const term = (searchInput?.value || '').toLowerCase();
  const type = typeFilter?.value || '';
  const filtered = allCards.filter(c => {
    const matchSearch = !term || (c.title||'').toLowerCase().includes(term) || (c.content||'').toLowerCase().includes(term);
    const matchType = !type || c.type === type;
    return matchSearch && matchType;
  });
  renderCards(filtered);
}

function generateTimeId() { return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12); }
function loadRawCardsFromLocal() { rawCards = JSON.parse(localStorage.getItem(LOCAL_RAW_CARDS_KEY)) || []; }
function saveRawCardsToLocal() { localStorage.setItem(LOCAL_RAW_CARDS_KEY, JSON.stringify(rawCards)); }
function removeRawCardFromLocal(id) { rawCards = rawCards.filter(c => c.localId !== id); saveRawCardsToLocal(); }
function esc(str) { return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m])); }
function showMsg(t, c) { if(formMsg) { formMsg.textContent = t; formMsg.className = 'form-msg ' + c; } }
function clearForm() { editForm?.reset(); if(cardId) cardId.value = generateTimeId(); imageFilename.textContent = '未選擇'; }
function handleImageSelect() {
  const file = imageInput?.files?.[0];
  if (!file) return;
  cardImage.value = file.name;
  imageFilename.textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => { if(imagePreview) { imagePreview.src = e.target.result; imagePreview.hidden = false; } };
  reader.readAsDataURL(file);
}
function prepareNewCardForm() { activeRawId = null; activeEditedId = null; clearForm(); renderRawList(); renderEditedList(); }
