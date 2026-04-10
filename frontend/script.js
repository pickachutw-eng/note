'use strict';

/* ── GitHub Config Keys ────────────────────────────────────────────────── */
const GH_OWNER_KEY  = 'gh_owner';
const GH_REPO_KEY   = 'gh_repo';
const GH_BRANCH_KEY = 'gh_branch';
const GH_TOKEN_KEY  = 'gh_token';   // sessionStorage — cleared when tab closes

/* ── Image localStorage key ─────────────────────────────────────────────── */
const IMG_PREFIX = 'img_';          // localStorage.getItem('img_' + cardId)

/* ── GitHub Config Helpers ─────────────────────────────────────────────── */
function ghOwner()  { return localStorage.getItem(GH_OWNER_KEY)  || 'pickachutw-eng'; }
function ghRepo()   { return localStorage.getItem(GH_REPO_KEY)   || 'note'; }
function ghBranch() { return localStorage.getItem(GH_BRANCH_KEY) || 'main'; }
function ghToken()  { return sessionStorage.getItem(GH_TOKEN_KEY) || ''; }

function ghApiBase() {
  return `https://api.github.com/repos/${ghOwner()}/${ghRepo()}/contents`;
}

/* ── GitHub API Helpers ────────────────────────────────────────────────── */
function ghDecode(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

function ghEncode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function ghGet(path) {
  const res = await fetch(`${ghApiBase()}/${path}`, {
    headers: {
      Authorization: `Bearer ${ghToken()}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message || res.statusText), { status: res.status });
  }
  return res.json();
}

async function ghPut(path, content, sha, message) {
  const body = { message, content: ghEncode(content), branch: ghBranch() };
  if (sha) body.sha = sha;
  const res = await fetch(`${ghApiBase()}/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${ghToken()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message || res.statusText), { status: res.status });
  }
  return res.json();
}

/* Upsert: get current sha (if any) then PUT */
async function ghUpsert(path, content, message) {
  let sha;
  try {
    const existing = await ghGet(path);
    sha = existing.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  return ghPut(path, content, sha, message);
}

/* ── Error Helpers ─────────────────────────────────────────────────────── */
function ghErrorMsg(e) {
  if (e.status === 401 || e.status === 403) return '❌ Token 無效或權限不足，請在「設定」中更新 Token';
  if (e.status === 404) return '❌ 找不到檔案或 Repository，請確認設定是否正確';
  if (e.status === 409) return '❌ 資料衝突，請重新整理頁面後再試';
  return `❌ 錯誤：${e.message}`;
}

/* ── State ────────────────────────────────────────────────────────────── */
let allCards = [];
let rawCards = [];
let activeRawId = null;
let activeEditedId = null;

/* ── DOM refs ──────────────────────────────────────────────────────────── */
const tabBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const tokenStatus = document.getElementById('tokenStatus');

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

// Settings
const settingOwner = document.getElementById('settingOwner');
const settingRepo = document.getElementById('settingRepo');
const settingBranch = document.getElementById('settingBranch');
const settingToken = document.getElementById('settingToken');
const toggleTokenBtn = document.getElementById('toggleTokenBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const clearTokenBtn = document.getElementById('clearTokenBtn');
const settingsMsg = document.getElementById('settingsMsg');

/* ── Token Status Indicator ────────────────────────────────────────────── */
function updateTokenStatus() {
  if (ghToken()) {
    tokenStatus.textContent = `🟢 已連線 ${ghOwner()}/${ghRepo()}`;
  } else {
    tokenStatus.textContent = '🔴 未連線（請設定 Token）';
  }
}

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
  updateTokenStatus();
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

/* ── No-Token Warning ──────────────────────────────────────────────────── */
function showNoTokenWarning() {
  rawCardList.innerHTML = '<li class="empty-hint">⚠️ 請先到「⚙️ 設定」頁面輸入 GitHub Token</li>';
  editedCardList.innerHTML = '<li class="empty-hint">⚠️ 請先到「⚙️ 設定」頁面輸入 GitHub Token</li>';
}

/* ── Load Both Lists ───────────────────────────────────────────────────── */
async function loadBothLists() {
  if (!ghToken()) {
    showNoTokenWarning();
    return;
  }
  rawCardList.innerHTML = '<li class="empty-hint">載入中…</li>';
  editedCardList.innerHTML = '<li class="empty-hint">載入中…</li>';
  // load edited first so rawCards can filter them out
  await loadEditedCards();
  await loadRawCards();
}

/* ── Raw Cards (GitHub API — backend/cards/ directory) ─────────────────── */
async function loadRawCards() {
  const editedIds = new Set(allCards.map(c => c.id));
  try {
    const files = await ghGet('backend/cards');
    rawCards = files
      .filter(f => f.type === 'file' && f.name.toLowerCase().endsWith('.md'))
      .map(f => ({
        id: f.name.replace(/\.md$/i, ''),
        filename: f.name,
        title: f.name.replace(/\.md$/i, '').replace(/_/g, ' '),
        sha: f.sha,
        content: null,  // lazy-loaded on select
        _url: f.url,
      }))
      .filter(c => !editedIds.has(c.id));
    renderRawList();
  } catch (e) {
    rawCardList.innerHTML = `<li class="empty-hint">${ghErrorMsg(e)}</li>`;
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

async function selectRawCard(id) {
  activeRawId = id;
  activeEditedId = null;
  renderRawList();
  renderEditedList();
  const card = rawCards.find(c => c.id === id);
  if (!card) return;

  // Lazy-load content from GitHub if not yet fetched
  if (card.content === null) {
    try {
      const data = await ghGet(`backend/cards/${card.filename}`);
      card.content = ghDecode(data.content);
      card.sha = data.sha;
      // Try to extract real title from # heading
      const firstH1 = card.content.split('\n').find(l => l.trim().startsWith('# '));
      if (firstH1) card.title = firstH1.replace(/^# /, '').trim();
      renderRawList(); // re-render with updated title
    } catch (e) {
      showMsg(ghErrorMsg(e), 'error');
      return;
    }
  }

  cardId.value = id;
  cardSourceId.value = id;
  cardTitle.value = card.title;

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

/* ── Edited Cards (GitHub API — backend/data/cards.json) ──────────────── */
async function loadEditedCards() {
  try {
    const data = await ghGet('backend/data/cards.json');
    const parsed = JSON.parse(ghDecode(data.content));
    allCards = parsed.map(c => ({
      ...c,
      image: localStorage.getItem(IMG_PREFIX + c.id) || c.image || '',
    }));
  } catch (e) {
    if (e.status === 404) {
      allCards = [];
    } else {
      editedCardList.innerHTML = `<li class="empty-hint">${ghErrorMsg(e)}</li>`;
      return;
    }
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
  const img = localStorage.getItem(IMG_PREFIX + card.id) || card.image || '';
  cardImage.value = img;
  if (img) {
    imagePreview.src = img;
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

/* ── Raw Upload (GitHub API — backend/cards/{filename}) ────────────────── */
rawUploadInput.addEventListener('change', () => {
  if (!ghToken()) { showMsg('❌ 請先在「⚙️ 設定」中設定 GitHub Token', 'error'); return; }
  const files = Array.from(rawUploadInput.files);
  if (!files.length) return;
  let pending = files.length;

  files.forEach(file => {
    if (!file.name.toLowerCase().endsWith('.md')) { pending--; if (!pending) finish(); return; }
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        await ghUpsert(`backend/cards/${file.name}`, e.target.result, `upload raw card: ${file.name}`);
      } catch (err) {
        showMsg(ghErrorMsg(err), 'error');
      } finally {
        pending--;
        if (!pending) finish();
      }
    };
    reader.onerror = () => { pending--; if (!pending) finish(); };
    reader.readAsText(file);
  });

  function finish() {
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

/* ── Image Upload (stays local — images too large for GitHub API) ────── */
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

/* ── Edit Form Submit (save to GitHub) ────────────────────────────────── */
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

editForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!ghToken()) { showMsg('❌ 請先在「⚙️ 設定」中設定 GitHub Token', 'error'); return; }

  const payload = {
    id: cardId.value.trim(),
    title: cardTitle.value.trim(),
    type: cardType.value,
    related: cardRelated.value.split(',').map(s => s.trim()).filter(Boolean),
    tags: cardTags.value.split(',').map(s => s.trim()).filter(Boolean),
    content: cardContent.value.trim(),
    sourceId: cardSourceId.value.trim(),
  };
  if (!payload.id || !payload.title) {
    showMsg('❌ ID 和標題為必填欄位', 'error');
    return;
  }

  // Store image locally (too large for GitHub); strip from payload
  const imgData = cardImage.value;
  if (imgData) {
    localStorage.setItem(IMG_PREFIX + payload.id, imgData);
  }

  showMsg('⏳ 儲存中…', '');
  try {
    const now = new Date().toISOString();

    // Always re-fetch cards.json to get latest sha (avoid conflicts)
    let currentCards = [];
    let sha;
    try {
      const existing = await ghGet('backend/data/cards.json');
      sha = existing.sha;
      currentCards = JSON.parse(ghDecode(existing.content));
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    const idx = currentCards.findIndex(c => c.id === payload.id);
    if (idx >= 0) {
      currentCards[idx] = { ...currentCards[idx], ...payload, updatedAt: now };
    } else {
      currentCards.push({ ...payload, createdAt: now, updatedAt: now });
    }

    await ghPut(
      'backend/data/cards.json',
      JSON.stringify(currentCards, null, 2),
      sha,
      `save card: ${payload.title}`
    );

    showMsg('✅ 卡片已儲存至 GitHub！', 'success');
    activeEditedId = payload.id;
    activeRawId = null;
    await loadBothLists();
  } catch (err) {
    showMsg(ghErrorMsg(err), 'error');
  }
});

/* ── Card Map ──────────────────────────────────────────────────────────── */
async function refreshMapTab() {
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

/* ── Settings Tab ──────────────────────────────────────────────────────── */
function loadSettingsFields() {
  settingOwner.value = ghOwner();
  settingRepo.value = ghRepo();
  settingBranch.value = ghBranch();
  settingToken.value = ghToken();
}

// Load settings values when tab becomes visible
tabBtns.forEach(btn => {
  if (btn.dataset.tab === 'settings') {
    btn.addEventListener('click', loadSettingsFields);
  }
});

toggleTokenBtn.addEventListener('click', () => {
  settingToken.type = settingToken.type === 'password' ? 'text' : 'password';
});

saveSettingsBtn.addEventListener('click', () => {
  const owner = settingOwner.value.trim();
  const repo = settingRepo.value.trim();
  const branch = settingBranch.value.trim() || 'main';
  const token = settingToken.value.trim();

  if (!owner || !repo) {
    showSettingsMsg('❌ Owner 和 Repo 為必填', 'error');
    return;
  }

  localStorage.setItem(GH_OWNER_KEY, owner);
  localStorage.setItem(GH_REPO_KEY, repo);
  localStorage.setItem(GH_BRANCH_KEY, branch);
  if (token) {
    sessionStorage.setItem(GH_TOKEN_KEY, token);
  }

  updateTokenStatus();
  showSettingsMsg('✅ 設定已儲存！Token 將在關閉瀏覽器後自動清除。', 'success');
  loadBothLists();
});

testConnectionBtn.addEventListener('click', async () => {
  const token = settingToken.value.trim() || ghToken();
  if (!token) { showSettingsMsg('❌ 請先輸入 Token', 'error'); return; }

  showSettingsMsg('⏳ 測試連線中…', 'pending');
  try {
    const owner = settingOwner.value.trim() || ghOwner();
    const repo = settingRepo.value.trim() || ghRepo();
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (res.ok) {
      const data = await res.json();
      showSettingsMsg(`✅ 連線成功！Repository: ${data.full_name}`, 'success');
    } else {
      const err = await res.json().catch(() => ({}));
      showSettingsMsg(`❌ 連線失敗（${res.status}）：${err.message || res.statusText}`, 'error');
    }
  } catch (e) {
    showSettingsMsg(`❌ 網路錯誤：${e.message}`, 'error');
  }
});

clearTokenBtn.addEventListener('click', () => {
  sessionStorage.removeItem(GH_TOKEN_KEY);
  settingToken.value = '';
  updateTokenStatus();
  showSettingsMsg('✅ Token 已清除', 'success');
  showNoTokenWarning();
});

function showSettingsMsg(text, type) {
  settingsMsg.textContent = text;
  settingsMsg.className = 'form-msg ' + type;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */
const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, m => HTML_ESCAPE_MAP[m]);
}

function showMsg(text, type) {
  formMsg.textContent = text;
  formMsg.className = 'form-msg ' + (type || 'pending');
  formMsg.style.display = 'block';
}

function hideMsg() {
  formMsg.className = 'form-msg';
  formMsg.style.display = '';
}