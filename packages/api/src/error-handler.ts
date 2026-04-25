import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      issues: err.issues,
    });
    return;
  }

  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 600) {
    res.status(status).json({
      error: 'UpstreamError',
      message: (err as Error).message,
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: 'InternalError',
    message: err instanceof Error ? err.message : 'Unknown error',
  });
};
