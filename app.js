const STORAGE_KEY = 'dictation-lab-wordbook';

const SAMPLE_ARTICLE = {
  title: 'The Morning Routine',
  text: `A good morning routine can set the tone for the entire day. Many successful people wake up early and spend the first hour on activities that nourish their mind and body.

Some people begin with light exercise, such as a short walk or stretching. Others prefer to read a few pages of a book or write in a journal. Drinking a glass of water right after waking up helps the body recover from hours of sleep.

The key is consistency. A routine does not need to be long or complicated. Even fifteen minutes of focused activity can make a noticeable difference over time. Start small, stay patient, and let the habit grow naturally.`,
};

const state = {
  title: '',
  text: '',
  sentences: [],
  currentSentenceIndex: 0,
  selectedWord: null,
  currentDefinition: null,
  voices: [],
  isLooping: false,
  playbackId: 0,
  wrongAttempts: 0,
  wordAudioUrl: null,
  isReadingArticle: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function init() {
  bindModeNav();
  bindSetup();
  bindReading();
  bindDictation();
  bindWordbook();
  loadVoices();
  renderWordbook();
  showFileProtocolWarning();

  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function showFileProtocolWarning() {
  if (location.protocol !== 'file:') return;

  const banner = document.createElement('div');
  banner.className = 'file-warning';
  banner.innerHTML = `
    <strong>Word lookup may not work in file mode.</strong>
    Run <code>serve.bat</code> and open <code>http://localhost:8765</code> instead.
  `;
  document.body.prepend(banner);
}

function bindModeNav() {
  $$('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      switchMode(btn.dataset.mode);
    });
  });
}

function switchMode(mode) {
  $$('.mode-btn').forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
  });
  $$('.panel').forEach((panel) => panel.classList.remove('active'));
  $(`#panel-${mode}`).classList.add('active');

  if (mode === 'wordbook') renderWordbook();
  if (mode !== 'dictate') stopPlayback();
  if (mode !== 'read') stopArticleReading();
  if (mode === 'read' && state.text) {
    setTimeout(() => speakArticle(), 350);
  }
}

function enableModes() {
  $$('.mode-btn').forEach((btn) => {
    if (btn.dataset.mode !== 'setup') btn.disabled = false;
  });
}

function bindSetup() {
  $('#load-sample').addEventListener('click', () => {
    $('#article-title').value = SAMPLE_ARTICLE.title;
    $('#article-text').value = SAMPLE_ARTICLE.text;
  });

  $('#start-reading').addEventListener('click', () => {
    const text = $('#article-text').value.trim();
    if (!text) {
      alert('Please paste or type an article first.');
      return;
    }
    state.title = $('#article-title').value.trim() || 'Untitled Article';
    state.text = text;
    state.sentences = splitIntoSentences(text);
    renderArticle();
    enableModes();
    switchMode('read');
  });
}

function splitIntoSentences(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const raw = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
  return raw.map((s) => s.trim()).filter(Boolean);
}

function renderArticle() {
  $('#read-title').textContent = state.title;
  const container = $('#article-content');
  container.innerHTML = '';

  const paragraphs = state.text.split(/\n\s*\n/);
  paragraphs.forEach((para) => {
    const p = document.createElement('p');
    const tokens = para.trim().split(/(\s+)/);
    tokens.forEach((token) => {
      if (/^\s+$/.test(token)) {
        p.appendChild(document.createTextNode(token));
      } else {
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = token;
        span.dataset.word = cleanWord(token);
        span.addEventListener('click', () => onWordClick(span));
        p.appendChild(span);
      }
    });
    container.appendChild(p);
  });
}

function cleanWord(token) {
  return token
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/^[^a-zA-Z'-]+|[^a-zA-Z'-]+$/g, '')
    .toLowerCase();
}

