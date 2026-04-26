import { Router } from 'express';
import { z } from 'zod';

export interface DraftIssueInput {
  description: string;
}

export interface DraftedIssue {
  title: string;
  body: string;
}

export type DraftIssueFn = (input: DraftIssueInput) => Promise<DraftedIssue>;

export interface ComposerDeps {
  draftIssue: DraftIssueFn;
}

const draftSchema = z
  .object({
    description: z.string().min(1).max(20_000),
  })
  .strict();

export function composerRouter(deps: ComposerDeps): Router {
  const router = Router();

  router.post('/composer/draft', async (req, res) => {
    const { description } = draftSchema.parse(req.body);
    const drafted = await deps.draftIssue({ description });
    res.json(drafted);
  });

  return router;
}
