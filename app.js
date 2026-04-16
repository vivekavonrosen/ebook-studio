/* ─────────────────────────────────────────────────────────────
   eBook Studio — App with Supabase Auth + Project Save/Load
───────────────────────────────────────────────────────────── */

// ── Supabase client ───────────────────────────────────────────
const SUPABASE_URL = 'https://umreguyhensnwqafpukv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtcmVndXloZW5zbndxYWZwdWt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTIxNDgsImV4cCI6MjA4OTg4ODE0OH0.F1-5mDb3MeUCj8_U5dl5fEU-996lqZd9Pwc0S-QIfV8';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──────────────────────────────────────────────────────
const state = {
  currentStep: 1, mode: 'single',
  sources: [], ideas: [], selectedIdea: null, pillars: [],
  answers: {}, bookTitle: null, contentOwner: 'myself',
  branding: { primaryColor: '#571F81', accentColor: '#DFB24A', textColor: '#1A0A2E', fontHeading: "'Bebas Neue', Georgia, serif", fontBody: "'Lato', system-ui, sans-serif", logoDataUrl: null, coverDataUrl: null, customCss: null, brandGuide: '' },
  generatedChapters: [], marketingPlan: null,
  isGenerating: false, projectId: null,
  user: null, accessToken: null,
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function toast(msg, type = 'info', dur = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  $('#toastContainer').appendChild(el);
  setTimeout(() => el.remove(), dur);
}

function authFetch(url, opts = {}) {
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), 'Authorization': `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' } });
}

// ── AUTH ───────────────────────────────────────────────────────
window.showAuthTab = function(tab) {
  ['signin','signup','forgot','confirm'].forEach(t => {
    $(`#form${t.charAt(0).toUpperCase()+t.slice(1)}`)?.classList.add('hidden');
  });
  $(`#tabSignIn`)?.classList.remove('active');
  $(`#tabSignUp`)?.classList.remove('active');
  if (tab === 'signin') { $('#formSignIn').classList.remove('hidden'); $('#tabSignIn')?.classList.add('active'); }
  else if (tab === 'signup') { $('#formSignUp').classList.remove('hidden'); $('#tabSignUp')?.classList.add('active'); }
  else if (tab === 'forgot') { $('#formForgot').classList.remove('hidden'); }
  else if (tab === 'confirm') { $('#formConfirm').classList.remove('hidden'); }
};

function initAuth() {
  // Email sign in
  $('#si-submit').addEventListener('click', async () => {
    const email = $('#si-email').value.trim(), password = $('#si-password').value;
    if (!email || !password) return showAuthError('si', 'Please enter your email and password.');
    $('#si-submit').textContent = 'Signing in…'; $('#si-submit').disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { showAuthError('si', error.message); $('#si-submit').textContent = 'Sign In ✦'; $('#si-submit').disabled = false; }
  });
  $('#si-password').addEventListener('keydown', e => { if (e.key === 'Enter') $('#si-submit').click(); });

  // Email sign up
  $('#su-submit').addEventListener('click', async () => {
    const name = $('#su-name').value.trim(), email = $('#su-email').value.trim(), password = $('#su-password').value;
    if (!name || !email || !password) return showAuthError('su', 'Please fill in all fields.');
    if (password.length < 8) return showAuthError('su', 'Password must be at least 8 characters.');
    $('#su-submit').textContent = 'Creating account…'; $('#su-submit').disabled = true;
    const { error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) { showAuthError('su', error.message); $('#su-submit').textContent = 'Create My Account ✦'; $('#su-submit').disabled = false; }
    else showAuthTab('confirm');
  });

  // Forgot password
  $('#fp-submit').addEventListener('click', async () => {
    const email = $('#fp-email').value.trim();
    if (!email) return showAuthError('fp', 'Please enter your email.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) showAuthError('fp', error.message);
    else { $('#fp-success').classList.remove('hidden'); $('#fp-error').classList.add('hidden'); }
  });

  // Google OAuth
  const signInGoogle = async () => { await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); };
  const signInGitHub = async () => { await sb.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } }); };
  $('#googleSignIn').addEventListener('click', signInGoogle);
  $('#googleSignUp').addEventListener('click', signInGoogle);
  $('#githubSignIn').addEventListener('click', signInGitHub);
  $('#githubSignUp').addEventListener('click', signInGitHub);

  // Sign out
  $('#signOutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.reload();
  });

  // Auth state changes
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      state.user = session.user;
      state.accessToken = session.access_token;
      onSignedIn();
    } else {
      showAuthScreen();
    }
  });
}