function getLookupCandidates(word) {
  const normalized = word.replace(/[\u2018\u2019\u2032]/g, "'").toLowerCase().trim();
  const candidates = new Set([normalized]);

  if (normalized.endsWith("'s")) {
    candidates.add(normalized.slice(0, -2));
  }

  const contractionSuffixes = ["'re", "'ve", "'ll", "'m", "'d", "'t"];
  contractionSuffixes.forEach((suffix) => {
    if (normalized.endsWith(suffix)) {
      candidates.add(normalized.slice(0, -suffix.length));
    }
  });

  if (normalized.includes("'")) {
    const stem = normalized.split("'")[0];
    if (stem.length >= 2) candidates.add(stem);
  }

  return [...candidates].filter((w) => w.length >= 2);
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function bindReading() {
  $('#go-dictate').addEventListener('click', () => {
    stopArticleReading();
    startDictation();
    switchMode('dictate');
  });

  $('#close-definition').addEventListener('click', () => {
    $('#definition-panel').classList.add('hidden');
    $$('.word.selected').forEach((w) => w.classList.remove('selected'));
    state.selectedWord = null;
    state.wordAudioUrl = null;
  });

  $('#add-to-wordbook').addEventListener('click', addCurrentToWordbook);

  $('#speak-word').addEventListener('click', () => {
    if (state.selectedWord) speakWord(state.selectedWord);
  });

  $('#read-article').addEventListener('click', () => {
    if (state.isReadingArticle) {
      stopArticleReading();
    } else {
      speakArticle();
    }
  });
}

async function onWordClick(span) {
  const word = cleanWord(span.textContent) || span.dataset.word;
  if (!word || word.length < 2) return;

  stopArticleReading();

  $$('.word.selected').forEach((w) => w.classList.remove('selected'));
  span.classList.add('selected');
  state.selectedWord = word;
  state.wordAudioUrl = null;

  const panel = $('#definition-panel');
  panel.classList.remove('hidden');
  $('#def-word').textContent = word;
  $('#def-content').innerHTML = '<p class="def-loading">Looking up definition…</p>';

  speakWord(word);

  const definition = await fetchDefinition(word);
  state.currentDefinition = definition;
  if (definition.audioUrl) state.wordAudioUrl = definition.audioUrl;
  $('#def-content').innerHTML = definition.html;

  const phoneticSpeak = $('#def-content .speak-phonetic');
  if (phoneticSpeak) {
    phoneticSpeak.addEventListener('click', () => speakWord(word));
  }
}

function getEnglishVoice() {
  if (!state.voices.length) {
    state.voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  }
  const preferred = state.voices.filter((v) => v.lang.startsWith('en-US') || v.lang.startsWith('en-GB'));
  const list = preferred.length ? preferred : state.voices;
  return list[0] || null;
}

function speakWord(word) {
  if (!word) return;

  if (state.wordAudioUrl) {
    const audio = new Audio(state.wordAudioUrl);
    audio.play().catch(() => speakText(word, { rate: 0.9 }));
    return;
  }

  speakText(word, { rate: 0.9 });
}

function speakText(text, options = {}) {
  if (!text) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getEnglishVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = 'en-US';
  }
  utterance.rate = options.rate ?? 0.9;
  if (options.onend) utterance.onend = options.onend;
  if (options.onerror) utterance.onerror = options.onerror;
  speechSynthesis.speak(utterance);
  return utterance;
}

function speakArticle() {
  if (!state.text) return;

  speechSynthesis.cancel();
  state.isReadingArticle = true;
  updateArticleSpeakerButton();

  const utterance = new SpeechSynthesisUtterance(state.text);
  const voice = getEnglishVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = 'en-US';
  }
  utterance.rate = 0.9;
  utterance.onend = () => {
    state.isReadingArticle = false;
    updateArticleSpeakerButton();
  };
  utterance.onerror = () => {
    state.isReadingArticle = false;
    updateArticleSpeakerButton();
  };
  speechSynthesis.speak(utterance);
}

