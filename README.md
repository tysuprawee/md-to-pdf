# Markdown to PDF App

A local Markdown -> PDF tool with:
- GitHub-flavored Markdown rendering
- Beautiful sectioning and optional TOC
- Equations (KaTeX)
- Code block highlighting
- Local and URL image support
- Multiple themes, including `github-dark`
- Header/footer page numbers + title metadata
- Live preview web UI

## Install

```powershell
npm install
```

## CLI usage

```powershell
node src/cli.js --input input.md --output output.pdf
```

### CLI options

- `--input`, `-i`: input markdown file (required)
- `--output`, `-o`: output PDF path
- `--theme`, `-t`: `clean`, `serif`, `academic`, `github-dark`
- `--paper`: `Letter` or `A4`
- `--margin`: margin value (example: `16mm`)
- `--title`: override document title for metadata/header
- `--basedir`: base path for relative image references
- `--css`: extra CSS file path (repeatable)
- `--no-toc`: disable TOC support
- `--header-footer`: enable page header/footer and page numbers
- `--no-header-footer`: disable page header/footer and page numbers (default)

### Examples

```powershell
node src/cli.js --input input.md --output output.pdf --theme clean
node src/cli.js --input input.md --output output-dark.pdf --theme github-dark
node src/cli.js --input input.md --output output.pdf --title "Game Card Guide"
```

## Live preview web UI

```powershell
npm run preview
```

Then open:

```text
http://localhost:3000
```

### In the web UI

1. Set `File` to a markdown file path (default is `input.md`).
2. Click `Load`.
3. Edit markdown on the left; preview updates automatically on the right.
4. Adjust `Theme`, `Paper`, `Margin`, TOC, and Header/Footer options.
5. Click `Export PDF` to download.

## NPM shortcuts

```powershell
npm run build:sample
npm run build:sample:serif
npm run build:sample:academic
npm run build:sample:dark
```

## Markdown features included

- Headings + anchors
- Task lists and tables (GitHub-style)
- Footnotes and definition lists
- Equations with `$inline$` and `$$display$$`
- Fenced code blocks with highlight
- Raw HTML support (including `<img ...>`)

## Tips

- For local images, set `--basedir` to the folder where your markdown/image files live.
- If a remote image URL does not render, the URL is likely access-restricted or expired.
- Use `[TOC]` in markdown to render a table of contents block.
