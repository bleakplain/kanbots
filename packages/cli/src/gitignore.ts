import { existsSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function ensureGitignoreEntry(gitRoot: string, entry: string): Promise<boolean> {
  const path = join(gitRoot, '.gitignore');

  if (!existsSync(path)) {
    await writeFile(path, `${entry}\n`, 'utf-8');
    return true;
  }

  const content = await readFile(path, 'utf-8');
  const target = entry.replace(/\/+$/, '');
  const present = content.split('\n').some((line) => {
    const cleaned = line.trim().replace(/^\/+|\/+$/g, '');
    return cleaned === target;
  });

  if (present) return false;

  const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  await appendFile(path, `${sep}${entry}\n`, 'utf-8');
  return true;
}
