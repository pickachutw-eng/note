'use strict';

// ── Firebase 初始化 ──────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  child 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";

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

// ── 狀態管理 ────────────────────────────────────────────────────────────
const EVENT_CARD_TYPE = '事件卡片';
let allCards = [];   
let rawCards = [];   
let activeRawId = null;
let activeEditedId = null;

// ── DOM 參考 ─────────────────────────────────────────────────────────
const cardId = document.getElementById('cardId');
const cardTitle = document.getElementById('cardTitle');
const cardType = document.getElementById('cardType');
const cardEventDate = document.getElementById('cardEventDate');
const eventDateRow = document.getElementById('eventDateRow');
const cardRelated = document.getElementById('cardRelated');
const cardTags = document.getElementById('cardTags');
const cardImage = document.getElementById('cardImage');
const cardContent = document.getElementById('cardContent');
const imageFilename = document.getElementById('imageFilename');
const imagePreview = document.getElementById('imagePreview');
const formMsg = document.getElementById('formMsg');

// ── 初始化 ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  console.log("App Initialized...");
  bindEvents();
  if (cardId) cardId.value = generateTimeId();
  loadRawCardsFromLocal();
  renderRawList();
  await loadEditedCards();
});

// ── 事件綁定 ────────────────────────────────────────────────────────────
function bindEvents() {
  const editForm = document.getElementById('editForm');
  if (editForm) {
    editForm.addEventListener('submit', handleSaveCard);
    console.log("Save form event bound.");
  } else {
    console.error("Critical Error: editForm not found in DOM!");
  }

  // 標籤切換
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn, .tab-content').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');
      if (btn.dataset.tab === 'map') renderCards(allCards);
    });
  });

  document.getElementById('rawUploadInput')?.addEventListener('change', handleRawUpload);
  document.getElementById('newCardBtn')?.addEventListener('click', prepareNewCardForm);
  document.getElementById('imageUploadBtn')?.addEventListener('click', () => document.getElementById('imageInput')?.click());
  document.getElementById('clearImageBtn')?.addEventListener('click', handleClearImage);
  document.getElementById('imageInput')?.addEventListener('change', handleImageSelect);
  document.getElementById('clearFormBtn')?.addEventListener('click', clearForm);
  cardType?.addEventListener('change', () => {
    if (eventDateRow) eventDateRow.style.display = cardType.value === EVENT_CARD_TYPE ? '' : 'none';
  });
  document.getElementById('resetFilterBtn')?.addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('typeFilter').value = '';
    renderCards(allCards);
  });
}