function showAuthError(form, msg) {
  const el = $(`#${form}-error`);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function showAuthScreen() {
  $('#authScreen').classList.remove('hidden');
  $('#dashboardScreen').classList.add('hidden');
  $('#app').classList.add('hidden');
  $('#appHeader').classList.add('hidden');
}

async function onSignedIn() {
  $('#authScreen').classList.add('hidden');
  $('#appHeader').classList.remove('hidden');
  // Set user avatar initials
  const name = state.user.user_metadata?.full_name || state.user.email || 'U';
  const initials = name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
  // Show dashboard
  showDashboard();
}

// ── DASHBOARD ─────────────────────────────────────────────────
async function showDashboard() {
  $('#dashboardScreen').classList.remove('hidden');
  $('#app').classList.add('hidden');
  // Update step trail
  $$('.trail-item').forEach(i => i.classList.remove('active','done'));

  const userName = state.user.user_metadata?.full_name || state.user.email?.split('@')[0] || 'there';
  $('#dashWelcome').textContent = `Welcome back, ${userName}`;

  $('#dashLoading').classList.remove('hidden');
  $('#dashEmpty').classList.add('hidden');
  $('#projectsGrid').innerHTML = '';

  try {
    const res = await authFetch('/api/projects');
    const data = await res.json();
    const projects = data.projects || [];
    $('#dashLoading').classList.add('hidden');

    if (projects.length === 0) {
      $('#dashEmpty').classList.remove('hidden');
    } else {
      renderProjectCards(projects);
    }
  } catch (err) {
    $('#dashLoading').classList.add('hidden');
    toast('Could not load projects.', 'error');
  }

  $('#newBookBtn').onclick = startNewBook;
  $('#dashboardBtn').onclick = showDashboard;
}

function renderProjectCards(projects) {
  const grid = $('#projectsGrid');
  grid.innerHTML = '';
  projects.forEach(p => {
    const date = new Date(p.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const statusColor = p.status === 'complete' ? 'var(--teal)' : 'var(--gold-dark)';
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-top">
        <div class="project-card-status" style="color:${statusColor}">${p.status === 'complete' ? '✓ Complete' : '○ Draft'}</div>
        <button class="project-delete" data-id="${p.id}" title="Delete">×</button>
      </div>
      <h3 class="project-card-title">${p.title || 'Untitled Book'}</h3>
      ${p.subtitle ? `<p class="project-card-subtitle">${p.subtitle}</p>` : ''}
      <p class="project-card-date">Last edited ${date}</p>
      <button class="btn-primary btn-sm project-open" data-id="${p.id}" style="margin-top:1rem;width:100%">Open Book →</button>`;
    card.querySelector('.project-open').addEventListener('click', () => loadProject(p.id));
    card.querySelector('.project-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
      await authFetch(`/api/projects/${p.id}`, { method: 'DELETE' });
      card.remove();
      if (grid.children.length === 0) $('#dashEmpty').classList.remove('hidden');
    });
    grid.appendChild(card);
  });
}

function startNewBook() {
  // Reset state
  Object.assign(state, { sources: [], ideas: [], selectedIdea: null, pillars: [], answers: {}, bookTitle: null, contentOwner: 'myself', generatedChapters: [], marketingPlan: null, isGenerating: false, projectId: null, branding: { primaryColor: '#571F81', accentColor: '#DFB24A', textColor: '#1A0A2E', fontHeading: "'Bebas Neue', Georgia, serif", fontBody: "'Lato', system-ui, sans-serif", logoDataUrl: null, coverDataUrl: null, customCss: null, brandGuide: '' } });
  $('#dashboardScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  goToStep(1);
  initGather();
}

async function loadProject(id) {
  try {
    const res = await authFetch(`/api/projects/${id}`);
    const { project } = await res.json();
    // Restore state
    state.projectId = project.id;
    state.selectedIdea = project.selected_idea;
    state.pillars = project.pillars || [];
    state.answers = project.answers || {};
    state.branding = project.branding || state.branding;
    state.generatedChapters = project.generated_chapters || [];
    state.marketingPlan = project.marketing_plan || null;
    state.bookTitle = project.book_title;
    state.mode = project.mode || 'single';
    state.contentOwner = project.content_owner || 'myself';

    $('#dashboardScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');

    // Go to the right step based on what's complete
    if (state.generatedChapters.length > 0) {
      goToStep(8);
      renderEbookPreview();
    } else if (state.pillars.length > 0 && state.answers.idealReader) {
      goToStep(6);
    } else if (state.pillars.length > 0) {
      goToStep(4);
      restoreClarifyForm();
    } else if (state.selectedIdea) {
      goToStep(3);
    } else {
      goToStep(1);
      initGather();
    }

    toast(`Opened: "${project.title}"`, 'success');
  } catch (err) {
    toast('Could not load project.', 'error');
  }
}

function restoreClarifyForm() {
  const a = state.answers;
  if (a.idealReader) $('#q-idealReader').value = a.idealReader;
  if (a.uniqueApproach) $('#q-uniqueApproach').value = a.uniqueApproach;
  if (a.clientPains) $('#q-clientPains').value = a.clientPains;
  if (a.bookSolution) $('#q-bookSolution').value = a.bookSolution;
  if (a.transformation) $('#q-transformation').value = a.transformation;
  if (a.callToAction) $('#q-callToAction').value = a.callToAction;
  if (a.authorBio) $('#q-authorBio').value = a.authorBio;
  if (a.website) $('#q-website').value = a.website;
  if (a.authorName) $('#authorNameInput').value = a.authorName;
}

// ── Save project to Supabase ──────────────────────────────────
async function saveProject(updates = {}) {
  if (!state.accessToken) return;
  const payload = {
    title: state.bookTitle || state.selectedIdea?.title || 'Untitled Book',
    subtitle: state.selectedIdea?.subtitle || '',
    author_name: state.answers.authorName || '',
    mode: state.mode,
    book_title: state.bookTitle,
    selected_idea: state.selectedIdea,
    pillars: state.pillars,
    answers: state.answers,
    branding: state.branding,
    generated_chapters: state.generatedChapters,
    marketing_plan: state.marketingPlan,
    content_owner: state.contentOwner,
    ...updates
  };
  try {
    if (state.projectId) {
      await authFetch(`/api/projects/${state.projectId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      const res = await authFetch('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.project?.id) state.projectId = data.project.id;
    }
  } catch (err) { console.error('Save error:', err); }
}

// ── Navigation ────────────────────────────────────────────────
function goToStep(n) {
  $$('.step').forEach(s => s.classList.remove('active'));
  $(`#step-${n}`)?.classList.add('active');
  state.currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $$('.trail-item').forEach(item => {
    const step = parseInt(item.dataset.step);
    item.classList.remove('active', 'done');
    if (step === n) item.classList.add('active');
    else if (step < n) item.classList.add('done');
  });
}

function initTrailNav() {
  $$('.trail-item').forEach(item => {
    item.addEventListener('click', () => {
      const step = parseInt(item.dataset.step);
      if (step < state.currentStep) {
        if (step === 1 && !confirm('Go back to Step 1 to edit your sources?')) return;
        goToStep(step);
        if (step === 1) initGather();
      }
    });
  });
}

// ── Step 1: Gather ────────────────────────────────────────────
function combineContent() {
  const parts = state.sources.map(s => `=== SOURCE: ${s.name} ===\n${s.text}`);
  const pasted = $('#pastedText')?.value?.trim();
  if (pasted) parts.push(`=== SOURCE: Pasted Content ===\n${pasted}`);
  return parts.join('\n\n');
}

window.setMode = function(mode) {
  state.mode = mode;
  $('#modeSingle').classList.toggle('active', mode === 'single');
  $('#modeSynth').classList.toggle('active', mode === 'synthesis');
  mode === 'synthesis' ? $('#synthesisBanner').classList.remove('hidden') : $('#synthesisBanner').classList.add('hidden');
};

function initGather() {
  const dropZone = $('#dropZone'), fileInput = $('#fileInput');
  if (!dropZone) return;
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
  const has = state.sources.length > 0 || ($('#pastedText')?.value?.trim().length > 100);
  if ($('#analyzeBtn')) $('#analyzeBtn').disabled = !has;
}

async function handleFileUpload(files) {
  if (!files || files.length === 0) return;
  const fileList = $('#fileList'), formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
    const item = document.createElement('div');
    item.className = 'file-item'; item.id = `file-${file.name.replace(/\W/g,'_')}`;
    item.innerHTML = `<span class="file-name" title="${file.name}">${file.name}</span><span class="file-size">${(file.size/1024).toFixed(0)}KB</span><span class="file-status loading">⟳</span>`;
    fileList.appendChild(item);
  }
  try {
    const res = await fetch('/api/extract/files', { method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}` }, body: formData });
    const data = await res.json();
    (data.results || []).forEach(r => {
      state.sources.push(r);
      const el = $(`#file-${r.name.replace(/\W/g,'_')}`) || $('.file-item:last-child');
      if (el) { el.querySelector('.file-status').textContent = '✓'; el.querySelector('.file-status').className = 'file-status done'; }
    });
    (data.errors || []).forEach(e => { toast(`Could not read ${e.name}: ${e.error}`, 'error'); });
    updateContentSummary(); checkAnalyzeReady();
  } catch (err) { toast('Upload failed.', 'error'); }
}

function addUrlRow() {
  const row = document.createElement('div'); row.className = 'url-row';
  row.innerHTML = `<input type="url" class="url-field" placeholder="https://..." /><button class="url-remove" onclick="this.closest('.url-row').remove()">×</button>`;
  $('#urlInputs').appendChild(row);
}

async function scrapeUrls() {
  const urls = $$('.url-field').map(f => f.value.trim()).filter(Boolean);
  if (!urls.length) return toast('Enter at least one URL.', 'info');
  const btn = $('#scrapeBtn'); btn.textContent = 'Fetching…'; btn.disabled = true;
  const resultsEl = $('#urlResults'); resultsEl.innerHTML = '';
  try {
    const res = await authFetch('/api/extract/urls', { method: 'POST', body: JSON.stringify({ urls }) });
    const data = await res.json();
    (data.results || []).forEach(r => {
      state.sources.push(r);
      const el = document.createElement('div'); el.className = 'url-result success';
      el.textContent = `✓ ${r.name.substring(0,60)}… — ${r.wordCount.toLocaleString()} words`;
      resultsEl.appendChild(el);
    });
    (data.errors || []).forEach(e => {
      const el = document.createElement('div'); el.className = 'url-result error';
      el.textContent = `✗ ${e.name.substring(0,50)}…: ${e.error}`; resultsEl.appendChild(el);
    });
    updateContentSummary(); checkAnalyzeReady();
  } catch (err) { toast('Scraping failed.', 'error'); }
  finally { btn.textContent = 'Fetch Content'; btn.disabled = false; }
}

function updateContentSummary() {
  const totalWords = state.sources.reduce((s, src) => s + src.wordCount, 0);
  const pastedWords = ($('#pastedText')?.value || '').trim().split(/\s+/).filter(Boolean).length;
  const summary = $('#contentSummary'), statsEl = $('#summaryStats');
  if (state.sources.length === 0 && pastedWords === 0) { summary.classList.add('hidden'); return; }
  summary.classList.remove('hidden');
  statsEl.innerHTML = `<div class="stat-item"><span>${state.sources.length}</span> sources</div><div class="stat-item">~<span>${(totalWords + pastedWords).toLocaleString()}</span> words</div>`;
}

async function analyzeContent() {
  const content = combineContent();
  if (content.length < 200) return toast('Add more content first.', 'info');
  state.answers.authorName = $('#authorNameInput').value.trim();
  state.contentOwner = $('input[name="contentOwner"]:checked')?.value || 'myself';
  goToStep(2);
  $('#ideasLoading').classList.remove('hidden');
  $('#ideasGrid').innerHTML = ''; $('#confirmIdea').classList.add('hidden');
  try {
    const res = await authFetch('/api/ideas', { method: 'POST', body: JSON.stringify({ content, authorName: state.answers.authorName, mode: state.mode }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state.ideas = data.ideas;
    renderIdeas();
  } catch (err) { toast(`Analysis failed: ${err.message}`, 'error'); goToStep(1); }
  finally { $('#ideasLoading').classList.add('hidden'); }
}

// ── Step 2: Ideas ─────────────────────────────────────────────
function renderIdeas() {
  const grid = $('#ideasGrid'); grid.innerHTML = '';
  state.ideas.forEach(idea => {
    const card = document.createElement('div');
    card.className = 'idea-card'; card.dataset.id = idea.id;
    card.innerHTML = `<div class="idea-tone">${idea.tone}${idea.sourcesDrawnFrom ? ' · Synthesis' : ''}</div><div class="idea-title">${idea.title}</div><div class="idea-subtitle">${idea.subtitle}</div><div class="idea-premise">${idea.premise}</div><div class="idea-meta"><div class="idea-meta-row"><strong>For:</strong> ${idea.targetAudience}</div><div class="idea-meta-row"><strong>Transformation:</strong> ${idea.transformation}</div></div>`;
    card.addEventListener('click', () => {
      $$('.idea-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected'); state.selectedIdea = idea; state.bookTitle = idea.title;
      const ti = $('#editableBookTitle'); if (ti) { ti.value = idea.title; $('#editableTitleRow').classList.remove('hidden'); }
      $('#confirmIdea').classList.remove('hidden');
    });
    grid.appendChild(card);
  });
  $('#confirmIdea').onclick = () => {
    const ti = $('#editableBookTitle');
    if (ti?.value.trim()) { state.bookTitle = ti.value.trim(); state.selectedIdea = { ...state.selectedIdea, title: state.bookTitle }; }
    buildPillars();
  };
  $('#regenerateIdeas').onclick = analyzeContent;
}

// ── Step 3: Pillars ───────────────────────────────────────────
async function buildPillars() {
  if (!state.selectedIdea) return;
  goToStep(3);
  $('#selectedIdeaBanner').innerHTML = `<div class="sib-title">${state.selectedIdea.title}</div><div class="sib-subtitle">${state.selectedIdea.subtitle}</div>`;
  $('#pillarsLoading').classList.remove('hidden'); $('#pillarsContainer').innerHTML = '';
  try {
    const res = await authFetch('/api/pillars', { method: 'POST', body: JSON.stringify({ selectedIdea: state.selectedIdea, content: combineContent(), mode: state.mode }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state.pillars = data.pillars; renderPillars();
    await saveProject({ status: 'draft' });
  } catch (err) { toast(`Could not build structure: ${err.message}`, 'error'); goToStep(2); }
  finally { $('#pillarsLoading').classList.add('hidden'); }
  $('#confirmPillars').onclick = () => { collectPillars(); goToStep(4); initClarify(); };
  $('#regeneratePillars').onclick = buildPillars;
  $('#addPillarBtn').onclick = () => { state.pillars.push({ id: String(state.pillars.length+1), title: 'New Chapter', description: '', keyInsights: [], order: state.pillars.length+1 }); renderPillars(); };
}

function renderPillars() {
  const container = $('#pillarsContainer'); container.innerHTML = '';
  state.pillars.forEach((p, i) => {
    const card = document.createElement('div'); card.className = 'pillar-card';
    card.innerHTML = `<div class="pillar-num">${String(i+1).padStart(2,'0')}</div><div class="pillar-body"><input class="pillar-title-input" type="text" value="${p.title}" placeholder="Chapter title" /><div class="pillar-desc">${p.description||''}</div></div><div class="pillar-actions-cell"><button class="pillar-btn" title="Remove" onclick="removePillar(${i})">×</button></div>`;
    container.appendChild(card);
  });
}

window.removePillar = i => { state.pillars.splice(i,1); renderPillars(); };
function collectPillars() { $$('.pillar-title-input').forEach((inp,i) => { if (state.pillars[i]) state.pillars[i].title = inp.value; }); }

// ── Step 4: Clarify ───────────────────────────────────────────
function initClarify() {
  $('#confirmClarify').onclick = async () => {
    const answers = {
      idealReader: $('#q-idealReader').value, uniqueApproach: $('#q-uniqueApproach').value,
      clientPains: $('#q-clientPains').value, bookSolution: $('#q-bookSolution').value,
      transformation: $('#q-transformation').value, callToAction: $('#q-callToAction').value,
      authorBio: $('#q-authorBio').value, website: $('#q-website').value.trim(),
      authorName: $('#authorNameInput').value.trim() || state.answers.authorName || 'the author',
    };
    const required = ['idealReader','uniqueApproach','clientPains','bookSolution','transformation','authorBio'];
    if (required.some(k => !answers[k]?.trim())) return toast('Please fill in all required fields.', 'info');
    state.answers = answers;
    await saveProject({ answers, status: 'draft' });
    goToStep(5); initBranding();
  };
}

// ── Step 5: Branding ──────────────────────────────────────────
function initBranding() {
  ['Primary','Accent','Text'].forEach(n => {
    const picker = $(`#color${n}`), hex = $(`#color${n}Hex`);
    picker.addEventListener('input', () => { hex.value = picker.value; updateBrandingState(); updateFontPreview(); });
    hex.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) { picker.value = hex.value; updateBrandingState(); } });
  });
  const presetColors = [['#571F81','#DFB24A'],['#1B3A4B','#2C97AF'],['#1A1A3E','#C9A96E'],['#1A2E1A','#7CAE7A'],['#2E1A1A','#C87864'],['#0D0D0D','#DFB24A']];
  $$('.preset-btn').forEach((btn, i) => {
    if (presetColors[i]) btn.style.background = `linear-gradient(135deg, ${presetColors[i][0]} 50%, ${presetColors[i][1]} 50%)`;
    btn.addEventListener('click', () => {
      $('#colorPrimary').value = btn.dataset.primary; $('#colorPrimaryHex').value = btn.dataset.primary;
      $('#colorAccent').value = btn.dataset.accent; $('#colorAccentHex').value = btn.dataset.accent;
      $('#colorText').value = btn.dataset.text; $('#colorTextHex').value = btn.dataset.text;
      updateBrandingState(); updateFontPreview();
    });
  });
  $('#fontHeading').addEventListener('change', updateFontPreview);
  $('#fontBody').addEventListener('change', updateFontPreview);
  updateFontPreview();
  ['logo','cover'].forEach(setupAssetUpload);
  const cssInput = $('#cssInput');
  $('#cssDropZone').addEventListener('click', e => { if (e.target.tagName!=='LABEL') cssInput.click(); });
  cssInput.addEventListener('change', () => { if (cssInput.files[0]) handleCssUpload(cssInput.files[0]); });
  $('#confirmBrand').onclick = () => { updateBrandingState(); state.branding.brandGuide = $('#brandGuideText').value.trim(); goToStep(6); startGeneration(); };
}

function updateBrandingState() {
  state.branding.primaryColor = $('#colorPrimary').value;
  state.branding.accentColor = $('#colorAccent').value;
  state.branding.textColor = $('#colorText').value;
  state.branding.fontHeading = $('#fontHeading').value;
  state.branding.fontBody = $('#fontBody').value;
}
function updateFontPreview() {
  $('.fp-heading').style.fontFamily = $('#fontHeading').value;
  $('.fp-body').style.fontFamily = $('#fontBody').value;
}
function setupAssetUpload(type) {
  const dz = $(`#${type}DropZone`), input = $(`#${type}Input`);
  dz.addEventListener('click', e => { if (e.target.tagName!=='LABEL') input.click(); });
  input.addEventListener('change', () => { if (input.files[0]) handleAssetFile(type, input.files[0]); });
}
function handleAssetFile(type, file) {
  const reader = new FileReader();
  reader.onload = e => {
    if (type==='logo') state.branding.logoDataUrl = e.target.result;
    if (type==='cover') state.branding.coverDataUrl = e.target.result;
    const preview = $(`#${type}Preview`), inner = $(`#${type}DropInner`);
    preview.src = e.target.result; preview.classList.remove('hidden');
    if (inner) inner.style.display = 'none';
  };
  reader.readAsDataURL(file);
}
function handleCssUpload(file) {
  const reader = new FileReader();
  reader.onload = e => { state.branding.customCss = e.target.result; $('#cssFilename').textContent = `✓ ${file.name}`; $('#cssFilename').classList.remove('hidden'); };
  reader.readAsText(file);
}

// ── Step 6: Generate ──────────────────────────────────────────
function initChapterProgressList() {
  const list = $('#chapterProgressList'); list.innerHTML = ''; state.generatedChapters = [];
  const chapters = [{ key:'intro', title:'Introduction' }, ...state.pillars.map((p,i) => ({ key:`ch${i+1}`, title:p.title })), { key:'conclusion', title:'Conclusion & Next Steps' }, { key:'about', title:'About the Author' }];
  chapters.forEach(({key, title}) => {
    state.generatedChapters.push({ key, title, content: '' });
    const item = document.createElement('div'); item.className = 'cp-item'; item.id = `cp-${key}`;
    item.innerHTML = `<div class="cp-dot"></div><div class="cp-label">${title}</div>`;
    list.appendChild(item);
  });
}

async function startGeneration() {
  if (state.isGenerating) return;
  state.isGenerating = true;
  initChapterProgressList();
  const previewBody = $('#previewBody');
  previewBody.innerHTML = '<div class="writing-cursor"></div>';
  $('#goToMarketing').classList.add('hidden'); $('#previewStatus').textContent = 'Writing…';
  let currentChapterIndex = -1;

  const setChapterWriting = key => {
    $$('.cp-item').forEach(el => el.classList.remove('writing'));
    $(`#cp-${key}`)?.classList.add('writing');
    const ch = state.generatedChapters.find(c => c.key===key);
    if (ch) { $('#previewChapterLabel').textContent = ch.title; previewBody.innerHTML = '<div class="writing-cursor"></div>'; }
  };
  const setChapterDone = key => { const el = $(`#cp-${key}`); if (el) { el.classList.remove('writing'); el.classList.add('done'); } };
  const appendText = text => {
    const cursor = previewBody.querySelector('.writing-cursor'), node = document.createTextNode(text);
    if (cursor) cursor.before(node); else previewBody.appendChild(node);
    previewBody.scrollTop = previewBody.scrollHeight;
    if (currentChapterIndex >= 0) state.generatedChapters[currentChapterIndex].content += text;
  };

  try {
    const response = await fetch('/api/generate', { method: 'POST', headers: { 'Authorization': `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedIdea: state.selectedIdea, pillars: state.pillars, answers: state.answers, content: combineContent(), mode: state.mode, brandGuide: state.branding.brandGuide, contentOwner: state.contentOwner }) });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type==='chapter_start') {
            const ch = data.chapter; let key = ch===0?'intro':ch===-1?'about':ch===state.pillars.length+1?'conclusion':`ch${ch}`;
            currentChapterIndex = state.generatedChapters.findIndex(c=>c.key===key); setChapterWriting(key);
          }
          if (data.type==='text') appendText(data.text);
          if (data.type==='chapter_end') { const ch=data.chapter; let key=ch===0?'intro':ch===-1?'about':ch===state.pillars.length+1?'conclusion':`ch${ch}`; setChapterDone(key); }
          if (data.type==='complete') {
            $$('.cp-item').forEach(el=>{ el.classList.remove('writing'); el.classList.add('done'); });
            previewBody.querySelector('.writing-cursor')?.remove();
            $('#previewStatus').textContent = 'Complete ✓'; $('#goToMarketing').classList.remove('hidden');
            state.isGenerating = false;
            await saveProject({ generated_chapters: state.generatedChapters, status: 'complete' });
            toast('Your eBook has been written and saved!', 'success');
          }
          if (data.type==='error') throw new Error(data.message);
        } catch {}
      }
    }
  } catch (err) {
    state.isGenerating = false; toast(`Generation failed: ${err.message}`, 'error');
    $('#previewStatus').textContent = 'Error — try again'; $('#backTo5Gen').classList.remove('hidden');
  }

  $('#goToMarketing').addEventListener('click', () => { goToStep(7); generateMarketingPlan(); });
}

// ── Step 7: Marketing ─────────────────────────────────────────
async function generateMarketingPlan() {
  if (state.marketingPlan) { renderMarketingPlan(state.marketingPlan); return; }
  $('#marketingLoading').classList.remove('hidden'); $('#marketingContent').classList.add('hidden');
  try {
    const res = await authFetch('/api/marketing', { method: 'POST', body: JSON.stringify({ selectedIdea: state.selectedIdea, answers: state.answers, pillars: state.pillars }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state.marketingPlan = data.plan;
    await saveProject({ marketing_plan: data.plan });
    renderMarketingPlan(data.plan);
  } catch (err) { toast(`Marketing plan failed: ${err.message}`, 'error'); }
  finally { $('#marketingLoading').classList.add('hidden'); }
  $('#goToExport').onclick = () => { goToStep(8); renderEbookPreview(); };
}

function renderMarketingPlan(plan) {
  const container = $('#marketingContent'); container.innerHTML = '';

  const timeline = document.createElement('div');
  timeline.innerHTML = `<h2 class="marketing-section-title">Launch Timeline</h2><p class="marketing-section-subtitle">A phased approach to getting your book in front of the right people.</p><div class="marketing-grid">${(plan.launchTimeline||[]).map(phase=>`<div class="marketing-card"><div class="marketing-card-header"><div class="marketing-card-icon">📅</div><div class="marketing-card-title">${phase.phase}</div></div><p style="font-size:.75rem;color:var(--gold-dark);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.75rem">${phase.timing}</p><div class="marketing-items">${(phase.actions||[]).map(a=>`<div class="marketing-item"><div class="marketing-bullet"></div><div class="marketing-item-text">${a}</div></div>`).join('')}</div></div>`).join('')}</div>`;
  container.appendChild(timeline);

  const channels = document.createElement('div');
  channels.innerHTML = `<h2 class="marketing-section-title" style="margin-top:2rem">Channel Tactics</h2><div class="marketing-grid">${(plan.channels||[]).map(ch=>`<div class="marketing-card"><div class="marketing-card-header"><div class="marketing-card-icon">${ch.icon}</div><div class="marketing-card-title">${ch.name}</div></div><div class="marketing-items">${(ch.tactics||[]).map(t=>`<div class="marketing-item"><div class="marketing-bullet"></div><div class="marketing-item-text">${t}</div></div>`).join('')}</div></div>`).join('')}</div>`;
  container.appendChild(channels);

  if (plan.webinarOutline) {
    const webinar = document.createElement('div');
    webinar.innerHTML = `<h2 class="marketing-section-title" style="margin-top:2rem">Launch Webinar Outline</h2><div class="marketing-card" style="max-width:680px"><div class="marketing-card-header"><div class="marketing-card-icon">🎤</div><div class="marketing-card-title">${plan.webinarOutline.title}</div></div><p style="font-size:.85rem;color:var(--text-mid);margin-bottom:1rem;font-style:italic">"${plan.webinarOutline.hook}"</p><div class="marketing-items">${(plan.webinarOutline.sections||[]).map((s,i)=>`<div class="marketing-item"><div class="marketing-bullet"></div><div class="marketing-item-text"><strong>Part ${i+1}:</strong> ${s}</div></div>`).join('')}<div class="marketing-item"><div class="marketing-bullet" style="background:var(--purple)"></div><div class="marketing-item-text"><strong>CTA:</strong> ${plan.webinarOutline.cta}</div></div></div></div>`;
    container.appendChild(webinar);
  }

  if (plan.socialPosts) {
    const posts = document.createElement('div');
    posts.innerHTML = `<h2 class="marketing-section-title" style="margin-top:2rem">Example Posts & Copy</h2><div class="marketing-grid">${(plan.socialPosts||[]).map(post=>`<div class="marketing-card"><div class="marketing-card-header"><div class="marketing-card-icon">${post.platform==='LinkedIn'?'💼':post.platform==='Instagram'?'📸':post.platform==='Email'?'📧':'📱'}</div><div class="marketing-card-title">${post.platform} · ${post.type}</div></div><p style="font-size:.85rem;color:var(--text-mid);line-height:1.6">${post.example}</p></div>`).join('')}</div>`;
    container.appendChild(posts);
  }

  if (plan.aiPrompts) {
    const promptsEl = document.createElement('div');
    promptsEl.innerHTML = `<h2 class="marketing-section-title" style="margin-top:2rem">AI Prompts for Your Content</h2><p class="marketing-section-subtitle">Copy any prompt into Claude, ChatGPT, or your AI tool of choice.</p><div class="prompts-grid">${(plan.aiPrompts||[]).map(p=>`<div class="prompt-card"><div class="prompt-card-label">${p.label}</div><div class="prompt-card-text">${p.prompt}</div><button class="prompt-copy-btn" onclick="copyPrompt(this,\`${p.prompt.replace(/`/g,"'")}\`)">Copy</button></div>`).join('')}</div>`;
    container.appendChild(promptsEl);
  }

  container.classList.remove('hidden');

  const dlBtn = $('#downloadMarketing');
  if (dlBtn) { dlBtn.classList.remove('hidden'); const nb = dlBtn.cloneNode(true); dlBtn.replaceWith(nb); nb.addEventListener('click', () => downloadMarketingPlan(plan)); }
}

window.copyPrompt = function(btn, text) { navigator.clipboard.writeText(text).then(() => { btn.textContent='Copied!'; btn.classList.add('copied'); setTimeout(()=>{ btn.textContent='Copy'; btn.classList.remove('copied'); }, 2000); }); };

function downloadMarketingPlan(plan) {
  const bookTitle = state.bookTitle || state.selectedIdea?.title || 'Your eBook';
  const authorName = state.answers.authorName || 'the author';
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'><head><meta charset="UTF-8"><title>Marketing Plan</title><style>body{font-family:Lato,Arial,sans-serif;font-size:12pt;color:#1A0A2E;margin:1in}h1{font-size:26pt;color:#571F81;border-bottom:3px solid #DFB24A;padding-bottom:.5rem}h2{font-size:16pt;color:#571F81;margin:2rem 0 .5rem;border-left:4px solid #DFB24A;padding-left:.75rem}h3{font-size:13pt;color:#2C97AF;margin:1.25rem 0 .4rem}p,li{font-size:11pt;line-height:1.7}ul{padding-left:1.5rem;margin-bottom:1rem}li{margin-bottom:.3rem}.prompt-box{background:#f4f1f9;border-left:4px solid #571F81;padding:.75rem 1rem;margin:.75rem 0;font-style:italic}.footer{text-align:center;color:#8B7BA0;font-size:9pt;margin-top:3rem;border-top:1px solid #e0d9f0;padding-top:1rem}</style></head><body><h1>Marketing Plan</h1><p><strong>${bookTitle}</strong> by ${authorName}</p>${(plan.launchTimeline||[]).map(p=>`<h2>${p.phase} — ${p.timing}</h2><ul>${(p.actions||[]).map(a=>`<li>${a}</li>`).join('')}</ul>`).join('')}${(plan.channels||[]).map(c=>`<h2>${c.icon||''} ${c.name}</h2><ul>${(c.tactics||[]).map(t=>`<li>${t}</li>`).join('')}</ul>`).join('')}${plan.webinarOutline?`<h2>Webinar: ${plan.webinarOutline.title}</h2><p><em>"${plan.webinarOutline.hook}"</em></p><ul>${(plan.webinarOutline.sections||[]).map((s,i)=>`<li><strong>Part ${i+1}:</strong> ${s}</li>`).join('')}<li><strong>CTA:</strong> ${plan.webinarOutline.cta}</li></ul>`:''}<h2>AI Prompts</h2>${(plan.aiPrompts||[]).map(p=>`<h3>${p.label}</h3><div class="prompt-box">${p.prompt}</div>`).join('')}<div class="footer">Created with Beyond the Dream Board · www.vivstoolbox.com</div></body></html>`;
  downloadFile(html, `Marketing-Plan-${safeFilename()}.doc`, 'application/msword');
  toast('Marketing plan downloaded!', 'success');
}

// ── Step 8: Export ────────────────────────────────────────────
function renderEbookPreview() {
  const html = generateEbookHtml(), wordHtml = generateWordHtml();
  const preview = $('#ebookPreview'), iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;border:none;min-height:900px;display:block;';
  preview.innerHTML = ''; preview.appendChild(iframe);
  setTimeout(() => { const doc = iframe.contentDocument||iframe.contentWindow.document; doc.open(); doc.write(html); doc.close(); setTimeout(() => { const h=doc.documentElement.scrollHeight; if(h>400) iframe.style.height=h+'px'; }, 500); }, 50);

  const wire = (id, fn) => { const btn=$(`#${id}`); if(!btn) return; const nb=btn.cloneNode(true); btn.replaceWith(nb); nb.addEventListener('click', fn); };
  wire('downloadHtml', () => showLeadModal(() => { downloadFile(html, `${safeFilename()}.html`, 'text/html'); toast('eBook downloaded! To save as PDF: open the file in your browser → Print → Save as PDF.', 'success'); }));
  wire('downloadWord', () => showLeadModal(() => { downloadFile(wordHtml, `${safeFilename()}.doc`, 'application/msword'); toast('Word document downloaded!', 'success'); }));
  wire('copyForDocs', () => showLeadModal(() => { const text=state.generatedChapters.map(ch=>`${ch.title}\n\n${ch.content}`).join('\n\n---\n\n'); navigator.clipboard.writeText(text).then(()=>toast('Copied! Paste into Google Docs.','success')); }));
  wire('printEbook', () => { const win=window.open('','_blank'); win.document.write(html); win.document.close(); win.onload=()=>win.print(); });
  wire('startOver', () => { if(confirm('Start over? This book is already saved to your account.')) showDashboard(); });
}

function safeFilename() { return (state.selectedIdea?.title||'ebook').replace(/[^a-z0-9]/gi,'_').substring(0,60); }
function downloadFile(content, filename, mimeType) { const blob=new Blob([content],{type:mimeType}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }

function generateEbookHtml() {
  const { primaryColor, accentColor, textColor, fontHeading, fontBody, logoDataUrl, coverDataUrl, customCss } = state.branding;
  const bookTitle = state.bookTitle || state.selectedIdea?.title || 'Your eBook';
  const authorName = state.answers.authorName || 'the author';
  const website = state.answers.website || '';
  const extractGFont = fs => { const m=fs.match(/'([^']+)'/); return m?m[1].replace(/ /g,'+'):null; };
  const gFontImports = [extractGFont(fontHeading), extractGFont(fontBody)].filter(Boolean).map(f=>`@import url('https://fonts.googleapis.com/css2?family=${f}:ital,wght@0,300;0,400;0,700;1,400&display=swap');`).join('\n');
  const tocItems = ['Introduction', ...state.pillars.map(p=>p.title), 'Conclusion & Next Steps', 'About the Author'];
  const hasCoverImg = !!coverDataUrl;
  const chapterHtml = state.generatedChapters.map((ch,i) => {
    const paragraphs = ch.content.split(/\n+/).filter(p=>p.trim()).map(p => { const line=p.trim(); if(line.startsWith('# ')) return `<h2 class="ch-h1">${line.slice(2)}</h2>`; if(line.startsWith('## ')) return `<h3 class="ch-h2">${line.slice(3)}</h3>`; if(line.startsWith('**')&&line.endsWith('**')) return `<h3 class="ch-h2">${line.slice(2,-2)}</h3>`; return `<p>${line.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>')}</p>`; }).join('\n');
    const isSpecial = ch.key==='intro'||ch.key==='conclusion'||ch.key==='about';
    return `<div class="book-page"><div class="chapter-page">${!isSpecial?`<div class="chapter-eyebrow">Chapter ${i}</div>`:''}<h1 class="chapter-title">${ch.title}</h1><div class="chapter-rule"></div><div class="chapter-body">${paragraphs}</div>${website?`<div class="page-footer">${authorName} · ${website}</div>`:''}</div></div>`;
  }).join('\n');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${bookTitle}</title><style>${gFontImports}
:root{--primary:${primaryColor};--accent:${accentColor};--text:${textColor};--fh:${fontHeading};--fb:${fontBody};}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:var(--fb);font-size:12pt;line-height:1.85;color:var(--text);background:#f4f4f4;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.book-page{background:#fff;max-width:780px;margin:2rem auto;padding:1.25in 1.1in;box-shadow:0 2px 20px rgba(0,0,0,.12);}
.cover-wrap{max-width:780px;margin:2rem auto 0;min-height:900px;background-color:var(--primary);position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;padding:5rem 4rem;box-shadow:0 2px 20px rgba(0,0,0,.12);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cover-wrap::before{content:'';position:absolute;bottom:-80px;right:-80px;width:400px;height:400px;border-radius:50%;background:var(--accent);opacity:.12;}
.cover-img-panel{position:absolute;top:0;right:0;bottom:0;width:42%;overflow:hidden;}
.cover-img-panel img{width:100%;height:100%;object-fit:cover;opacity:.45;}
.cover-body{position:relative;z-index:3;max-width:${hasCoverImg?'54%':'78%'};}
.cover-logo-img{max-height:55px;max-width:180px;object-fit:contain;margin-bottom:3.5rem;display:block;}
.cover-eyebrow{font-family:var(--fh);font-size:11pt;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);margin-bottom:1rem;}
.cover-title{font-family:var(--fh);font-size:52pt;font-weight:400;letter-spacing:.04em;line-height:.95;color:#fff;margin-bottom:.8rem;}
.cover-rule{width:70px;height:4px;background:var(--accent);margin:1.2rem 0 1.6rem;}
.cover-subtitle{font-size:14pt;color:rgba(255,255,255,.72);font-style:italic;line-height:1.4;margin-bottom:3rem;}
.cover-author{font-family:var(--fh);font-size:14pt;letter-spacing:.1em;color:var(--accent);}
.toc-title{font-family:var(--fh);font-size:26pt;letter-spacing:.08em;color:var(--primary);margin-bottom:.4rem;}
.toc-rule{width:3rem;height:3px;background:var(--accent);margin-bottom:2.5rem;}
.toc-item{display:flex;align-items:baseline;gap:.5rem;padding:.65rem 0;border-bottom:1px solid rgba(0,0,0,.07);font-size:11pt;}
.toc-num{font-family:var(--fh);font-size:10pt;letter-spacing:.08em;color:var(--accent);width:2.2rem;flex-shrink:0;}
.chapter-page{position:relative;}
.chapter-eyebrow{font-family:var(--fh);font-size:9pt;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);margin-bottom:.75rem;}
.chapter-title{font-family:var(--fh);font-size:30pt;letter-spacing:.04em;color:var(--primary);line-height:1.05;}
.chapter-rule{width:3.5rem;height:3px;background:var(--accent);margin:1.2rem 0 2.2rem;}
.chapter-body p{margin-bottom:1.1em;font-size:12pt;color:var(--text);line-height:1.85;text-align:justify;}
.ch-h1{font-family:var(--fh);font-size:18pt;letter-spacing:.04em;color:var(--primary);margin:2rem 0 .8rem;}
.ch-h2{font-family:var(--fh);font-size:14pt;letter-spacing:.03em;color:var(--primary);margin:1.5rem 0 .6rem;}
.ch-h3{font-family:var(--fb);font-size:12pt;font-weight:700;color:var(--accent);margin:1.25rem 0 .5rem;}
.chapter-body strong{color:var(--primary);}.chapter-body em{font-style:italic;}
.page-footer{font-family:var(--fb);font-size:8pt;color:rgba(0,0,0,.35);letter-spacing:.04em;margin-top:3rem;padding-top:.75rem;text-align:center;border-top:1px solid rgba(0,0,0,.1);}
.colophon-page{max-width:780px;margin:0 auto 2rem;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;text-align:center;padding:4rem;background:var(--primary);-webkit-print-color-adjust:exact;print-color-adjust:exact;box-shadow:0 2px 20px rgba(0,0,0,.12);}
.colophon-mark{font-size:2.5rem;margin-bottom:1.5rem;opacity:.6;color:var(--accent);}
.colophon-text{font-family:var(--fh);font-size:11pt;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:.5rem;}
.colophon-brand{font-family:var(--fh);font-size:18pt;letter-spacing:.1em;color:#fff;margin-bottom:1rem;}
.colophon-link{font-family:var(--fb);font-size:10pt;color:rgba(255,255,255,.55);text-decoration:none;letter-spacing:.06em;}
@page{size:A4;margin:1.1in 1in;}
@page :first{margin:0;}
@media print{body{background:#fff;}.book-page,.cover-wrap,.colophon-page{max-width:none;margin:0;box-shadow:none;padding:0;}.cover-wrap{page-break-after:always;}.book-page{page-break-before:always;}.colophon-page{page-break-before:always;}}
${customCss||''}</style></head><body>
<div class="cover-wrap">${coverDataUrl?`<div class="cover-img-panel"><img src="${coverDataUrl}" alt="" /></div>`:''}<div class="cover-body">${logoDataUrl?`<img class="cover-logo-img" src="${logoDataUrl}" alt="Logo" />`:''}
<div class="cover-eyebrow">A guide by ${authorName}</div>
<h1 class="cover-title">${bookTitle}</h1>
<div class="cover-rule"></div>
<p class="cover-subtitle">${state.selectedIdea?.subtitle||''}</p>
<div class="cover-author">by ${authorName}${website?`<br><span style="font-size:10pt;opacity:.7">${website}</span>`:''}</div></div></div>
<div class="book-page"><h2 class="toc-title">Contents</h2><div class="toc-rule"></div>${tocItems.map((t,i)=>`<div class="toc-item"><span class="toc-num">${String(i+1).padStart(2,'0')}</span><span>${t}</span></div>`).join('')}</div>
${chapterHtml}
<div class="colophon-page"><div class="colophon-mark">✦</div><div class="colophon-text">Created with</div><div class="colophon-brand">Beyond the Dream Board</div><a class="colophon-link" href="https://www.vivstoolbox.com">www.vivstoolbox.com</a></div>
</body></html>`;
}

function generateWordHtml() {
  const bookTitle = state.bookTitle || state.selectedIdea?.title || 'Your eBook';
  const authorName = state.answers.authorName || 'the author';
  const website = state.answers.website || '';
  const { primaryColor, accentColor, textColor, fontHeading, fontBody } = state.branding;
  const chapterContent = state.generatedChapters.map(ch => {
    const body = ch.content.split(/\n+/).filter(p=>p.trim()).map(p => { const line=p.trim(); if(line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`; if(line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`; return `<p>${line.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>')}</p>`; }).join('\n');
    return `<h1>${ch.title}</h1>\n${body}\n<hr />`;
  }).join('\n');
  return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset="UTF-8"><title>${bookTitle}</title><style>body{font-family:${fontBody.split(',')[0].replace(/'/g,'')};font-size:12pt;line-height:1.8;color:${textColor};margin:1in}h1{font-size:22pt;color:${primaryColor};margin:2rem 0 .5rem;page-break-before:always}h2{font-size:15pt;color:${primaryColor};margin:1.5rem 0 .5rem}p{margin-bottom:1em}hr{border:none;border-top:2px solid ${accentColor};margin:2rem 0}.cover{text-align:center;padding:3rem}.author{font-size:14pt;color:${accentColor};margin-top:1rem}</style></head><body><div class="cover"><h1 style="page-break-before:avoid;font-size:32pt">${bookTitle}</h1><p class="author">by ${authorName}</p>${website?`<p style="color:#999;font-size:10pt">${website}</p>`:''}</div>${chapterContent}<p style="text-align:center;color:#999;font-size:9pt;margin-top:3rem">Created with Beyond the Dream Board · www.vivstoolbox.com</p></body></html>`;
}

// ── Lead Capture Modal ────────────────────────────────────────
let pendingDownloadFn = null;
function showLeadModal(onSuccess) { pendingDownloadFn = onSuccess; $('#leadOverlay').classList.remove('hidden'); setTimeout(()=>$('#lead-firstName').focus(),100); }
function hideLeadModal() { $('#leadOverlay').classList.add('hidden'); pendingDownloadFn = null; const sb=$('#leadSubmit'),st=$('#leadSubmitText'); if(sb) sb.disabled=false; if(st) st.textContent='Get My eBook ✦'; }
function initLeadModal() {
  $('#leadForm').addEventListener('submit', async e => {
    e.preventDefault();
    const firstName=$('#lead-firstName').value.trim(), lastName=$('#lead-lastName').value.trim(), email=$('#lead-email').value.trim(), website=$('#lead-website').value.trim(), phone=$('#lead-phone').value.trim();
    if (!firstName||!email) return toast('Please enter your name and email.','info');
    $('#leadSubmit').disabled=true; $('#leadSubmitText').textContent='Saving…';
    try { await authFetch('/api/lead', { method:'POST', body:JSON.stringify({ firstName, lastName, email, website, phone, bookTitle: state.bookTitle||state.selectedIdea?.title||'' }) }); } catch {}
    hideLeadModal(); if (pendingDownloadFn) pendingDownloadFn();
  });
  $('#leadSkip').addEventListener('click', () => { hideLeadModal(); if(pendingDownloadFn) pendingDownloadFn(); });
  $('#leadOverlay').addEventListener('click', e => { if(e.target===$('#leadOverlay')) { hideLeadModal(); if(pendingDownloadFn) pendingDownloadFn(); } });
}

function initTrailNav() {
  $$('.trail-item').forEach(item => {
    item.addEventListener('click', () => {
      const step = parseInt(item.dataset.step);
      if (step < state.currentStep) {
        if (step===1&&!confirm('Go back to Step 1 to edit your sources?')) return;
        goToStep(step);
        if (step===1) initGather();
      }
    });
  });
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initLeadModal();
  $('#dashboardBtn').addEventListener('click', showDashboard);
});
