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

const app = express();
const PORT = process.env.PORT || 3000;

// ── Anthropic Client ───────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Middleware ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── File Upload Config ─────────────────────────────────────────────────
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error(`File type ${ext} is not supported. Use PDF, DOCX, TXT, or MD.`));
  },
});

// ── Text Extraction Utilities ──────────────────────────────────────────
async function extractFromFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === '.docx' || ext === '.doc') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf8');
  }

  return '';
}

async function scrapeUrl(url) {
  const response = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const $ = cheerio.load(response.data);

  // Strip non-content
  $('script, style, nav, footer, aside, header, .nav, .header, .footer, .sidebar, .menu, .ads, .advertisement, .cookie-banner, [aria-hidden="true"]').remove();

  // Try specific content containers
  const selectors = [
    'article',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.post-body',
    '.body-copy',
    '.newsletter-content',
    '.substack-post-content',
    '.content-body',
    '#content',
    '.content',
  ];

  for (const sel of selectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 300) {
      return el.text().replace(/\s+/g, ' ').trim();
    }
  }

  // Fallback: body text
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function truncate(text, chars = 80000) {
  if (text.length <= chars) return text;
  return text.substring(0, chars) + '\n\n[Content truncated for processing...]';
}

// ── Routes ─────────────────────────────────────────────────────────────

// Upload files and extract text
app.post('/api/extract/files', upload.array('files', 30), async (req, res) => {
  const results = [];
  const errors = [];

  for (const file of req.files || []) {
    try {
      const text = await extractFromFile(file.path, file.originalname);
      const cleaned = text.replace(/\s+/g, ' ').trim();
      results.push({
        name: file.originalname,
        type: 'file',
        wordCount: cleaned.split(/\s+/).length,
        charCount: cleaned.length,
        text: cleaned.substring(0, 120000),
      });
    } catch (err) {
      errors.push({ name: file.originalname, error: err.message });
    } finally {
      try { fs.unlinkSync(file.path); } catch {}
    }
  }

  res.json({ results, errors });
});

// Scrape URLs
app.post('/api/extract/urls', async (req, res) => {
  const { urls } = req.body;
  const results = [];
  const errors = [];

  for (const url of urls || []) {
    const trimmed = url.trim();
    if (!trimmed) continue;

    try {
      const text = await scrapeUrl(trimmed);
      results.push({
        name: trimmed,
        type: 'url',
        wordCount: text.split(/\s+/).length,
        charCount: text.length,
        text: text.substring(0, 120000),
      });
    } catch (err) {
      errors.push({ name: trimmed, error: err.message });
    }
  }

  res.json({ results, errors });
});

