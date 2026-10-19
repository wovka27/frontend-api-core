import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  BREAKING_SECTION,
  COMMIT_TYPES,
  HEADER_MAX_LENGTH,
  RELEASE_LEVEL_BY_TYPE,
  RELEASE_RANK,
  SECTION_BY_TYPE,
  SECTION_ORDER,
} from './commit-policy.mjs';

const HEADER_PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?: (?<subject>.+)$/;
const SCOPE_PATTERN = /^[a-z0-9][a-z0-9._/-]*$/;
const VERSION_PATTERN = /^v?(?<version>\d+\.\d+\.\d+)$/;
const GIT_FORMAT = '%x1e%H%x1f%P%x1f%s%x1f%b';
const TYPE_SET = new Set(COMMIT_TYPES);

/**
 * @param {string} version
 * @param {'major' | 'minor' | 'patch'} level
 */
export function bumpVersion(version, level) {
  const match = VERSION_PATTERN.exec(version.trim());
  if (!match || !Object.hasOwn(RELEASE_RANK, level)) {
    throw new Error(`Cannot bump version "${version}" with level "${String(level)}"`);
  }

  let [major, minor, patch] = match.groups.version.split('.').map(Number);
  if (level === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (level === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

/**
 * @param {string | null | undefined} left
 * @param {string | null | undefined} right
 */
export function higherLevel(left, right) {
  const leftRank = left ? RELEASE_RANK[left] : 0;
  const rightRank = right ? RELEASE_RANK[right] : 0;
  if (leftRank === 0 && rightRank === 0) {
    return null;
  }
  return leftRank >= rightRank ? left : right;
}

/**
 * @param {string} raw
 */
export function parseGitLog(raw) {
  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = '', parents = '', subject = '', body = ''] = record.split('\x1f');
      return {
        hash: hash.trim(),
        parents: parents.trim().split(' ').filter(Boolean),
        subject: subject.trim(),
        body: body.replace(/^\n+|\n+$/g, ''),
      };
    });
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} cwd
 */
