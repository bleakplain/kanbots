import { describe, expect, it } from 'vitest';
import { parseGitHubRemote } from '../src/git.js';

describe('parseGitHubRemote', () => {
  it('parses https URLs with .git', () => {
    expect(parseGitHubRemote('https://github.com/octo/hello.git')).toEqual({
      owner: 'octo',
      repo: 'hello',
    });
  });

  it('parses https URLs without .git', () => {
    expect(parseGitHubRemote('https://github.com/octo/hello')).toEqual({
      owner: 'octo',
      repo: 'hello',
    });
  });

  it('parses ssh URLs (git@github.com)', () => {
    expect(parseGitHubRemote('git@github.com:octo/hello.git')).toEqual({
      owner: 'octo',
      repo: 'hello',
    });
  });

  it('parses ssh URLs without .git', () => {
    expect(parseGitHubRemote('git@github.com:octo/hello')).toEqual({
      owner: 'octo',
      repo: 'hello',
    });
  });

  it('parses ssh:// URLs', () => {
    expect(parseGitHubRemote('ssh://git@github.com/octo/hello.git')).toEqual({
      owner: 'octo',
      repo: 'hello',
    });
  });

  it('handles trailing slash', () => {
    expect(parseGitHubRemote('https://github.com/octo/hello/')).toEqual({
      owner: 'octo',
      repo: 'hello',
    });
  });

  it('handles user@ in https', () => {
    expect(parseGitHubRemote('https://user@github.com/octo/hello.git')).toEqual({
      owner: 'octo',
      repo: 'hello',
    });
  });

  it('handles repo names with dots', () => {
    expect(parseGitHubRemote('https://github.com/octo/hello.world.git')).toEqual({
      owner: 'octo',
      repo: 'hello.world',
    });
  });

  it('returns null for non-GitHub hosts', () => {
    expect(parseGitHubRemote('https://gitlab.com/octo/hello.git')).toBeNull();
    expect(parseGitHubRemote('git@gitlab.com:octo/hello.git')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseGitHubRemote('garbage')).toBeNull();
    expect(parseGitHubRemote('')).toBeNull();
  });
});
