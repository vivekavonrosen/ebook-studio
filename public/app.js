/* ────────────────────────────────────────────────────────────────
   eBook Studio — Frontend Application Logic
   ──────────────────────────────────────────────────────────────── */

// ── State ─────────────────────────────────────────────────────────
const state = {
  currentStep: 1,
  sources: [],               // { name, type, wordCount, charCount, text }
  ideas: [],
  selectedIdea: null,
  pillars: [],
  answers: {},
  branding: {
    primaryColor: '#1A1A3E',
    accentColor: '#C9A96E',
    textColor: '#2C2C3E',
    fontHeading: "'Playfair Display', Georgia, serif",
    fontBody: "'Crimson Pro', Georgia, serif",
    logoDataUrl: null,
    coverDataUrl: null,
    customCss: null,
  },
  generatedChapters: [],     // { title, content }[]
  isGenerating: false,
};

// ── Utility ───────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function combineContent() {
  const parts = [];
  for (const s of state.sources) {
    parts.push(`=== SOURCE: ${s.name} ===\n${s.text}`);
  }
  const pasted = $('#pastedText')?.value?.trim();
  if (pasted) parts.push(`=== SOURCE: Pasted Content ===\n${pasted}`);
  return parts.join('\n\n');
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatNumber(n) {
  return n.toLocaleString();
}

