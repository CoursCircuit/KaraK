const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const run = promisify(execFile);

function words(text) {
  return text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss').match(/[\p{L}\p{N}]+/gu) || [];
}

// Align the supplied words to recognized words in song order. Consecutive
// matches beat isolated common words, and omitted lyrics stay unmatched.
function matchLines(lines, transcription, retry = false) {
  const expected = lines.flatMap((line, index) => words(line).map((word) => ({ word, index })));
  const heard = transcription.flatMap((segment) => {
    const start = segment.offsets?.from / 1000;
    const end = segment.offsets?.to / 1000;
    const tokens = words(segment.text);
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end < start) return [];
    return tokens.map((word, i) => ({ word, time: start + (end - start) * i / tokens.length }));
  });
  const width = heard.length + 1;
  if (expected.length * width > 16_000_000) {
    throw new Error('Ce morceau contient trop de mots pour le calage automatique.');
  }

  const steps = new Uint8Array((expected.length + 1) * width);
  let previous = new Int32Array(width);
  let current = new Int32Array(width);
  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= heard.length; j += 1) {
      const cell = i * width + j;
      const same = expected[i - 1].word === heard[j - 1].word;
      const adjacent = steps[cell - width - 1] === 3;
      const match = same ? previous[j - 1] + (adjacent ? 5 : 2) : -1;
      if (match > previous[j] && match > current[j - 1]) {
        current[j] = match;
        steps[cell] = 3;
      } else if (previous[j] >= current[j - 1]) {
        current[j] = previous[j];
        steps[cell] = 1;
      } else {
        current[j] = current[j - 1];
        steps[cell] = 2;
      }
    }
    [previous, current] = [current, previous];
  }

  const matches = lines.map(() => []);
  let i = expected.length;
  let j = heard.length;
  while (i > 0 && j > 0) {
    const step = steps[i * width + j];
    if (step === 3) {
      matches[expected[i - 1].index].push({ expected: i - 1, heard: j - 1 });
      i -= 1;
      j -= 1;
    } else if (step === 1) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return matches.map((entries, index) => {
    const count = words(lines[index]).length;
    const first = entries.at(-1);
    const last = entries[0];
    if (count < 2 || entries.length < Math.max(2, Math.ceil(count * 0.65))) return null;
    const missingStart = first.expected > 0 && expected[first.expected - 1].index === index;
    if (missingStart && (!retry || count < 3 || expected[first.expected - 2]?.index === index)) return null;
    if (last.heard - first.heard + 1 > count + 2) return null;
    if (heard[last.heard].time - heard[first.heard].time > Math.max(5, count * 1.2)) return null;
    if (!missingStart) return heard[first.heard].time;
    const next = entries.at(-2);
    if (next.expected !== first.expected + 1 || next.heard !== first.heard + 1) return null;
    const lead = Math.min(0.8, Math.max(0.15, heard[next.heard].time - heard[first.heard].time));
    return heard[first.heard].time - lead;
  });
}

// If recognition places a cue in a silent gap, move it to the nearby
// audio onset. Music above the threshold keeps the original estimate.
function adjustSilentStarts(wav, times) {
  const frame = 320; // 20 ms at 16 kHz
  let offset = 12;
  while (offset + 8 <= wav.length && wav.toString('ascii', offset, offset + 4) !== 'data') {
    const size = wav.readUInt32LE(offset + 4);
    offset += 8 + size + (size % 2);
  }
  if (offset + 8 > wav.length) return times;
  const start = offset + 8;
  const samples = Math.min(wav.readUInt32LE(offset + 4), wav.length - start) >> 1;
  const audible = (from) => {
    let squareSum = 0;
    for (let i = from; i < from + frame; i += 1) {
      const sample = wav.readInt16LE(start + i * 2);
      squareSum += sample * sample;
    }
    return squareSum / frame > 260 ** 2;
  };
  let next = Infinity;
  return times.reduceRight((adjusted, time, index) => {
    if (time === null) return adjusted;
    const from = Math.floor(time * 16000);
    const limit = Math.min(samples - frame * 2, from + 22400, Math.floor(next * 16000) - frame * 2);
    let position = from;
    while (position <= limit) {
      if (audible(position) && audible(position + frame)) {
        adjusted[index] = Math.max(time, (position - frame) / 16000);
        break;
      }
      position += frame;
    }
    next = time;
    return adjusted;
  }, [...times]);
}

