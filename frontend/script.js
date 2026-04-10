'use strict';

// ── Firebase 初始化 ──────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  query,
  orderByChild,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

// 請確認這裡是你的 Firebase 設定
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
const auth = getAuth(app);
const cardsRef = ref(db, "cards");

// ── Local Storage Keys ───────────────────────────────────────────────
const LOCAL_RAW_CARDS_KEY = 'rawCardsDrafts';

// ── State ────────────────────────────────────────────────────────────
let allCards = [];   // Firebase 已編輯卡片
let rawCards = [];   // 本機暫存原始卡片
let activeRawId = null;
let activeEditedId = null;
let lastLoadError = '';

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
  cardId.value = generateTimeId();
  loadRawCardsFromLocal();
  renderRawList();
  try {
    await signInAnonymously(auth);
  } catch (authErr) {
    console.error('匿名登入失敗', authErr);
    showMsg(`❌ 匿名登入失敗，可能無法儲存。請確認網路或重新整理：${authErr.message}`, 'error');
  }
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
        await loadProcessedCards();
      }
    });
  });

  if (rawUploadInput) {
    rawUploadInput.addEventListener('change', handleRawUpload);
  }

  if (newCardBtn) {
    newCardBtn.addEventListener('click', () => {
      prepareNewCardForm();
    });
  }

  if (imageUploadBtn) {
    imageUploadBtn.addEventListener('click', () => {
      if (imageInput) imageInput.click();
    });
  }

  const clearImageBtn = document.getElementById('clearImageBtn');
  if (clearImageBtn) {
    clearImageBtn.addEventListener('click', () => {
      if (cardImage) cardImage.value = '';
      if (imageFilename) imageFilename.textContent = '未選擇';
      if (imagePreview) {
        imagePreview.src = '';
        imagePreview.hidden = true;
      }
      if (imageInput) imageInput.value = '';
    });
  }

  if (imageInput) {
    imageInput.addEventListener('change', handleImageSelect);
  }

  if (clearFormBtn) {
    clearFormBtn.addEventListener('click', () => {
      clearForm();
    });
  }

  if (editForm) {
    editForm.addEventListener('submit', handleSaveCard);
  }

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

// ── Upload Raw Markdown ──────────────────────────────────────────────
async function handleRawUpload(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  for (const file of files) {
    const text = await file.text();
    const parsed = parseMarkdownCard(text, file.name);

    rawCards.unshift({
      localId: generateLocalRawId(),
      sourceName: file.name,
      title: parsed.title,
      type: parsed.type,
      related: parsed.related,
      tags: parsed.tags,
      image: parsed.image, // 只是文字欄位，不是圖片內容
      content: parsed.content,
      uploadedAt: Date.now()
    });
  }

  saveRawCardsToLocal();
  renderRawList();

  // 上傳後清空 input，才能再次選同一檔案
  event.target.value = '';

  showMsg('✅ 原始卡片已加入左側列表（僅暫存本機）', 'success');
}

// ── Parse Markdown ───────────────────────────────────────────────────
function parseMarkdownCard(text, filename) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  let title = '';
  let type = '';
  let related = [];
  let tags = [];
  let image = '';
  let contentStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!title && line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '').trim();
      continue;
    }

    if (/^type\s*:/i.test(line)) {
      type = line.split(':').slice(1).join(':').trim();
      continue;
    }

    if (/^related\s*:/i.test(line)) {
      related = line
        .split(':')
        .slice(1)
        .join(':')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      continue;
    }

    if (/^tags\s*:/i.test(line)) {
      tags = line
        .split(':')
        .slice(1)
        .join(':')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      continue;
    }

    if (/^image\s*:/i.test(line)) {
      image = line.split(':').slice(1).join(':').trim();
      continue;
    }

    if (line === '---') {
      contentStartIndex = i + 1;
      break;
    }
  }

  const content = lines.slice(contentStartIndex).join('\n').trim();

  return {
    title: title || filename.replace(/\.md$/i, ''),
    type,
    related,
    tags,
    image,
    content: content || text.trim()
  };
}

// ── Raw Cards Local Storage ──────────────────────────────────────────
function loadRawCardsFromLocal() {
  try {
    const saved = localStorage.getItem(LOCAL_RAW_CARDS_KEY);
    rawCards = saved ? JSON.parse(saved) : [];
  } catch (err) {
    console.error('讀取本機原始卡片失敗', err);
    rawCards = [];
  }
}

function saveRawCardsToLocal() {
  localStorage.setItem(LOCAL_RAW_CARDS_KEY, JSON.stringify(rawCards));
}