function toast(message, type = 'info', duration = 4000) {
  const tc = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  tc.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Step Navigation ───────────────────────────────────────────────
function goToStep(n) {
  $$('.step').forEach((s) => s.classList.remove('active'));
  $(`#step-${n}`).classList.add('active');
  state.currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Update trail
  $$('.trail-item').forEach((item) => {
    const step = parseInt(item.dataset.step);
    item.classList.remove('active', 'done');
    if (step === n) item.classList.add('active');
    else if (step < n) item.classList.add('done');
  });
}

// ── Step 1: Gather ────────────────────────────────────────────────
function initGather() {
  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');

  // Label click handled via <label for>
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    handleFileUpload(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => handleFileUpload(fileInput.files));

  $('#addUrlBtn').addEventListener('click', addUrlRow);
  $('#scrapeBtn').addEventListener('click', scrapeUrls);
  $('#analyzeBtn').addEventListener('click', analyzeContent);

  // Enable analyze button when content exists
  document.addEventListener('input', checkAnalyzeReady);
  document.addEventListener('change', checkAnalyzeReady);

  $('#backTo1').addEventListener('click', () => goToStep(1));
  $('#backTo2').addEventListener('click', () => goToStep(2));
  $('#backTo3').addEventListener('click', () => goToStep(3));
  $('#backTo4').addEventListener('click', () => goToStep(4));
  $('#backTo5Gen').addEventListener('click', () => goToStep(5));
  $('#backTo6').addEventListener('click', () => goToStep(6));
}

function checkAnalyzeReady() {
  const hasSources = state.sources.length > 0;
  const hasPasted = $('#pastedText')?.value?.trim().length > 100;
  $('#analyzeBtn').disabled = !(hasSources || hasPasted);
}

async function handleFileUpload(files) {
  if (!files || files.length === 0) return;

  const fileList = $('#fileList');
  const formData = new FormData();

  for (const file of files) {
    formData.append('files', file);
    const item = document.createElement('div');
    item.className = 'file-item';
    item.id = `file-${file.name.replace(/\W/g, '_')}`;
    item.innerHTML = `
      <span class="file-name" title="${file.name}">${file.name}</span>
      <span class="file-size">${(file.size / 1024).toFixed(0)}KB</span>
      <span class="file-status loading">⟳</span>`;
    fileList.appendChild(item);
  }

  try {
    const res = await fetch('/api/extract/files', { method: 'POST', body: formData });
    const data = await res.json();

    for (const r of data.results || []) {
      state.sources.push(r);
      const id = `file-${r.name.replace(/\W/g, '_')}`;
      const el = $(`#${id}`) || $('.file-item:last-child');
      if (el) el.querySelector('.file-status').textContent = '✓';
      if (el) el.querySelector('.file-status').className = 'file-status done';
    }

    for (const e of data.errors || []) {
      toast(`Could not read ${e.name}: ${e.error}`, 'error');
      const id = `file-${e.name.replace(/\W/g, '_')}`;
      const el = $(`#${id}`);
      if (el) el.querySelector('.file-status').textContent = '✗';
      if (el) el.querySelector('.file-status').className = 'file-status error';
    }

    updateContentSummary();
    checkAnalyzeReady();
  } catch (err) {
    toast('Upload failed. Check your connection and try again.', 'error');
  }
}

function addUrlRow() {
  const row = document.createElement('div');
  row.className = 'url-row';
  row.innerHTML = `
    <input type="url" class="url-field" placeholder="https://..." />
    <button class="url-remove" onclick="this.closest('.url-row').remove()">×</button>`;
  $('#urlInputs').appendChild(row);
}

async function scrapeUrls() {
  const fields = $$('.url-field');
  const urls = fields.map((f) => f.value.trim()).filter(Boolean);

  if (urls.length === 0) {
    toast('Enter at least one URL first.', 'info');
    return;
  }

  const btn = $('#scrapeBtn');
  btn.textContent = 'Fetching…';
  btn.disabled = true;

  const resultsEl = $('#urlResults');
  resultsEl.innerHTML = '';

  try {
    const res = await fetch('/api/extract/urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
    const data = await res.json();

    for (const r of data.results || []) {
      state.sources.push(r);
      const item = document.createElement('div');
      item.className = 'url-result success';
      item.textContent = `✓ ${r.name} — ${formatNumber(r.wordCount)} words`;
      resultsEl.appendChild(item);
    }

    for (const e of data.errors || []) {
      const item = document.createElement('div');
      item.className = 'url-result error';
      item.textContent = `✗ ${e.name}: ${e.error}`;
      resultsEl.appendChild(item);
    }

    updateContentSummary();
    checkAnalyzeReady();
  } catch (err) {
    toast('Scraping failed. Some sites block automated access — paste content manually instead.', 'error');
  } finally {
    btn.textContent = 'Fetch Content';
    btn.disabled = false;
  }
}

function updateContentSummary() {
  const summary = $('#contentSummary');
  const statsEl = $('#summaryStats');

  const totalWords = state.sources.reduce((sum, s) => sum + s.wordCount, 0);
  const pastedWords = wordCount($('#pastedText')?.value || '');
  const allWords = totalWords + pastedWords;

  if (state.sources.length === 0 && pastedWords === 0) {
    summary.classList.add('hidden');
    return;
  }

  summary.classList.remove('hidden');
  statsEl.innerHTML = `
    <div class="stat-item"><span>${state.sources.length}</span> sources</div>
    <div class="stat-item">~<span>${formatNumber(allWords)}</span> words gathered</div>
    ${pastedWords > 0 ? `<div class="stat-item"><span>${formatNumber(pastedWords)}</span> words pasted</div>` : ''}`;
}

async function analyzeContent() {
  const content = combineContent();
  if (content.length < 200) {
    toast('Add more content before analyzing — at least a few hundred words.', 'info');
    return;
  }

  const authorName = $('#authorNameInput').value.trim();
  goToStep(2);
  $('#ideasLoading').classList.remove('hidden');
  $('#ideasGrid').innerHTML = '';
  $('#confirmIdea').classList.add('hidden');

  try {
    const res = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, authorName }),
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    state.ideas = data.ideas;
    renderIdeas();
  } catch (err) {
    toast(`Analysis failed: ${err.message}`, 'error');
    goToStep(1);
  } finally {
    $('#ideasLoading').classList.add('hidden');
  }
}

