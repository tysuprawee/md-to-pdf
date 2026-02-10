const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const MarkdownIt = require('markdown-it');
const anchor = require('markdown-it-anchor');
const attrs = require('markdown-it-attrs');
const footnote = require('markdown-it-footnote');
const taskLists = require('markdown-it-task-lists');
const deflist = require('markdown-it-deflist');
const texmath = require('markdown-it-texmath');
const toc = require('markdown-it-table-of-contents');
const katex = require('katex');
const hljs = require('highlight.js');
const puppeteer = require('puppeteer');

const THEME_ASSETS = {
  clean: {
    githubCss: 'github-markdown.css',
    highlightCss: 'github.css',
  },
  serif: {
    githubCss: 'github-markdown.css',
    highlightCss: 'github.css',
  },
  academic: {
    githubCss: 'github-markdown.css',
    highlightCss: 'github.css',
  },
  'github-dark': {
    githubCss: 'github-markdown-dark.css',
    highlightCss: 'github-dark.css',
  },
};

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveTheme(theme) {
  const selected = theme || 'clean';
  const info = THEME_ASSETS[selected];
  if (!info) {
    throw new Error('Unknown theme "' + selected + '". Use clean, serif, academic, or github-dark.');
  }

  const themePath = path.join(__dirname, '..', 'themes', `${selected}.css`);
  if (!fs.existsSync(themePath)) {
    throw new Error(`Theme stylesheet not found: ${themePath}`);
  }

  return {
    name: selected,
    themeCss: fs.readFileSync(themePath, 'utf8'),
    githubCss: fs.readFileSync(
      path.join(__dirname, '..', 'node_modules', 'github-markdown-css', info.githubCss),
      'utf8'
    ),
    highlightCss: fs.readFileSync(
      path.join(__dirname, '..', 'node_modules', 'highlight.js', 'styles', info.highlightCss),
      'utf8'
    ),
  };
}

function normalizeImageSrc(src, basedir) {
  if (!src) return src;
  if (/^(https?:|data:|file:|#|blob:)/i.test(src)) return src;
  if (/^[a-zA-Z]:[\\/]/.test(src)) return pathToFileURL(src).href;
  return pathToFileURL(path.resolve(basedir, src)).href;
}

function fixHtmlImagePaths(html, basedir) {
  return html.replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)(\2)/gi,
    (match, prefix, quote, src, suffixQuote) => `${prefix}${quote}${normalizeImageSrc(src, basedir)}${suffixQuote}`
  );
}

function getMimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function fileUrlToPath(fileUrl) {
  const url = new URL(fileUrl);
  let p = decodeURIComponent(url.pathname);
  if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1);
  return p;
}

