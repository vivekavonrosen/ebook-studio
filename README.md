# ✦ eBook Studio

Transform any body of work into a polished, branded eBook — powered by Claude AI.

Upload PDFs, Word docs, blog posts, Substack articles, LinkedIn newsletters, video transcripts, or paste raw content. The tool analyzes your material, generates compelling book concepts, builds a chapter structure, and writes the full book in your voice.

---

## What It Does

**Step 1 — Gather**: Upload files (PDF, DOCX, TXT), paste URLs to scrape (blog posts, Substack, LinkedIn newsletters), or paste content directly.

**Step 2 — Ideas**: AI analyzes your body of work and generates 4 distinct book concepts. Choose the one that resonates.

**Step 3 — Pillars**: AI builds a chapter structure from your selected concept. Rename, reorder, add, or remove chapters.

**Step 4 — Clarify**: Answer 7 strategic questions about your ideal reader, your unique approach, and what transformation the book delivers.

**Step 5 — Brand**: Set colors, fonts, upload a logo and cover image — or upload your own CSS stylesheet.

**Step 6 — Generate**: Watch your book being written chapter by chapter, live, in your voice and from your content.

**Step 7 — Export**: Download your eBook as a self-contained HTML file (print to PDF from any browser), or print directly.

---

## Setup

### Requirements
- Node.js 18 or higher
- An Anthropic API key (get one at console.anthropic.com)

### Install

```bash
cd ebook-studio
npm install
```

### Configure

Copy the environment template and add your API key:

```bash
cp .env.example .env
```

Open `.env` and set:
```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

### Run

```bash
npm start
```

Open `http://localhost:3000` in your browser.

For development with auto-reload:
```bash
npm run dev
```

---

## Supported File Types

| Type | Format |
|------|--------|
| Documents | PDF, DOCX, DOC, TXT, MD |
| URLs | Any publicly accessible page |
| Substack | Public article URLs |
| LinkedIn | Paste newsletter content directly (LinkedIn blocks automated access) |
| Transcripts | TXT or DOCX files |

---

## Tips

- **More content = better book.** Upload everything you have — the AI synthesizes across all sources.
- **LinkedIn newsletters** can't be scraped automatically. Copy the text and paste it in the "Raw Content" box.
- **Substack** articles work well via URL if they're public. Paid posts won't be accessible.
- **The strategic questions in Step 4** are the most important input. Take time with them.
- **For PDF export**: Open the downloaded HTML file in Chrome or Safari, then File → Print → Save as PDF.

---

## Architecture

```
ebook-studio/
├── server.js          Express backend — file upload, scraping, AI calls
├── public/
│   ├── index.html     7-step wizard UI
│   ├── styles.css     Editorial dark aesthetic
│   └── app.js         Frontend logic — state, API calls, streaming, export
├── uploads/           Temp storage for uploaded files (auto-cleared)
└── package.json
```

**API Endpoints**
- `POST /api/extract/files` — Upload and extract text from files
- `POST /api/extract/urls` — Scrape URLs and extract content
- `POST /api/ideas` — Generate book concepts from content
- `POST /api/pillars` — Generate chapter structure for selected idea
- `POST /api/generate` — Stream the full eBook generation (SSE)

---

## Customization

The branding system in Step 5 gives you:
- **Color palette**: Primary, accent, and body text colors
- **6 quick palettes**: Midnight Gold, Deep Teal, Deep Violet, Forest, Terracotta, Monochrome
- **7 heading fonts** and **6 body fonts** with live preview
- **Logo + cover image** upload (embedded in the exported HTML as base64)
- **CSS stylesheet upload** — overrides all visual settings for complete brand control

---

## License

Built for use with the Anthropic Claude API. Requires your own API key.