// ── Step 2: Ideas ─────────────────────────────────────────────────
function renderIdeas() {
  const grid = $('#ideasGrid');
  grid.innerHTML = '';

  state.ideas.forEach((idea) => {
    const card = document.createElement('div');
    card.className = 'idea-card';
    card.dataset.id = idea.id;
    card.innerHTML = `
      <div class="idea-tone">${idea.tone}</div>
      <div class="idea-title">${idea.title}</div>
      <div class="idea-subtitle">${idea.subtitle}</div>
      <div class="idea-premise">${idea.premise}</div>
      <div class="idea-meta">
        <div class="idea-meta-row"><strong>For:</strong> ${idea.targetAudience}</div>
        <div class="idea-meta-row"><strong>Transformation:</strong> ${idea.transformation}</div>
        <div class="idea-meta-row"><strong>What's different:</strong> ${idea.uniqueAngle}</div>
      </div>`;

    card.addEventListener('click', () => {
      $$('.idea-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedIdea = idea;
      $('#confirmIdea').classList.remove('hidden');
    });

    grid.appendChild(card);
  });

  $('#confirmIdea').addEventListener('click', buildPillars);
  $('#regenerateIdeas').addEventListener('click', () => {
    state.selectedIdea = null;
    analyzeContent();
  });
}

async function buildPillars() {
  if (!state.selectedIdea) return;

  const content = combineContent();
  goToStep(3);

  const banner = $('#selectedIdeaBanner');
  banner.innerHTML = `
    <div class="sib-title">${state.selectedIdea.title}</div>
    <div class="sib-subtitle">${state.selectedIdea.subtitle}</div>`;

  $('#pillarsLoading').classList.remove('hidden');
  $('#pillarsContainer').innerHTML = '';

  try {
    const res = await fetch('/api/pillars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedIdea: state.selectedIdea, content }),
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    state.pillars = data.pillars;
    renderPillars();
  } catch (err) {
    toast(`Could not build structure: ${err.message}`, 'error');
    goToStep(2);
  } finally {
    $('#pillarsLoading').classList.add('hidden');
  }

  $('#confirmPillars').addEventListener('click', () => {
    collectPillars();
    goToStep(4);
    initClarify();
  });

  $('#regeneratePillars').addEventListener('click', buildPillars);

  $('#addPillarBtn').addEventListener('click', () => {
    state.pillars.push({
      id: String(state.pillars.length + 1),
      title: 'New Chapter',
      subtitle: '',
      description: 'Describe what this chapter covers.',
      keyInsights: [],
      order: state.pillars.length + 1,
    });
    renderPillars();
  });
}

function renderPillars() {
  const container = $('#pillarsContainer');
  container.innerHTML = '';

  state.pillars.forEach((pillar, i) => {
    const card = document.createElement('div');
    card.className = 'pillar-card';
    card.dataset.index = i;
    card.innerHTML = `
      <div class="pillar-num">${String(i + 1).padStart(2, '0')}</div>
      <div class="pillar-body">
        <input class="pillar-title-input" type="text" value="${pillar.title}" placeholder="Chapter title" />
        <div class="pillar-desc">${pillar.description || ''}</div>
      </div>
      <div class="pillar-actions-cell">
        <button class="pillar-btn" title="Remove" onclick="removePillar(${i})">×</button>
      </div>`;
    container.appendChild(card);
  });
}

function removePillar(index) {
  state.pillars.splice(index, 1);
  renderPillars();
}
window.removePillar = removePillar;

function collectPillars() {
  $$('.pillar-title-input').forEach((input, i) => {
    if (state.pillars[i]) state.pillars[i].title = input.value;
  });
}

// ── Step 4: Clarify ───────────────────────────────────────────────
function initClarify() {
  $('#confirmClarify').addEventListener('click', () => {
    const answers = collectAnswers();
    const required = ['idealReader', 'uniqueApproach', 'clientPains', 'bookSolution', 'transformation', 'authorBio'];
    const missing = required.filter((k) => !answers[k]?.trim());

    if (missing.length > 0) {
      toast('Please fill in all required fields before continuing.', 'info');
      return;
    }

    state.answers = answers;
    state.answers.authorName = $('#authorNameInput').value.trim() || 'the author';
    goToStep(5);
    initBranding();
  });
}

function collectAnswers() {
  return {
    idealReader: $('#q-idealReader').value,
    uniqueApproach: $('#q-uniqueApproach').value,
    clientPains: $('#q-clientPains').value,
    bookSolution: $('#q-bookSolution').value,
    transformation: $('#q-transformation').value,
    callToAction: $('#q-callToAction').value,
    authorBio: $('#q-authorBio').value,
  };
}

// ── Step 5: Branding ──────────────────────────────────────────────
function initBranding() {
  // Color pickers
  ['Primary', 'Accent', 'Text'].forEach((name) => {
    const picker = $(`#color${name}`);
    const hex = $(`#color${name}Hex`);

    picker.addEventListener('input', () => {
      hex.value = picker.value;
      updateBrandingState();
      updateFontPreview();
    });
    hex.addEventListener('input', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) {
        picker.value = hex.value;
        updateBrandingState();
      }
    });
  });

  // Color presets
  $$('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#colorPrimary').value = btn.dataset.primary;
      $('#colorPrimaryHex').value = btn.dataset.primary;
      $('#colorAccent').value = btn.dataset.accent;
      $('#colorAccentHex').value = btn.dataset.accent;
      $('#colorText').value = btn.dataset.text;
      $('#colorTextHex').value = btn.dataset.text;
      updateBrandingState();
      updateFontPreview();
    });
  });

  // Font selects
  $('#fontHeading').addEventListener('change', updateFontPreview);
  $('#fontBody').addEventListener('change', updateFontPreview);

  updateFontPreview();

  // Asset uploads
  setupAssetUpload('logo');
  setupAssetUpload('cover');

  // CSS upload
  const cssInput = $('#cssInput');
  ['#cssDropZone'].forEach((zoneId) => {
    const zone = $(zoneId);
    if (!zone) return;
    zone.addEventListener('click', () => cssInput.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--gold)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = '';
      if (e.dataTransfer.files[0]) handleCssUpload(e.dataTransfer.files[0]);
    });
  });
  cssInput.addEventListener('change', () => {
    if (cssInput.files[0]) handleCssUpload(cssInput.files[0]);
  });

  $('#confirmBrand').addEventListener('click', () => {
    updateBrandingState();
    goToStep(6);
    startGeneration();
  });
}

