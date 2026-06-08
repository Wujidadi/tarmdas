# Tarmdas

A local, fully offline Markdown → single-HTML converter

The project name comes from the author's Elvish name _Taras_ with _md_ (short for Markdown) embedded inside

## What is this

Tarmdas turns a single Markdown file into a single HTML file that opens offline — it is not a site generator, and it never spins up a full server just to convert one file.
By default it produces a self-contained single file: CSS, fonts, the Mermaid script and images are all embedded, so you can copy it anywhere and open it straight from the browser via `file://`, no network required

### Features

- **Fully offline**: every asset is embedded; nothing is fetched from remote sources
- **Single file**: self-contained by default; large media above the threshold (e.g. videos) automatically downgrades to sidecar assets to keep the file size sane
- **LaTeX / KaTeX**: math rendered at build time, fonts embedded as base64
- **Mermaid**: script embedded and rendered in the browser, no Puppeteer dependency
- **Code highlighting**: build-time highlighting via highlight.js
- **GitHub Alerts**: the five `> [!NOTE]` / `> [!IMPORTANT]`-style alert blocks, with markers and colors matching GitHub, plus a non-standard `> [!DATE]` type in a neutral gray for highlighting a date or timestamp — its title defaults to "Date" but a label on the marker line (e.g. `> [!DATE] Last updated: 2026-06-06`) overrides it; all auto-switch with the theme's light/dark mode
- **Task lists**: `- [ ]` / `- [x]` GFM task lists become read-only checkboxes (matching GitHub: display-only, not clickable)
- **Footnotes**: `[^1]` footnotes collected into a bottom section with backlinks
- **Heading anchors**: every heading gets a GitHub-style slug id (CJK preserved) and a clickable anchor, for in-page jumps and shareable section links
- **Extended syntax**: definition lists (`term\n: definition`), mark `==text==`, superscript `x^2^` / subscript `H~2~O`, emoji shortcodes `:rocket:` (converted to Unicode at build time), abbreviations `*[ABBR]:`, insert `++ins++`, custom containers `:::name`
- **Table of contents**: drop `[[toc]]` (or `[toc]`) into the document to generate a TOC nested by heading level with links to the matching anchors
- **Home-path links**: a leading `~` in a link or image target (e.g. `[draft](~/notes/draft.md)`) expands to an absolute `file://` URL, so it still resolves to the real local file when the HTML is opened offline; set `basedir` in the config file and a leading `@/` expands the same way against that base directory, to keep deep repeated path prefixes short
- **New-tab links**: links to another document — external (`http(s)`, protocol-relative), local `file://` and relative/absolute paths — open in a new tab with `target="_blank" rel="noopener noreferrer"`; only in-page `#` anchors and non-navigational schemes (`mailto:`, `tel:`) stay in the same tab. On by default (this is a single-document converter, not a site with navigation chrome); pass `--no-new-tab` or set `"newTab": false` to keep everything in the same tab. Literal `file://` links are allowed (`javascript:`/`vbscript:` stay blocked)
- **Built-in themes**: GitHub, One, Gruvbox, Tokyo Night, Solarized, Monokai, Dracula, Nord, xAI — 17 in total (most with light/dark), with body, code and Mermaid colors kept consistent
- **Custom styles**: CSS plus SASS / SCSS / LESS preprocessing
- **Config file**: place a `tarmdas.config.json` in your documents project to set common options (theme, page width, font size, etc.) and skip the flags
- **Live Reload**: opt-in; no server is started by default
- **Lightweight**: the CLI, dev server and file watching all use Node.js built-ins, no heavyweight frameworks

## Installation

Requires Node.js 20 or later

```bash
npm install
```

## Usage examples

Using the bundled [`examples/sample.md`](examples/sample.md) (covering text, lists, task lists, alert blocks, extended inline syntax, definition lists, footnotes, custom containers, TOC, tables, code, KaTeX, Mermaid and images):

```bash
# Convert to a self-contained single file (default output examples/sample.html)
node bin/tarmdas.js examples/sample.md

# Specify the output path
node bin/tarmdas.js examples/sample.md -o dist/sample.html

# Pick a built-in theme (github auto / github-light / github-dark)
node bin/tarmdas.js examples/sample.md --theme github-dark

# Light layout with dark code colors
node bin/tarmdas.js examples/sample.md --theme github-light --highlight-theme github-dark

# Apply a custom SCSS stylesheet
node bin/tarmdas.js examples/sample.md --css my-theme.scss

# Use "HTML + sidecar asset folder" mode instead
node bin/tarmdas.js examples/sample.md --external-assets

# Enable Live Reload (browser refreshes automatically on save)
node bin/tarmdas.js examples/sample.md --watch
```

