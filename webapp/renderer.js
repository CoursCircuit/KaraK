const ui = {
  gameRemaskBtn: document.getElementById('gameRemaskBtn'),
  gameRevealAllBtn: document.getElementById('gameRevealAllBtn'),
  revealWordBtn: document.getElementById('revealWordBtn'),
  nextLineBtn: document.getElementById('nextLineBtn'),
  prevLineBtn: document.getElementById('prevLineBtn'),
  gamePlayBtn: document.getElementById('gamePlayBtn'),
  gameProgress: document.getElementById('gameProgress'),
  fullscreenBtn: document.getElementById('fullscreenBtn'),
  alignmentStatus: document.getElementById('alignmentStatus'),
  undoAlignBtn: document.getElementById('undoAlignBtn'),
  applyAlignBtn: document.getElementById('applyAlignBtn'),
  cancelAlignBtn: document.getElementById('cancelAlignBtn'),
  autoAlignBtn: document.getElementById('autoAlignBtn'),
  alignmentLanguage: document.getElementById('alignmentLanguage'),
  lineCount: document.getElementById('lineCount'),
  projectLabel: document.getElementById('projectLabel'),
  newProjectBtn: document.getElementById('newProjectBtn'),
  openProjectBtn: document.getElementById('openProjectBtn'),
  saveProjectBtn: document.getElementById('saveProjectBtn'),
  saveAsProjectBtn: document.getElementById('saveAsProjectBtn'),
  editModeBtn: document.getElementById('editModeBtn'),
  gameModeBtn: document.getElementById('gameModeBtn'),
  editModeSection: document.getElementById('editMode'),
  gameModeSection: document.getElementById('gameMode'),
  loadAudioBtn: document.getElementById('loadAudioBtn'),
  audioPathLabel: document.getElementById('audioPathLabel'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  audioTime: document.getElementById('audioTime'),
  audioScrub: document.getElementById('audioScrub'),
  audioLatencyInput: document.getElementById('audioLatencyInput'),
  syncToggle: document.getElementById('syncToggle'),
  audioPlayer: document.getElementById('audioPlayer'),
  importTextBtn: document.getElementById('importTextBtn'),
  segmentBtn: document.getElementById('segmentBtn'),
  clearLyricsBtn: document.getElementById('clearLyricsBtn'),
  autoSegmentToggle: document.getElementById('autoSegmentToggle'),
  lyricsTextarea: document.getElementById('lyricsTextarea'),
  maskManual: document.getElementById('maskManual'),
  maskPercent: document.getElementById('maskPercent'),
  maskLength: document.getElementById('maskLength'),
  maskPercentInput: document.getElementById('maskPercentInput'),
  maskLengthInput: document.getElementById('maskLengthInput'),
  maskAllBtn: document.getElementById('maskAllBtn'),
  revealAllBtn: document.getElementById('revealAllBtn'),
  lineList: document.getElementById('lineList'),
  statusMessage: document.getElementById('statusMessage'),
  gamePrevLine: document.getElementById('gamePrevLine'),
  gameActiveLine: document.getElementById('gameActiveLine'),
  gameNextLine: document.getElementById('gameNextLine'),
  gameScrub: document.getElementById('gameScrub'),
  gameTime: document.getElementById('gameTime'),
  gameStatus: document.getElementById('gameStatus')
};

const state = {
  projectPath: null,
  audioPath: null,
  audioLatencyMs: 0,
  lyricsRaw: '',
  lines: [],
  maskMode: 'manual',
  maskPercent: 40,
  maskMinLength: 6,
  activeLine: 0,
  reveal: {
    all: false,
    words: []
  },
  mode: 'edit',
  autoSegment: true,
  playDelayTimer: null,
  syncEnabled: false,
  manualBase: null,
  audioLoad: 0,
  alignmentRunning: false,
  markingLine: null,
  suggestions: null,
  lastAlignment: null,
  saving: false,
  cleanProject: null
};

function setStatus(message, type = 'info') {
  ui.statusMessage.textContent = message;
  ui.gameStatus.textContent = message;
  ui.statusMessage.dataset.type = type;
  ui.gameStatus.dataset.type = type;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function createLine(text) {
  const line = {
    text: text ?? '',
    manualMask: [],
    autoMaskPercent: [],
    autoMaskLength: [],
    lineHidden: false,
    timestamp: ''
  };
  ensureLineMasks(line);
  return line;
}

function normalizeLines(lines) {
  return lines.map((line) => {
    const normalized = {
      text: typeof line?.text === 'string' ? line.text : '',
      manualMask: Array.isArray(line?.manualMask) ? line.manualMask : [],
      autoMaskPercent: Array.isArray(line?.autoMaskPercent) ? line.autoMaskPercent : [],
      autoMaskLength: Array.isArray(line?.autoMaskLength) ? line.autoMaskLength : [],
      lineHidden: !!line?.lineHidden,
      timestamp: typeof line?.timestamp === 'string' ? line.timestamp : ''
    };
    ensureLineMasks(normalized);
    return normalized;
  });
}

function tokenizeLine(text) {
  const tokens = [];
  const regex = /\s+|\S+/g;
  let match;
  let wordIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    const part = match[0];
    if (/^\s+$/.test(part)) {
      tokens.push({ type: 'space', text: part });
      continue;
    }
    const hasLetters = /[\p{L}\p{N}]/u.test(part);
    if (hasLetters) {
      tokens.push({ type: 'word', text: part, wordIndex });
      wordIndex += 1;
    } else {
      tokens.push({ type: 'punct', text: part });
    }
  }
  return { tokens, wordCount: wordIndex };
}

function ensureLineMasks(line) {
  const { wordCount } = tokenizeLine(line.text);
  line.manualMask = adjustMaskLength(line.manualMask, wordCount, false);
  line.autoMaskPercent = adjustMaskLength(line.autoMaskPercent, wordCount, false);
  line.autoMaskLength = adjustMaskLength(line.autoMaskLength, wordCount, false);
}

function adjustMaskLength(mask, length, fill) {
  const next = Array.isArray(mask) ? mask.slice(0, length).map((value) => value === true) : [];
  while (next.length < length) {
    next.push(fill);
  }
  return next;
}

function ensureRevealState() {
  state.reveal.words = state.lines.map((line, index) => {
    const { wordCount } = tokenizeLine(line.text);
    const existing = state.reveal.words[index] || [];
    return adjustMaskLength(existing, wordCount, false);
  });
  if (state.activeLine >= state.lines.length) {
    state.activeLine = Math.max(0, state.lines.length - 1);
  }
}

function resetRevealState() {
  state.reveal.all = false;
  state.reveal.words = state.lines.map((line) => {
    const { wordCount } = tokenizeLine(line.text);
    return new Array(wordCount).fill(false);
  });
}

function parseTimestamp(value) {
  const match = /^(\d+):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match || Number(match[2]) >= 60) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`);
  return Number.isFinite(seconds) ? seconds : null;
}

function formatTimestamp(seconds) {
  const centiseconds = Math.round(seconds * 100);
  return `${formatTime(centiseconds / 100)}.${String(centiseconds % 100).padStart(2, '0')}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getAutoLineIndex(currentTime) {
  const timestamps = getTimestampMap();
  if (timestamps.length === 0) return null;
  let nextIndex = -1;
  for (let i = 0; i < timestamps.length; i += 1) {
    if (currentTime >= timestamps[i].time) {
      nextIndex = timestamps[i].index;
    } else {
      break;
    }
  }
  return nextIndex;
}

function getTimestampMap() {
  return state.lines
    .map((line, index) => ({ index, time: parseTimestamp(line.timestamp) }))
    .filter((item) => item.time !== null && (!hasAudio() || item.time < ui.audioPlayer.duration))
    .sort((a, b) => a.time - b.time);
}

function syncActiveLineToAudio() {
  if (state.mode !== 'game' || !state.syncEnabled || !hasAudio()) return;
  const index = getAutoLineIndex(ui.audioPlayer.currentTime);
  if (index === null || index === state.manualBase) return;
  state.manualBase = null;
  if (index !== state.activeLine) {
    state.activeLine = index;
    renderGame();
  }
}

function updateLyricsTextareaFromLines() {
  state.lyricsRaw = state.lines.map((line) => line.text).join('\n');
  ui.lyricsTextarea.value = state.lyricsRaw;
}

function segmentFromTextarea(silent = false) {
  state.lyricsRaw = ui.lyricsTextarea.value;
  const parts = state.lyricsRaw.split(/\r\n?|\n/).map((text) => text.trim()).filter(Boolean);
  const previous = state.lines;
  let start = 0;
  while (start < parts.length && previous[start]?.text === parts[start]) start += 1;
  let oldEnd = previous.length;
  let newEnd = parts.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1].text === parts[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  if (start !== previous.length || start !== parts.length) {
    invalidateAlignment();
    const middle = previous.slice(start, oldEnd);
    const byText = new Map();
    for (const line of middle) {
      if (!byText.has(line.text)) byText.set(line.text, []);
      byText.get(line.text).push(line);
    }
    const next = parts.slice(start, newEnd).map((text) => {
      const existing = byText.get(text)?.shift();
      if (existing) return existing;
      if (middle.length === 1 && newEnd === start + 1) {
        editLineText(middle[0], text);
        return middle[0];
      }
      return createLine(text);
    });
    state.lines = [...previous.slice(0, start), ...next, ...previous.slice(oldEnd)];
    state.activeLine = 0;
    resetRevealState();
    applyCurrentMaskRule();
    renderAll();
  }
  updatePreparation();
  if (!silent) setStatus(`${state.lines.length} ligne(s) à préparer.`);
}

function editLineText(line, text) {
  const oldWords = tokenizeLine(line.text).tokens.filter((token) => token.type === 'word');
  const newWords = tokenizeLine(text).tokens.filter((token) => token.type === 'word');
  const mask = newWords.map((word, index) => oldWords[index]?.text === word.text && !!line.manualMask[index]);
  for (let i = 1; i <= Math.min(oldWords.length, newWords.length); i += 1) {
    if (oldWords.at(-i).text !== newWords.at(-i).text) break;
    mask[mask.length - i] = !!line.manualMask[oldWords.length - i];
  }
  line.text = text;
  line.manualMask = mask;
  ensureLineMasks(line);
}

function applyCurrentMaskRule() {
  if (state.maskMode === 'percent') {
    applyPercentRule(state.maskPercent);
  } else if (state.maskMode === 'length') {
    applyLengthRule(state.maskMinLength);
  } else {
    state.lines.forEach(ensureLineMasks);
  }
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function applyPercentRule(percent) {
  const ratio = Math.min(Math.max(percent, 0), 100) / 100;
  state.lines.forEach((line) => {
    const { wordCount } = tokenizeLine(line.text);
    const mask = new Array(wordCount).fill(false);
    const countToMask = Math.round(wordCount * ratio);
    const indices = Array.from({ length: wordCount }, (_, i) => i);
    const rand = seededRandom(hashString(line.text));
    for (let i = 0; i < countToMask && indices.length > 0; i += 1) {
      const pick = Math.floor(rand() * indices.length);
      const wordIndex = indices.splice(pick, 1)[0];
      mask[wordIndex] = true;
    }
    line.autoMaskPercent = mask;
    line.autoMaskLength = adjustMaskLength(line.autoMaskLength, wordCount, false);
    line.manualMask = adjustMaskLength(line.manualMask, wordCount, false);
  });
  resetRevealState();
}

function wordCharCount(text) {
  const matches = text.match(/[\p{L}\p{N}]/gu);
  return matches ? matches.length : text.length;
}

function applyLengthRule(minLength) {
  state.lines.forEach((line) => {
    const { tokens, wordCount } = tokenizeLine(line.text);
    const mask = new Array(wordCount).fill(false);
    tokens.forEach((token) => {
      if (token.type === 'word') {
        const length = wordCharCount(token.text);
        if (length > minLength) {
          mask[token.wordIndex] = true;
        }
      }
    });
    line.autoMaskLength = mask;
    line.autoMaskPercent = adjustMaskLength(line.autoMaskPercent, wordCount, false);
    line.manualMask = adjustMaskLength(line.manualMask, wordCount, false);
  });
  resetRevealState();
}

function getActiveMask(line) {
  if (state.maskMode === 'percent') return line.autoMaskPercent;
  if (state.maskMode === 'length') return line.autoMaskLength;
  return line.manualMask;
}

function isWordMasked(lineIndex, wordIndex) {
  const line = state.lines[lineIndex];
  if (!line) return false;
  if (line.lineHidden) return true;
  const mask = getActiveMask(line);
  return !!mask[wordIndex];
}

function toggleWordMask(lineIndex, wordIndex, button) {
  const line = state.lines[lineIndex];
  if (!line) return;
  if (state.maskMode !== 'manual') {
    state.lines.forEach((item) => { item.manualMask = [...getActiveMask(item)]; });
    state.maskMode = 'manual';
    syncMaskModeUI();
    setStatus('Règle convertie en masques manuels pour pouvoir ajuster les mots.');
  }
  const wasHidden = line.lineHidden;
  if (wasHidden) {
    line.manualMask.fill(true);
    line.lineHidden = false;
  }
  line.manualMask[wordIndex] = !line.manualMask[wordIndex];
  updateWordButton(button, line.manualMask[wordIndex]);
  if (wasHidden) {
    renderLineList();
    ui.lineList.querySelectorAll('.line-card')[lineIndex]?.querySelectorAll('.word')[wordIndex]?.focus();
  }
  resetRevealState();
  renderGame();
  updatePreparation();
}

function mergeLines(targetIndex, sourceIndex) {
  const target = state.lines[targetIndex];
  const source = state.lines[sourceIndex];
  if (!target || !source) return;
  const mergedText = [target.text, source.text].filter(Boolean).join(' ').trim();
  const combinedManual = [target, source].flatMap((line) => line.manualMask.map((masked) => line.lineHidden || masked));
  const combinedPercent = target.autoMaskPercent.concat(source.autoMaskPercent);
  const combinedLength = target.autoMaskLength.concat(source.autoMaskLength);
  const mergedLine = {
    text: mergedText,
    manualMask: combinedManual,
    autoMaskPercent: combinedPercent,
    autoMaskLength: combinedLength,
    lineHidden: target.lineHidden && source.lineHidden,
    timestamp: target.timestamp || source.timestamp || ''
  };
  ensureLineMasks(mergedLine);
  invalidateAlignment();
  state.lines.splice(targetIndex, 1, mergedLine);
  state.lines.splice(sourceIndex, 1);
  updateLyricsTextareaFromLines();
  applyCurrentMaskRule();
  resetRevealState();
  renderAll();
}

function splitLine(lineIndex, cursorPosition) {
  const line = state.lines[lineIndex];
  if (!line) return;
  const text = line.text;
  const positions = [...text.matchAll(/\s+/g)]
    .map((match) => match.index)
    .filter((position) => text.slice(0, position).trim() && text.slice(position).trim());
  if (!positions.length) return;
  const cursor = cursorPosition > 0 && cursorPosition < text.length ? cursorPosition : text.length / 2;
  const pos = positions.reduce((best, position) => Math.abs(position - cursor) < Math.abs(best - cursor) ? position : best);
  const leftText = text.slice(0, pos).trimEnd();
  const rightText = text.slice(pos).trimStart();

  const { tokens } = tokenizeLine(text);
  let splitWordIndex = 0;
  let charCount = 0;
  tokens.forEach((token) => {
    const tokenLength = token.text.length;
    if (token.type === 'word') {
      if (charCount + tokenLength <= pos) {
        splitWordIndex = token.wordIndex + 1;
      }
    }
    charCount += tokenLength;
  });

  const leftLine = {
    text: leftText,
    manualMask: line.manualMask.slice(0, splitWordIndex),
    autoMaskPercent: line.autoMaskPercent.slice(0, splitWordIndex),
    autoMaskLength: line.autoMaskLength.slice(0, splitWordIndex),
    lineHidden: line.lineHidden,
    timestamp: line.timestamp
  };
  const rightLine = {
    text: rightText,
    manualMask: line.manualMask.slice(splitWordIndex),
    autoMaskPercent: line.autoMaskPercent.slice(splitWordIndex),
    autoMaskLength: line.autoMaskLength.slice(splitWordIndex),
    lineHidden: line.lineHidden,
    timestamp: ''
  };
  ensureLineMasks(leftLine);
  ensureLineMasks(rightLine);

  invalidateAlignment();
  state.lines.splice(lineIndex, 1, leftLine, rightLine);
  updateLyricsTextareaFromLines();
  applyCurrentMaskRule();
  resetRevealState();
  renderAll();
}

function deleteLine(lineIndex) {
  if (!state.lines[lineIndex]) return;
  invalidateAlignment();
  state.lines.splice(lineIndex, 1);
  updateLyricsTextareaFromLines();
  applyCurrentMaskRule();
  resetRevealState();
  renderAll();
}

const expandedLines = new WeakSet();

function renderLineList() {
  const scroll = ui.lineList.scrollTop;
  ui.lineList.replaceChildren();
  if (!state.lines.length) {
    const empty = document.createElement('div');
    empty.className = 'line-empty';
    empty.textContent = 'Les lignes apparaîtront ici après l’ajout des paroles.';
    ui.lineList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.lines.forEach((line, index) => {
    const card = document.createElement('article');
    card.className = `line-card${line.lineHidden ? ' hidden' : ''}`;
    const meta = document.createElement('div');
    meta.className = 'line-meta';
    const label = document.createElement('span');
    label.className = 'line-index';
    label.textContent = `Ligne ${index + 1}`;

    const proposal = state.suggestions?.get(line);
    if (proposal && !line.timestamp) {
      card.classList.add('suggested');
      const hint = document.createElement('span');
      hint.className = 'suggestion';
      hint.textContent = `Proposé ${proposal}`;
      meta.appendChild(label);
      meta.appendChild(hint);
    } else {
      meta.appendChild(label);
    }

    const missing = document.createElement('span');
    missing.className = 'missing-label';
    missing.textContent = 'Sans repère';
    meta.appendChild(missing);

    const time = document.createElement('input');
    time.className = 'timestamp-input';
    time.placeholder = 'mm:ss.cc';
    time.setAttribute('aria-label', `Repère de la ligne ${index + 1}`);
    time.value = line.timestamp;
    const seek = lineButton('Écouter', () => {
      ui.audioPlayer.currentTime = parseTimestamp(line.timestamp);
      ui.audioPlayer.play().catch(() => setStatus('Impossible de lire ce fichier audio.', 'error'));
    });
    seek.dataset.audioAction = 'seek';
    seek.title = 'Écouter à partir de ce repère';
    const mark = lineButton('Marquer', () => {
      time.value = formatTimestamp(ui.audioPlayer.currentTime);
      time.dispatchEvent(new Event('input'));
      setStatus(`Ligne ${index + 1} marquée à ${time.value}.`);
      if (state.markingLine === line) {
        const next = state.lines.findIndex((item, i) => i > index && !item.timestamp.trim());
        state.markingLine = next < 0 ? null : state.lines[next];
        ui.lineList.children[next]?.querySelector('[data-audio-action="mark"]').focus();
      }
    });
    mark.dataset.audioAction = 'mark';
    mark.title = 'Utiliser la position de lecture actuelle';
    const listenPrevious = lineButton('Écouter depuis le repère précédent', () => {
      if (!hasAudio()) return;
      const previous = state.lines.slice(0, index).findLast((item) => {
        const position = parseTimestamp(item.timestamp);
        return position !== null && position < ui.audioPlayer.duration;
      });
      cancelDelayedPlayback();
      state.markingLine = line;
      ui.audioPlayer.currentTime = previous ? parseTimestamp(previous.timestamp) : 0;
      ui.audioPlayer.play().catch(() => setStatus('Impossible de lire ce fichier audio.', 'error'));
      mark.focus();
    });
    listenPrevious.dataset.audioAction = 'previous';
    listenPrevious.title = 'Repart du début si aucun repère ne précède cette ligne';

    time.addEventListener('input', () => {
      line.timestamp = time.value;
      card.querySelector('.suggestion')?.remove();
      card.classList.remove('suggested');
      state.suggestions?.delete(line);
      updateLineAudio(card);
      updatePreparation();
    });
    meta.append(time, mark, seek, listenPrevious);

    const preview = document.createElement('div');
    preview.className = 'word-preview';
    renderWordPreview(preview, line, index);

    const details = document.createElement('details');
    details.className = 'options';
    details.open = expandedLines.has(line);
    details.addEventListener('toggle', () => {
      if (details.open) expandedLines.add(line);
      else expandedLines.delete(line);
    });
    const summary = document.createElement('summary');
    summary.textContent = 'Modifier la ligne';

    const lineText = document.createElement('input');
    lineText.className = 'line-text timestamp-input';
    lineText.value = line.text;
    lineText.setAttribute('aria-label', `Texte de la ligne ${index + 1}`);
    lineText.addEventListener('input', () => {
      invalidateAlignment();
      editLineText(line, lineText.value);
      updateLyricsTextareaFromLines();
      applyCurrentMaskRule();
      resetRevealState();
      renderWordPreview(preview, line, index);
      renderGame();
      updatePreparation();
    });

    const controls = document.createElement('div');
    controls.className = 'line-controls';
    const up = lineButton('Fusionner ↑', () => mergeLines(index - 1, index));
    const down = lineButton('Fusionner ↓', () => mergeLines(index, index + 1));
    up.disabled = index === 0;
    down.disabled = index === state.lines.length - 1;
    const split = lineButton('Scinder', () => splitLine(index, lineText.selectionStart));
    split.title = 'Couper au séparateur le plus proche du curseur';
    const hide = lineButton(line.lineHidden ? 'Réafficher la ligne' : 'Masquer la ligne', () => {
      line.lineHidden = !line.lineHidden;
      card.classList.toggle('hidden', line.lineHidden);
      hide.textContent = line.lineHidden ? 'Réafficher la ligne' : 'Masquer la ligne';
      resetRevealState();
      renderWordPreview(preview, line, index);
      renderGame();
    });
    controls.append(up, down, split, hide, lineButton('Supprimer', () => deleteLine(index)));
    details.append(summary, lineText, controls);
    card.append(meta, preview, details);
    updateLineAudio(card);
    fragment.appendChild(card);
  });
  ui.lineList.appendChild(fragment);
  ui.lineList.scrollTop = scroll;
}

function lineButton(label, onClick) {
  const button = document.createElement('button');
  button.className = 'ghost';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function renderWordPreview(preview, line, index) {
  preview.replaceChildren();
  const { tokens } = tokenizeLine(line.text);
  for (const token of tokens) {
    if (token.type !== 'word') {
      preview.append(token.text);
      continue;
    }
    const button = lineButton(token.text, () => toggleWordMask(index, token.wordIndex, button));
    button.className = 'word';
    updateWordButton(button, isWordMasked(index, token.wordIndex));
    preview.appendChild(button);
  }
}

function updateWordButton(button, masked) {
  button.classList.toggle('masked', masked);
  button.setAttribute('aria-pressed', String(masked));
}

function hasAudio() {
  return Number.isFinite(ui.audioPlayer.duration) && ui.audioPlayer.duration > 0 && !ui.audioPlayer.error;
}

function updateLineAudio(card) {
  const input = card.querySelector('.line-meta .timestamp-input');
  const time = parseTimestamp(input.value);
  const valid = time !== null && (!hasAudio() || time < ui.audioPlayer.duration);
  const missing = !input.value.trim();
  card.classList.toggle('missing-cue', missing);
  card.querySelector('.missing-label').hidden = !missing;
  const listenPrevious = card.querySelector('[data-audio-action="previous"]');
  listenPrevious.hidden = !missing;
  listenPrevious.disabled = !hasAudio();
  input.setAttribute('aria-invalid', String(!!input.value.trim() && !valid));
  input.title = valid || !input.value.trim() ? 'Début de la ligne, par exemple 01:23.45' : 'Repère invalide ou hors du morceau';
  card.querySelector('[data-audio-action="seek"]').disabled = !hasAudio() || !valid;
  card.querySelector('[data-audio-action="mark"]').disabled = !hasAudio() || ui.audioPlayer.currentTime >= ui.audioPlayer.duration;
}

function updatePreparation() {
  const count = state.lines.length;
  const timed = getTimestampMap().length;
  const pendingText = ui.lyricsTextarea.value !== state.lyricsRaw;
  ui.lineCount.textContent = pendingText ? 'Paroles à actualiser' : count ? `${count} ligne${count > 1 ? 's' : ''} · ${timed} repère${timed > 1 ? 's' : ''}` : 'Aucune ligne';
  const name = state.projectPath?.split('/').pop().replace(/\.json$/i, '') || 'Nouveau projet';
  ui.projectLabel.textContent = name;
  ui.projectLabel.title = state.projectPath || name;
  ui.segmentBtn.hidden = state.autoSegment;
  ui.segmentBtn.disabled = !pendingText;
  ui.lineList.inert = pendingText;
  ui.gameModeBtn.disabled = count === 0 && !pendingText;
  ui.autoAlignBtn.disabled = !hasAudio() || (!count && !pendingText) || state.alignmentRunning;
  ui.cancelAlignBtn.hidden = !state.alignmentRunning;
  ui.applyAlignBtn.hidden = !state.suggestions?.size;
  ui.undoAlignBtn.hidden = !state.lastAlignment?.size;
  ui.saveProjectBtn.disabled = state.saving;
  ui.saveAsProjectBtn.disabled = state.saving;
  ui.newProjectBtn.disabled = state.saving;
  ui.openProjectBtn.disabled = state.saving;
}

function invalidateAlignment() {
  state.suggestions = null;
  state.lastAlignment = null;
  ui.alignmentStatus.textContent = state.alignmentRunning
    ? 'Le projet a changé. Le résultat de l’analyse sera ignoré.'
    : 'Dans la webapp, utilisez les repères manuels.';
  for (const card of ui.lineList.querySelectorAll('.suggested')) {
    card.classList.remove('suggested');
    card.querySelector('.suggestion')?.remove();
  }
}

async function suggestAlignment() {
  if (state.alignmentRunning || !hasAudio()) return;
  if (ui.lyricsTextarea.value !== state.lyricsRaw) segmentFromTextarea(true);
  if (!state.lines.length) return;
  if (state.lines.every((line) => line.timestamp.trim())) {
    ui.alignmentStatus.textContent = 'Toutes les lignes ont déjà un repère. Effacez les repères à recalculer.';
    return;
  }

  state.suggestions = null;
  state.alignmentRunning = true;
  ui.audioPlayer.pause();
  cancelDelayedPlayback();
  const original = state.lines;
  const lines = original.map((line) => line.text);
  const audioPath = state.audioPath;
  const audioLoad = state.audioLoad;
  const duration = ui.audioPlayer.duration;
  const timestamps = original.map((line) => line.timestamp);
  const anchors = timestamps.map((timestamp) => {
    const time = parseTimestamp(timestamp);
    return time !== null && time < duration ? time : null;
  });
  ui.alignmentStatus.textContent = 'Analyse en cours. KaraK réécoute ensuite les passages où il manque des repères.';
  renderAll();
  try {
    const { times, canceled, error } = await window.api.alignAudio({ audioPath, lines, anchors, duration, language: ui.alignmentLanguage.value });
    if (canceled) {
      ui.alignmentStatus.textContent = 'Analyse annulée.';
    } else if (state.audioLoad !== audioLoad || state.lines !== original || original.some((line, i) => line.text !== lines[i] || line.timestamp !== timestamps[i])) {
      ui.alignmentStatus.textContent = 'Le projet a changé pendant l’analyse. Relancez-la si nécessaire.';
    } else if (error) {
      ui.alignmentStatus.textContent = error;
    } else {
      const proposed = new Map();
      times.forEach((value, i) => {
        if (value !== null && value < duration && !original[i].timestamp.trim()) {
          proposed.set(original[i], formatTimestamp(value));
        }
      });
      state.suggestions = proposed;
      ui.alignmentStatus.textContent = proposed.size
        ? `${proposed.size} repère(s) proposé(s) sur ${lines.length} lignes. Appliquez-les puis vérifiez à l’écoute.`
        : 'Aucun nouveau repère fiable. Vérifiez la langue et les paroles, ou marquez les débuts à l’écoute.';
      renderLineList();
    }
  } catch {
    ui.alignmentStatus.textContent = 'Impossible de lancer l’analyse audio.';
  } finally {
    state.alignmentRunning = false;
    updatePreparation();
  }
}

function applyAlignment() {
  if (!state.suggestions?.size) return;
  state.lastAlignment = new Map();
  for (const [line, timestamp] of state.suggestions) {
    if (line.timestamp.trim()) continue;
    state.lastAlignment.set(line, { before: line.timestamp, after: timestamp });
    line.timestamp = timestamp;
  }
  state.suggestions = null;
  state.syncEnabled = true;
  ui.alignmentStatus.textContent = `${state.lastAlignment.size} repère(s) ajouté(s). Ajustez-les avec « Écouter » et « Marquer ».`;
  renderAll();
}

function undoAlignment() {
  for (const [line, { before, after }] of state.lastAlignment || []) {
    if (line.timestamp === after) line.timestamp = before;
  }
  state.lastAlignment = null;
  if (!getTimestampMap().length) state.syncEnabled = false;
  ui.alignmentStatus.textContent = 'Repères automatiques retirés.';
  renderAll();
}

function maskWordDisplay(text) {
  if (!text) return '';
  const replaced = text.replace(/[\p{L}\p{N}]/gu, '_');
  return replaced;
}

function buildGameLine(lineIndex) {
  const line = state.lines[lineIndex];
  if (!line) return '';
  const { tokens } = tokenizeLine(line.text);
  const fragment = document.createElement('span');
  tokens.forEach((token) => {
    if (token.type === 'space') {
      fragment.appendChild(document.createTextNode(token.text));
      return;
    }
    if (token.type === 'punct') {
      const span = document.createElement('span');
      span.className = 'punct';
      span.textContent = token.text;
      fragment.appendChild(span);
      return;
    }
    const span = document.createElement('span');
    const baseMasked = isWordMasked(lineIndex, token.wordIndex);
    const revealed = state.reveal.all || state.reveal.words[lineIndex]?.[token.wordIndex];
    if (baseMasked && !revealed) {
      span.className = 'masked';
      span.textContent = maskWordDisplay(token.text);
    } else {
      span.textContent = token.text;
    }
    fragment.appendChild(span);
  });
  return fragment;
}

function renderGame() {
  ensureRevealState();
  const active = state.activeLine;
  ui.gameProgress.textContent = active < 0 ? 'Introduction' : `Ligne ${active + 1} / ${state.lines.length}`;
  ui.prevLineBtn.disabled = active <= 0;
  ui.nextLineBtn.disabled = active >= state.lines.length - 1;
  ui.revealWordBtn.disabled = active < 0 || state.reveal.all;
  const prevIndex = active - 1;
  const nextIndex = state.activeLine + 1;

  ui.gamePrevLine.innerHTML = '';
  ui.gameActiveLine.innerHTML = '';
  ui.gameNextLine.innerHTML = '';

  if (state.lines[prevIndex]) {
    ui.gamePrevLine.appendChild(buildGameLine(prevIndex));
  }
  if (active < 0) ui.gameActiveLine.textContent = '♪';
  if (state.lines[state.activeLine]) {
    ui.gameActiveLine.appendChild(buildGameLine(state.activeLine));
  }
  if (state.lines[nextIndex]) {
    ui.gameNextLine.appendChild(buildGameLine(nextIndex));
  }
}

function renderAll() {
  renderLineList();
  renderGame();
  updateModeButtons();
  syncMaskModeUI();
  updateAudioUI();
  updatePreparation();
}

function syncMaskModeUI() {
  ui.maskManual.checked = state.maskMode === 'manual';
  ui.maskPercent.checked = state.maskMode === 'percent';
  ui.maskLength.checked = state.maskMode === 'length';
  ui.maskPercentInput.value = String(state.maskPercent ?? 40);
  ui.maskLengthInput.value = String(state.maskMinLength ?? 6);
  ui.autoSegmentToggle.checked = !!state.autoSegment;
  ui.syncToggle.checked = !!state.syncEnabled;
  ui.audioLatencyInput.value = state.audioLatencyMs;
}

function updateModeButtons() {
  ui.editModeBtn.classList.toggle('active', state.mode === 'edit');
  ui.gameModeBtn.classList.toggle('active', state.mode === 'game');
  ui.editModeSection.classList.toggle('active', state.mode === 'edit');
  ui.gameModeSection.classList.toggle('active', state.mode === 'game');
  document.body.classList.toggle('game-view', state.mode === 'game');
}

function updateAudioUI() {
  const { duration, currentTime, paused } = ui.audioPlayer;
  const ready = hasAudio();
  const audioName = state.audioPath?.split('/').pop() || 'Aucun fichier audio';
  ui.audioPathLabel.textContent = audioName;
  ui.audioPathLabel.title = state.audioPath || audioName;
  const action = state.playDelayTimer ? 'Annuler le départ' : paused ? 'Lire' : 'Pause';
  ui.playPauseBtn.textContent = action;
  ui.gamePlayBtn.firstChild.textContent = `${action} `;
  ui.playPauseBtn.disabled = ui.gamePlayBtn.disabled = !ready;
  ui.audioTime.textContent = ui.gameTime.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  for (const slider of [ui.audioScrub, ui.gameScrub]) {
    slider.disabled = !ready;
    slider.max = ready ? duration : 0;
    slider.value = ready ? currentTime : 0;
  }
}

function setActiveLine(delta) {
  if (!state.lines.length) return;
  const nextLine = clamp(state.activeLine + delta, 0, state.lines.length - 1);
  if (state.syncEnabled && hasAudio() && nextLine !== state.activeLine) {
    const target = parseTimestamp(state.lines[nextLine].timestamp);
    if (target !== null && target < ui.audioPlayer.duration) {
      ui.audioPlayer.currentTime = target;
    }
    state.manualBase = getAutoLineIndex(ui.audioPlayer.currentTime);
  }
  state.activeLine = nextLine;
  renderGame();
}

function revealNext() {
  if (state.lines.length === 0) return;
  if (state.reveal.all) return;
  const lineIndex = state.activeLine;
  const line = state.lines[lineIndex];
  if (!line) return;
  const { wordCount } = tokenizeLine(line.text);
  const revealLine = state.reveal.words[lineIndex];
  for (let i = 0; i < wordCount; i += 1) {
    if (isWordMasked(lineIndex, i) && !revealLine[i]) {
      revealLine[i] = true;
      renderGame();
      return;
    }
  }
  for (let i = 0; i < wordCount; i += 1) {
    revealLine[i] = true;
  }
  renderGame();
}

function revealAll() {
  state.reveal.all = true;
  renderGame();
}

function remaskAll() {
  resetRevealState();
  renderGame();
}

function maskAllManual() {
  state.maskMode = 'manual';
  ui.maskManual.checked = true;
  state.lines.forEach((line) => {
    ensureLineMasks(line);
    line.manualMask = line.manualMask.map(() => true);
    line.lineHidden = false;
  });
  resetRevealState();
  renderAll();
}

function unmaskAllManual() {
  state.maskMode = 'manual';
  ui.maskManual.checked = true;
  state.lines.forEach((line) => {
    ensureLineMasks(line);
    line.manualMask = line.manualMask.map(() => false);
    line.lineHidden = false;
  });
  resetRevealState();
  renderAll();
}

function cancelDelayedPlayback() {
  clearTimeout(state.playDelayTimer);
  state.playDelayTimer = null;
}

function togglePlayback() {
  if (!hasAudio()) return;
  if (state.playDelayTimer) {
    cancelDelayedPlayback();
    setStatus('Départ annulé.');
  } else if (!ui.audioPlayer.paused) {
    ui.audioPlayer.pause();
  } else {
    const play = () => {
      state.playDelayTimer = null;
      setStatus('');
      ui.audioPlayer.play().catch(() => setStatus('Impossible de lire le fichier audio.', 'error'));
      updateAudioUI();
    };
    if (state.audioLatencyMs > 0) {
      setStatus(`Lecture dans ${state.audioLatencyMs} ms.`);
      state.playDelayTimer = setTimeout(play, state.audioLatencyMs);
    } else {
      play();
    }
  }
  updateAudioUI();
}

async function loadAudio(filePath) {
  const generation = ++state.audioLoad;
  state.markingLine = null;
  invalidateAlignment();
  cancelDelayedPlayback();
  ui.audioPlayer.pause();
  ui.audioPlayer.removeAttribute('src');
  ui.audioPlayer.load();
  state.audioPath = filePath;
  state.manualBase = null;
  refreshAudioControls();
  if (!filePath) return;

  try {
    const url = await window.api.audioURL(filePath);
    if (state.audioLoad === generation && url) ui.audioPlayer.src = url;
    else if (state.audioLoad === generation) { state.audioPath = ''; setStatus('Réimportez le fichier audio associé à ce projet.', 'warning'); refreshAudioControls(); }
  } catch {
    if (state.audioLoad === generation) setStatus('Impossible de charger l’audio.', 'error');
  }
}

function refreshAudioControls() {
  updateAudioUI();
  ui.lineList.querySelectorAll('.line-card').forEach(updateLineAudio);
  updatePreparation();
}

function buildProjectData() {
  return {
    version: 1,
    audioPath: state.audioPath || '',
    audioLatencyMs: Number(state.audioLatencyMs) || 0,
    lyricsRaw: state.lyricsRaw || '',
    maskMode: state.maskMode,
    maskPercent: Number(state.maskPercent) || 0,
    maskMinLength: Number(state.maskMinLength) || 0,
    activeLine: Math.max(0, state.activeLine),
    syncEnabled: state.syncEnabled,
    lines: state.lines.map((line) => ({
      text: line.text,
      manualMask: line.manualMask,
      autoMaskPercent: line.autoMaskPercent,
      autoMaskLength: line.autoMaskLength,
      lineHidden: line.lineHidden,
      timestamp: line.timestamp || ''
    }))
  };
}

function normalizeNumber(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(Math.round(value), min, max)
    : fallback;
}

function loadProjectData(data, projectPath = null) {
  if (!data || !Array.isArray(data.lines) || data.lines.some((line) => typeof line?.text !== 'string')) {
    throw new Error('Le projet ne contient pas de lignes valides.');
  }
  if (state.alignmentRunning) window.api.cancelAlignment().catch(() => {});
  state.projectPath = projectPath;
  state.audioLatencyMs = normalizeNumber(data.audioLatencyMs, 0, 0, 60000);
  state.maskMode = ['manual', 'percent', 'length'].includes(data.maskMode) ? data.maskMode : 'manual';
  state.maskPercent = normalizeNumber(data.maskPercent, 40, 0, 100);
  state.maskMinLength = normalizeNumber(data.maskMinLength, 6, 1, Number.MAX_SAFE_INTEGER);
  state.lines = normalizeLines(data.lines);
  state.lyricsRaw = typeof data.lyricsRaw === 'string' ? data.lyricsRaw : state.lines.map((line) => line.text).join('\n');
  ui.lyricsTextarea.value = state.lyricsRaw;
  state.activeLine = normalizeNumber(data.activeLine, 0, 0, Math.max(0, state.lines.length - 1));
  state.syncEnabled = typeof data.syncEnabled === 'boolean'
    ? data.syncEnabled
    : state.lines.some((line) => parseTimestamp(line.timestamp) !== null);
  resetRevealState();
  applyCurrentMaskRule();
  loadAudio(typeof data.audioPath === 'string' ? data.audioPath : '');
  renderAll();
  state.cleanProject = projectSnapshot();
}

function projectSnapshot(data = buildProjectData()) {
  const { activeLine, ...content } = data;
  return JSON.stringify({ ...content, lyricsRaw: ui.lyricsTextarea.value });
}

function isDirty() {
  return state.cleanProject !== projectSnapshot();
}

function confirmDiscard() {
  return !isDirty() || window.confirm('Abandonner les modifications non enregistrées ?');
}

async function saveProject(saveAs) {
  if (state.saving) return;
  if (ui.lyricsTextarea.value !== state.lyricsRaw) segmentFromTextarea(true);
  const data = buildProjectData();
  const snapshot = projectSnapshot(data);
  state.saving = true;
  updatePreparation();
  try {
    const filePath = saveAs
      ? await window.api.saveProjectAs(data)
      : await window.api.saveProject(data, state.projectPath);
    if (filePath) {
      state.projectPath = filePath;
      state.cleanProject = snapshot;
      setStatus('Projet enregistré.');
    }
  } catch {
    setStatus('Impossible d’enregistrer le projet. Vérifiez l’accès au dossier.', 'error');
  } finally {
    state.saving = false;
    updatePreparation();
  }
}

function enterMode(mode) {
  if (mode === 'game') {
    if (ui.lyricsTextarea.value !== state.lyricsRaw) segmentFromTextarea(true);
    if (!state.lines.length) return;
    resetRevealState();
    state.manualBase = null;
    state.activeLine = Math.max(0, state.activeLine);
    setStatus('');
  } else {
    cancelDelayedPlayback();
    ui.audioPlayer.pause();
    window.api.setFullscreen(false).catch(() => {});
  }
  state.mode = mode;
  updateModeButtons();
  syncActiveLineToAudio();
  renderGame();
  updateAudioUI();
  const target = mode === 'game' ? ui.gameModeSection : ui.gameModeBtn;
  target.focus();
}

function handleKeyboard(event) {
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === 's') {
    event.preventDefault();
    saveProject(event.shiftKey);
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
  const isTyping = ['INPUT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable;
  if (state.mode !== 'game') return;
  if (key === 'escape') {
    event.preventDefault();
    enterMode('edit');
    return;
  }
  if (isTyping || (key === ' ' && event.target.tagName === 'BUTTON')) return;

  if (key === ' ') {
    event.preventDefault();
    togglePlayback();
  } else if (key === 'arrowleft') {
    event.preventDefault();
    setActiveLine(-1);
  } else if (key === 'arrowright') {
    event.preventDefault();
    setActiveLine(1);
  } else if (key === 'r') {
    event.preventDefault();
    revealNext();
  } else if (key === 't') {
    event.preventDefault();
    revealAll();
  } else if (key === 'h') {
    event.preventDefault();
    remaskAll();
  } else if (key === 'f') {
    event.preventDefault();
    window.api.toggleFullscreen().catch(() => {});
  }
}

function bindEvents() {
  ui.newProjectBtn.addEventListener('click', () => {
    if (!confirmDiscard()) return;
    loadProjectData({ lines: [] });
    setStatus('Nouveau projet prêt.');
  });

  ui.openProjectBtn.addEventListener('click', async () => {
    try {
      const result = await window.api.openProject();
      if (!result || !confirmDiscard()) return;
      const project = { ...result.data };
      const audioName = project.audioPath?.split(/[\\/]/).pop();
      project.audioPath = '';
      loadProjectData(project, result.path);
      setStatus(audioName ? `Projet chargé. Choisissez à nouveau l’audio : ${audioName}.` : 'Projet chargé.');
    } catch {
      setStatus('Impossible d’ouvrir ce projet. Vérifiez le fichier JSON.', 'error');
    }
  });

  ui.saveProjectBtn.addEventListener('click', () => saveProject(false));
  ui.saveAsProjectBtn.addEventListener('click', () => saveProject(true));

  ui.editModeBtn.addEventListener('click', () => enterMode('edit'));
  ui.gameModeBtn.addEventListener('click', () => enterMode('game'));
  ui.fullscreenBtn.addEventListener('click', () => window.api.toggleFullscreen().catch(() => {}));
  ui.prevLineBtn.addEventListener('click', () => setActiveLine(-1));
  ui.nextLineBtn.addEventListener('click', () => setActiveLine(1));
  ui.revealWordBtn.addEventListener('click', revealNext);
  ui.gameRevealAllBtn.addEventListener('click', revealAll);
  ui.gameRemaskBtn.addEventListener('click', remaskAll);

  ui.autoAlignBtn.addEventListener('click', suggestAlignment);
  ui.cancelAlignBtn.addEventListener('click', () => window.api.cancelAlignment().catch(() => {}));
  ui.applyAlignBtn.addEventListener('click', applyAlignment);
  ui.undoAlignBtn.addEventListener('click', undoAlignment);

  ui.loadAudioBtn.addEventListener('click', async () => {
    try {
      const filePath = await window.api.openAudio();
      if (!filePath) return;
      loadAudio(filePath);
      setStatus('Chargement de l’audio…');
    } catch {
      setStatus('Impossible de charger l’audio.', 'error');
    }
  });

  ui.playPauseBtn.addEventListener('click', togglePlayback);
  ui.gamePlayBtn.addEventListener('click', togglePlayback);

  ui.audioLatencyInput.addEventListener('input', () => {
    state.audioLatencyMs = normalizeNumber(ui.audioLatencyInput.valueAsNumber, 0, 0, 60000);
  });
  ui.audioLatencyInput.addEventListener('change', () => {
    ui.audioLatencyInput.value = state.audioLatencyMs;
  });

  ui.audioPlayer.addEventListener('timeupdate', () => {
    updateAudioUI();
    syncActiveLineToAudio();
  });
  ui.audioPlayer.addEventListener('loadedmetadata', () => {
    refreshAudioControls();
    syncActiveLineToAudio();
    setStatus('Audio prêt.');
  });
  ui.audioPlayer.addEventListener('play', updateAudioUI);
  ui.audioPlayer.addEventListener('pause', updateAudioUI);
  ui.audioPlayer.addEventListener('ended', refreshAudioControls);
  ui.audioPlayer.addEventListener('seeking', () => {
    ui.lineList.querySelectorAll('.line-card').forEach(updateLineAudio);
  });
  ui.audioPlayer.addEventListener('error', () => {
    refreshAudioControls();
    if (state.audioPath) setStatus('Audio introuvable ou illisible. Choisissez à nouveau le fichier audio.', 'error');
  });

  ui.syncToggle.addEventListener('change', () => {
    state.syncEnabled = ui.syncToggle.checked;
    state.manualBase = null;
    if (state.syncEnabled && !getTimestampMap().length) {
      setStatus('Ajoutez au moins un repère pour que la projection suive l’audio.', 'warning');
    }
  });

  for (const slider of [ui.audioScrub, ui.gameScrub]) {
    slider.addEventListener('input', () => {
      if (!hasAudio()) return;
      state.manualBase = null;
      ui.audioPlayer.currentTime = slider.valueAsNumber;
      updateAudioUI();
      syncActiveLineToAudio();
    });
  }

  ui.importTextBtn.addEventListener('click', async () => {
    try {
      const result = await window.api.openText();
      if (!result) return;
      if (ui.lyricsTextarea.value.trim() && !window.confirm('Remplacer les paroles actuelles par ce fichier ?')) return;
      ui.lyricsTextarea.value = result.text;
      if (state.autoSegment) segmentFromTextarea(true);
      updatePreparation();
      setStatus('Paroles importées.');
    } catch {
      setStatus('Impossible d’importer le texte.', 'error');
    }
  });

  ui.segmentBtn.addEventListener('click', () => segmentFromTextarea());
  ui.clearLyricsBtn.addEventListener('click', () => {
    if (!ui.lyricsTextarea.value && !state.lines.length) return;
    if (!window.confirm('Effacer les paroles, les repères et les masques ?')) return;
    ui.lyricsTextarea.value = '';
    segmentFromTextarea(true);
    setStatus('Paroles effacées.');
  });
  ui.autoSegmentToggle.addEventListener('change', () => {
    state.autoSegment = ui.autoSegmentToggle.checked;
    if (state.autoSegment) segmentFromTextarea(true);
    updatePreparation();
  });
  ui.lyricsTextarea.addEventListener('input', (event) => {
    if (state.autoSegment && !event.isComposing) segmentFromTextarea(true);
    updatePreparation();
  });
  ui.lyricsTextarea.addEventListener('compositionend', () => {
    if (state.autoSegment) segmentFromTextarea(true);
  });

  ui.maskManual.addEventListener('change', () => {
    if (ui.maskManual.checked) {
      state.maskMode = 'manual';
      resetRevealState();
      renderAll();
    }
  });

  ui.maskPercent.addEventListener('change', () => {
    if (ui.maskPercent.checked) {
      state.maskMode = 'percent';
      state.maskPercent = normalizeNumber(ui.maskPercentInput.valueAsNumber, 40, 0, 100);
      applyPercentRule(state.maskPercent);
      renderAll();
    }
  });

  ui.maskPercentInput.addEventListener('input', (event) => {
    state.maskPercent = normalizeNumber(event.target.valueAsNumber, 40, 0, 100);
    if (state.maskMode === 'percent') {
      applyPercentRule(state.maskPercent);
      renderLineList();
      renderGame();
    }
  });

  ui.maskLength.addEventListener('change', () => {
    if (ui.maskLength.checked) {
      state.maskMode = 'length';
      state.maskMinLength = normalizeNumber(ui.maskLengthInput.valueAsNumber, 6, 1, Number.MAX_SAFE_INTEGER);
      applyLengthRule(state.maskMinLength);
      renderAll();
    }
  });

  ui.maskLengthInput.addEventListener('input', (event) => {
    state.maskMinLength = normalizeNumber(event.target.valueAsNumber, 6, 1, Number.MAX_SAFE_INTEGER);
    if (state.maskMode === 'length') {
      applyLengthRule(state.maskMinLength);
      renderLineList();
      renderGame();
    }
  });

  ui.maskAllBtn.addEventListener('click', maskAllManual);
  ui.revealAllBtn.addEventListener('click', unmaskAllManual);

  for (const field of [ui.maskPercentInput, ui.maskLengthInput]) {
    field.addEventListener('change', syncMaskModeUI);
  }
  document.addEventListener('keydown', handleKeyboard);
  window.addEventListener('beforeunload', (event) => {
    if (isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

function init() {
  state.lines = [];
  resetRevealState();
  bindEvents();
  renderAll();
  state.cleanProject = projectSnapshot();
}

init();