function updateBrandingState() {
  state.branding.primaryColor = $('#colorPrimary').value;
  state.branding.accentColor = $('#colorAccent').value;
  state.branding.textColor = $('#colorText').value;
  state.branding.fontHeading = $('#fontHeading').value;
  state.branding.fontBody = $('#fontBody').value;
}

function updateFontPreview() {
  const headingFont = $('#fontHeading').value;
  const bodyFont = $('#fontBody').value;
  $('.fp-heading').style.fontFamily = headingFont;
  $('.fp-body').style.fontFamily = bodyFont;
  loadGoogleFont(headingFont);
  loadGoogleFont(bodyFont);
}

function loadGoogleFont(fontStack) {
  const match = fontStack.match(/'([^']+)'/);
  if (!match) return;
  const name = match[1].replace(/ /g, '+');
  const id = `gfont-${name}`;
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,400;0,600;0,700;1,400&display=swap`;
    document.head.appendChild(link);
  }
}

function setupAssetUpload(type) {
  const dropZone = $(`#${type}DropZone`);
  const input = $(`#${type}Input`);
  const preview = $(`#${type}Preview`);

  dropZone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'LABEL') input.click();
  });
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--gold)'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    if (e.dataTransfer.files[0]) handleAssetFile(type, e.dataTransfer.files[0]);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handleAssetFile(type, input.files[0]);
  });
}

function handleAssetFile(type, file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const preview = $(`#${type}Preview`);
    const inner = $(`#${type}DropInner`);

    if (type === 'logo') state.branding.logoDataUrl = dataUrl;
    if (type === 'cover') state.branding.coverDataUrl = dataUrl;

    preview.src = dataUrl;
    preview.classList.remove('hidden');
    if (inner) inner.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function handleCssUpload(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    state.branding.customCss = e.target.result;
    $('#cssFilename').textContent = `✓ ${file.name} loaded`;
    $('#cssFilename').classList.remove('hidden');
    toast(`Stylesheet "${file.name}" applied.`, 'success');
  };
  reader.readAsText(file);
}