async function fillGaps(lines, times, anchors, duration, recognize, signal) {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const fixed = lines.map((_, index) => {
    const time = anchors[index] ?? times[index];
    return Number.isFinite(time) && time >= 0 && time < duration ? time : null;
  });
  if (fixed.every((time) => time === null)) return;
  let previous = -1;
  for (let next = 0; next <= lines.length; next += 1) {
    if (next < lines.length && fixed[next] === null) continue;
    const lower = previous < 0 ? 0 : fixed[previous];
    const upper = next === lines.length ? duration : fixed[next];
    if (next > previous + 1 && upper - lower >= 1 && upper - lower <= 45) {
      signal.throwIfAborted();
      // Include adjacent lyrics and a little surrounding audio, so a repeated
      // phrase in either anchor does not get assigned to the missing lines.
      const start = Math.max(0, lower - 0.4);
      const end = Math.min(duration, upper + 3);
      const fromLine = Math.max(0, previous);
      const candidates = matchLines(lines.slice(fromLine, next + 1), await recognize(start, end), true);
      let lastTime = previous < 0 ? -0.05 : lower;
      for (let i = previous + 1; i < next; i += 1) {
        const candidate = candidates[i - fromLine];
        if (candidate !== null && candidate >= 0 && candidate > lastTime + 0.04 && candidate < upper - 0.04) {
          times[i] = candidate;
          lastTime = candidate;
        }
      }
    }
    previous = next;
  }
}

async function alignAudio({ audioPath, lines, language, anchors = [], duration, resources, signal }) {
  if (!['auto', 'de', 'fr', 'en', 'it', 'es'].includes(language)) throw new Error('Langue inconnue.');
  if (!Array.isArray(lines) || !lines.length || lines.some((line) => typeof line !== 'string')) {
    throw new Error('Ajoutez les paroles avant le calage.');
  }

  const engine = path.join(resources, 'whisper-cli');
  const model = path.join(resources, 'ggml-large-v3-turbo-q5_0.bin');
  try {
    await Promise.all([fs.access(engine), fs.access(model)]);
  } catch {
    throw new Error('Le moteur de calage local est absent de cette installation.');
  }

  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'karak-'));
  const wav = path.join(folder, 'audio.wav');
  const output = path.join(folder, 'reperes');
  try {
    try {
      await run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', '--mix', audioPath, wav], { signal });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error('Le calage ne peut pas décoder ce fichier. Essayez une copie WAV ou MP3.');
    }
    const recognize = async (start, end) => {
      const windowArgs = start === undefined ? [] : [
        '-ot', String(Math.floor(start * 1000)),
        '-d', String(Math.ceil((end - start) * 1000)),
        '-mc', '0'
      ];
      try {
        await run(engine, [
          '-m', model, '-f', wav, '-l', language, '-ng', '-t', String(Math.min(6, os.availableParallelism())),
          '-ml', '1', '-sow', '-oj', '-of', output, '-np', ...windowArgs
        ], { signal, maxBuffer: 16 * 1024 * 1024 });
      } catch (error) {
        if (signal.aborted) throw error;
        console.error('Whisper:', error.stderr?.slice(-1500) || error.message);
        throw new Error('L’analyse audio a échoué. Réessayez avec un fichier plus court.');
      }
      const { transcription } = JSON.parse(await fs.readFile(`${output}.json`, 'utf8'));
      return transcription;
    };
    const times = matchLines(lines, await recognize());
    await fillGaps(lines, times, Array.isArray(anchors) ? anchors : [], duration, recognize, signal);
    if (times.every((time) => time === null)) return times;
    const fixed = Array.isArray(anchors) ? anchors : [];
    const adjusted = adjustSilentStarts(await fs.readFile(wav), times.map((time, index) => fixed[index] ?? time));
    return adjusted.map((time, index) => fixed[index] != null ? null : time);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
}

module.exports = { alignAudio, matchLines };