export function readGitCommits(from, to, cwd) {
  const output = execFileSync('git', ['log', `--format=${GIT_FORMAT}`, `${from}..${to}`], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return parseGitLog(output);
}

/**
 * @param {{ hash?: string, parents?: string[], subject: string, body?: string }} commit
 */
export function parseCommit(commit) {
  const subject = commit.subject ?? '';
  const parents = commit.parents ?? [];
  if (parents.length > 1 || /^(Merge |fixup! |squash! )/.test(subject)) {
    return { skip: true };
  }

  const hash = commit.hash ?? '';
  const shortHash = hash ? hash.slice(0, 7) : '';
  const header = HEADER_PATTERN.exec(subject);
  if (!header?.groups) {
    return { ok: false, shortHash, summary: subject || '(empty message)' };
  }

  const type = header.groups.type ?? '';
  const scope = header.groups.scope ?? '';
  const bang = Boolean(header.groups.bang);
  const description = (header.groups.subject ?? '').trim();
  const problems = [];

  if (!TYPE_SET.has(type)) {
    problems.push(`unknown type "${type}"`);
  }
  if (header.groups.scope !== undefined && !SCOPE_PATTERN.test(scope)) {
    problems.push('scope must be lowercase');
  }
  if (!description) {
    problems.push('empty subject');
  }
  if (description.endsWith('.')) {
    problems.push('subject ends with a period');
  }
  if (subject.length > HEADER_MAX_LENGTH) {
    problems.push(`header is longer than ${HEADER_MAX_LENGTH}`);
  }

  const breakingNotes = footers(commit.body ?? '')
    .filter((footer) => footer.token === 'BREAKING CHANGE' || footer.token === 'BREAKING-CHANGE')
    .map((footer) => footer.value.trim())
    .filter(Boolean);

  if (problems.length > 0) {
    return { ok: false, shortHash, summary: subject, problems };
  }

  return {
    ok: true,
    skip: false,
    type,
    scope,
    subject: description,
    shortHash,
    breaking: bang || breakingNotes.length > 0,
    breakingNotes,
  };
}

/**
 * @param {Array<{ hash?: string, parents?: string[], subject: string, body?: string }>} commits
 */
export function summarizeCommits(commits) {
  /** @type {Record<string, string[]>} */
  const grouped = {
    [BREAKING_SECTION]: [],
    Added: [],
    Changed: [],
    Fixed: [],
  };
  /** @type {string[]} */
  const silent = [];
  /** @type {Array<{ shortHash: string, summary: string }>} */
  const invalid = [];
  /** @type {'major' | 'minor' | 'patch' | null} */
  let level = null;

  for (const commit of commits) {
    const parsed = parseCommit(commit);
    if (parsed.skip) {
      continue;
    }
    if (!parsed.ok) {
      invalid.push({ shortHash: parsed.shortHash, summary: parsed.summary });
      continue;
    }

    if (parsed.breaking) {
      const notes = parsed.breakingNotes.length > 0 ? parsed.breakingNotes : [parsed.subject];
      for (const note of notes) {
        grouped[BREAKING_SECTION].push(bullet(parsed, { breakingNote: note }));
      }
      level = higherLevel(level, 'major');
    }

    const section = SECTION_BY_TYPE[parsed.type];
    if (section) {
      grouped[section].push(bullet(parsed, { markBreaking: parsed.breaking }));
      level = higherLevel(level, RELEASE_LEVEL_BY_TYPE[parsed.type] ?? null);
    } else if (!parsed.breaking) {
      silent.push(bullet(parsed, { includeType: true }));
    }
  }

  return { level, grouped, silent, invalid };
}

/**
 * @param {ReturnType<typeof summarizeCommits>} summary
 * @param {{
 *   currentVersion: string,
 *   nextVersion: string | null,
 *   level: 'major' | 'minor' | 'patch' | null,
 *   prLevel: 'major' | 'minor' | 'patch' | null,
 *   baselineTag: string | null,
 *   mainAffectsVersion: boolean,
 * }} version
 */
export function renderPullRequestChangelog(summary, version) {
  const lines = [
    '## Changelog',
    '',
    'Built from the commits in this pull request using [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The version follows [SemVer](https://semver.org/spec/v2.0.0.html).',
    '',
  ];

  if (version.baselineTag) {
    lines.push(`Baseline version: \`${version.currentVersion}\` (tag \`${version.baselineTag}\`).`);
  } else {
    lines.push(
      `No \`v*\` baseline tag yet. The release on \`main\` waits until tag \`v${version.currentVersion}\` matches \`package.json\`.`,
    );
  }

  if (version.nextVersion && version.level) {
    lines.push(
      `Next version after merge into \`main\`: **\`${version.nextVersion}\`** (${version.level}).`,
    );
  } else {
    lines.push('No release: none of the commits are `feat`, `fix`, `perf`, `revert`, or a breaking change.');
  }

  if (version.mainAffectsVersion) {
    const prImpact = version.prLevel ?? 'no release';
    lines.push(`This pull request: ${prImpact}.`);
    lines.push('Unreleased commits already on `main` since the last tag are included in the version.');
  }

  lines.push('');

  for (const section of SECTION_ORDER) {
    const items = summary.grouped[section] ?? [];
    if (items.length === 0) {
      continue;
    }
    lines.push(`### ${section}`, '', ...items, '');
  }

  if (summary.silent.length > 0) {
    lines.push('### No version bump', '', ...summary.silent, '');
  }

  if (summary.invalid.length > 0) {
    lines.push(
      '### Invalid commits',
      '',
      'commitlint will fail this pull request until those messages follow the standard.',
      '',
    );
    for (const commit of summary.invalid) {
      const hash = commit.shortHash ? ` \`${commit.shortHash}\`` : '';
      lines.push(`- ${neutralize(commit.summary)}${hash}`);
    }
    lines.push('');
  }

  lines.push('Commit message rules: [docs/commits.md](docs/commits.md).');
  return `${lines.join('\n').trim()}\n`;
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} cwd
 * @param {string | undefined} versionOverride
 */
export function changelogForRange(from, to, cwd, versionOverride) {
  const tagged = versionOverride ? null : readTaggedVersion(cwd, from);
  const currentVersion = versionOverride ?? tagged?.version ?? readPackageVersion(cwd);
  const baselineTag = versionOverride ? null : (tagged?.tag ?? null);
  const prCommits = readGitCommits(from, to, cwd);
  const mainCommits = tagged ? readGitCommits(tagged.tag, from, cwd) : [];
  const prSummary = summarizeCommits(prCommits);
  const overall = summarizeCommits([...mainCommits, ...prCommits]);
  const level = overall.level;
  const nextVersion = level ? bumpVersion(currentVersion, level) : null;

  return renderPullRequestChangelog(prSummary, {
    currentVersion,
    nextVersion,
    level,
    prLevel: prSummary.level,
    baselineTag,
    mainAffectsVersion: rank(level) > rank(prSummary.level),
  });
}

function rank(level) {
  return level ? RELEASE_RANK[level] : 0;
}

/**
 * @param {string} cwd
 * @param {string} ref
 */
function readTaggedVersion(cwd, ref) {
  try {
    const tag = execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', ref], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = /^v(\d+\.\d+\.\d+)$/.exec(tag);
    if (!match) {
      return null;
    }
    return { tag, version: match[1] };
  } catch {
    return null;
  }
}

/**
 * @param {string} cwd
 */
function readPackageVersion(cwd) {
  const file = path.join(cwd, 'package.json');
  const version = JSON.parse(readFileSync(file, 'utf8')).version;
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new Error(`package.json version "${String(version)}" is not MAJOR.MINOR.PATCH`);
  }
  return version.replace(/^v/, '');
}

