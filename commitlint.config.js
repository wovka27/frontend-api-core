import {
  COMMIT_TYPES,
  HEADER_MAX_LENGTH,
} from './scripts/commit-policy.mjs';

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [...COMMIT_TYPES]],
    'header-max-length': [2, 'always', HEADER_MAX_LENGTH],
    // Release notes and Russian subjects do not fit the English case rule.
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