function removeRawCardFromLocal(localId) {
  rawCards = rawCards.filter(card => card.localId !== localId);
  saveRawCardsToLocal();
}

// ── Render Raw List ──────────────────────────────────────────────────
function renderRawList() {
  if (!rawCardList) return;

  if (rawCards.length === 0) {
    rawCardList.innerHTML = '<li class="empty-hint">尚無原始卡片，請按＋上傳</li>';
    return;
  }

  rawCardList.innerHTML = rawCards.map(card => `
    <li class="card-list-item${activeRawId === card.localId ? ' active' : ''}" data-id="${esc(card.localId)}" data-kind="raw">
      <div class="item-title">${esc(card.title || '(未命名卡片)')}</div>
      <div class="item-meta">原始卡片｜${esc(card.sourceName || '')}</div>
    </li>
  `).join('');

  rawCardList.querySelectorAll('.card-list-item').forEach(li => {
    li.addEventListener('click', () => {
      selectRawCard(li.dataset.id);
    });
  });
}

function selectRawCard(localId) {
  activeRawId = localId;
  activeEditedId = null;

  renderRawList();
  renderEditedList();

  const card = rawCards.find(c => c.localId === localId);
  if (!card) return;

  fillForm({
    id: generateTimeId(),
    title: card.title || '',
    type: normalizeType(card.type || ''),
    related: card.related || [],
    tags: card.tags || [],
    image: card.image || '',
    content: card.content || ''
  });

  hideMsg();
}

// ── Firebase Realtime Database Load Edited Cards ─────────────────────
async function loadEditedCards() {
  lastLoadError = '';
  try {
    allCards = [];
    const q = query(cardsRef, orderByChild("updatedAt"));
    const snapshot = await withTimeout(get(q), 8000, '載入資料庫逾時（8 秒）');

    if (snapshot.exists()) {
      snapshot.forEach((childSnap) => {
        const data = childSnap.val();
        if (data) allCards.push(data);
      });
    }

    // 若沒有排序，就手動按 updatedAt 粗略排序
    allCards.sort((a, b) => {
      const ta = getComparableTime(a.updatedAt);
      const tb = getComparableTime(b.updatedAt);
      return tb - ta;
    });

    renderEditedList();
    return true;
  } catch (e) {
    console.error(e);
    allCards = [];
    lastLoadError = e?.message || '未知錯誤';
    if (editedCardList) {
      editedCardList.innerHTML = '<li class="empty-hint">資料庫載入失敗</li>';
    }
    return false;
  }
}

function renderEditedList() {
  if (!editedCardList) return;

  if (allCards.length === 0) {
    editedCardList.innerHTML = '<li class="empty-hint">尚無已編輯卡片</li>';
    return;
  }

  editedCardList.innerHTML = allCards.map(card => `
    <li class="card-list-item${activeEditedId === card.id ? ' active' : ''}" data-id="${esc(card.id)}" data-kind="edited">
      <div class="item-title">${esc(card.title || '(未命名卡片)')}</div>
      <div class="item-meta">${esc(card.type || '')} ${esc(card.id || '')}</div>
    </li>
  `).join('');

  editedCardList.querySelectorAll('.card-list-item').forEach(li => {
    li.addEventListener('click', () => {
      selectEditedCard(li.dataset.id);
    });
  });
}

function selectEditedCard(id) {
  activeEditedId = id;
  activeRawId = null;

  renderRawList();
  renderEditedList();

  const card = allCards.find(c => c.id === id);
  if (!card) return;

  fillForm({
    id: card.id || '',
    title: card.title || '',
    type: card.type || '',
    related: card.related || [],
    tags: card.tags || [],
    image: card.image || '',
    content: card.content || ''
  });

  if (card.image) {
    imageFilename.textContent = `已記錄：${card.image}`;
  } else {
    imageFilename.textContent = '未選擇';
  }
  if (imagePreview) imagePreview.hidden = true;

  hideMsg();
}

// ── Form Handling ────────────────────────────────────────────────────
function prepareNewCardForm() {
  activeRawId = null;
  activeEditedId = null;

  renderRawList();
  renderEditedList();

  clearForm();
  cardId.value = generateTimeId();
}

function clearForm() {
  if (editForm) editForm.reset();
  if (cardId) cardId.value = generateTimeId();
  if (cardImage) cardImage.value = '';
  if (imageFilename) imageFilename.textContent = '未選擇';
  if (imagePreview) {
    imagePreview.src = '';
    imagePreview.hidden = true;
  }
  if (imageInput) imageInput.value = '';
  hideMsg();
}

