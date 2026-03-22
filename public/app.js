/* ─────────────────────────────────────────────────────────────
   eBook Studio — Frontend Application Logic
───────────────────────────────────────────────────────────── */

const state = {
  currentStep: 1,
  mode: 'single',            // 'single' | 'synthesis'
  sources: [],
  ideas: [],
  selectedIdea: null,
  pillars: [],
  answers: {},
  branding: {
    primaryColor: '#571F81',
    accentColor:  '#DFB24A',
    textColor:    '#1A0A2E',
    fontHeading:  "'Bebas Neue', Georgia, serif",
    fontBody:     "'Lato', system-ui, sans-serif",
    logoDataUrl:  null,
    coverDataUrl: null,
    customCss:    null,
    brandGuide:   '',
  },
  generatedChapters: [],
  marketingPlan: null,
  isGenerating: false,
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function combineContent() {
  const parts = state.sources.map(s => `=== SOURCE: ${s.name} ===\n${s.text}`);
  const pasted = $('#pastedText')?.value?.trim();
  if (pasted) parts.push(`=== SOURCE: Pasted Content ===\n${pasted}`);
  return parts.join('\n\n');
}

function wordCount(text) { return text.trim().split(/\s+/).filter(Boolean).length; }
function formatNumber(n) { return n.toLocaleString(); }

function toast(message, type = 'info', duration = 4000) {
  const tc = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  tc.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Mode Toggle ───────────────────────────────────────────────
window.setMode = function(mode) {
  state.mode = mode;
  $('#modeSingle').classList.toggle('active', mode === 'single');
  $('#modeSynth').classList.toggle('active', mode === 'synthesis');
  const banner = $('#synthesisBanner');
  if (mode === 'synthesis') banner.classList.remove('hidden');
  else banner.classList.add('hidden');
};

// ── Step Navigation ───────────────────────────────────────────
function goToStep(n) {
  $$('.step').forEach(s => s.classList.remove('active'));
  $(`#step-${n}`).classList.add('active');
  state.currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $$('.trail-item').forEach(item => {
    const step = parseInt(item.dataset.step);
    item.classList.remove('active', 'done');
    if (step === n) item.classList.add('active');
    else if (step < n) item.classList.add('done');
  });
}

// ── Step 1: Gather ────────────────────────────────────────────
function initGather() {
  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragging'); handleFileUpload(e.dataTransfer.files); });
  fileInput.addEventListener('change', () => handleFileUpload(fileInput.files));

  $('#addUrlBtn').addEventListener('click', addUrlRow);
  $('#scrapeBtn').addEventListener('click', scrapeUrls);
  $('#analyzeBtn').addEventListener('click', analyzeContent);

  document.addEventListener('input', checkAnalyzeReady);
  document.addEventListener('change', checkAnalyzeReady);

  $('#backTo1').addEventListener('click', () => goToStep(1));
  $('#backTo2').addEventListener('click', () => goToStep(2));
  $('#backTo3').addEventListener('click', () => goToStep(3));
  $('#backTo4').addEventListener('click', () => goToStep(4));
  $('#backTo5Gen').addEventListener('click', () => goToStep(5));
  $('#backTo6').addEventListener('click', () => goToStep(6));
  $('#backTo7').addEventListener('click', () => goToStep(7));
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
    item.innerHTML = `<span class="file-name" title="${file.name}">${file.name}</span><span class="file-size">${(file.size/1024).toFixed(0)}KB</span><span class="file-status loading">⟳</span>`;
    fileList.appendChild(item);
  }

  try {
    const res = await fetch('/api/extract/files', { method: 'POST', body: formData });
    const data = await res.json();
    for (const r of data.results || []) {
      state.sources.push(r);
      const el = $(`#file-${r.name.replace(/\W/g, '_')}`) || $('.file-item:last-child');
      if (el) { el.querySelector('.file-status').textContent = '✓'; el.querySelector('.file-status').className = 'file-status done'; }
    }
    for (const e of data.errors || []) {
      toast(`Could not read ${e.name}: ${e.error}`, 'error');
      const el = $(`#file-${e.name.replace(/\W/g, '_')}`);
      if (el) { el.querySelector('.file-status').textContent = '✗'; el.querySelector('.file-status').className = 'file-status error'; }
    }
    updateContentSummary(); checkAnalyzeReady();
  } catch (err) {
    toast('Upload failed. Check your connection and try again.', 'error');
  }
}

function addUrlRow() {
  const row = document.createElement('div');
  row.className = 'url-row';
  row.innerHTML = `<input type="url" class="url-field" placeholder="https://..." /><button class="url-remove" onclick="this.closest('.url-row').remove()">×</button>`;
  $('#urlInputs').appendChild(row);
}

async function scrapeUrls() {
  const urls = $$('.url-field').map(f => f.value.trim()).filter(Boolean);
  if (urls.length === 0) { toast('Enter at least one URL first.', 'info'); return; }
  const btn = $('#scrapeBtn');
  btn.textContent = 'Fetching…'; btn.disabled = true;
  const resultsEl = $('#urlResults');
  resultsEl.innerHTML = '';
  try {
    const res = await fetch('/api/extract/urls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) });
    const data = await res.json();
    for (const r of data.results || []) {
      state.sources.push(r);
      const item = document.createElement('div');
      item.className = 'url-result success';
      item.textContent = `✓ ${r.name.substring(0, 60)}… — ${formatNumber(r.wordCount)} words`;
      resultsEl.appendChild(item);
    }
    for (const e of data.errors || []) {
      const item = document.createElement('div');
      item.className = 'url-result error';
      item.textContent = `✗ ${e.name.substring(0, 50)}…: ${e.error}`;
      resultsEl.appendChild(item);
    }
    updateContentSummary(); checkAnalyzeReady();
  } catch (err) {
    toast('Scraping failed. Some sites block automated access — paste content manually instead.', 'error');
  } finally { btn.textContent = 'Fetch Content'; btn.disabled = false; }
}

function updateContentSummary() {
  const totalWords = state.sources.reduce((sum, s) => sum + s.wordCount, 0);
  const pastedWords = wordCount($('#pastedText')?.value || '');
  const allWords = totalWords + pastedWords;
  const summary = $('#contentSummary');
  const statsEl = $('#summaryStats');
  if (state.sources.length === 0 && pastedWords === 0) { summary.classList.add('hidden'); return; }
  summary.classList.remove('hidden');
  statsEl.innerHTML = `
    <div class="stat-item"><span>${state.sources.length}</span> sources</div>
    <div class="stat-item">~<span>${formatNumber(allWords)}</span> words gathered</div>
    ${pastedWords > 0 ? `<div class="stat-item"><span>${formatNumber(pastedWords)}</span> words pasted</div>` : ''}`;
}

async function analyzeContent() {
  const content = combineContent();
  if (content.length < 200) { toast('Add more content before analyzing — at least a few hundred words.', 'info'); return; }
  const authorName = $('#authorNameInput').value.trim();
  const contentOwner = $('input[name="contentOwner"]:checked')?.value || 'myself';
  state.contentOwner = contentOwner;
  goToStep(2);
  $('#ideasLoading').classList.remove('hidden');
  $('#ideasGrid').innerHTML = '';
  $('#confirmIdea').classList.add('hidden');

  try {
    const res = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, authorName, mode: state.mode }),
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

// ── Step 2: Ideas ─────────────────────────────────────────────
function renderIdeas() {
  const grid = $('#ideasGrid');
  grid.innerHTML = '';
  state.ideas.forEach(idea => {
    const card = document.createElement('div');
    card.className = 'idea-card';
    card.dataset.id = idea.id;
    card.innerHTML = `
      <div class="idea-tone">${idea.tone}${idea.sourcesDrawnFrom ? ' · Synthesis' : ''}</div>
      <div class="idea-title">${idea.title}</div>
      <div class="idea-subtitle">${idea.subtitle}</div>
      <div class="idea-premise">${idea.premise}</div>
      <div class="idea-meta">
        <div class="idea-meta-row"><strong>For:</strong> ${idea.targetAudience}</div>
        <div class="idea-meta-row"><strong>Transformation:</strong> ${idea.transformation}</div>
        <div class="idea-meta-row"><strong>What's different:</strong> ${idea.uniqueAngle}</div>
        ${idea.sourcesDrawnFrom ? `<div class="idea-meta-row"><strong>Sources:</strong> ${idea.sourcesDrawnFrom}</div>` : ''}
      </div>`;
    card.addEventListener('click', () => {
      $$('.idea-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedIdea = idea;
      state.bookTitle = idea.title;
      // Update editable title field
      const titleInput = $('#editableBookTitle');
      if (titleInput) { titleInput.value = idea.title; titleInput.closest('.editable-title-row').classList.remove('hidden'); }
      $('#confirmIdea').classList.remove('hidden');
    });
    grid.appendChild(card);
  });

  $('#confirmIdea').onclick = () => {
    // Capture any edits to the title
    const titleInput = $('#editableBookTitle');
    if (titleInput && titleInput.value.trim()) {
      state.bookTitle = titleInput.value.trim();
      state.selectedIdea = { ...state.selectedIdea, title: state.bookTitle };
    }
    buildPillars();
  };
  $('#regenerateIdeas').onclick = () => { state.selectedIdea = null; analyzeContent(); };
}

// ── Step 3: Pillars ───────────────────────────────────────────
async function buildPillars() {
  if (!state.selectedIdea) return;
  const content = combineContent();
  goToStep(3);
  const banner = $('#selectedIdeaBanner');
  banner.innerHTML = `<div class="sib-title">${state.selectedIdea.title}</div><div class="sib-subtitle">${state.selectedIdea.subtitle}</div>`;
  $('#pillarsLoading').classList.remove('hidden');
  $('#pillarsContainer').innerHTML = '';

  try {
    const res = await fetch('/api/pillars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedIdea: state.selectedIdea, content, mode: state.mode }),
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

  $('#confirmPillars').onclick = () => { collectPillars(); goToStep(4); initClarify(); };
  $('#regeneratePillars').onclick = buildPillars;
  $('#addPillarBtn').onclick = () => {
    state.pillars.push({ id: String(state.pillars.length + 1), title: 'New Chapter', subtitle: '', description: 'Describe what this chapter covers.', keyInsights: [], order: state.pillars.length + 1 });
    renderPillars();
  };
}

function renderPillars() {
  const container = $('#pillarsContainer');
  container.innerHTML = '';
  state.pillars.forEach((pillar, i) => {
    const card = document.createElement('div');
    card.className = 'pillar-card';
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

window.removePillar = (index) => { state.pillars.splice(index, 1); renderPillars(); };

function collectPillars() {
  $$('.pillar-title-input').forEach((input, i) => { if (state.pillars[i]) state.pillars[i].title = input.value; });
}

// ── Step 4: Clarify ───────────────────────────────────────────
function initClarify() {
  $('#confirmClarify').onclick = () => {
    const answers = {
      idealReader:    $('#q-idealReader').value,
      uniqueApproach: $('#q-uniqueApproach').value,
      clientPains:    $('#q-clientPains').value,
      bookSolution:   $('#q-bookSolution').value,
      transformation: $('#q-transformation').value,
      callToAction:   $('#q-callToAction').value,
      authorBio:      $('#q-authorBio').value,
      website:        $('#q-website').value.trim(),
    };
    const required = ['idealReader', 'uniqueApproach', 'clientPains', 'bookSolution', 'transformation', 'authorBio'];
    if (required.some(k => !answers[k]?.trim())) { toast('Please fill in all required fields before continuing.', 'info'); return; }
    state.answers = answers;
    state.answers.authorName = $('#authorNameInput').value.trim() || 'the author';
    goToStep(5);
    initBranding();
  };
}

// ── Step 5: Branding ──────────────────────────────────────────
function initBranding() {
  ['Primary', 'Accent', 'Text'].forEach(name => {
    const picker = $(`#color${name}`);
    const hex = $(`#color${name}Hex`);
    picker.addEventListener('input', () => { hex.value = picker.value; updateBrandingState(); updateFontPreview(); });
    hex.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) { picker.value = hex.value; updateBrandingState(); } });
  });

  $$('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('#colorPrimary').value = btn.dataset.primary; $('#colorPrimaryHex').value = btn.dataset.primary;
      $('#colorAccent').value = btn.dataset.accent;   $('#colorAccentHex').value = btn.dataset.accent;
      $('#colorText').value = btn.dataset.text;       $('#colorTextHex').value = btn.dataset.text;
      updateBrandingState(); updateFontPreview();
    });
  });

  // Color the presets
  const presets = $$('.preset-btn');
  const presetColors = [['#571F81','#DFB24A'],['#1B3A4B','#2C97AF'],['#1A1A3E','#C9A96E'],['#1A2E1A','#7CAE7A'],['#2E1A1A','#C87864'],['#0D0D0D','#DFB24A']];
  presets.forEach((btn, i) => {
    if (presetColors[i]) {
      btn.style.background = `linear-gradient(135deg, ${presetColors[i][0]} 50%, ${presetColors[i][1]} 50%)`;
    }
  });

  $('#fontHeading').addEventListener('change', updateFontPreview);
  $('#fontBody').addEventListener('change', updateFontPreview);
  updateFontPreview();

  setupAssetUpload('logo');
  setupAssetUpload('cover');

  const cssInput = $('#cssInput');
  $('#cssDropZone').addEventListener('click', () => cssInput.click());
  cssInput.addEventListener('change', () => { if (cssInput.files[0]) handleCssUpload(cssInput.files[0]); });

  $('#confirmBrand').onclick = () => {
    updateBrandingState();
    state.branding.brandGuide = $('#brandGuideText').value.trim();
    goToStep(6);
    startGeneration();
  };
}

function updateBrandingState() {
  state.branding.primaryColor = $('#colorPrimary').value;
  state.branding.accentColor  = $('#colorAccent').value;
  state.branding.textColor    = $('#colorText').value;
  state.branding.fontHeading  = $('#fontHeading').value;
  state.branding.fontBody     = $('#fontBody').value;
}

function updateFontPreview() {
  const hf = $('#fontHeading').value;
  const bf = $('#fontBody').value;
  $('.fp-heading').style.fontFamily = hf;
  $('.fp-body').style.fontFamily = bf;
}

function setupAssetUpload(type) {
  const dropZone = $(`#${type}DropZone`);
  const input = $(`#${type}Input`);
  dropZone.addEventListener('click', e => { if (e.target.tagName !== 'LABEL') input.click(); });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); });
  dropZone.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleAssetFile(type, e.dataTransfer.files[0]); });
  input.addEventListener('change', () => { if (input.files[0]) handleAssetFile(type, input.files[0]); });
}

