// Project-level config file: search upward from the input file's directory for
// tarmdas.config.json and use it as the source of option defaults
// (precedence: built-in defaults < config file < CLI flags)
import { readFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_FILENAME = 'tarmdas.config.json';

// Fields allowed in the config file (camelCase forms of the CLI long flags)
// Per-conversion options such as title and output are not configurable here
export const ALLOWED_KEYS = [
  'theme',
  'highlightTheme',
  'css',
  'externalAssets',
  'maxInlineSize',
  'maxWidth',
  'fontSize',
  'breaks',
  'math',
  'mermaid',
  'highlight',
  'newTab',
  'port',
  'basedir',
];

/**
 * Search upward from startDir level by level for a config file, returning the first path found
 * @param {string} startDir Starting directory (usually the input file's directory)
 * @returns {Promise<string|null>} Absolute path of the config file, or null if not found
 */
export async function findConfig(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const file = path.join(dir, CONFIG_FILENAME);
    try {
      await access(file);
      return file;
    } catch {
      /* not at this level, go one up */
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached the filesystem root
    dir = parent;
  }
}

/**
 * Find and load the config file: parse the JSON, validate the fields, and resolve
 * relative css paths against the config file's directory
 * @param {string} startDir Starting directory (usually the input file's directory)
 * @returns {Promise<{ config: object, configPath: string|null }>} config is an empty object when no config file is found
 */
export async function loadConfig(startDir) {
  const configPath = await findConfig(startDir);
  if (!configPath) return { config: {}, configPath: null };

  let data;
  try {
    data = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot parse config file ${configPath}: ${err.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Config file ${configPath} must have a JSON object at the top level`);
  }

  const unknown = Object.keys(data).filter((k) => !ALLOWED_KEYS.includes(k));
  if (unknown.length) {
    throw new Error(
      `Config file ${configPath} contains unknown field(s): ${unknown.join(', ')}\n\nAvailable fields: ${ALLOWED_KEYS.join(', ')}`,
    );
  }

  const config = { ...data };
  const configDir = path.dirname(configPath);
  // css may be a single string or an array; relative paths resolve against the config
  // file's directory, independent of the runtime cwd
  if (config.css != null) {
    const list = Array.isArray(config.css) ? config.css : [config.css];
    config.css = list.map((f) => path.resolve(configDir, f));
  }
  // basedir backs the `@/` link/image prefix; expand a leading `~` and resolve relative
  // values against the config file's directory, so it ends up as an absolute path
  if (config.basedir != null) {
    let b = String(config.basedir);
    if (b === '~' || b.startsWith('~/')) b = path.join(os.homedir(), b.slice(1));
    config.basedir = path.resolve(configDir, b);
  }
  return { config, configPath };
}
