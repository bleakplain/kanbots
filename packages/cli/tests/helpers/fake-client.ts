import type { InitClient } from '../../src/commands/init.js';

interface ApiError extends Error {
  status: number;
}

function apiError(status: number, message: string): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  return err;
}

export class FakeGitHubClient implements InitClient {
  getRepoCalls = 0;
  ensureLabelsCalls = 0;

  getRepoImpl: () => Promise<unknown> = async () => ({
    owner: 'octo',
    name: 'hello',
    defaultBranch: 'main',
    private: false,
    htmlUrl: 'https://github.com/octo/hello',
  });

  ensureLabelsImpl: () => Promise<void> = async () => {};

  async getRepo(): Promise<unknown> {
    this.getRepoCalls++;
    return this.getRepoImpl();
  }

  async ensureLabels(): Promise<void> {
    this.ensureLabelsCalls++;
    return this.ensureLabelsImpl();
  }

  static reject(status: number, message: string): () => Promise<never> {
    return async () => {
      throw apiError(status, message);
    };
  }
}