With `--watch` enabled, open the URL shown in the terminal (default `http://localhost:4321/`); editing and saving `examples/sample.md` refreshes the page automatically

### Preview output

The commands above generate HTML files locally. To keep the bulky self-contained files (about 3.6 MB each) out of version control, `examples/*.html` and `examples/themes-preview/` are gitignored and not stored in the repository; to see the actual results, run the matching commands locally, for example:

```bash
# Self-contained single files, suffixed per scenario
node bin/tarmdas.js examples/sample.md -o examples/sample-github-auto.html
node bin/tarmdas.js examples/sample.md -o examples/sample-github-light.html --theme github-light
node bin/tarmdas.js examples/sample.md -o examples/sample-github-dark.html --theme github-dark
node bin/tarmdas.js examples/sample.md -o examples/sample-light-darkcode.html --theme github-light --highlight-theme github-dark
node bin/tarmdas.js examples/sample.md -o examples/sample-external.html --external-assets
```

You can also generate previews for several themes at once to compare them side by side (missing output directories are created automatically):

```bash
for theme in xai-dark xai-light github tokyo-night-dark dracula solarized-light; do
  node bin/tarmdas.js examples/sample.md \
    -o "examples/themes-preview/sample-$theme.html" --theme "$theme"
done
```

## Command options

| Option                     | Description                                                                       |
| -------------------------- | --------------------------------------------------------------------------------- |
| `-o, --output <file>`      | Output HTML path (default: same name with .html)                                  |
| `--css <file>`             | Custom stylesheet (.css/.scss/.sass/.less), repeatable                            |
| `--external-assets`        | Use "HTML + sidecar asset folder" mode instead                                    |
| `--max-inline-size <n>`    | Media inline-embedding limit in inline mode, supports k/m/g suffixes (default 5m) |
| `--theme <name>`           | Document theme, 17 in total (default github, full list under "Built-in themes")   |
| `--highlight-theme <name>` | Override code colors (any highlight.js theme)                                     |
| `--max-width <w>`          | Max page content width, bare number means px (default 1600px)                     |
| `--font-size <s>`          | Base body font size, bare number means px (default 14px)                          |
| `--title <text>`           | Document title (default: front matter or first H1)                                |
| `--breaks`                 | Render single newlines inside paragraphs as `<br>` (default: treated as spaces)   |
| `--no-new-tab`             | Keep links to other documents in the same tab (default: open new tab)             |
| `--no-math`                | Disable KaTeX                                                                     |
| `--no-mermaid`             | Disable Mermaid                                                                   |
| `--no-highlight`           | Disable code highlighting                                                         |
| `-w, --watch`              | Start the Live Reload dev server                                                  |
| `--port <n>`               | Dev server port (default 4321)                                                    |
| `-h, --help`               | Show help                                                                         |
| `-v, --version`            | Show version                                                                      |

## Config file

Personal preferences such as page width, font size and theme do not need flags on every run: place a `tarmdas.config.json` in your documents project to set them once.
On conversion, Tarmdas searches upward from the input file's directory and uses the first config file found; precedence is "built-in defaults < config file < CLI flags", so flags can always override ad hoc.

```json
{
  "theme": "github-dark",
  "css": ["./style/extra.scss"],
  "maxWidth": "1400px",
  "fontSize": 15,
  "breaks": true
}
```

- Field names are the camelCase forms of the CLI long flags. Available fields:
  `theme`, `highlightTheme`, `css`, `externalAssets`, `maxInlineSize`, `maxWidth`, `fontSize`, `breaks`, `newTab`, `math`, `mermaid`, `highlight`, `port`, `basedir`