/**
 * @param {string} body
 */
function footers(body) {
  /** @type {Array<{ token: string, value: string }>} */
  const found = [];
  let current = null;

  for (const line of body.split(/\r?\n/)) {
    const match = /^(BREAKING CHANGE|[A-Za-z][A-Za-z-]*)(?:: | #)(.*)$/.exec(line);
    if (match) {
      current = { token: match[1] ?? '', value: match[2] ?? '' };
      found.push(current);
      continue;
    }
    if (current && line.length > 0) {
      current.value += `\n${line}`;
    }
  }

  return found;
}

/**
 * @param {{ type: string, scope: string, subject: string, shortHash: string, breaking: boolean }} parsed
 * @param {{ includeType?: boolean, markBreaking?: boolean, breakingNote?: string }} options
 */
function bullet(parsed, options) {
  const prefix = prefixFor(parsed, options);
  const hash = parsed.shortHash ? ` (\`${parsed.shortHash}\`)` : '';
  const mark = options.markBreaking ? '**BREAKING** ' : '';
  const text = options.breakingNote ? neutralize(options.breakingNote) : neutralize(parsed.subject);
  const sameNote = options.breakingNote && options.breakingNote.trim() === parsed.subject;
  if (options.breakingNote && !sameNote) {
    return `- ${prefix}${neutralize(parsed.subject)}${hash}\n\n  ${text}`;
  }
  return `- ${mark}${prefix}${text}${hash}`;
}

/**
 * @param {{ type: string, scope: string }} parsed
 * @param {{ includeType?: boolean }} options
 */
function prefixFor(parsed, options) {
  if (options.includeType && parsed.scope) {
    return `**${parsed.type}(${parsed.scope}):** `;
  }
  if (options.includeType) {
    return `**${parsed.type}:** `;
  }
  if (parsed.scope) {
    return `**${parsed.scope}:** `;
  }
  return '';
}

/**
 * @param {string} text
 */
function neutralize(text) {
  return text.replaceAll('@', '@\u200b');
}

function printUsage() {
  console.error(
    'Usage: node scripts/changelog-from-commits.mjs --from <base-sha> --to <head-sha> [--out file] [--current-version x.y.z]',
  );
}

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function isDirectExecution() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectExecution()) {
  const from = readFlag('--from');
  const to = readFlag('--to');
  const out = readFlag('--out');
  const currentVersion = readFlag('--current-version');

  if (!from || !to) {
    printUsage();
    process.exit(1);
  }

  try {
    const markdown = changelogForRange(from, to, process.cwd(), currentVersion);
    if (out) {
      writeFileSync(out, markdown);
    }
    process.stdout.write(markdown);
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? error.stderr : undefined;
    const message = Buffer.isBuffer(stderr) && stderr.length > 0 ? stderr.toString() : error.message;
    console.error(message);
    process.exit(1);
  }
}
