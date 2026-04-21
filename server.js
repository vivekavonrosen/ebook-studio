require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Supabase ─────────────────────────────────────────────────────
const sbAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function userClient(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error } = await sbAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  req.accessToken = token;
  next();
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error(`File type ${ext} not supported.`));
  },
});

// ── Text Extraction ─────────────────────────────────────────────
async function extractFromFile(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (ext === '.docx' || ext === '.doc') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString('utf8');
}

async function scrapeUrl(url) {
  const response = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    },
  });
  const $ = cheerio.load(response.data);
  $('script,style,nav,footer,aside,header,.nav,.header,.footer,.sidebar,.menu,.ads,[aria-hidden="true"]').remove();
  const selectors = ['article','main','.post-content','.article-content','.entry-content','.post-body','.content-body','.newsletter-content','.substack-post-content','#content','.content'];
  for (const sel of selectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 300) {
      return el.text().replace(/\s+/g, ' ').trim();
    }
  }
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function truncate(text, chars = 80000) {
  if (text.length <= chars) return text;
  return text.substring(0, chars) + '\n\n[Content truncated for processing...]';
}

// ── Routes ──────────────────────────────────────────────────────

app.post('/api/extract/files', upload.array('files', 30), async (req, res) => {
  const results = [], errors = [];
  for (const file of req.files || []) {
    try {
      const text = await extractFromFile(file.buffer, file.originalname);
      const cleaned = text.replace(/\s+/g, ' ').trim();
      results.push({ name: file.originalname, type: 'file', wordCount: cleaned.split(/\s+/).length, charCount: cleaned.length, text: cleaned.substring(0, 120000) });
    } catch (err) {
      errors.push({ name: file.originalname, error: err.message });
    }
  }
  res.json({ results, errors });
});

app.post('/api/extract/urls', async (req, res) => {
  const { urls } = req.body;
  const results = [], errors = [];
  for (const url of urls || []) {
    const trimmed = url.trim();
    if (!trimmed) continue;
    try {
      const text = await scrapeUrl(trimmed);
      results.push({ name: trimmed, type: 'url', wordCount: text.split(/\s+/).length, charCount: text.length, text: text.substring(0, 120000) });
    } catch (err) {
      errors.push({ name: trimmed, error: err.message });
    }
  }
  res.json({ results, errors });
});

