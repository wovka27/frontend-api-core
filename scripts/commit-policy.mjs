/**
 * Single source for commitlint and the pull request changelog.
 * Conventional Commits 1.0.0 mapped onto SemVer and Keep a Changelog 1.1.0.
 */

export const COMMIT_TYPES = Object.freeze([
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
]);

/** Release level for a type that is not a breaking change. */
export const RELEASE_LEVEL_BY_TYPE = Object.freeze({
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  revert: 'patch',
});

/** Keep a Changelog section for a releasable type. */
export const SECTION_BY_TYPE = Object.freeze({
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Changed',
  revert: 'Fixed',
});

export const BREAKING_SECTION = 'BREAKING CHANGES';

export const SECTION_ORDER = Object.freeze([BREAKING_SECTION, 'Added', 'Changed', 'Fixed']);

export const HEADER_MAX_LENGTH = 100;

export const RELEASE_RANK = Object.freeze({
  major: 3,
  minor: 2,
  patch: 1,
});
