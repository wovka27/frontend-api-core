import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { COMMIT_TYPES, RELEASE_LEVEL_BY_TYPE } from './commit-policy.mjs';
import {
  bumpVersion,
  changelogForRange,
  higherLevel,
  parseCommit,
  parseGitLog,
  renderPullRequestChangelog,
  summarizeCommits,
} from './changelog-from-commits.mjs';

const scriptPath = fileURLToPath(new URL('./changelog-from-commits.mjs', import.meta.url));

describe('commit policy', () => {
  it('maps only known types to a release level', () => {
    for (const type of Object.keys(RELEASE_LEVEL_BY_TYPE)) {
      assert.equal(COMMIT_TYPES.includes(type), true);
    }
  });
});

describe('bumpVersion', () => {
  it('follows SemVer for stable versions', () => {
    assert.equal(bumpVersion('0.1.0', 'patch'), '0.1.1');
    assert.equal(bumpVersion('0.1.0', 'minor'), '0.2.0');
    assert.equal(bumpVersion('0.1.0', 'major'), '1.0.0');
    assert.equal(bumpVersion('v1.4.2', 'major'), '2.0.0');
    assert.equal(bumpVersion('1.4.2', 'minor'), '1.5.0');
  });
});

describe('parseCommit', () => {
  it('parses a scoped feature', () => {
    const parsed = parseCommit({
      hash: 'abcdef1234567890',
      parents: ['111'],
      subject: 'feat(http): add case conversion',
      body: '',
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.type, 'feat');
    assert.equal(parsed.scope, 'http');
    assert.equal(parsed.breaking, false);
    assert.equal(parsed.shortHash, 'abcdef1');
  });

  it('reads a bang and a breaking footer', () => {
    const parsed = parseCommit({
      hash: '1234567aaaaaaa',
      parents: ['111'],
      subject: 'feat(context)!: require error codes',
      body: 'BREAKING CHANGE: createApiContext requires errorCodes.',
    });
    assert.equal(parsed.breaking, true);
    assert.deepEqual(parsed.breakingNotes, ['createApiContext requires errorCodes.']);
  });

  it('skips merge commits', () => {
    const parsed = parseCommit({
      hash: '1234567aaaaaaa',
      parents: ['111', '222'],
      subject: 'Merge pull request #4 from org/feature',
      body: '',
    });
    assert.equal(parsed.skip, true);
  });

  it('rejects a free-form subject', () => {
    const parsed = parseCommit({
      hash: '',
      parents: ['111'],
      subject: 'update readme',
      body: '',
    });
    assert.equal(parsed.ok, false);
  });

  it('rejects a trailing period and an uppercase scope', () => {
    assert.equal(parseCommit({ parents: ['1'], subject: 'fix: handle timeout.', body: '' }).ok, false);
    assert.equal(parseCommit({ parents: ['1'], subject: 'feat(HTTP): add flag', body: '' }).ok, false);
  });

  it('neutralizes mentions in the changelog', () => {
    const summary = summarizeCommits([
      { hash: 'abcdef1234567890', parents: ['1'], subject: 'fix: ping @octocat', body: '' },
    ]);
    const markdown = renderPullRequestChangelog(summary, {
      currentVersion: '0.1.0',
      nextVersion: '0.1.1',
      level: 'patch',
      prLevel: 'patch',
      baselineTag: 'v0.1.0',
      mainAffectsVersion: false,
    });
    assert.equal(markdown.includes('@octocat'), false);
    assert.match(markdown, /0\.1\.1/);
    assert.match(markdown, /### Fixed/);
  });
});

describe('summarizeCommits', () => {
  it('lets a breaking change win over feat and fix', () => {
    const summary = summarizeCommits([
      { hash: 'aaaaaaaaaaaaaaa', parents: ['1'], subject: 'fix: close a socket', body: '' },
      {
        hash: 'bbbbbbbbbbbbbbb',
        parents: ['1'],
        subject: 'feat: add a client',
        body: 'BREAKING CHANGE: remove the old constructor.',
      },
    ]);
    assert.equal(summary.level, 'major');
    assert.equal(summary.grouped.Fixed.length, 1);
    assert.equal(summary.grouped.Added.length, 1);
    assert.equal(summary.grouped['BREAKING CHANGES'].length, 1);
    assert.equal(higherLevel('patch', 'major'), 'major');
  });

  it('keeps docs out of the release level and lists them separately', () => {
    const summary = summarizeCommits([
      { hash: 'aaaaaaaaaaaaaaa', parents: ['1'], subject: 'docs: describe the session', body: '' },
    ]);
    assert.equal(summary.level, null);
    assert.match(summary.silent[0], /\*\*docs:\*\*/);
  });

  it('puts perf into Changed and a patch release', () => {
    const summary = summarizeCommits([
      { hash: 'aaaaaaaaaaaaaaa', parents: ['1'], subject: 'perf(http): skip unchanged keys', body: '' },
    ]);
    assert.equal(summary.level, 'patch');
    assert.equal(summary.grouped.Changed.length, 1);
  });
});

describe('parseGitLog', () => {
  it('splits records on the unit separator', () => {
    const raw = '\x1eabc\x1f111\x1ffeat: add\x1fbody line\n\x1edef\x1f111 222\x1fMerge branch\x1f';
    const commits = parseGitLog(raw);
    assert.equal(commits.length, 2);
    assert.equal(commits[0].subject, 'feat: add');
    assert.deepEqual(commits[1].parents, ['111', '222']);
  });
});

describe('changelogForRange', () => {
  it('builds the pull request changelog from a git range and includes main', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'frontend-api-core-changelog-'));
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Changelog Test',
      GIT_AUTHOR_EMAIL: 'changelog-test@example.com',
      GIT_COMMITTER_NAME: 'Changelog Test',
      GIT_COMMITTER_EMAIL: 'changelog-test@example.com',
    };
    const git = (args) => {
      execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, env });
    };

    try {
      git(['init', '-b', 'main']);
      writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ version: '0.1.0' }));
      git(['add', 'package.json']);
      git(['commit', '-m', 'chore: initial commit']);
      git(['tag', '-a', 'v0.1.0', '-m', 'chore(release): 0.1.0']);
      git(['commit', '--allow-empty', '-m', 'feat: already on main']);
      const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
      git(['checkout', '-b', 'feature']);
      git(['commit', '--allow-empty', '-m', 'fix(parser): read an empty body']);
      git(['commit', '--allow-empty', '-m', 'docs: describe the client']);
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();

      const markdown = changelogForRange(base, head, cwd);
      assert.match(markdown, /Next version after merge into `main`: \*\*`0\.2\.0`\*\* \(minor\)/);
      assert.match(markdown, /This pull request: patch/);
      assert.match(markdown, /### Fixed/);
      assert.match(markdown, /read an empty body/);
      assert.match(markdown, /### No version bump/);
      assert.match(markdown, /\*\*docs:\*\*/);
      assert.doesNotMatch(markdown, /already on main/);

      const cli = execFileSync(process.execPath, [scriptPath, '--from', base, '--to', head], {
        cwd,
        encoding: 'utf8',
      });
      assert.match(cli, /0\.2\.0/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