// ── Step 6: Generate ──────────────────────────────────────────────
function initChapterProgressList() {
  const list = $('#chapterProgressList');
  list.innerHTML = '';
  state.generatedChapters = [];

  const chapters = [
    { key: 'intro', title: 'Introduction' },
    ...state.pillars.map((p, i) => ({ key: `ch${i + 1}`, title: p.title })),
    { key: 'conclusion', title: 'Conclusion & Next Steps' },
    { key: 'about', title: 'About the Author' },
  ];

  chapters.forEach(({ key, title }) => {
    state.generatedChapters.push({ key, title, content: '' });
    const item = document.createElement('div');
    item.className = 'cp-item';
    item.id = `cp-${key}`;
    item.innerHTML = `<div class="cp-dot"></div><div class="cp-label">${title}</div>`;
    list.appendChild(item);
  });
}

async function startGeneration() {
  if (state.isGenerating) return;
  state.isGenerating = true;

  initChapterProgressList();

  const content = combineContent();
  const previewBody = $('#previewBody');
  previewBody.innerHTML = '<div class="writing-cursor"></div>';
  $('#goToExport').classList.add('hidden');
  $('#previewStatus').textContent = 'Writing…';

  let currentChapterIndex = -1;

  const setChapterWriting = (key) => {
    $$('.cp-item').forEach((el) => el.classList.remove('writing'));
    $(`#cp-${key}`)?.classList.add('writing');
    const chapter = state.generatedChapters.find((c) => c.key === key);
    if (chapter) {
      $('#previewChapterLabel').textContent = chapter.title;
      previewBody.innerHTML = '<div class="writing-cursor"></div>';
    }
  };

  const setChapterDone = (key) => {
    const el = $(`#cp-${key}`);
    if (el) { el.classList.remove('writing'); el.classList.add('done'); }
  };

  const appendText = (text) => {
    const cursor = previewBody.querySelector('.writing-cursor');
    const textNode = document.createTextNode(text);
    if (cursor) cursor.before(textNode);
    else previewBody.appendChild(textNode);
    previewBody.scrollTop = previewBody.scrollHeight;

    if (currentChapterIndex >= 0) {
      state.generatedChapters[currentChapterIndex].content += text;
    }
  };

  // Map streaming chapter events to our chapters array
  const chapterKeyMap = ['intro', ...state.pillars.map((_, i) => `ch${i + 1}`), 'conclusion', 'about'];

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedIdea: state.selectedIdea,
        pillars: state.pillars,
        answers: state.answers,
        content,
      }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));

          if (data.type === 'chapter_start') {
            const chapter = data.chapter;
            let key;
            if (chapter === 0) key = 'intro';
            else if (chapter === -1) key = 'about';
            else if (chapter === state.pillars.length + 1) key = 'conclusion';
            else key = `ch${chapter}`;

            currentChapterIndex = state.generatedChapters.findIndex((c) => c.key === key);
            setChapterWriting(key);
          }

          if (data.type === 'text') {
            appendText(data.text);
          }

          if (data.type === 'chapter_end') {
            const chapter = data.chapter;
            let key;
            if (chapter === 0) key = 'intro';
            else if (chapter === -1) key = 'about';
            else if (chapter === state.pillars.length + 1) key = 'conclusion';
            else key = `ch${chapter}`;
            setChapterDone(key);
          }

          if (data.type === 'complete') {
            $$('.cp-item').forEach((el) => { el.classList.remove('writing'); el.classList.add('done'); });
            previewBody.querySelector('.writing-cursor')?.remove();
            $('#previewStatus').textContent = 'Complete ✓';
            $('#goToExport').classList.remove('hidden');
            state.isGenerating = false;
            toast('Your eBook has been written!', 'success');
          }

          if (data.type === 'error') {
            throw new Error(data.message);
          }
        } catch (parseErr) {
          // Ignore malformed SSE lines
        }
      }
    }
  } catch (err) {
    state.isGenerating = false;
    toast(`Generation failed: ${err.message}`, 'error');
    $('#previewStatus').textContent = 'Error — try again';
    $('#backTo5Gen').classList.remove('hidden');
  }

  $('#goToExport').addEventListener('click', () => {
    goToStep(7);
    renderEbookPreview();
  });
}

