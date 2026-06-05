// User stylesheet compilation: pick SASS/SCSS, LESS or plain CSS by file extension
// sass / less are optional dependencies, dynamically imported only when actually used
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function compileScss(file) {
  let sass;
  try {
    // Use a namespace import (sass has deprecated the default import)
    sass = await import('sass');
  } catch {
    throw new Error(
      `Processing ${path.basename(file)} requires the "sass" package, install it first: npm install sass`,
    );
  }
  const result = await sass.compileAsync(file, { style: 'expanded', loadPaths: [path.dirname(file)] });
  return result.css;
}

async function compileLess(file) {
  let less;
  try {
    less = (await import('less')).default ?? (await import('less'));
  } catch {
    throw new Error(
      `Processing ${path.basename(file)} requires the "less" package, install it first: npm install less`,
    );
  }
  const input = await readFile(file, 'utf8');
  const result = await less.render(input, { filename: file, paths: [path.dirname(file)] });
  return result.css;
}

/**
 * Compile a single stylesheet into a CSS string
 * @param {string} file Stylesheet path (.css/.scss/.sass/.less)
 * @returns {Promise<string>}
 */
export async function compileStyle(file) {
  const ext = path.extname(file).toLowerCase();
  switch (ext) {
    case '.scss':
    case '.sass':
      return compileScss(file);
    case '.less':
      return compileLess(file);
    case '.css':
      return readFile(file, 'utf8');
    default:
      throw new Error(`Unsupported stylesheet extension: ${ext} (supported: .css/.scss/.sass/.less)`);
  }
}

/**
 * Compile multiple user stylesheets and concatenate them into a single CSS string
 * @param {string[]} files
 * @returns {Promise<string>}
 */
export async function compileStyles(files = []) {
  const parts = [];
  for (const file of files) {
    parts.push(await compileStyle(file));
  }
  return parts.join('\n');
}