function stopArticleReading() {
  if (!state.isReadingArticle && !speechSynthesis.speaking) {
    updateArticleSpeakerButton();
    return;
  }
  state.isReadingArticle = false;
  speechSynthesis.cancel();
  updateArticleSpeakerButton();
}

function updateArticleSpeakerButton() {
  const btn = $('#read-article');
  if (!btn) return;
  if (state.isReadingArticle) {
    btn.textContent = '⏹';
    btn.title = 'Stop reading';
    btn.classList.add('speaking');
  } else {
    btn.textContent = '🔊';
    btn.title = 'Read article aloud';
    btn.classList.remove('speaking');
  }
}

async function fetchFromDictionaryApi(word) {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!res.ok) return null;

  const data = await res.json();
  const entry = data[0];
  let html = '';
  let audioUrl = null;

  const phonetic = entry.phonetic
    || (entry.phonetics || []).find((p) => p.text)?.text
    || '';
  const withAudio = (entry.phonetics || []).find((p) => p.audio);

  if (withAudio?.audio) audioUrl = withAudio.audio;

  if (phonetic) {
    html += `<div class="def-phonetic-row">
      <span class="def-phonetic">${escapeHtml(phonetic)}</span>
      <button type="button" class="speaker-btn speak-phonetic" title="Pronounce word" aria-label="Pronounce word">🔊</button>
    </div>`;
  }

  const meanings = (entry.meanings || []).slice(0, 4);
  meanings.forEach((m) => {
    html += `<div><span class="def-pos">${escapeHtml(m.partOfSpeech || '')}</span></div>`;
    (m.definitions || []).slice(0, 2).forEach((d) => {
      html += `<p class="def-meaning">${escapeHtml(d.definition)}</p>`;
      if (d.example) {
        html += `<p class="def-example">"${escapeHtml(d.example)}"</p>`;
      }
    });
  });

  const plainText = meanings
    .flatMap((m) => (m.definitions || []).map((d) => d.definition))
    .slice(0, 3)
    .join('; ');

  return { html, plainText, audioUrl };
}

async function fetchFromWiktionary(word) {
  const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
  if (!res.ok) return null;

  const data = await res.json();
  const entries = data.en || [];
  if (!entries.length) return null;

  let html = '';
  const plainParts = [];

  entries.slice(0, 4).forEach((entry) => {
    html += `<div><span class="def-pos">${escapeHtml(entry.partOfSpeech || '')}</span></div>`;
    (entry.definitions || []).slice(0, 2).forEach((d) => {
      const meaning = stripHtml(d.definition || '');
      if (!meaning) return;
      html += `<p class="def-meaning">${escapeHtml(meaning)}</p>`;
      plainParts.push(meaning);
    });
  });

  if (!plainParts.length) return null;

  return {
    html,
    plainText: plainParts.slice(0, 3).join('; '),
  };
}

async function fetchFromDatamuse(word) {
  const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=1`);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.length || !data[0].defs?.length) return null;

  let html = '';
  const plainParts = [];

  data[0].defs.slice(0, 4).forEach((def) => {
    const [pos, ...rest] = def.split('\t');
    const meaning = rest.join(' ').trim();
    if (!meaning) return;
    html += `<div><span class="def-pos">${escapeHtml(pos || 'def')}</span></div>`;
    html += `<p class="def-meaning">${escapeHtml(meaning)}</p>`;
    plainParts.push(meaning);
  });

  if (!plainParts.length) return null;

  return {
    html,
    plainText: plainParts.slice(0, 3).join('; '),
  };
}

async function fetchDefinition(word) {
  const candidates = getLookupCandidates(word);
  let lastError = null;

  const sources = [fetchFromDictionaryApi, fetchFromWiktionary, fetchFromDatamuse];

  for (const candidate of candidates) {
    for (const source of sources) {
      try {
        const result = await source(candidate);
        if (result) return result;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (lastError instanceof TypeError) {
    return {
      html: `<p class="def-error">Cannot connect to dictionary services.</p>
        <p class="def-hint">If you opened this page as a local file (<code>file://</code>), please run a local server instead:</p>
        <p class="def-hint"><code>python -m http.server 8765</code></p>
        <p class="def-hint">Then open <code>http://localhost:8765</code> in your browser.</p>`,
      plainText: '',
    };
  }

  return {
    html: '<p class="def-error">Definition not found. You can still add this word to your wordbook.</p>',
    plainText: '',
  };
}