- `maxWidth` and `fontSize` accept any CSS length (e.g. `90ch`, `1.05rem`); bare numbers mean px, and the Mermaid diagram font size follows `fontSize`
- `math`, `mermaid` and `highlight` are booleans; setting them to `false` is equivalent to the `--no-math` etc. flags
- `newTab` is a boolean defaulting to `true`; setting it to `false` is equivalent to the `--no-new-tab` flag
- `css` may be a string or an array; relative paths resolve against the config file's directory
- `basedir` sets the directory that the `@/` link/image prefix expands against (see "Home-path links" above); a leading `~` is expanded and relative values resolve against the config file's directory
- Per-conversion options such as `title` and `output` are not configurable here
- The config file is a personal preference; consider adding it to your documents project's `.gitignore` and keeping it out of version control

### Per-document front matter

A single document can override these same options from its own YAML front matter (the leading `---` block), which is the highest-precedence layer: "built-in defaults < config file < CLI flags < front matter".

```markdown
---
max-width: 1670px
theme: github-dark
mermaid: false
---

# My wide document
```

- Keys accept either the kebab-case flag name (`max-width`, `font-size`, `highlight-theme`) or the camelCase config name (`maxWidth`, `fontSize`, `highlightTheme`)
- Booleans take `true`/`false` (also `yes`/`no`, `on`/`off`, `1`/`0`); bare numbers in `maxWidth`/`fontSize` mean px, exactly as in the config file
- Relative `css`/`basedir` paths resolve against the document's own directory; `css` may be a single path or a comma-separated list
- Unrelated metadata (`title`, `author`, `date`, ...) is left untouched, so front matter you already use keeps working; `port` and `output` are not accepted (they are not properties of a document)

## Built-in themes

17 in total:

| Theme               | Body                      | Code (highlight.js)         | Mermaid              |
| ------------------- | ------------------------- | --------------------------- | -------------------- |
| `github` (default)  | follows system light/dark | auto-switching              | by system preference |
| `github-light`      | light                     | github                      | default              |
| `github-dark`       | dark                      | github-dark                 | dark                 |
| `one-light`         | light                     | atom-one-light              | default              |
| `one-dark`          | dark                      | atom-one-dark               | dark                 |
| `gruvbox-light`     | light                     | base16/gruvbox-light-medium | default              |
| `gruvbox-dark`      | dark                      | base16/gruvbox-dark-medium  | dark                 |
| `tokyo-night-light` | light                     | tokyo-night-light           | default              |
| `tokyo-night-dark`  | dark                      | tokyo-night-dark            | dark                 |
| `solarized-light`   | light                     | base16/solarized-light      | default              |
| `solarized-dark`    | dark                      | base16/solarized-dark       | dark                 |
| `monokai`           | dark                      | monokai                     | dark                 |
| `dracula`           | dark                      | base16/dracula              | dark                 |
| `nord`              | dark                      | nord                        | dark                 |
| `xai`               | follows system light/dark | auto-switching              | by system preference |
| `xai-light`         | light                     | tokyo-night-light           | default              |
| `xai-dark`          | dark                      | tokyo-night-dark            | dark                 |

Each theme drives the body through CSS variables and links the matching highlight.js code colors and Mermaid diagram theme, keeping all three consistent across light/dark. Themes are written in SCSS under [`themes/`](themes/) and can serve as templates for custom themes

> Monokai, Dracula and Nord are dark-only because highlight.js ships no official light variants for them

## Tech stack

| Area                    | Choice                                           |
| ----------------------- | ------------------------------------------------ |
| Runtime                 | Node.js (ESM)                                    |
| Markdown parsing        | markdown-it                                      |
| Math                    | KaTeX + markdown-it-texmath                      |
| Code highlighting       | highlight.js                                     |
| Diagrams                | Mermaid (browser-side rendering)                 |
| Style preprocessing     | sass (dart-sass); less is optional               |
| CLI / server / watching | Node.js built-in parseArgs, http, fs.watch + SSE |

## How it works

1. Read the Markdown and parse the front matter
2. Render to HTML with markdown-it; code goes through highlight.js, math through KaTeX, and Mermaid blocks become `<pre class="mermaid">`
3. Process local images/media: files below the threshold are Base64-embedded (SVG inlined); above the threshold or in external mode they are copied to the sidecar asset folder
4. Inline assets on demand: theme, KaTeX, Mermaid and other resources are only included when the document actually uses them, keeping simple documents small
5. Assemble the complete HTML and write it out

## Development

```bash
npm test   # run the unit tests (node:test)
```

## License

MIT licensed, see [LICENSE](LICENSE)