async function inlineImageSources(html, basedir) {
  const imgSrcPattern = /(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)(\2)/gi;
  const matches = Array.from(html.matchAll(imgSrcPattern));
  const srcs = [...new Set(matches.map((m) => m[3]))];
  const replacements = new Map();

  for (const src of srcs) {
    if (!src || /^(data:|blob:|#)/i.test(src)) continue;
    try {
      let mime = 'application/octet-stream';
      let bytes;

      if (/^https?:/i.test(src)) {
        const res = await fetch(src);
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        bytes = Buffer.from(ab);
        mime = (res.headers.get('content-type') || '').split(';')[0] || mime;
      } else {
        let localPath = src;
        if (/^file:/i.test(src)) localPath = fileUrlToPath(src);
        else if (!path.isAbsolute(src)) localPath = path.resolve(basedir, src);
        if (!fs.existsSync(localPath)) continue;
        bytes = fs.readFileSync(localPath);
        mime = getMimeFromPath(localPath);
      }

      const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
      replacements.set(src, dataUrl);
    } catch (_) {
      // Keep original src if loading fails.
    }
  }

  return html.replace(imgSrcPattern, (match, prefix, quote, src, suffixQuote) => {
    const nextSrc = replacements.get(src) || src;
    return `${prefix}${quote}${nextSrc}${suffixQuote}`;
  });
}

function createMarkdownRenderer(withToc) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return `<pre><code class="hljs language-${lang}">${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      }
      return `<pre><code class="hljs">${md.utils.escapeHtml(str)}</code></pre>`;
    },
  });

  md.use(anchor);
  md.use(attrs);
  md.use(footnote);
  md.use(taskLists, { enabled: true, label: true, labelAfter: true });
  md.use(deflist);
  md.use(texmath, { engine: katex, delimiters: 'dollars', katexOptions: { throwOnError: false } });

  if (withToc) {
    md.use(toc, {
      includeLevel: [1, 2, 3],
      containerClass: 'toc',
    });
  }

  return md;
}

function loadCssBlocks(extraCssFiles, themeName) {
  const theme = resolveTheme(themeName);
  const katexCss = fs.readFileSync(
    path.join(__dirname, '..', 'node_modules', 'katex', 'dist', 'katex.min.css'),
    'utf8'
  );

  const baseCss = `
@page {
  margin: 16mm;
}
body {
  margin: 0;
  background: #f4f6f8;
}
.page-wrap {
  padding: 20px 0;
}
.markdown-body {
  box-sizing: border-box;
  min-width: 200px;
  max-width: 960px;
  margin: 0 auto;
  background: #ffffff;
  padding: 48px;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(31, 35, 40, 0.08);
}
img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1rem auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
thead {
  display: table-header-group;
}
tfoot {
  display: table-footer-group;
}
tr,
td,
th,
img,
pre,
blockquote {
  break-inside: avoid;
  page-break-inside: avoid;
}
h1, h2, h3, h4, h5, h6 {
  break-after: avoid-page;
  page-break-after: avoid;
}
pre {
  overflow: auto;
}
.toc {
  padding: 12px 16px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f6f8fa;
}
.toc ul {
  margin: 0.4rem 0;
}
.pdf-header, .pdf-footer {
  width: 100%;
  font-size: 8.5pt;
  color: #6e7781;
  padding: 0 12mm;
  box-sizing: border-box;
}
.pdf-header {
  padding-bottom: 2mm;
}
.pdf-footer {
  padding-top: 2mm;
  display: flex;
  justify-content: space-between;
}
@media print {
  body {
    background: #fff;
  }
  .page-wrap {
    padding: 0;
  }
  .markdown-body {
    max-width: none;
    margin: 0;
    border: none;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
  }
  table,
  tr,
  td,
  th,
  img,
  pre,
  blockquote {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`;

  const customCss = extraCssFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n\n');
  return [theme.githubCss, katexCss, theme.highlightCss, baseCss, theme.themeCss, customCss].join('\n\n');
}

function extractTitle(markdown, fallback = 'Document') {
  const m = markdown.match(/^\s*#\s+(.+)$/m);
  if (!m) return fallback;
  return m[1].trim();
}

function buildHtml(content, css, title) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="page-wrap">
    <article class="markdown-body">
${content}
    </article>
  </div>
</body>
</html>`;
}

async function renderMarkdownDocument(options) {
  const basedir = options.basedir ? path.resolve(options.basedir) : process.cwd();
  const markdown = options.markdown;
  const md = createMarkdownRenderer(options.toc !== false);
  const title = options.title || extractTitle(markdown, 'Markdown Document');
  const renderedWithPaths = fixHtmlImagePaths(md.render(markdown), basedir);
  const rendered = await inlineImageSources(renderedWithPaths, basedir);
  const css = loadCssBlocks(options.css || [], options.theme || 'clean');
  const html = buildHtml(rendered, css, title);
  return { html, title };
}

function replaceAllText(text, from, to) {
  return text.split(from).join(to);
}

function renderHeaderFooterText(text, title) {
  const withTitle = String(text || '').replace(/\{title\}/gi, title || '');
  const pageToken = '__PAGE_TOKEN__';
  const totalToken = '__TOTAL_TOKEN__';
  const dateToken = '__DATE_TOKEN__';
  let escaped = escapeHtml(
    withTitle
      .replace(/\{page\}/gi, pageToken)
      .replace(/\{total\}/gi, totalToken)
      .replace(/\{date\}/gi, dateToken)
  );
  escaped = replaceAllText(escaped, pageToken, '<span class="pageNumber"></span>');
  escaped = replaceAllText(escaped, totalToken, '<span class="totalPages"></span>');
  escaped = replaceAllText(escaped, dateToken, '<span class="date"></span>');
  return escaped;
}

function resolveHeaderFooterFields(options, title) {
  const hasCustomHeader = [options.headerLeft, options.headerCenter, options.headerRight]
    .some((v) => String(v || '').trim().length > 0);
  const hasCustomFooter = [options.footerLeft, options.footerCenter, options.footerRight]
    .some((v) => String(v || '').trim().length > 0);

  return {
    headerLeft: hasCustomHeader ? (options.headerLeft || '') : '',
    headerCenter: hasCustomHeader ? (options.headerCenter || '') : title,
    headerRight: hasCustomHeader ? (options.headerRight || '') : '',
    footerLeft: hasCustomFooter ? (options.footerLeft || '') : 'Page {page} of {total}',
    footerCenter: hasCustomFooter ? (options.footerCenter || '') : '',
    footerRight: hasCustomFooter ? (options.footerRight || '') : '{date}',
  };
}

function buildRowTemplate(left, center, right, rule, topOrBottom = 'bottom') {
  const border = topOrBottom === 'top'
    ? `border-top:1px solid ${rule};padding-top:2mm;`
    : `border-bottom:1px solid ${rule};padding-bottom:2mm;`;

  return `
<div style="width:100%;font-size:11px;color:#6e7781;padding:0 10mm;box-sizing:border-box;${border}">
  <div style="display:flex;align-items:center;gap:6mm;line-height:1.35;">
    <div style="flex:1;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${left}</div>
    <div style="flex:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${center}</div>
    <div style="flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${right}</div>
  </div>
</div>`;
}

function buildHeaderTemplate(fields, title, ruleColor) {
  return buildRowTemplate(
    renderHeaderFooterText(fields.headerLeft, title),
    renderHeaderFooterText(fields.headerCenter, title),
    renderHeaderFooterText(fields.headerRight, title),
    ruleColor,
    'bottom'
  );
}

function buildFooterTemplate(fields, title, ruleColor) {
  return buildRowTemplate(
    renderHeaderFooterText(fields.footerLeft, title),
    renderHeaderFooterText(fields.footerCenter, title),
    renderHeaderFooterText(fields.footerRight, title),
    ruleColor,
    'top'
  );
}

async function renderMarkdownToPdf(options) {
  let markdown = options.markdown;
  if (!markdown) {
    if (!options.input || !fs.existsSync(options.input)) {
      throw new Error(`Input file not found: ${options.input || '(missing)'}`);
    }
    markdown = fs.readFileSync(options.input, 'utf8');
  }

  for (const cssFile of options.css || []) {
    if (!fs.existsSync(cssFile)) {
      throw new Error(`CSS file not found: ${cssFile}`);
    }
  }

  const { html, title } = await renderMarkdownDocument({
    markdown,
    basedir: options.basedir,
    toc: options.toc,
    theme: options.theme,
    css: options.css,
    title: options.title,
  });

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        })
      );
    });
    await page.emulateMediaType('print');

    const themeName = options.theme || 'clean';
    const displayHeaderFooter = options.headerFooter === true;
    const requestedMargin = options.margin || '16mm';
    const headerFooterFields = resolveHeaderFooterFields(options, title);
    const ruleColor = themeName === 'github-dark' ? '#2a3040' : '#d0d7de';
    const marginValue =
      themeName === 'github-dark' && requestedMargin === '16mm' && !displayHeaderFooter
        ? '0mm'
        : requestedMargin;
    const pdfBuffer = await page.pdf({
      path: options.output,
      printBackground: true,
      format: options.paper || 'Letter',
      displayHeaderFooter,
      headerTemplate: displayHeaderFooter
        ? buildHeaderTemplate(headerFooterFields, title, ruleColor)
        : '<span></span>',
      footerTemplate: displayHeaderFooter
        ? buildFooterTemplate(headerFooterFields, title, ruleColor)
        : '<span></span>',
      margin: {
        top: displayHeaderFooter ? '18mm' : marginValue,
        right: marginValue,
        bottom: displayHeaderFooter ? '18mm' : marginValue,
        left: marginValue,
      },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { renderMarkdownToPdf, renderMarkdownDocument };