// ── Step 7: Export ────────────────────────────────────────────────
function renderEbookPreview() {
  const html = generateEbookHtml();
  const preview = $('#ebookPreview');
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;border:none;min-height:800px;';
  preview.innerHTML = '';
  preview.appendChild(iframe);

  // Write into iframe for isolated rendering
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();

  // Resize iframe to content height
  iframe.onload = () => {
    iframe.style.height = (doc.body.scrollHeight + 40) + 'px';
  };

  $('#downloadHtml').addEventListener('click', () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const title = state.selectedIdea?.title?.replace(/[^a-z0-9]/gi, '_') || 'ebook';
    a.download = `${title}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast('eBook downloaded! Open the HTML file to print as PDF.', 'success');
  });

  $('#printEbook').addEventListener('click', () => {
    iframe.contentWindow.print();
  });

  $('#startOver').addEventListener('click', () => {
    if (confirm('Start over? All progress will be lost.')) location.reload();
  });
}

function generateEbookHtml() {
  const { primaryColor, accentColor, textColor, fontHeading, fontBody, logoDataUrl, coverDataUrl, customCss } = state.branding;
  const idea = state.selectedIdea;
  const authorName = state.answers.authorName || 'the author';

  // Google Fonts import strings
  const extractGFont = (fontStr) => {
    const m = fontStr.match(/'([^']+)'/);
    return m ? m[1].replace(/ /g, '+') : null;
  };
  const hFont = extractGFont(fontHeading);
  const bFont = extractGFont(fontBody);
  const gFontImports = [hFont, bFont]
    .filter(Boolean)
    .map((f) => `@import url('https://fonts.googleapis.com/css2?family=${f}:ital,wght@0,400;0,600;0,700;1,400&display=swap');`)
    .join('\n');

  // Table of Contents
  const tocItems = [
    'Introduction',
    ...state.pillars.map((p) => p.title),
    'Conclusion & Next Steps',
    'About the Author',
  ];

  // Chapter HTML
  const chapterHtml = state.generatedChapters.map((ch, i) => {
    const paragraphs = ch.content
      .split(/\n+/)
      .filter((p) => p.trim())
      .map((p) => {
        const line = p.trim();
        if (line.startsWith('# ')) return `<h1 class="ch-h1">${line.slice(2)}</h1>`;
        if (line.startsWith('## ')) return `<h2 class="ch-h2">${line.slice(3)}</h2>`;
        if (line.startsWith('### ')) return `<h3 class="ch-h3">${line.slice(4)}</h3>`;
        if (line.startsWith('**') && line.endsWith('**')) return `<h3 class="ch-h3">${line.slice(2, -2)}</h3>`;
        return `<p>${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')}</p>`;
      })
      .join('\n');

    const isSpecial = ch.key === 'intro' || ch.key === 'conclusion' || ch.key === 'about';
    const chNum = isSpecial ? '' : `Chapter ${i}`;

    return `
    <div class="chapter-page">
      ${!isSpecial ? `<div class="chapter-number">${chNum}</div>` : ''}
      <h1 class="chapter-title">${ch.title}</h1>
      <div class="chapter-divider"></div>
      <div class="chapter-body">${paragraphs}</div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${idea?.title || 'eBook'}</title>
  <style>
${gFontImports}

/* ── Variables ── */
:root {
  --primary: ${primaryColor};
  --accent: ${accentColor};
  --text: ${textColor};
  --font-heading: ${fontHeading};
  --font-body: ${fontBody};
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Page ── */
body {
  font-family: var(--font-body);
  font-size: 12pt;
  line-height: 1.85;
  color: var(--text);
  background: white;
}

@page {
  margin: 1.25in 1.1in;
}

@media print {
  .page-break { page-break-before: always; }
  .cover-page { page-break-after: always; }
  .toc-page { page-break-after: always; }
  .chapter-page { page-break-before: always; }
  body { background: white; }
}

/* ── Cover ── */
.cover-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 3rem;
  background: var(--primary);
  color: white;
  position: relative;
  overflow: hidden;
}
.cover-page::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  width: 60%;
  height: 60%;
  background: var(--accent);
  opacity: 0.08;
  border-radius: 50% 0 0 0;
}
.cover-logo {
  max-height: 60px;
  max-width: 200px;
  margin-bottom: 4rem;
  object-fit: contain;
}
.cover-image-wrap {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 45%;
  overflow: hidden;
}
.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.6;
}
.cover-content {
  position: relative;
  z-index: 2;
  max-width: 55%;
}
.cover-eyebrow {
  font-family: var(--font-heading);
  font-size: 10pt;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 1.5rem;
}
.cover-title {
  font-family: var(--font-heading);
  font-size: 36pt;
  font-weight: 700;
  line-height: 1.1;
  color: white;
  margin-bottom: 1rem;
}
.cover-subtitle {
  font-size: 14pt;
  color: rgba(255,255,255,0.7);
  font-style: italic;
  margin-bottom: 3rem;
  line-height: 1.4;
}
.cover-author {
  font-family: var(--font-heading);
  font-size: 13pt;
  color: var(--accent);
  letter-spacing: 0.05em;
}

/* ── TOC ── */
.toc-page {
  padding: 3rem 0;
  min-height: 80vh;
}
.toc-title {
  font-family: var(--font-heading);
  font-size: 22pt;
  color: var(--primary);
  margin-bottom: 0.5rem;
}
.toc-rule {
  width: 3rem;
  height: 3px;
  background: var(--accent);
  margin-bottom: 2.5rem;
}
.toc-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid rgba(0,0,0,0.07);
  font-size: 11pt;
  color: var(--text);
}
.toc-num {
  color: var(--accent);
  font-family: var(--font-heading);
  font-size: 10pt;
  flex-shrink: 0;
  width: 2rem;
}
.toc-label { flex: 1; }

/* ── Chapter Pages ── */
.chapter-page {
  padding: 2rem 0 4rem;
  min-height: 60vh;
}
.chapter-number {
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 0.75rem;
}
.chapter-title {
  font-family: var(--font-heading);
  font-size: 26pt;
  font-weight: 700;
  color: var(--primary);
  line-height: 1.15;
  margin-bottom: 0.5rem;
}
.chapter-divider {
  width: 3rem;
  height: 3px;
  background: var(--accent);
  margin: 1rem 0 2rem;
}
.chapter-body { }
.chapter-body p {
  margin-bottom: 1.2em;
  font-size: 12pt;
  color: var(--text);
  line-height: 1.85;
  text-align: justify;
}
.chapter-body h1, .ch-h1 {
  font-family: var(--font-heading);
  font-size: 18pt;
  color: var(--primary);
  margin: 2rem 0 0.75rem;
  font-weight: 700;
}
.chapter-body h2, .ch-h2 {
  font-family: var(--font-heading);
  font-size: 14pt;
  color: var(--primary);
  margin: 1.5rem 0 0.6rem;
  font-weight: 600;
}
.chapter-body h3, .ch-h3 {
  font-family: var(--font-heading);
  font-size: 12pt;
  color: var(--accent);
  margin: 1.25rem 0 0.5rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.chapter-body strong { color: var(--primary); }
.chapter-body em { font-style: italic; }

/* ── Custom CSS Override ── */
${customCss || ''}
  </style>
</head>
<body>

<!-- ── Cover ── -->
<div class="cover-page">
  ${logoDataUrl ? `<img class="cover-logo" src="${logoDataUrl}" alt="Logo" />` : ''}
  ${coverDataUrl ? `<div class="cover-image-wrap"><img class="cover-image" src="${coverDataUrl}" alt="Cover" /></div>` : ''}
  <div class="cover-content">
    <div class="cover-eyebrow">A Guide by ${authorName}</div>
    <h1 class="cover-title">${idea?.title || 'Your eBook'}</h1>
    <p class="cover-subtitle">${idea?.subtitle || ''}</p>
    <div class="cover-author">by ${authorName}</div>
  </div>
</div>

<!-- ── Table of Contents ── -->
<div class="toc-page page-break">
  <h2 class="toc-title">Contents</h2>
  <div class="toc-rule"></div>
  ${tocItems.map((title, i) => `
  <div class="toc-item">
    <span class="toc-num">${String(i + 1).padStart(2, '0')}</span>
    <span class="toc-label">${title}</span>
  </div>`).join('')}
</div>

<!-- ── Chapters ── -->
${chapterHtml}

</body>
</html>`;
}

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initGather();

  // Paste text listener for content summary
  $('#pastedText')?.addEventListener('input', () => {
    updateContentSummary();
    checkAnalyzeReady();
  });
});