function handleAssetFile(type, file) {
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    if (type === 'logo') state.branding.logoDataUrl = dataUrl;
    if (type === 'cover') state.branding.coverDataUrl = dataUrl;
    const preview = $(`#${type}Preview`);
    const inner = $(`#${type}DropInner`);
    preview.src = dataUrl; preview.classList.remove('hidden');
    if (inner) inner.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function handleCssUpload(file) {
  const reader = new FileReader();
  reader.onload = e => {
    state.branding.customCss = e.target.result;
    $('#cssFilename').textContent = `✓ ${file.name} loaded`;
    $('#cssFilename').classList.remove('hidden');
    toast(`Stylesheet "${file.name}" applied.`, 'success');
  };
  reader.readAsText(file);
}

// ── Step 6: Generate ──────────────────────────────────────────
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
    item.className = 'cp-item'; item.id = `cp-${key}`;
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
  $('#goToMarketing').classList.add('hidden');
  $('#previewStatus').textContent = 'Writing…';

  let currentChapterIndex = -1;

  const setChapterWriting = key => {
    $$('.cp-item').forEach(el => el.classList.remove('writing'));
    $(`#cp-${key}`)?.classList.add('writing');
    const chapter = state.generatedChapters.find(c => c.key === key);
    if (chapter) { $('#previewChapterLabel').textContent = chapter.title; previewBody.innerHTML = '<div class="writing-cursor"></div>'; }
  };

  const setChapterDone = key => {
    const el = $(`#cp-${key}`);
    if (el) { el.classList.remove('writing'); el.classList.add('done'); }
  };

  const appendText = text => {
    const cursor = previewBody.querySelector('.writing-cursor');
    const node = document.createTextNode(text);
    if (cursor) cursor.before(node); else previewBody.appendChild(node);
    previewBody.scrollTop = previewBody.scrollHeight;
    if (currentChapterIndex >= 0) state.generatedChapters[currentChapterIndex].content += text;
  };

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedIdea: state.selectedIdea,
        pillars: state.pillars,
        answers: state.answers,
        content,
        mode: state.mode,
        brandGuide: state.branding.brandGuide,
        contentOwner: state.contentOwner || 'myself',
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
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'chapter_start') {
            const ch = data.chapter;
            let key = ch === 0 ? 'intro' : ch === -1 ? 'about' : ch === state.pillars.length + 1 ? 'conclusion' : `ch${ch}`;
            currentChapterIndex = state.generatedChapters.findIndex(c => c.key === key);
            setChapterWriting(key);
          }
          if (data.type === 'text') appendText(data.text);
          if (data.type === 'chapter_end') {
            const ch = data.chapter;
            let key = ch === 0 ? 'intro' : ch === -1 ? 'about' : ch === state.pillars.length + 1 ? 'conclusion' : `ch${ch}`;
            setChapterDone(key);
          }
          if (data.type === 'complete') {
            $$('.cp-item').forEach(el => { el.classList.remove('writing'); el.classList.add('done'); });
            previewBody.querySelector('.writing-cursor')?.remove();
            $('#previewStatus').textContent = 'Complete ✓';
            $('#goToMarketing').classList.remove('hidden');
            state.isGenerating = false;
            toast('Your eBook has been written!', 'success');
          }
          if (data.type === 'error') throw new Error(data.message);
        } catch {}
      }
    }
  } catch (err) {
    state.isGenerating = false;
    toast(`Generation failed: ${err.message}`, 'error');
    $('#previewStatus').textContent = 'Error — try again';
    $('#backTo5Gen').classList.remove('hidden');
  }

  $('#goToMarketing').addEventListener('click', () => {
    goToStep(7);
    generateMarketingPlan();
  });
}