// Generate book ideas from extracted content
app.post('/api/ideas', async (req, res) => {
  const { content, authorName } = req.body;

  if (!content || content.length < 200) {
    return res.status(400).json({ error: 'Not enough content to analyze. Please add more source material.' });
  }

  const prompt = `You are a senior publishing strategist and ghostwriter. Analyze this body of work and generate 4 distinct, compelling eBook concepts.

AUTHOR: ${authorName || 'the author'}

BODY OF WORK:
${truncate(content, 80000)}

Create 4 meaningfully different book concepts — different angles, audiences, or approaches to the material. Each should be commercially viable and deeply rooted in what's actually in the source material.

Return ONLY a valid JSON array. No preamble, no markdown, no explanation — just the array:
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

// Generate content pillars for selected idea
app.post('/api/pillars', async (req, res) => {
  const { selectedIdea, content } = req.body;

  const prompt = `You are a book architect and content strategist. Create the chapter structure for this eBook.

BOOK CONCEPT:
Title: "${selectedIdea.title}"
Subtitle: "${selectedIdea.subtitle}"
Premise: ${selectedIdea.premise}
Target Audience: ${selectedIdea.targetAudience}
Transformation: ${selectedIdea.transformation}
Tone: ${selectedIdea.tone}

SOURCE MATERIAL:
${truncate(content, 60000)}

Create 6–8 chapters. Each chapter should:
- Have a distinctive, compelling title (not "Chapter 1: Introduction")
- Build on what came before (create narrative arc)
- Map directly to the author's actual expertise in the source material
- Be distinct — no overlap

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

// Stream the full eBook generation
app.post('/api/generate', async (req, res) => {
  const { selectedIdea, pillars, answers, content } = req.body;

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Heartbeat to prevent timeout
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  const sourceContent = truncate(content, 60000);
  const bookContext = `BOOK: "${selectedIdea.title}: ${selectedIdea.subtitle}"
TARGET READER: ${answers.idealReader || 'Not specified'}
AUTHOR NAME: ${answers.authorName || 'the author'}
AUTHOR'S UNIQUE APPROACH: ${answers.uniqueApproach || 'Not specified'}
READER PAIN POINTS: ${answers.clientPains || 'Not specified'}
HOW THIS BOOK HELPS: ${answers.bookSolution || 'Not specified'}
TRANSFORMATION: ${answers.transformation || 'Not specified'}
TONE: ${selectedIdea.tone}`;

  try {
    // ── Introduction
    send({ type: 'chapter_start', chapter: 0, title: 'Introduction' });

    const introPrompt = `You are a professional ghostwriter. Write the INTRODUCTION for this eBook.

${bookContext}

SOURCE MATERIAL (draw from this directly):
${sourceContent}

Write 700–900 words. First person. Include:
1. A compelling opening hook (specific story, provocative question, or surprising insight)
2. Who this book is for — name the reader directly
3. What problem this solves and why now
4. Brief overview of the journey ahead
5. A personal note that establishes the author's credibility and care

Draw from the source material to make it feel authentic and specific — not generic.`;

    const introStream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: introPrompt }],
    });

    for await (const chunk of introStream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        send({ type: 'text', text: chunk.delta.text });
      }
    }
    send({ type: 'chapter_end', chapter: 0 });

    // ── Chapters
    for (let i = 0; i < pillars.length; i++) {
      const pillar = pillars[i];
      send({ type: 'chapter_start', chapter: i + 1, title: pillar.title });

      const chapterPrompt = `You are a professional ghostwriter. Write Chapter ${i + 1} of this eBook.

${bookContext}

THIS CHAPTER:
Title: "${pillar.title}"
${pillar.subtitle ? `Subtitle: "${pillar.subtitle}"` : ''}
What it covers: ${pillar.description}
Key insights to include: ${(pillar.keyInsights || []).join('; ')}

Chapter position: ${i + 1} of ${pillars.length} (${i === 0 ? 'first chapter — set the foundation' : i === pillars.length - 1 ? 'final chapter — bring it home' : 'middle chapter — build on what came before'})

SOURCE MATERIAL (pull actual examples, quotes, and frameworks from this):
${sourceContent}

Write 900–1200 words. First person. Structure:
1. Chapter opening that hooks (story, insight, question)
2. Core teaching broken into 3–4 distinct sections
3. Concrete examples from the author's actual experience or client work
4. Practical takeaway or reflection prompt at the end

Do NOT be generic. Pull specific details from the source material.`;

      const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: chapterPrompt }],
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          send({ type: 'text', text: chunk.delta.text });
        }
      }
      send({ type: 'chapter_end', chapter: i + 1 });
    }

    // ── Conclusion
    send({ type: 'chapter_start', chapter: pillars.length + 1, title: 'Conclusion & Next Steps' });

    const conclusionPrompt = `Write the CONCLUSION chapter for this eBook.

${bookContext}
CHAPTERS COVERED: ${pillars.map((p) => p.title).join(' → ')}
CALL TO ACTION: ${answers.callToAction || 'Connect with the author for continued support'}

Write 500–700 words. First person. Include:
1. Synthesis of the journey — what the reader has learned
2. Reaffirmation of the transformation they've experienced
3. Clear, specific next steps (3–5 actions)
4. Final closing statement — memorable and motivating

No new concepts. Just bring it home.`;

    const conclusionStream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: conclusionPrompt }],
    });

    for await (const chunk of conclusionStream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        send({ type: 'text', text: chunk.delta.text });
      }
    }
    send({ type: 'chapter_end', chapter: pillars.length + 1 });

    // ── About the Author
    send({ type: 'chapter_start', chapter: -1, title: 'About the Author' });

    const aboutPrompt = `Write a professional "About the Author" section (150–200 words, third person) based on this bio:

${answers.authorBio || answers.authorName + ' is the author of this book.'}

Make it warm, credible, and specific. End with how readers can connect with the author.
If a website, social handle, or contact info is mentioned in the bio, include it naturally.`;

    const aboutMsg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: aboutPrompt }],
    });

    send({ type: 'text', text: aboutMsg.content[0].text });
    send({ type: 'chapter_end', chapter: -1 });
    send({ type: 'complete' });
  } catch (err) {
    console.error('Generation error:', err);
    send({ type: 'error', message: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── SPA catch-all ───────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start Server ────────────────────────────────────────────────────────
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

app.listen(PORT, () => {
  console.log(`\n  ✦  eBook Studio\n`);
  console.log(`  Running at: http://localhost:${PORT}`);
  console.log(`  API Key:    ${process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ MISSING — set ANTHROPIC_API_KEY'}\n`);
});
