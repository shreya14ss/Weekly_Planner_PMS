import { DocType } from '@models/common';

/**
 * Doc IDs are prefixed by type so we can range-scan by type cheaply
 * (`allDocs({ startkey: 'project:', endkey: 'project:￰' })`) and,
 * more importantly, so a single database stays coherent.
 */
export const idOf = (type: DocType, key: string): string => `${type}:${key}`;

export const parseId = (id: string): { type: DocType; key: string } | null => {
  const idx = id.indexOf(':');
  if (idx < 0) return null;
  return {
    type: id.slice(0, idx) as DocType,
    key: id.slice(idx + 1),
  };
};

export const isType = (id: string, type: DocType): boolean =>
  id.startsWith(`${type}:`);

export const rangeForType = (type: DocType): { startkey: string; endkey: string } => ({
  startkey: `${type}:`,
  endkey: `${type}:￰`,
});

/** Short, URL-safe random id — good enough for client-side docs. */
export const shortId = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
