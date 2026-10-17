// Node не ищет файлы без расширения и не знает алиас «@/», а Metro пишет импорты так —
// подставляем .ts / .tsx и путь к src/.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith('@/')) spec = pathToFileURL(path.join(SRC, spec.slice(2))).href;
  const local = spec.startsWith('.') || spec.startsWith('file:');
  if (local && !/\.[cm]?[jt]sx?$/.test(spec)) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(spec + ext, context);
      } catch {}
    }
  }
  return next(spec, context);
}
