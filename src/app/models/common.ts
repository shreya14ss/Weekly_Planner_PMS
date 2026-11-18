/**
 * PouchDB base document shape. Every doc we store carries an `_id`, and PouchDB
 * adds `_rev` on writes. `docType` is our discriminator so a single database
 * can hold heterogenous documents cheaply (projects, users, weeks, audit).
 */
export interface BaseDoc {
  _id: string;
  _rev?: string;
  docType: DocType;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export type DocType =
  | 'project'
  | 'user'
  | 'week'
  | 'audit'
  | 'settings'
  | 'reminder'
  | 'meeting'
  | 'todo';

/** ISO date string YYYY-MM-DD (always Monday for week keys). */
export type IsoDate = string;

/** Non-empty string helper for stricter APIs. */
export type NonEmpty<T extends string> = T extends '' ? never : T;
