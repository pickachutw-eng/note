#!/usr/bin/env node
'use strict';

/**
 * md-to-json.js
 * Scan backend/processed/ and backend/raw/ and write cards.json / raw-cards.json.
 * Usage: node backend/scripts/md-to-json.js
 */

const fs = require('fs');
const path = require('path');

const PROCESSED_DIR = path.join(__dirname, '../processed');
const RAW_DIR = path.join(__dirname, '../raw');
const DATA_DIR = path.join(__dirname, '../data');
const CARDS_JSON = path.join(DATA_DIR, 'cards.json');
const RAW_CARDS_JSON = path.join(DATA_DIR, 'raw-cards.json');

[DATA_DIR, PROCESSED_DIR, RAW_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/**
 * Parse a processed MD card (has YAML frontmatter between --- delimiters).
 */
function parseProcessedCard(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parts = content.split(/^---$/m);
  if (parts.length < 3) return null;

  const yaml = parts[1];
  const body = parts.slice(2).join('---');
  const card = {};

  yaml.split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (!key) return;
    if (value.startsWith('[') && value.endsWith(']')) {
      card[key] = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    } else {
      card[key] = value;
    }
  });

  // Extract front and back from body
  const frontMatch = body.match(/##\s*正面[^\n]*\n([\s\S]*?)(?=##|$)/);
  const backMatch = body.match(/##\s*反面[^\n]*\n([\s\S]*?)(?=##|$)/);
  card.front = frontMatch ? frontMatch[1].trim() : '';
  card.back = backMatch ? backMatch[1].trim() : '';

  if (!card.id) card.id = path.basename(filePath, '.md');
  if (!Array.isArray(card.related)) card.related = card.related ? [card.related] : [];
  if (!Array.isArray(card.tags)) card.tags = card.tags ? [card.tags] : [];

  return card;
}

/**
 * Parse a raw MD card (free-form markdown, no frontmatter required).
 */
function parseRawCard(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const firstHeading = lines.find(l => l.startsWith('# '));
  const title = firstHeading ? firstHeading.replace(/^# /, '').trim() : path.basename(filePath, '.md');
  return {
    id: path.basename(filePath, '.md'),
    filename: path.basename(filePath),
    title,
    content,
  };
}

// Process processed cards
const processedFiles = fs.readdirSync(PROCESSED_DIR).filter(f => f.endsWith('.md'));
const cards = processedFiles.map(f => parseProcessedCard(path.join(PROCESSED_DIR, f))).filter(Boolean);
fs.writeFileSync(CARDS_JSON, JSON.stringify(cards, null, 2));
console.log(`✅ Processed cards: ${cards.length} → ${CARDS_JSON}`);

// Process raw cards
const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.md'));
const rawCards = rawFiles.map(f => parseRawCard(path.join(RAW_DIR, f)));
fs.writeFileSync(RAW_CARDS_JSON, JSON.stringify(rawCards, null, 2));
console.log(`✅ Raw cards: ${rawCards.length} → ${RAW_CARDS_JSON}`);