// ── Step 7: Marketing Plan ────────────────────────────────────
async function generateMarketingPlan() {
  $('#marketingLoading').classList.remove('hidden');
  $('#marketingContent').classList.add('hidden');

  try {
    const res = await fetch('/api/marketing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedIdea: state.selectedIdea, answers: state.answers, pillars: state.pillars }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state.marketingPlan = data.plan;
    renderMarketingPlan(data.plan);
  } catch (err) {
    toast(`Marketing plan failed: ${err.message}`, 'error');
  } finally {
    $('#marketingLoading').classList.add('hidden');
  }

  $('#goToExport').onclick = () => { goToStep(8); renderEbookPreview(); };
}

function renderMarketingPlan(plan) {
  const container = $('#marketingContent');
  container.innerHTML = '';

  // ── Launch Timeline
  const timeline = document.createElement('div');
  timeline.innerHTML = `
    <h2 class="marketing-section-title">Launch Timeline</h2>
    <p class="marketing-section-subtitle">A phased approach to getting your book in front of the right people.</p>
    <div class="marketing-grid">
      ${(plan.launchTimeline || []).map(phase => `
        <div class="marketing-card">
          <div class="marketing-card-header">
            <div class="marketing-card-icon">📅</div>
            <div class="marketing-card-title">${phase.phase}</div>
          </div>
          <p style="font-size:0.75rem;color:var(--gold-dark);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.75rem">${phase.timing}</p>
          <div class="marketing-items">
            ${(phase.actions || []).map(a => `
              <div class="marketing-item"><div class="marketing-bullet"></div><div class="marketing-item-text">${a}</div></div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
  container.appendChild(timeline);

  // ── Channels
  const channels = document.createElement('div');
  channels.innerHTML = `
    <h2 class="marketing-section-title" style="margin-top:2rem">Channel Tactics</h2>
    <p class="marketing-section-subtitle">Where to show up and what to say on each platform.</p>
    <div class="marketing-grid">
      ${(plan.channels || []).map(ch => `
        <div class="marketing-card">
          <div class="marketing-card-header">
            <div class="marketing-card-icon">${ch.icon}</div>
            <div class="marketing-card-title">${ch.name}</div>
          </div>
          <div class="marketing-items">
            ${(ch.tactics || []).map(t => `
              <div class="marketing-item"><div class="marketing-bullet"></div><div class="marketing-item-text">${t}</div></div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
  container.appendChild(channels);

  // ── Webinar
  if (plan.webinarOutline) {
    const webinar = document.createElement('div');
    webinar.innerHTML = `
      <h2 class="marketing-section-title" style="margin-top:2rem">Launch Webinar Outline</h2>
      <p class="marketing-section-subtitle">A free webinar is one of the highest-converting ways to launch a book. Here's the structure.</p>
      <div class="marketing-card" style="max-width:680px">
        <div class="marketing-card-header">
          <div class="marketing-card-icon">🎤</div>
          <div class="marketing-card-title">${plan.webinarOutline.title}</div>
        </div>
        <p style="font-size:0.85rem;color:var(--text-mid);margin-bottom:1rem;font-style:italic">"${plan.webinarOutline.hook}"</p>
        <div class="marketing-items">
          ${(plan.webinarOutline.sections || []).map((s, i) => `
            <div class="marketing-item">
              <div class="marketing-bullet"></div>
              <div class="marketing-item-text"><strong>Part ${i + 1}</strong>${s}</div>
            </div>
          `).join('')}
          <div class="marketing-item">
            <div class="marketing-bullet" style="background:var(--purple)"></div>
            <div class="marketing-item-text"><strong>CTA</strong>${plan.webinarOutline.cta}</div>
          </div>
        </div>
      </div>`;
    container.appendChild(webinar);
  }

  // ── Example Social Posts
  if (plan.socialPosts) {
    const posts = document.createElement('div');
    posts.innerHTML = `
      <h2 class="marketing-section-title" style="margin-top:2rem">Example Posts & Copy</h2>
      <p class="marketing-section-subtitle">Customized to your book — use these directly or adapt them for your voice.</p>
      <div class="marketing-grid">
        ${(plan.socialPosts || []).map(post => `
          <div class="marketing-card">
            <div class="marketing-card-header">
              <div class="marketing-card-icon">${post.platform === 'LinkedIn' ? '💼' : post.platform === 'Instagram' ? '📸' : post.platform === 'Email' ? '📧' : '📱'}</div>
              <div class="marketing-card-title">${post.platform} · ${post.type}</div>
            </div>
            <p style="font-size:0.85rem;color:var(--text-mid);line-height:1.6;">${post.example}</p>
          </div>
        `).join('')}
      </div>`;
    container.appendChild(posts);
  }

  // ── AI Prompts
  if (plan.aiPrompts) {
    const promptsEl = document.createElement('div');
    promptsEl.innerHTML = `
      <h2 class="marketing-section-title" style="margin-top:2rem">AI Prompts for Your Content</h2>
      <p class="marketing-section-subtitle">Copy any prompt into ChatGPT, Claude, or your AI tool of choice. Each is pre-filled with your book's details — just paste and run.</p>
      <div class="prompts-grid">
        ${(plan.aiPrompts || []).map(prompt => `
          <div class="prompt-card">
            <div class="prompt-card-label">${prompt.label}</div>
            <div class="prompt-card-text">${prompt.prompt}</div>
            <button class="prompt-copy-btn" onclick="copyPrompt(this, \`${prompt.prompt.replace(/`/g, "'")}\`)">Copy</button>
          </div>
        `).join('')}
      </div>`;
    container.appendChild(promptsEl);
  }

  container.classList.remove('hidden');
}

window.copyPrompt = function(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
};

// ── Step 8: Export ────────────────────────────────────────────
function renderEbookPreview() {
  const html = generateEbookHtml();
  const wordHtml = generateWordHtml();
  const preview = $('#ebookPreview');
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;border:none;min-height:900px;display:block;';
  preview.innerHTML = '';
  preview.appendChild(iframe);

  // Write into iframe after it's attached to DOM
  setTimeout(() => {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      const h = doc.documentElement.scrollHeight;
      if (h > 400) iframe.style.height = h + 'px';
    }, 500);
  }, 50);

  // Remove old listeners by replacing buttons
  const dlBtn = $('#downloadHtml');
  const newDl = dlBtn.cloneNode(true);
  dlBtn.replaceWith(newDl);
  newDl.addEventListener('click', () => {
    showLeadModal(() => {
      downloadFile(html, `${safeFilename()}.html`, 'text/html');
      toast('eBook downloaded! Open in Chrome → Print → Save as PDF for the best result.', 'success');
    });
  });

  const wordBtn = $('#downloadWord');
  if (wordBtn) {
    const newWord = wordBtn.cloneNode(true);
    wordBtn.replaceWith(newWord);
    newWord.addEventListener('click', () => {
      showLeadModal(() => {
        downloadFile(wordHtml, `${safeFilename()}.doc`, 'application/msword');
        toast('Word document downloaded! Open in Microsoft Word or Google Docs.', 'success');
      });
    });
  }

  const copyBtn = $('#copyForDocs');
  if (copyBtn) {
    const newCopy = copyBtn.cloneNode(true);
    copyBtn.replaceWith(newCopy);
    newCopy.addEventListener('click', () => {
      showLeadModal(() => {
        const plainText = state.generatedChapters.map(ch => `${ch.title}\n\n${ch.content}`).join('\n\n---\n\n');
        navigator.clipboard.writeText(plainText).then(() => {
          toast('Book text copied! Paste into Google Docs (Edit → Paste).', 'success');
        });
      });
    });
  }

  const printBtn = $('#printEbook');
  const newPrint = printBtn.cloneNode(true);
  printBtn.replaceWith(newPrint);
  newPrint.addEventListener('click', () => {
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  });

  const soBtn = $('#startOver');
  const newSo = soBtn.cloneNode(true);
  soBtn.replaceWith(newSo);
  newSo.addEventListener('click', () => { if (confirm('Start over? All progress will be lost.')) location.reload(); });
}

function safeFilename() {
  return (state.selectedIdea?.title || 'ebook').replace(/[^a-z0-9]/gi, '_').substring(0, 60);
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function generateEbookHtml() {
  const { primaryColor, accentColor, textColor, fontHeading, fontBody, logoDataUrl, coverDataUrl, customCss } = state.branding;
  const idea = state.selectedIdea;
  const bookTitle = state.bookTitle || idea?.title || 'Your eBook';
  const authorName = state.answers.authorName || 'the author';
  const website = state.answers.website || '';

  const extractGFont = fs => { const m = fs.match(/'([^']+)'/); return m ? m[1].replace(/ /g, '+') : null; };
  const hFont = extractGFont(fontHeading);
  const bFont = extractGFont(fontBody);
  const gFontImports = [hFont, bFont].filter(Boolean)
    .map(f => `@import url('https://fonts.googleapis.com/css2?family=${f.replace(/ /g,'+')}:ital,wght@0,300;0,400;0,700;1,400&display=swap');`)
    .join('\n');

  const tocItems = ['Introduction', ...state.pillars.map(p => p.title), 'Conclusion & Next Steps', 'About the Author'];

  const chapterHtml = state.generatedChapters.map((ch, i) => {
    const paragraphs = ch.content.split(/\n+/).filter(p => p.trim()).map(p => {
      const line = p.trim();
      if (line.startsWith('# '))   return `<h2 class="ch-h1">${line.slice(2)}</h2>`;
      if (line.startsWith('## '))  return `<h3 class="ch-h2">${line.slice(3)}</h3>`;
      if (line.startsWith('### ')) return `<h4 class="ch-h3">${line.slice(4)}</h4>`;
      if (line.startsWith('**') && line.endsWith('**')) return `<h3 class="ch-h2">${line.slice(2,-2)}</h3>`;
      return `<p>${line.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>')}</p>`;
    }).join('\n');

    const isSpecial = ch.key === 'intro' || ch.key === 'conclusion' || ch.key === 'about';
    const chapterNum = isSpecial ? '' : `Chapter ${i}`;

    return `<div class="book-page">
  <div class="chapter-page">
    ${!isSpecial ? `<div class="chapter-eyebrow">${chapterNum}</div>` : ''}
    <h1 class="chapter-title">${ch.title}</h1>
    <div class="chapter-rule"></div>
    <div class="chapter-body">${paragraphs}</div>
    ${website ? `<div class="page-footer">${authorName} · ${website}</div>` : ''}
  </div>
</div>`;
  }).join('\n');

  const hasCoverImg = !!coverDataUrl;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${bookTitle}</title>
<style>
${gFontImports}

:root {
  --primary: ${primaryColor};
  --accent:  ${accentColor};
  --text:    ${textColor};
  --fh: ${fontHeading};
  --fb: ${fontBody};
}

/* ── Reset ── */
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--fb);
  font-size: 12pt;
  line-height: 1.85;
  color: var(--text);
  background: #f4f4f4;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Page wrapper — gives margins in browser view ── */
.book-page {
  background: #fff;
  max-width: 780px;
  margin: 2rem auto;
  padding: 1.25in 1.1in;
  box-shadow: 0 2px 20px rgba(0,0,0,0.12);
  position: relative;
}

/* Cover is full-bleed — no page wrapper needed */
.cover-wrap {
  max-width: 780px;
  margin: 2rem auto 0;
  box-shadow: 0 2px 20px rgba(0,0,0,0.12);
}

/* ── Print — suppress browser chrome, use @page margins ── */
@page {
  size: A4;
  margin: 1.1in 1in;
}
@page :first { margin: 0; }

@media print {
  body { background: #fff; }
  .book-page {
    max-width: none;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
  .cover-wrap {
    max-width: none;
    margin: 0;
    box-shadow: none;
  }
  .cover-wrap { page-break-after: always; }
  .toc-wrap   { page-break-after: always; }
  .chapter-page { page-break-before: always; }
  .colophon-page { page-break-before: always; }
}

/* ── Cover ── */
.cover-wrap {
  width: 100%;
  min-height: 900px;
  background-color: var(--primary);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 5rem 4rem;
}

/* Decorative circle */
.cover-wrap::before {
  content: '';
  position: absolute;
  bottom: -80px; right: -80px;
  width: 400px; height: 400px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.12;
  pointer-events: none;
}
.cover-wrap::after {
  content: '';
  position: absolute;
  top: -60px; left: -60px;
  width: 250px; height: 250px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.07;
  pointer-events: none;
}

.cover-img-panel {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 42%;
  overflow: hidden;
}
.cover-img-panel img {
  width: 100%; height: 100%; object-fit: cover; opacity: 0.45;
  display: block;
}

.cover-body {
  position: relative;
  z-index: 3;
  max-width: ${hasCoverImg ? '54%' : '78%'};
}

.cover-logo-img {
  max-height: 55px;
  max-width: 180px;
  object-fit: contain;
  margin-bottom: 3.5rem;
  display: block;
}

.cover-eyebrow {
  font-family: var(--fh);
  font-size: 11pt;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 1rem;
}

.cover-title {
  font-family: var(--fh);
  font-size: 52pt;
  font-weight: 400;
  letter-spacing: 0.04em;
  line-height: 0.95;
  color: #ffffff;
  margin-bottom: 0.8rem;
}

.cover-rule {
  width: 70px; height: 4px;
  background: var(--accent);
  margin: 1.2rem 0 1.6rem;
}

.cover-subtitle {
  font-family: var(--fb);
  font-size: 14pt;
  color: rgba(255,255,255,0.72);
  font-style: italic;
  line-height: 1.4;
  margin-bottom: 3rem;
}

.cover-author {
  font-family: var(--fh);
  font-size: 14pt;
  letter-spacing: 0.1em;
  color: var(--accent);
}

/* ── Table of Contents ── */
.toc-wrap { }
.toc-title {
  font-family: var(--fh);
  font-size: 26pt;
  letter-spacing: 0.08em;
  color: var(--primary);
  margin-bottom: 0.4rem;
}
.toc-rule {
  width: 3rem; height: 3px;
  background: var(--accent);
  margin-bottom: 2.5rem;
}
.toc-item {
  display: flex; align-items: baseline; gap: 0.5rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid rgba(0,0,0,0.07);
  font-family: var(--fb); font-size: 11pt;
}
.toc-num {
  font-family: var(--fh); font-size: 10pt;
  letter-spacing: 0.08em; color: var(--accent);
  width: 2.2rem; flex-shrink: 0;
}
.toc-label { flex: 1; color: var(--text); }

/* ── Chapter Pages ── */
.chapter-page { position: relative; }
.chapter-eyebrow {
  font-family: var(--fh);
  font-size: 9pt; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--accent);
  margin-bottom: 0.75rem;
}
.chapter-title {
  font-family: var(--fh);
  font-size: 30pt; letter-spacing: 0.04em;
  color: var(--primary); line-height: 1.05;
}
.chapter-rule {
  width: 3.5rem; height: 3px;
  background: var(--accent);
  margin: 1.2rem 0 2.2rem;
}
.chapter-body p {
  margin-bottom: 1.1em;
  font-size: 12pt; color: var(--text);
  line-height: 1.85; text-align: justify;
}
.ch-h1 {
  font-family: var(--fh); font-size: 18pt;
  letter-spacing: 0.04em; color: var(--primary);
  margin: 2rem 0 0.8rem;
}
.ch-h2 {
  font-family: var(--fh); font-size: 14pt;
  letter-spacing: 0.03em; color: var(--primary);
  margin: 1.5rem 0 0.6rem;
}
.ch-h3 {
  font-family: var(--fb); font-size: 12pt;
  font-weight: 700; color: var(--accent);
  margin: 1.25rem 0 0.5rem;
}
.chapter-body strong { color: var(--primary); }
.chapter-body em { font-style: italic; }

/* ── Page footer (author + website) ── */
.page-footer {
  font-family: var(--fb);
  font-size: 8pt; color: rgba(0,0,0,0.35);
  letter-spacing: 0.04em;
  margin-top: 3rem;
  padding-top: 0.75rem;
  text-align: center;
  border-top: 1px solid rgba(0,0,0,0.1);
}

/* ── Colophon (final page) ── */
.colophon-page {
  max-width: 780px;
  margin: 0 auto 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
  padding: 4rem;
  background: var(--primary);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  box-shadow: 0 2px 20px rgba(0,0,0,0.12);
}
@media print {
  .colophon-page { max-width: none; margin: 0; box-shadow: none; }
}
.colophon-mark {
  font-size: 2.5rem; margin-bottom: 1.5rem; opacity: 0.6;
}
.colophon-text {
  font-family: var(--fh);
  font-size: 11pt; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--accent);
  margin-bottom: 0.5rem;
}
.colophon-brand {
  font-family: var(--fh);
  font-size: 18pt; letter-spacing: 0.1em;
  color: #ffffff; margin-bottom: 1rem;
}
.colophon-link {
  font-family: var(--fb); font-size: 10pt;
  color: rgba(255,255,255,0.55);
  text-decoration: none; letter-spacing: 0.06em;
}

${customCss || ''}
</style>
</head>
<body>

<!-- ── Cover ── -->
<div class="cover-wrap">
  ${hasCoverImg ? `<div class="cover-img-panel"><img src="${coverDataUrl}" alt="" /></div>` : ''}
  <div class="cover-body">
    ${logoDataUrl ? `<img class="cover-logo-img" src="${logoDataUrl}" alt="Logo" />` : ''}
    <div class="cover-eyebrow">A guide by ${authorName}</div>
    <h1 class="cover-title">${bookTitle}</h1>
    <div class="cover-rule"></div>
    <p class="cover-subtitle">${idea?.subtitle || ''}</p>
    <div class="cover-author">by ${authorName}${website ? '<br><span style="font-size:10pt;opacity:0.7">' + website + '</span>' : ''}</div>
  </div>
</div>

<!-- ── Table of Contents ── -->
<div class="book-page">
  <div class="toc-wrap">
    <h2 class="toc-title">Contents</h2>
    <div class="toc-rule"></div>
    ${tocItems.map((title, i) => `
    <div class="toc-item">
      <span class="toc-num">${String(i + 1).padStart(2,'0')}</span>
      <span class="toc-label">${title}</span>
    </div>`).join('')}
  </div>
</div>

<!-- ── Chapters ── -->
${chapterHtml}

<!-- ── Colophon ── -->
<div class="colophon-page">
  <div class="colophon-mark">✦</div>
  <div class="colophon-text">Created with</div>
  <div class="colophon-brand">Beyond the Dream Board</div>
  <a class="colophon-link" href="https://www.vivstoolbox.com">www.vivstoolbox.com</a>
</div>

</body>
</html>`;
}

function generateWordHtml() {
  const { primaryColor, accentColor, textColor, fontHeading, fontBody } = state.branding;
  const bookTitle = state.bookTitle || state.selectedIdea?.title || 'Your eBook';
  const authorName = state.answers.authorName || 'the author';
  const website = state.answers.website || '';

  const chapterContent = state.generatedChapters.map(ch => {
    const body = ch.content
      .split(/\n+/)
      .filter(p => p.trim())
      .map(p => {
        const line = p.trim();
        if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
        if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
        return `<p>${line.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>')}</p>`;
      }).join('\n');
    return `<h1>${ch.title}</h1>\n${body}\n<hr />`;
  }).join('\n');

  return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="UTF-8">
<title>${bookTitle}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
body { font-family: ${fontBody.split(',')[0].replace(/'/g,'')}; font-size: 12pt; line-height: 1.8; color: ${textColor}; margin: 1in; }
h1 { font-family: ${fontHeading.split(',')[0].replace(/'/g,'')}; font-size: 24pt; color: ${primaryColor}; margin: 2rem 0 0.5rem; page-break-before: always; }
h2 { font-family: ${fontHeading.split(',')[0].replace(/'/g,'')}; font-size: 16pt; color: ${primaryColor}; margin: 1.5rem 0 0.5rem; }
h3 { font-size: 12pt; font-weight: bold; color: ${accentColor}; margin: 1rem 0 0.4rem; }
p { margin-bottom: 1em; }
hr { border: none; border-top: 2px solid ${accentColor}; margin: 2rem 0; }
.cover { text-align: center; padding: 3rem; }
.cover h1 { font-size: 36pt; page-break-before: avoid; }
.author { font-size: 14pt; color: ${accentColor}; margin-top: 1rem; }
</style>
</head>
<body>
<div class="cover">
<h1>${bookTitle}</h1>
<p class="author">by ${authorName}</p>
${website ? `<p style="color:#999;font-size:10pt">${website}</p>` : ''}
</div>
${chapterContent}
<p style="text-align:center;color:#999;font-size:9pt;margin-top:3rem">Created with Beyond the Dream Board · www.vivstoolbox.com</p>
</body>
</html>`;
}

// ── Lead Capture Modal ────────────────────────────────────────
let pendingDownloadFn = null;

function showLeadModal(onSuccess) {
  pendingDownloadFn = onSuccess;
  $('#leadOverlay').classList.remove('hidden');
  setTimeout(() => $('#lead-firstName').focus(), 100);
}

function hideLeadModal() {
  $('#leadOverlay').classList.add('hidden');
  pendingDownloadFn = null;
}

function initLeadModal() {
  const submitBtn  = $('#leadSubmit');
  const submitText = $('#leadSubmitText');

  $('#leadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = $('#lead-firstName').value.trim();
    const lastName  = $('#lead-lastName').value.trim();
    const email     = $('#lead-email').value.trim();
    const website   = $('#lead-website').value.trim();
    const phone     = $('#lead-phone').value.trim();

    if (!firstName || !email) { toast('Please enter your name and email.', 'info'); return; }

    submitBtn.disabled = true;
    submitText.textContent = 'Saving…';

    try {
      await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, email, website, phone,
          bookTitle: state.bookTitle || state.selectedIdea?.title || '',
        }),
      });
    } catch (err) {
      console.error('Lead capture error:', err);
      // Don't block download on error
    }

    hideLeadModal();
    if (pendingDownloadFn) pendingDownloadFn();
  });

  $('#leadSkip').addEventListener('click', () => {
    hideLeadModal();
    if (pendingDownloadFn) pendingDownloadFn();
  });

  // Close on backdrop click
  $('#leadOverlay').addEventListener('click', (e) => {
    if (e.target === $('#leadOverlay')) {
      hideLeadModal();
      if (pendingDownloadFn) pendingDownloadFn();
    }
  });
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initGather();
  initLeadModal();
  $('#pastedText')?.addEventListener('input', () => { updateContentSummary(); checkAnalyzeReady(); });
});
