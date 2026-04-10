#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const RAW_DIR = path.join(__dirname, 'backend/raw');
const PROCESSED_DIR = path.join(__dirname, 'backend/processed');
const UPLOADS_DIR = path.join(__dirname, 'backend/uploads');
const DATA_DIR = path.join(__dirname, 'backend/data');
const CARDS_JSON = path.join(DATA_DIR, 'cards.json');
const RAW_CARDS_JSON = path.join(DATA_DIR, 'raw-cards.json');

// Ensure directories exist
[RAW_DIR, PROCESSED_DIR, UPLOADS_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize JSON files if missing
if (!fs.existsSync(CARDS_JSON)) fs.writeFileSync(CARDS_JSON, '[]');
if (!fs.existsSync(RAW_CARDS_JSON)) fs.writeFileSync(RAW_CARDS_JSON, '[]');

/**
 * Sanitize a card ID so it only contains safe filename characters and
 * cannot escape the target directory via path traversal.
 */
function sanitizeId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 100);
}

/**
 * Parse a comma-separated or array field from a request body value.
 */
function parseListField(value) {
  if (Array.isArray(value)) return value.map(s => String(s).trim()).filter(Boolean);
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Multer for raw MD uploads — validate MIME type and extension
const rawStorage = multer.diskStorage({
  destination: RAW_DIR,
  filename: (req, file, cb) => cb(null, path.basename(file.originalname)),
});
const uploadRaw = multer({
  storage: rawStorage,
  fileFilter: (req, file, cb) => {
    const hasValidExt = file.originalname.toLowerCase().endsWith('.md');
    const hasValidMime = ['text/plain', 'text/markdown', 'application/octet-stream'].includes(file.mimetype);
    if (hasValidExt && hasValidMime) cb(null, true);
    else cb(new Error('Only .md files are allowed'));
  },
  limits: { fileSize: 1024 * 1024 }, // 1 MB
});

// Multer for image uploads — add entropy to filename to avoid collisions
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const imageStorage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const random = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${random}${ext}`);
  },
});
const uploadImage = multer({
  storage: imageStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_IMAGE_EXTS.has(ext)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Rate limiter for write endpoints
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/backend/uploads', express.static(UPLOADS_DIR));

// Rate limiter for all API read endpoints
const readLimiter = rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });

// ── API ────────────────────────────────────────────────────────────────────

// List raw cards
app.get('/api/raw-cards', readLimiter, (req, res) => {
  const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.md'));
  const cards = files.map(file => {
    const filePath = path.join(RAW_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const firstLine = content.split('\n').find(l => l.startsWith('# '));
    const id = path.basename(file, '.md');
    const title = firstLine ? firstLine.replace(/^# /, '').trim() : id;
    return { id, filename: file, title, content };
  });
  res.json(cards);
});

// Upload raw MD file
app.post('/api/raw-cards/upload', writeLimiter, uploadRaw.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ success: true, filename: req.file.originalname });
});

// Upload image
app.post('/api/uploads', writeLimiter, uploadImage.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  res.json({ success: true, filename: req.file.filename, url: '/backend/uploads/' + req.file.filename });
});

// List processed cards
app.get('/api/cards', readLimiter, (req, res) => {
  const cards = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf-8'));
  res.json(cards);
});

// Save processed card
app.post('/api/cards', writeLimiter, (req, res) => {
  const { title, type, related, tags, image, front, back } = req.body;
  const id = sanitizeId(req.body.id);
  if (!id || !title) return res.status(400).json({ error: 'id and title are required' });

  const relatedList = parseListField(related);
  const tagList = parseListField(tags);

  const mdContent = [
    '---',
    `id: ${id}`,
    `title: ${title}`,
    `type: ${type || ''}`,
    `related: [${relatedList.join(', ')}]`,
    `tags: [${tagList.join(', ')}]`,
    `image: ${image || ''}`,
    '---',
    '',
    '## 正面 (Front)',
    '',
    front || '',
    '',
    '## 反面 (Back)',
    '',
    back || '',
  ].join('\n');

  // Resolve and verify the path stays within PROCESSED_DIR
  const mdPath = path.resolve(PROCESSED_DIR, id + '.md');
  if (!mdPath.startsWith(PROCESSED_DIR + path.sep)) {
    return res.status(400).json({ error: 'Invalid card id' });
  }
  fs.writeFileSync(mdPath, mdContent, 'utf-8');

  // Update cards.json
  const cards = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf-8'));
  const now = new Date().toISOString();
  const cardData = { id, title, type: type || '', related: relatedList, tags: tagList, image: image || '', front: front || '', back: back || '', updatedAt: now };
  const idx = cards.findIndex(c => c.id === id);
  if (idx >= 0) {
    cards[idx] = { ...cards[idx], ...cardData };
  } else {
    cardData.createdAt = now;
    cards.push(cardData);
  }
  fs.writeFileSync(CARDS_JSON, JSON.stringify(cards, null, 2));

  res.json({ success: true, card: cardData });
});

// Delete processed card
app.delete('/api/cards/:id', writeLimiter, (req, res) => {
  const id = sanitizeId(req.params.id);

  // Resolve and verify the path stays within PROCESSED_DIR
  const mdPath = path.resolve(PROCESSED_DIR, id + '.md');
  if (!mdPath.startsWith(PROCESSED_DIR + path.sep)) {
    return res.status(400).json({ error: 'Invalid card id' });
  }
  if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);

  const cards = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf-8'));
  const filtered = cards.filter(c => c.id !== id);
  fs.writeFileSync(CARDS_JSON, JSON.stringify(filtered, null, 2));

  res.json({ success: true });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`Card Database running at http://localhost:${PORT}`);
});
