#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { renderMarkdownToPdf } = require('./renderer');

function parseArgs(argv) {
  const args = {
    input: '',
    output: '',
    theme: 'clean',
    paper: 'Letter',
    toc: true,
    basedir: '',
    css: [],
    margin: '16mm',
    title: '',
    headerFooter: false,
    headerLeft: '',
    headerCenter: '',
    headerRight: '',
    footerLeft: '',
    footerCenter: '',
    footerRight: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') args.input = argv[++i];
    else if (arg === '--output' || arg === '-o') args.output = argv[++i];
    else if (arg === '--theme' || arg === '-t') args.theme = argv[++i];
    else if (arg === '--paper') args.paper = argv[++i];
    else if (arg === '--margin') args.margin = argv[++i];
    else if (arg === '--basedir') args.basedir = argv[++i];
    else if (arg === '--title') args.title = argv[++i];
    else if (arg === '--header-left') args.headerLeft = argv[++i];
    else if (arg === '--header-center') args.headerCenter = argv[++i];
    else if (arg === '--header-right') args.headerRight = argv[++i];
    else if (arg === '--footer-left') args.footerLeft = argv[++i];
    else if (arg === '--footer-center') args.footerCenter = argv[++i];
    else if (arg === '--footer-right') args.footerRight = argv[++i];
    else if (arg === '--css') args.css.push(argv[++i]);
    else if (arg === '--no-toc') args.toc = false;
    else if (arg === '--header-footer') args.headerFooter = true;
    else if (arg === '--no-header-footer') args.headerFooter = false;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.input) {
    printHelp();
    throw new Error('Missing required --input path');
  }

  const inputAbs = path.resolve(args.input);
  if (!fs.existsSync(inputAbs)) {
    throw new Error(`Input file not found: ${inputAbs}`);
  }

  args.input = inputAbs;
  args.output = args.output
    ? path.resolve(args.output)
    : path.join(path.dirname(inputAbs), `${path.parse(inputAbs).name}.pdf`);
  args.basedir = args.basedir ? path.resolve(args.basedir) : path.dirname(inputAbs);
  args.css = args.css.map((p) => path.resolve(p));

  return args;
}

function printHelp() {
  console.log(`md2pdf - Markdown to PDF with GitHub-style formatting

Usage:
  node src/cli.js --input input.md [options]

Options:
  -i, --input <path>         Input markdown file (required)
  -o, --output <path>        Output PDF path (default: input filename + .pdf)
  -t, --theme <name>         Theme: clean | serif | academic | github-dark
      --paper <size>         Paper size (Letter or A4, default: Letter)
      --margin <value>       Page margin for sides (default: 16mm)
      --title <text>         Override title metadata/header text
      --header-left <text>   Header left text
      --header-center <text> Header center text
      --header-right <text>  Header right text
      --footer-left <text>   Footer left text
      --footer-center <text> Footer center text
      --footer-right <text>  Footer right text
                             Placeholders: {title} {page} {total} {date}
      --basedir <path>       Base directory for relative image paths
      --css <path>           Extra CSS file (repeat for multiple)
      --no-toc               Disable table of contents plugin behavior
      --header-footer        Enable page header/footer with page numbers
      --no-header-footer     Disable page header/footer with page numbers
  -h, --help                 Show this help
`);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    await renderMarkdownToPdf(options);
    console.log(`Generated: ${options.output}`);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