function fillForm(card) {
  if (cardId) cardId.value = card.id || generateTimeId();
  if (cardTitle) cardTitle.value = card.title || '';
  if (cardType) cardType.value = card.type || '';
  if (cardRelated) cardRelated.value = (card.related || []).join(', ');
  if (cardTags) cardTags.value = (card.tags || []).join(', ');
  if (cardImage) cardImage.value = card.image || '';
  if (cardContent) cardContent.value = card.content || '';

  if (imageFilename) {
    imageFilename.textContent = card.image ? `已記錄：${card.image}` : '未選擇';
  }

  if (imagePreview) {
    imagePreview.src = '';
    imagePreview.hidden = true;
  }
}

function handleImageSelect() {
  const file = imageInput?.files?.[0];
  if (!file) return;

  // 只記錄檔名，不存圖片內容到 Database
  if (cardImage) cardImage.value = file.name;
  if (imageFilename) imageFilename.textContent = file.name;

  const reader = new FileReader();
  reader.onload = e => {
    if (imagePreview) {
      imagePreview.src = e.target.result;
      imagePreview.hidden = false;
    }
  };
  reader.readAsDataURL(file);
}

async function handleSaveCard(e) {
  e.preventDefault();

  const payload = {
    id: (cardId?.value || '').trim(),
    title: (cardTitle?.value || '').trim(),
    type: cardType?.value || '',
    related: (cardRelated?.value || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    tags: (cardTags?.value || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    image: (cardImage?.value || '').trim(), // 只存檔名
    content: (cardContent?.value || '').trim(),
    updatedAt: serverTimestamp()
  };

  if (!payload.id || !payload.title) {
    showMsg('❌ ID 和標題為必填', 'error');
    return;
  }

  try {
    showMsg('⏳ 儲存中…', 'info');
    await withTimeout(set(ref(db, `cards/${payload.id}`), payload), 8000, '儲存逾時（8 秒）');

    // 如果是從原始卡片編輯而來，儲存成功後移出原始列表
    if (activeRawId) {
      removeRawCardFromLocal(activeRawId);
      activeRawId = null;
      renderRawList();
    }

    activeEditedId = payload.id;
    const reloadOk = await loadEditedCards();

    if (reloadOk) {
      showMsg('✅ 已成功儲存到 Database', 'success');
    } else {
      showMsg(`✅ 已成功儲存到 Database，但重新載入失敗：${lastLoadError}`, 'error');
    }
  } catch (err) {
    console.error(err);
    showMsg(`❌ 儲存到 Database 失敗：${err.message}`, 'error');
  }
}

// ── Map Tab ──────────────────────────────────────────────────────────
async function loadProcessedCards() {
  await loadEditedCards();
  renderCards(allCards);
}

function renderCards(cards) {
  if (!cardCount || !cardsGrid) return;

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
  const term = (searchInput?.value || '').toLowerCase();
  const type = typeFilter?.value || '';

  const filtered = allCards.filter(c => {
    const matchSearch = !term ||
      (c.title || '').toLowerCase().includes(term) ||
      (c.content || '').toLowerCase().includes(term) ||
      (c.tags || []).some(t => String(t).toLowerCase().includes(term));

    const matchType = !type || c.type === type;
    return matchSearch && matchType;
  });

  renderCards(filtered);
}

// ── Helpers ──────────────────────────────────────────────────────────
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

function generateLocalRawId() {
  return `raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeType(type) {
  const t = String(type || '').trim();
  if (t === '問題卡' || t === '地圖卡') return t;
  return '';
}

const NUMERIC_PATTERN = /^\d+(\.\d+)?$/;

function getComparableTime(ts) {
  if (!ts) return 0;

  if (typeof ts === 'number') {
    return ts;
  }

  if (typeof ts === 'string') {
    const trimmed = ts.trim();
    if (trimmed && NUMERIC_PATTERN.test(trimmed)) {
      const num = Number(trimmed);
      if (!Number.isNaN(num)) return num;
    }
  }

  // Firestore Timestamp (compat)
  if (typeof ts.toMillis === 'function') {
    return ts.toMillis();
  }

  // Firestore plain object {seconds, nanoseconds} (compat)
  if (typeof ts.seconds === 'number') {
    return ts.seconds * 1000;
  }

  return 0;
}

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
};

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, m => HTML_ESCAPE_MAP[m]);
}

function showMsg(text, type) {
  if (!formMsg) return;
  formMsg.textContent = text;
  formMsg.className = 'form-msg ' + type;
}

function hideMsg() {
  if (!formMsg) return;
  formMsg.textContent = '';
  formMsg.className = 'form-msg';
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, ms);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}