// ── 儲存卡片 (RTDB 版) ─────────────────────────────────────────────────
async function handleSaveCard(e) {
  e.preventDefault();
  console.log("Save button clicked!"); // 測試按鈕是否有反應

  const payload = {
    id: (cardId?.value || '').trim(),
    title: (cardTitle?.value || '').trim(),
    type: cardType?.value || '',
    eventDate: cardType?.value === EVENT_CARD_TYPE ? (cardEventDate?.value || '') : '',
    related: (cardRelated?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    tags: (cardTags?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    image: (cardImage?.value || '').trim(),
    content: (cardContent?.value || '').trim(),
    updatedAt: Date.now()
  };

  if (!payload.id || !payload.title) {
    showMsg('❌ ID 和標題為必填', 'error');
    return;
  }

  try {
    const path = 'cards/' + payload.id;
    console.log(`Attempting to save to RTDB path: ${path}`, payload);
    const targetRef = ref(db, path);
    await set(targetRef, payload);
    
    console.log("Save successful!");
    if (activeRawId) {
      removeRawCardFromLocal(activeRawId);
      activeRawId = null;
      renderRawList();
    }
    activeEditedId = payload.id;
    await loadEditedCards();
    renderCards(allCards);
    showMsg('✅ 已成功儲存到 Realtime Database', 'success');
  } catch (err) {
    console.error("Firebase Save Error:", err);
    showMsg(`❌ 儲存失敗：${err.message}`, 'error');
  }
}

// ── 載入資料 ────────────────────────────────────────────────────────────
async function loadEditedCards() {
  try {
    const snapshot = await get(child(dbRef, 'cards'));
    allCards = snapshot.exists() ? Object.values(snapshot.val()) : [];
    allCards.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    renderEditedList();
  } catch (e) {
    console.error("Load Cards Error:", e);
  }
}

// ── 渲染功能 ────────────────────────────────────────────────────────────
function renderRawList() {
  const list = document.getElementById('rawCardList');
  if (!list) return;
  list.innerHTML = rawCards.length === 0 ? '<li class="empty-hint">尚無原始卡片</li>' :
    rawCards.map(c => `
      <li class="card-list-item${activeRawId === c.localId ? ' active' : ''}" data-id="${c.localId}" onclick="appSelectRawCard('${c.localId}')">
        <div class="item-title">${esc(c.title)}</div>
        <div class="item-meta">原始｜${esc(c.sourceName)}</div>
      </li>`).join('');
}

function renderEditedList() {
  const list = document.getElementById('editedCardList');
  if (!list) return;
  list.innerHTML = allCards.length === 0 ? '<li class="empty-hint">尚無已編輯卡片</li>' :
    allCards.map(c => `
      <li class="card-list-item${activeEditedId === c.id ? ' active' : ''}" data-id="${c.id}" onclick="appSelectEditedCard('${c.id}')">
        <div class="item-title">${esc(c.title)}</div>
        <div class="item-meta">${esc(c.type)} ${esc(c.id)}</div>
      </li>`).join('');
}

// ── 將函數暴露給全域 (解決模組作用域問題) ───────────────────────────
window.appSelectRawCard = (localId) => {
  activeRawId = localId; activeEditedId = null;
  const card = rawCards.find(c => c.localId === localId);
  if (card) fillForm({ ...card, id: generateTimeId() });
  renderRawList(); renderEditedList();
};

window.appSelectEditedCard = (id) => {
  activeEditedId = id; activeRawId = null;
  const card = allCards.find(c => c.id === id);
  if (card) fillForm(card);
  renderRawList(); renderEditedList();
};

// ── 其他輔助函數 (保持邏輯) ──────────────────────────────────────────
function fillForm(card) {
  cardId.value = card.id || '';
  cardTitle.value = card.title || '';
  cardType.value = card.type || '';
  if (eventDateRow) eventDateRow.style.display = card.type === EVENT_CARD_TYPE ? '' : 'none';
  if (cardEventDate) cardEventDate.value = card.eventDate || '';
  cardRelated.value = (card.related || []).join(', ');
  cardTags.value = (card.tags || []).join(', ');
  cardImage.value = card.image || '';
  imageFilename.textContent = card.image ? `已記錄：${card.image}` : '未選擇';
  cardContent.value = card.content || '';
}

function renderCards(cards) {
  const grid = document.getElementById('cardsGrid');
  if (!grid) return;
  document.getElementById('cardCount').textContent = `顯示 ${cards.length} / ${allCards.length} 張`;
  grid.innerHTML = cards.length === 0 ? '<div class="no-results">找不到卡片</div>' :
    cards.map(c => `<div class="card"><h3>${esc(c.title)}</h3><p>${esc(c.content)}</p></div>`).join('');
}

async function handleRawUpload(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    const text = await file.text();
    rawCards.unshift({ localId: 'raw_'+Date.now()+Math.random().toString(36).slice(2,5), sourceName: file.name, title: file.name, content: text });
  }
  localStorage.setItem('rawCardsDrafts', JSON.stringify(rawCards));
  renderRawList();
  showMsg('✅ 原始卡片已加入', 'success');
}

function generateTimeId() { return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12); }
function loadRawCardsFromLocal() { rawCards = JSON.parse(localStorage.getItem('rawCardsDrafts')) || []; }
function removeRawCardFromLocal(id) { rawCards = rawCards.filter(c => c.localId !== id); localStorage.setItem('rawCardsDrafts', JSON.stringify(rawCards)); }
function esc(str) { return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m])); }
function showMsg(t, c) { if(formMsg) { formMsg.textContent = t; formMsg.className = 'form-msg ' + c; } }
function clearForm() { document.getElementById('editForm')?.reset(); cardId.value = generateTimeId(); imageFilename.textContent = '未選擇'; if (eventDateRow) eventDateRow.style.display = 'none'; }
function handleImageSelect(e) { const f = e.target.files[0]; if(f){ cardImage.value = f.name; imageFilename.textContent = f.name; } }
function handleClearImage() { if (cardImage) cardImage.value = ''; if (imageFilename) imageFilename.textContent = '未選擇'; }
function prepareNewCardForm() { activeRawId = null; activeEditedId = null; clearForm(); renderRawList(); renderEditedList(); }
