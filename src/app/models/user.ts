import { BaseDoc } from './common';

export type UserRole = 'pm' | 'tl' | 'user';

export interface UserDoc extends BaseDoc {
  docType: 'user';
  name: string;
  role: UserRole;
  /** 4-digit numeric PIN. In prod, store a hash — for now we carry the same
   *  model as the legacy HTML (numeric PIN in plaintext) so we can migrate
   *  existing data without a breaking change. */
  pin: string;
  email?: string;
  mobile?: string;
}

/** Session payload persisted in sessionStorage; NOT a PouchDB doc. */
export interface AuthSession {
  id: string;
  name: string;
  role: UserRole;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  pm: 'Project Manager',
  tl: 'Team Leader',
  user: 'Engineer',
};

export const ROLE_ORDER: Record<UserRole, number> = { pm: 0, tl: 1, user: 2 };
