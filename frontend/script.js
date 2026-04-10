'use strict';

// ── Firebase 初始化 ──────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { 
  getFirestore, collection, doc, setDoc, getDocs, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// 請在此處貼上你在 Firebase Console 取得的設定
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
const db = getFirestore(app);
const cardsCol = collection(db, "cards");

/* ── State ────────────────────────────────────────────────────────────── */
let allCards = [];
let rawCards = []; // 原始 MD 列表暫時保留結構
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

function generateTimeId() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${y}${mo}${d}${h}${mi}`;
}

async function loadBothLists() {
  await Promise.all([loadRawCards(), loadEditedCards()]);
}

/* ── Firebase 讀取 (Edited Cards) ───────────────────────────────────────── */
async function loadEditedCards() {
  try {
    const q = query(cardsCol, orderBy("updatedAt", "desc"));
    const querySnapshot = await getDocs(q);
    allCards = [];
    querySnapshot.forEach((doc) => {
      allCards.push(doc.data());
    });
    renderEditedList();
  } catch (e) {
    console.error(e);
    editedCardList.innerHTML = '<li class="empty-hint">Firebase 載入失敗</li>';
  }
}

/* ── 原有的 Raw Cards 邏輯 (暫時維持本地 fetch，直到你決定上傳機制) ── */
async function loadRawCards() {
  // 注意：若你完全移至 Firebase，此部分可能需要改寫或移除
  rawCardList.innerHTML = '<li class="empty-hint">請透過 Firebase 管理原始卡片</li>';
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
    imageFilename.textContent = '已從雲端載入圖片';
  } else {
    imagePreview.hidden = true;
    imageFilename.textContent = '未選擇';
  }
  hideMsg();
}

/* ── Firebase 儲存 ───────────────────────────────────────────────────── */
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
    updatedAt: serverTimestamp() // 使用 Firebase 伺服器時間
  };

  if (!payload.id || !payload.title) {
    showMsg('❌ ID 和標題為必填', 'error');
    return;
  }

  try {
    await setDoc(doc(db, "cards", payload.id), payload);
    showMsg('✅ 已成功儲存至雲端！', 'success');
    activeEditedId = payload.id;
    await loadEditedCards();
  } catch (err) {
    console.error(err);
    showMsg('❌ 儲存至 Firebase 失敗', 'error');
  }
});

/* ── 介面其他邏輯 (維持不變) ─────────────────────────────────────────── */
newCardBtn.addEventListener('click', () => {
  activeRawId = null;
  activeEditedId = null;
  renderEditedList();
  editForm.reset();
  cardId.value = generateTimeId();
  cardImage.value = '';
  imageFilename.textContent = '未選擇';
  imagePreview.hidden = true;
  hideMsg();
});

imageUploadBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    cardImage.value = e.target.result;
    imageFilename.textContent = file.name;
    imagePreview.src = e.target.result;
    imagePreview.hidden = false;
  };
  reader.readAsDataURL(file);
});

clearFormBtn.addEventListener('click', () => {
  editForm.reset();
  cardImage.value = '';
  imageFilename.textContent = '未選擇';
  imagePreview.hidden = true;
  activeEditedId = null;
  renderEditedList();
  hideMsg();
});

async function loadProcessedCards() {
  await loadEditedCards();
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