// ── Book Ideas ──────────────────────────────────────────────────
app.post('/api/ideas', async (req, res) => {
  const { content, authorName, mode } = req.body;
  if (!content || content.length < 200) {
    return res.status(400).json({ error: 'Not enough content to analyze. Please add more source material.' });
  }

  const isSynthesis = mode === 'synthesis';

  const prompt = isSynthesis
    ? `You are a senior publishing strategist. Analyze this body of work — which may include multiple books, courses, or content collections — and identify the THROUGH-LINES: the consistent frameworks, recurring insights, signature ideas, and unique perspective that appear across all sources.

AUTHOR: ${authorName || 'the author'}

BODY OF WORK:
${truncate(content, 80000)}

Generate 4 distinct SYNTHESIS book concepts. Each should represent a unified, coherent work that draws on the strongest threads across ALL the source material — not just one piece. Think of these as the definitive book only this author could write, combining their best thinking into something more powerful than any single source.

Return ONLY a valid JSON array with no preamble or markdown:
[
  {
    "id": "1",
    "title": "The main book title",
    "subtitle": "A clarifying, specific subtitle",
    "premise": "2-3 sentences: what through-lines this synthesizes and why the unified whole is greater than its parts",
    "targetAudience": "Specific reader profile",
    "transformation": "The before-and-after: what changes for the reader?",
    "uniqueAngle": "What makes this synthesis different — the thread that ties everything together",
    "estimatedChapters": 8,
    "tone": "One of: Conversational | Professional | Story-driven | Practical | Motivational",
    "sourcesDrawnFrom": "Which sources/themes are most central to this concept"
  }
]`
    : `You are a senior publishing strategist. Analyze this body of work and generate 4 distinct, compelling eBook concepts deeply rooted in the actual content.

AUTHOR: ${authorName || 'the author'}

BODY OF WORK:
${truncate(content, 80000)}

Create 4 meaningfully different book concepts with different angles, audiences, or approaches. Each should be commercially viable and drawn directly from the source material.

Return ONLY a valid JSON array with no preamble or markdown:
[
  {
    "id": "1",
    "title": "The main book title",
    "subtitle": "A clarifying, specific subtitle",
    "premise": "2-3 sentences: the core argument or unique value this book delivers",
    "targetAudience": "Specific reader profile — be concrete, not generic",
    "transformation": "The before-and-after: what changes for the reader?",
    "uniqueAngle": "What makes this different from anything else out there",
    "estimatedChapters": 7,
    "tone": "One of: Conversational | Professional | Story-driven | Practical | Motivational"
  }
]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = message.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
    const ideas = JSON.parse(raw);
    res.json({ ideas });
  } catch (err) {
    console.error('Ideas error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Pillars ─────────────────────────────────────────────────────
app.post('/api/pillars', async (req, res) => {
  const { selectedIdea, content, mode } = req.body;
  const isSynthesis = mode === 'synthesis';

  const prompt = `You are a book architect. Create the chapter structure for this eBook.

BOOK CONCEPT:
Title: "${selectedIdea.title}"
Subtitle: "${selectedIdea.subtitle}"
Premise: ${selectedIdea.premise}
Target Audience: ${selectedIdea.targetAudience}
Transformation: ${selectedIdea.transformation}
Tone: ${selectedIdea.tone}
${isSynthesis ? `Sources drawn from: ${selectedIdea.sourcesDrawnFrom || 'All uploaded material'}` : ''}

SOURCE MATERIAL:
${truncate(content, 60000)}

Create 6–8 chapters. ${isSynthesis ? 'Each chapter should synthesize threads from ACROSS the source material — not just one piece. Show how ideas build on each other across sources.' : 'Each chapter should build on what came before and map to actual expertise in the source material.'}

Return ONLY a valid JSON array:
[
  {
    "id": "1",
    "title": "Chapter title",
    "subtitle": "Optional clarifying subtitle",
    "description": "2–3 sentences on what this chapter covers and why it matters",
    "keyInsights": ["Specific insight 1", "Specific insight 2", "Specific insight 3"],
    "order": 1
  }
]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = message.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
    const pillars = JSON.parse(raw);
    res.json({ pillars });
  } catch (err) {
    console.error('Pillars error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Generate ONE chapter (streaming) ────────────────────────────
// Called once per chapter from the client — avoids Vercel timeout
app.post('/api/generate/chapter', async (req, res) => {
  const {
    selectedIdea, pillars, answers, content, mode, brandGuide, contentOwner,
    chapterType,   // 'intro' | 'chapter' | 'conclusion' | 'about'
    chapterIndex,  // 0-based index into pillars (only for chapterType='chapter')
    writtenSummaries = [],
  } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);

  const isSynthesis = mode === 'synthesis';
  const isFirstPerson = contentOwner !== 'client';
  const sourceContent = truncate(content, 60000);

  const voiceInstruction = isFirstPerson
    ? `VOICE: Write in first person throughout (I, me, my, we). The author is speaking directly to the reader. Never refer to the author by name or in third person — they ARE the narrator.`
    : `VOICE: Write in third person throughout (she/he/they, or use the author's name: ${answers.authorName || 'the author'}). This is a book ABOUT the author's expertise and methodology, not written AS the author.`;

  const bookContext = `BOOK: "${selectedIdea.title}: ${selectedIdea.subtitle}"
TARGET READER: ${answers.idealReader || 'Not specified'}
AUTHOR NAME: ${answers.authorName || 'the author'}
AUTHOR'S UNIQUE APPROACH: ${answers.uniqueApproach || 'Not specified'}
READER PAIN POINTS: ${answers.clientPains || 'Not specified'}
HOW THIS BOOK HELPS: ${answers.bookSolution || 'Not specified'}
TRANSFORMATION: ${answers.transformation || 'Not specified'}
TONE: ${selectedIdea.tone}
${brandGuide ? `BRAND VOICE & GUIDELINES: ${brandGuide.substring(0, 500)}` : ''}
${isSynthesis ? 'MODE: This is a synthesis book drawing threads from across multiple works.' : ''}
${voiceInstruction}`;

  const alreadyWritten = writtenSummaries.length > 0
    ? `\nALREADY WRITTEN — DO NOT REPEAT these stories, examples, or frameworks:\n${writtenSummaries.map(s => `- ${s}`).join('\n')}\nUse DIFFERENT examples, anecdotes, and entry points for this chapter.\n`
    : '';

  try {
    let prompt, maxTokens;

    if (chapterType === 'intro') {
      maxTokens = 2000;
      prompt = `You are a professional ghostwriter. Write the INTRODUCTION for this eBook.

${bookContext}

SOURCE MATERIAL (draw from this directly — quote real examples, cite actual frameworks):
${sourceContent}

Write 700–900 words. Follow the VOICE instruction above exactly. Include:
1. A compelling opening hook (specific story, provocative question, or surprising insight from the source material)
2. Who this book is for — name the reader directly
3. What problem this solves and why now
4. Brief overview of the journey ahead — mention each chapter title briefly
5. A note that establishes the author's credibility and expertise

${isSynthesis ? "This is a synthesis of multiple works — acknowledge that this book brings together the best of the author's thinking in a new, unified framework." : ''}

Be specific and pull from the actual source material. Avoid generic writing.`;

    } else if (chapterType === 'chapter') {
      const pillar = pillars[chapterIndex];
      const totalChapters = pillars.length;
      const position = chapterIndex === 0 ? 'first chapter — set the foundation'
        : chapterIndex === totalChapters - 1 ? 'final chapter — bring it home'
        : 'middle chapter — build on what came before';
      maxTokens = 3000;
      prompt = `You are a professional ghostwriter. Write Chapter ${chapterIndex + 1} of this eBook.

${bookContext}
${alreadyWritten}
THIS CHAPTER:
Title: "${pillar.title}"
${pillar.subtitle ? `Subtitle: "${pillar.subtitle}"` : ''}
What it covers: ${pillar.description}
Key insights to include: ${(pillar.keyInsights || []).join('; ')}

Chapter position: ${chapterIndex + 1} of ${totalChapters} (${position})

SOURCE MATERIAL (pull actual examples, stories, and frameworks from this — ONLY ones not already used above):
${sourceContent}

Write 900–1200 words. Follow the VOICE instruction above exactly. Structure:
1. A FRESH opening — different story, angle, or hook from any previous chapter
2. Core teaching in 3–4 distinct sections with clear sub-headings
3. NEW examples and anecdotes not mentioned in earlier chapters
4. Practical takeaway, exercise, or reflection prompt specific to this chapter's topic

${isSynthesis ? 'Draw threads from ACROSS the source material — show how ideas from different works connect and reinforce each other.' : ''}

Be specific. Each chapter must feel like a distinct progression — not a repeat.`;

    } else if (chapterType === 'conclusion') {
      maxTokens = 1500;
      prompt = `Write the CONCLUSION for this eBook.

${bookContext}
CHAPTERS COVERED: ${pillars.map(p => p.title).join(' → ')}
CALL TO ACTION: ${answers.callToAction || 'Connect with the author for continued support'}

Write 500–700 words. Follow the VOICE instruction above exactly. Include:
1. Synthesis of the journey — what the reader has learned
2. Reaffirmation of the transformation they've experienced
3. Clear, specific next steps (3–5 actions)
4. Final closing statement — memorable, motivating, and true to the author's voice

No new concepts. Bring it home with power.`;

    } else if (chapterType === 'about') {
      // Non-streaming for the short About section
      const aboutMsg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Write a professional "About the Author" section (150–200 words, third person) based on this bio:

${answers.authorBio || (answers.authorName || 'the author') + ' is the author of this book.'}

Make it warm, credible, and specific. End with how readers can connect with the author.`,
        }],
      });
      send({ type: 'text', text: aboutMsg.content[0].text });
      send({ type: 'complete', summary: aboutMsg.content[0].text.substring(0, 200) });
      return;
    } else {
      throw new Error(`Unknown chapterType: ${chapterType}`);
    }

    // Stream the chapter
    let chapterText = '';
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        send({ type: 'text', text: chunk.delta.text });
        chapterText += chunk.delta.text;
      }
    }
    // Return a summary so the client can pass it to the next chapter call
    send({ type: 'complete', summary: chapterText.substring(0, 300).replace(/\n/g, ' ') });

  } catch (err) {
    console.error('Chapter generation error:', err);
    send({ type: 'error', message: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── Marketing Plan ───────────────────────────────────────────────
app.post('/api/marketing', async (req, res) => {
  const { selectedIdea, answers, pillars } = req.body;

  const prompt = `You are a book marketing strategist specializing in thought leadership and expert authors.

Create a comprehensive but practical marketing plan for this eBook:

BOOK: "${selectedIdea.title}: ${selectedIdea.subtitle}"
AUTHOR: ${answers.authorName || 'the author'}
TARGET READER: ${answers.idealReader || 'Not specified'}
TRANSFORMATION: ${answers.transformation || 'Not specified'}
CALL TO ACTION: ${answers.callToAction || 'Connect with the author'}
CHAPTERS: ${pillars.map(p => p.title).join(', ')}

Generate a marketing plan with these exact sections. Return ONLY valid JSON, no preamble, no markdown fences:

{
  "launchTimeline": [
    { "phase": "Phase name", "timing": "e.g. 2 weeks before launch", "actions": ["Action 1", "Action 2", "Action 3"] }
  ],
  "channels": [
    { "name": "Channel name", "icon": "emoji", "tactics": ["Specific tactic 1", "Specific tactic 2", "Specific tactic 3"] }
  ],
  "webinarOutline": {
    "title": "Webinar title based on the book",
    "hook": "Opening hook for the webinar",
    "sections": ["Section 1", "Section 2", "Section 3", "Section 4"],
    "cta": "Webinar call to action"
  },
  "socialPosts": [
    { "platform": "LinkedIn", "type": "Launch announcement", "example": "A compelling 3-5 sentence LinkedIn post announcing the book, written in first person as the author. Make it specific and personal — not generic." },
    { "platform": "LinkedIn", "type": "Key insight teaser", "example": "A LinkedIn post sharing one powerful insight from the book that makes people want to read it." },
    { "platform": "Instagram", "type": "Quote graphic", "example": "A short, punchy quote from the book suitable for a visual post." },
    { "platform": "Email", "type": "Launch email subject line", "example": "A compelling subject line for the launch email." }
  ],
  "aiPrompts": [
    { "label": "LinkedIn launch post", "prompt": "Write a compelling LinkedIn post announcing my new eBook called '[BOOK TITLE]'. The book is for [TARGET READER] and helps them [TRANSFORMATION]. My tone is [TONE]. Include a personal story angle, one key insight, and end with a call to action. Write in first person." },
    { "label": "Social proof request", "prompt": "Write a short, warm message I can send to 5 colleagues asking them to read my new eBook '[BOOK TITLE]' and share a testimonial. Make it personal and non-pressuring. Explain the book is for [TARGET READER]." },
    { "label": "Email newsletter", "prompt": "Write a launch email for my new eBook '[BOOK TITLE]: [SUBTITLE]'. The email should open with a relatable pain point for [TARGET READER], tease 3 key things they'll learn, and link to where they can download it. Tone: [TONE]." },
    { "label": "Webinar promotional post", "prompt": "Write a promotional LinkedIn post for a free webinar I'm hosting based on my new book '[BOOK TITLE]'. The webinar will cover [one insight from the book]. Include urgency, a clear benefit, and registration CTA. Tone: conversational and expert." },
    { "label": "Instagram caption", "prompt": "Write an Instagram caption for a post about my new eBook. The caption should start with a bold statement or question that stops the scroll, share one insight that proves my expertise, and end with a CTA to get the book. Include 5 relevant hashtags. Tone: [TONE]." }
  ]
}

Replace [BOOK TITLE], [SUBTITLE], [TARGET READER], [TRANSFORMATION], and [TONE] in the aiPrompts with the actual values from the book details provided above. Make all content specific to this book and author — not generic.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = message.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
    const plan = JSON.parse(raw);
    res.json({ plan });
  } catch (err) {
    console.error('Marketing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Lead Capture ─────────────────────────────────────────────────
app.post('/api/lead', async (req, res) => {
  const { firstName, lastName, email, website, phone, bookTitle } = req.body;

  if (!email || !firstName) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  const nimbleKey = process.env.NIMBLE_API_KEY;

  if (!nimbleKey) {
    console.warn('No NIMBLE_API_KEY set — lead not saved to Nimble.');
    return res.json({ success: true, nimble: 'skipped — no API key' });
  }

  try {
    const fields = {
      'first name': [{ value: firstName, modifier: '' }],
      'last name':  [{ value: lastName || '', modifier: '' }],
      'email':      [{ value: email, modifier: 'work' }],
    };
    if (phone)   fields['phone'] = [{ value: phone, modifier: 'work' }];
    if (website) fields['URL']   = [{ value: website, modifier: 'work' }];

    const tags = ['ebook-studio-lead'];
    if (bookTitle) tags.push(`ebook: ${bookTitle.substring(0, 40)}`);

    const contactRes = await axios.post(
      'https://api.nimble.com/api/v1/contacts',
      { fields, tags, record_type: 'person' },
      {
        headers: {
          Authorization: `Bearer ${nimbleKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Nimble contact created:', contactRes.data?.id);
    res.json({ success: true, nimble: 'success', id: contactRes.data?.id });

  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('Nimble error:', msg);
    // Still return success so the download isn't blocked
    res.json({ success: true, nimble: 'error: ' + msg });
  }
});

// ── Projects ──────────────────────────────────────────────────────
app.get('/api/projects', requireAuth, async (req, res) => {
  const sb = userClient(req.accessToken);
  const { data, error } = await sb
    .from('projects')
    .select('id, title, subtitle, status, updated_at, created_at')
    .order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ projects: data });
});

app.post('/api/projects', requireAuth, async (req, res) => {
  const sb = userClient(req.accessToken);
  const { data, error } = await sb
    .from('projects')
    .insert({ ...req.body, user_id: req.user.id })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ project: data });
});

app.get('/api/projects/:id', requireAuth, async (req, res) => {
  const sb = userClient(req.accessToken);
  const { data, error } = await sb
    .from('projects')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Project not found' });
  res.json({ project: data });
});

app.put('/api/projects/:id', requireAuth, async (req, res) => {
  const sb = userClient(req.accessToken);
  const { data, error } = await sb
    .from('projects')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ project: data });
});

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  const sb = userClient(req.accessToken);
  const { error } = await sb
    .from('projects')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── SPA catch-all ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  ✦  eBook Studio\n`);
  console.log(`  Running at: http://localhost:${PORT}`);
  console.log(`  API Key:    ${process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ MISSING'}\n`);
});
