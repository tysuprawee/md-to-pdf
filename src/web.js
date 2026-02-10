#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const express = require('express');
const { renderMarkdownDocument, renderMarkdownToPdf } = require('./renderer');

const app = express();
app.use(express.json({ limit: '20mb' }));

const DEFAULT_FILE = path.resolve(process.cwd(), 'input.md');

function safeFilePath(inputPath) {
  const fallback = fs.existsSync(DEFAULT_FILE) ? DEFAULT_FILE : '';
  if (!inputPath) return fallback;
  const resolved = path.resolve(inputPath);
  return fs.existsSync(resolved) ? resolved : fallback;
}

function pageHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>md2pdf Live Preview</title>
  <style>
    :root {
      --bg: #f3f4f6;
      --panel: #ffffff;
      --text: #1f2328;
      --line: #d0d7de;
      --accent: #0969da;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background: var(--bg);
      height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .toolbar {
      background: var(--panel);
      border-bottom: 1px solid var(--line);
      padding: 10px;
      display: grid;
      gap: 8px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .row label { font-size: 12px; color: #57606a; }
    input, select, button {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 13px;
      background: #fff;
    }
    button {
      cursor: pointer;
      border-color: #1f6feb;
      background: var(--accent);
      color: #fff;
    }
    .layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      padding: 10px;
      min-height: 0;
    }
    textarea, iframe {
      width: 100%;
      height: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    textarea {
      resize: none;
      padding: 12px;
      font: 13px/1.5 Consolas, "SFMono-Regular", monospace;
    }
    iframe { background: #fff; }
    .status {
      font-size: 12px;
      color: #57606a;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="row">
      <label>File</label>
      <input id="file" style="min-width:360px" />
      <button id="load">Load</button>
      <label>Base dir</label>
      <input id="basedir" style="min-width:260px" />
      <label>Title</label>
      <input id="title" style="min-width:220px" placeholder="Optional" />
      <span class="status" id="status">Ready</span>
    </div>
    <div class="row">
      <label>Theme</label>
      <select id="theme">
        <option value="clean">clean</option>
        <option value="serif">serif</option>
        <option value="academic">academic</option>
        <option value="github-dark">github-dark</option>
      </select>
      <label>Paper</label>
      <select id="paper">
        <option value="Letter">Letter</option>
        <option value="A4">A4</option>
      </select>
      <label>Margin</label>
      <input id="margin" value="16mm" style="width:80px" />
      <label><input type="checkbox" id="toc" checked /> TOC</label>
      <label><input type="checkbox" id="hf" /> Header/Footer</label>
      <button id="download">Export PDF</button>
    </div>
  </div>
  <div class="layout">
    <textarea id="md"></textarea>
    <iframe id="preview"></iframe>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const els = {
      file: $('file'), basedir: $('basedir'), title: $('title'), theme: $('theme'), paper: $('paper'),
      margin: $('margin'), toc: $('toc'), hf: $('hf'), md: $('md'), preview: $('preview'),
      status: $('status'), load: $('load'), download: $('download')
    };

    let timer;

    function setStatus(t) { els.status.textContent = t; }

    function payload() {
      return {
        markdown: els.md.value,
        basedir: els.basedir.value,
        theme: els.theme.value,
        paper: els.paper.value,
        margin: els.margin.value,
        toc: els.toc.checked,
        headerFooter: els.hf.checked,
        title: els.title.value,
      };
    }

    async function renderPreview() {
      try {
        setStatus('Rendering preview...');
        const res = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload()),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        els.preview.srcdoc = data.html;
        if (!els.title.value && data.title) {
          els.title.value = data.title;
        }
        setStatus('Preview updated');
      } catch (e) {
        setStatus('Preview error: ' + e.message);
      }
    }

    function renderPreviewDebounced() {
      clearTimeout(timer);
      timer = setTimeout(renderPreview, 350);
    }

    async function loadFile() {
      try {
        const filePath = els.file.value.trim();
        const res = await fetch('/api/load?file=' + encodeURIComponent(filePath));
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        els.file.value = data.file;
        els.basedir.value = data.basedir;
        els.md.value = data.markdown;
        setStatus('Loaded ' + data.file);
        await renderPreview();
      } catch (e) {
        setStatus('Load error: ' + e.message);
      }
    }

    async function exportPdf() {
      try {
        setStatus('Generating PDF...');
        const res = await fetch('/api/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload()),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const nameBase = (els.title.value || 'document').replace(/[^a-z0-9-_]+/gi, '_');
        a.href = url;
        a.download = nameBase + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus('PDF exported');
      } catch (e) {
        setStatus('PDF error: ' + e.message);
      }
    }

    ['input', 'change'].forEach((ev) => {
      els.md.addEventListener(ev, renderPreviewDebounced);
      els.theme.addEventListener(ev, renderPreviewDebounced);
      els.paper.addEventListener(ev, renderPreviewDebounced);
      els.margin.addEventListener(ev, renderPreviewDebounced);
      els.toc.addEventListener(ev, renderPreviewDebounced);
      els.hf.addEventListener(ev, renderPreviewDebounced);
      els.title.addEventListener(ev, renderPreviewDebounced);
      els.basedir.addEventListener(ev, renderPreviewDebounced);
    });

    els.load.addEventListener('click', loadFile);
    els.download.addEventListener('click', exportPdf);

    (async function init() {
      const params = new URLSearchParams(location.search);
      els.file.value = params.get('file') || 'input.md';
      await loadFile();
    })();
  </script>
</body>
</html>`;
}

app.get('/', (req, res) => {
  res.type('html').send(pageHtml());
});

app.get('/api/load', (req, res) => {
  const file = safeFilePath(req.query.file);
  if (!file) return res.status(404).send('No readable default file found.');
  const markdown = fs.readFileSync(file, 'utf8');
  return res.json({ file, basedir: path.dirname(file), markdown });
});

app.post('/api/preview', async (req, res) => {
  try {
    const markdown = typeof req.body.markdown === 'string' ? req.body.markdown : '';
    const { html, title } = await renderMarkdownDocument({
      markdown,
      basedir: req.body.basedir || process.cwd(),
      theme: req.body.theme || 'clean',
      toc: req.body.toc !== false,
      css: Array.isArray(req.body.css) ? req.body.css : [],
      title: req.body.title || '',
    });
    res.json({ html, title });
  } catch (err) {
    res.status(400).send(err.message || String(err));
  }
});

app.post('/api/pdf', async (req, res) => {
  try {
    const markdown = typeof req.body.markdown === 'string' ? req.body.markdown : '';
    const pdf = await renderMarkdownToPdf({
      markdown,
      basedir: req.body.basedir || process.cwd(),
      theme: req.body.theme || 'clean',
      paper: req.body.paper || 'Letter',
      margin: req.body.margin || '16mm',
      toc: req.body.toc !== false,
      headerFooter: req.body.headerFooter === true,
      title: req.body.title || '',
      css: Array.isArray(req.body.css) ? req.body.css : [],
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="document.pdf"');
    res.send(pdf);
  } catch (err) {
    res.status(400).send(err.message || String(err));
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`md2pdf preview running at http://localhost:${port}`);
});