function getWordbook() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveWordbook(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function addCurrentToWordbook() {
  if (!state.selectedWord) return;
  const book = getWordbook();
  if (book.some((w) => w.word === state.selectedWord)) {
    const btn = $('#add-to-wordbook');
    const orig = btn.textContent;
    btn.textContent = 'Already in wordbook';
    setTimeout(() => { btn.textContent = orig; }, 1500);
    return;
  }
  book.unshift({
    word: state.selectedWord,
    definition: state.currentDefinition?.plainText || '',
    addedAt: new Date().toISOString(),
  });
  saveWordbook(book);
  const btn = $('#add-to-wordbook');
  btn.textContent = '✓ Added!';
  setTimeout(() => { btn.textContent = '+ Add to Wordbook'; }, 1500);
}

function bindWordbook() {
  $('#clear-wordbook').addEventListener('click', () => {
    if (confirm('Clear all words from your wordbook?')) {
      saveWordbook([]);
      renderWordbook();
    }
  });
}

function renderWordbook() {
  const book = getWordbook();
  const list = $('#wordbook-list');
  const empty = $('#wordbook-empty');
  list.innerHTML = '';

  if (book.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  book.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'wordbook-item';
    li.innerHTML = `
      <button class="btn btn-ghost wordbook-remove" data-index="${i}">Remove</button>
      <div class="wordbook-word">${escapeHtml(item.word)}</div>
      <div class="wordbook-def">${escapeHtml(item.definition) || 'No definition saved'}</div>
      <div class="wordbook-meta">Added ${formatDate(item.addedAt)}</div>
    `;
    li.querySelector('.wordbook-remove').addEventListener('click', () => {
      const updated = getWordbook();
      updated.splice(i, 1);
      saveWordbook(updated);
      renderWordbook();
    });
    list.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

function bindDictation() {
  const speedRange = $('#speed-range');
  const speedValue = $('#speed-value');

  speedRange.addEventListener('input', () => {
    speedValue.textContent = `${parseFloat(speedRange.value).toFixed(1)}×`;
  });

  $('#play-sentence').addEventListener('click', togglePlayback);
  $('#check-answer').addEventListener('click', checkAnswer);
  $('#next-sentence').addEventListener('click', goToNextSentence);
  $('#show-hint').addEventListener('click', showHint);
  $('#restart-dictate').addEventListener('click', () => {
    startDictation();
    $('#completion').classList.add('hidden');
    $('.dictate-area').style.display = '';
    $('.controls-row').style.display = '';
    $('.progress-bar-wrap').style.display = '';
    $('.dictate-header').style.display = '';
  });
  $('#new-article').addEventListener('click', () => switchMode('setup'));

  $('#dictation-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();

    const nextBtn = $('#next-sentence');
    if (!nextBtn.classList.contains('hidden')) {
      goToNextSentence();
    } else {
      checkAnswer();
    }
  });

  $('#dictation-input').addEventListener('input', () => {
    if (state.wrongAttempts >= 3) {
      showInputErrorMarks();
    } else {
      clearInputErrorMarks();
    }
  });

  $('#dictation-input').addEventListener('scroll', syncOverlayScroll);
}

function startDictation() {
  stopArticleReading();
  state.currentSentenceIndex = 0;
  updateDictationUI();
  $('#dictation-input').value = '';
  $('#feedback').classList.add('hidden');
  $('#next-sentence').classList.add('hidden');
  $('#completion').classList.add('hidden');
  $('.dictate-area').style.display = '';
  $('.controls-row').style.display = '';
  $('.progress-bar-wrap').style.display = '';
  $('.dictate-header').style.display = '';

  setTimeout(() => startLoopPlayback(), 400);
}

function updateDictationUI() {
  const total = state.sentences.length;
  const current = state.currentSentenceIndex + 1;
  $('#sentence-index').textContent = current;
  $('#sentence-total').textContent = total;
  $('#progress-bar').style.width = total ? `${(state.currentSentenceIndex / total) * 100}%` : '0%';
  $('#dictation-input').value = '';
  $('#dictation-input').focus();
  $('#feedback').classList.add('hidden');
  $('#next-sentence').classList.add('hidden');
  state.wrongAttempts = 0;
  clearInputErrorMarks();
}

function loadVoices() {
  state.voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  const select = $('#voice-select');
  const prev = select.value;
  select.innerHTML = '';

  const preferred = state.voices.filter((v) => v.lang.startsWith('en-US') || v.lang.startsWith('en-GB'));
  const list = preferred.length ? preferred : state.voices;

  list.forEach((voice, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${voice.name} (${voice.lang})`;
    select.appendChild(opt);
  });

  if (prev) select.value = prev;
}

function getSelectedVoice() {
  const preferred = state.voices.filter((v) => v.lang.startsWith('en-US') || v.lang.startsWith('en-GB'));
  const list = preferred.length ? preferred : state.voices;
  const idx = parseInt($('#voice-select').value, 10) || 0;
  return list[idx] || list[0];
}

function togglePlayback() {
  if (state.isLooping) {
    stopPlayback();
  } else {
    startLoopPlayback();
  }
}

function startLoopPlayback() {
  state.isLooping = true;
  updatePlaybackButton();
  speakCurrentSentence();
}

function stopPlayback() {
  state.isLooping = false;
  state.playbackId += 1;
  speechSynthesis.cancel();
  updatePlaybackButton();
}

function updatePlaybackButton() {
  const btn = $('#play-sentence');
  if (state.isLooping) {
    btn.innerHTML = '<span class="play-icon">■</span> Stop';
    btn.className = 'btn btn-stop';
    btn.title = 'Stop looping playback';
  } else {
    btn.innerHTML = '<span class="play-icon">▶</span> Play';
    btn.className = 'btn btn-secondary';
    btn.title = 'Start looping playback';
  }
}

function speakCurrentSentence() {
  const sentence = state.sentences[state.currentSentenceIndex];
  if (!sentence) return;

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(sentence);
  const voice = getSelectedVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = parseFloat($('#speed-range').value);
  utterance.lang = voice?.lang || 'en-US';

  const playbackId = state.playbackId;
  const scheduleReplay = () => {
    if (!state.isLooping || playbackId !== state.playbackId) return;
    setTimeout(() => {
      if (state.isLooping && playbackId === state.playbackId) speakCurrentSentence();
    }, 500);
  };

  utterance.onend = scheduleReplay;
  utterance.onerror = scheduleReplay;
  speechSynthesis.speak(utterance);
}

function normalizeForCompare(str) {
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForCompare(str) {
  return normalizeForCompare(str).split(' ').filter(Boolean);
}

function checkAnswer() {
  const input = normalizeForCompare($('#dictation-input').value);
  const expected = normalizeForCompare(state.sentences[state.currentSentenceIndex]);
  const feedback = $('#feedback');

  if (!input) {
    feedback.textContent = 'Type your answer first, then check.';
    feedback.className = 'feedback error';
    feedback.classList.remove('hidden');
    return;
  }

  if (input === expected) {
    state.wrongAttempts = 0;
    clearInputErrorMarks();
    stopPlayback();
    feedback.innerHTML = '✓ Perfect! Every word is correct.';
    feedback.className = 'feedback success';
    feedback.classList.remove('hidden');
    $('#next-sentence').classList.remove('hidden');

    if (state.currentSentenceIndex >= state.sentences.length - 1) {
      $('#next-sentence').textContent = 'Finish →';
    } else {
      $('#next-sentence').textContent = 'Next Sentence →';
    }
  } else {
    state.wrongAttempts += 1;
    const diff = highlightDifferences(expected, input);
    if (state.wrongAttempts >= 3) {
      showSentenceReveal('After 3 attempts, here is the sentence');
      showInputErrorMarks();
    } else {
      feedback.innerHTML = `Not quite right. ${diff}`;
      feedback.className = 'feedback error';
      feedback.classList.remove('hidden');
    }
    $('#next-sentence').classList.add('hidden');
  }
}

function highlightDifferences(expected, input) {
  const expWords = tokenizeForCompare(expected);
  const inpWords = tokenizeForCompare(input);
  const maxLen = Math.max(expWords.length, inpWords.length);
  let wrong = 0;

  for (let i = 0; i < maxLen; i++) {
    if ((expWords[i] || '') !== (inpWords[i] || '')) wrong++;
  }

  if (wrong === 1) return 'One word differs — listen again and try once more.';
  if (inpWords.length < expWords.length) return `You may be missing ${expWords.length - inpWords.length} word(s).`;
  if (inpWords.length > expWords.length) return `You have ${inpWords.length - expWords.length} extra word(s).`;
  return `${wrong} word(s) don't match. Listen carefully and try again.`;
}

function goToNextSentence() {
  if (state.currentSentenceIndex >= state.sentences.length - 1) {
    showCompletion();
    return;
  }
  state.currentSentenceIndex++;
  updateDictationUI();
  setTimeout(() => startLoopPlayback(), 300);
}

function showSentenceReveal(label) {
  const sentence = state.sentences[state.currentSentenceIndex];
  const feedback = $('#feedback');
  feedback.innerHTML = `${escapeHtml(label)}: <strong>${escapeHtml(sentence)}</strong>`;
  feedback.className = 'feedback hint';
  feedback.classList.remove('hidden');
}

function showHint() {
  showSentenceReveal('Hint');
}

function buildInputErrorMarkup(userInput, expectedSentence) {
  const tokens = userInput.match(/\S+|\s+/g) || [];
  const expectedWords = tokenizeForCompare(expectedSentence);
  let wordIndex = 0;

  return tokens.map((token) => {
    if (/^\s+$/.test(token)) {
      return escapeHtml(token);
    }

    const normalized = normalizeForCompare(token);
    const expected = expectedWords[wordIndex];
    const isCorrect = normalized === expected;
    wordIndex += 1;

    const escaped = escapeHtml(token);
    if (isCorrect) {
      return `<span class="input-ok">${escaped}</span>`;
    }

    const title = expected ? `Expected: ${expected}` : 'Extra word';
    return `<span class="input-error" title="${escapeHtml(title)}">${escaped}</span>`;
  }).join('');
}

function showInputErrorMarks() {
  const input = $('#dictation-input');
  const overlay = $('#dictation-overlay');
  const sentence = state.sentences[state.currentSentenceIndex];

  overlay.innerHTML = buildInputErrorMarkup(input.value, sentence);
  overlay.classList.remove('hidden');
  $('.dictate-input-wrap').classList.add('marking-errors');
  syncOverlayScroll();
}

function clearInputErrorMarks() {
  $('.dictate-input-wrap').classList.remove('marking-errors');
  const overlay = $('#dictation-overlay');
  overlay.classList.add('hidden');
  overlay.innerHTML = '';
}

function syncOverlayScroll() {
  const input = $('#dictation-input');
  const overlay = $('#dictation-overlay');
  overlay.scrollTop = input.scrollTop;
  overlay.scrollLeft = input.scrollLeft;
}

function showCompletion() {
  stopPlayback();
  $('#progress-bar').style.width = '100%';
  $('.dictate-area').style.display = 'none';
  $('.controls-row').style.display = 'none';
  $('.progress-bar-wrap').style.display = 'none';
  $('#completion').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', init);
