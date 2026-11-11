#!/usr/bin/env node
/**
 * Documentation link check.
 *
 * Verifies that every relative link, reference definition and in-page anchor in
 * the repository's Markdown files resolves. External URLs are not fetched and
 * fenced code blocks are ignored. Path matching is case-sensitive so a link
 * that works on Windows but breaks on Linux still fails here.
 *
 * Usage:
 *   node scripts/check-doc-links.mjs
 *   node scripts/check-doc-links.mjs --root <directory>
 *
 * Exit codes: 0 = all links resolve, 1 = at least one broken link.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const rootFlag = process.argv.indexOf('--root');
const root =
  rootFlag === -1
    ? path.resolve(here, '..')
    : path.resolve(process.argv[rootFlag + 1] ?? '');

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Not a directory: ${root}`);
  process.exit(2);
}

function collectMarkdown(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(full, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(full);
  }
  return out;
}

function stripCode(text) {
  let inFence = false;
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return '';
      }
      if (inFence) return '';
      return line.replace(/`[^`]*`/g, '');
    })
    .join('\n');
}

function slug(text) {
  return text
    .trim()
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function anchorIndex(text) {
  const seen = new Map();
  const anchors = new Set();
  const body = stripCode(text);
  for (const match of body.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = slug(match[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

/** Case-sensitive existence check, segment by segment. */
function resolveExact(absolute) {
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { ok: false };

  let current = root;
  for (const segment of relative.split(path.sep)) {
    if (!segment || segment === '.') continue;
    let entries;
    try {
      entries = fs.readdirSync(current);
    } catch {
      return { ok: false };
    }
    if (entries.includes(segment)) {
      current = path.join(current, segment);
      continue;
    }
    const loose = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
    return loose ? { ok: false, caseError: true, actual: loose } : { ok: false };
  }
  return fs.existsSync(current) ? { ok: true } : { ok: false };
}

const files = collectMarkdown(root).sort();
const anchorCache = new Map();
const broken = [];
let linkCount = 0;

for (const file of files) {
  const absolute = path.resolve(file);
  const text = fs.readFileSync(absolute, 'utf8');
  const body = stripCode(text);

  const anchorsFor = (target) => {
    if (!anchorCache.has(target)) {
      anchorCache.set(target, anchorIndex(fs.readFileSync(target, 'utf8')));
    }
    return anchorCache.get(target);
  };

  // Inline links plus reference definitions.
  const targets = [];
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    targets.push(match[1]);
  }
  for (const match of body.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(\S+)/gm)) {
    targets.push(match[1]);
  }

  for (const rawTarget of targets) {
    let target = rawTarget;
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    if (/^(https?:|mailto:|tel:|data:|ftp:|\/\/)/i.test(target)) continue;

    linkCount += 1;
    let anchor = null;
    const hash = target.indexOf('#');
    if (hash !== -1) {
      anchor = target.slice(hash + 1);
      target = target.slice(0, hash);
    }
    try {
      target = decodeURIComponent(target);
    } catch {
      // keep the raw form
    }
    target = target.split('?')[0];

    if (target === '') {
      if (anchor && !anchorsFor(absolute).has(anchor.toLowerCase())) {
        broken.push({ file, target: rawTarget, reason: 'missing anchor' });
      }
      continue;
    }

    const resolved = target.startsWith('/')
      ? path.resolve(root, target.replace(/^\/+/, ''))
      : path.resolve(path.dirname(absolute), target.split('/').join(path.sep));
    const check = resolveExact(resolved);

    if (!check.ok) {
      broken.push({
        file,
        target: rawTarget,
        reason: check.caseError
          ? `case mismatch: on disk it is "${check.actual}"`
          : 'file not found',
      });
      continue;
    }

    if (anchor && resolved.toLowerCase().endsWith('.md')) {
      if (!anchorsFor(resolved).has(anchor.toLowerCase())) {
        broken.push({ file, target: rawTarget, reason: 'missing anchor' });
      }
    }
  }
}

if (broken.length > 0) {
  for (const item of broken) {
    console.error(`${path.relative(root, item.file)}: ${item.target}  (${item.reason})`);
  }
  console.error(`\n${broken.length} broken of ${linkCount} links in ${files.length} files.`);
  process.exit(1);
}

console.log(`OK - ${linkCount} links in ${files.length} Markdown files, 0 broken.`);
