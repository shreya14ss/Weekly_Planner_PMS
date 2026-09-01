import { BaseDoc } from './common';

/** Canonical status list — mirrors the legacy STATUS_OPTS. */
export const PROJECT_STATUSES = [
  '',
  'In Progress',
  'On Hold',
  'Not Started',
  'Site Handed Over',
  'Completed',
  'SAVT Running',
  'Testing, Validation in Progress',
  'Configuration',
  'Site Survey in Progress',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectDoc extends BaseDoc {
  docType: 'project';
  /** Client short-code, e.g. 'BHEL', 'OPTCL'. */
  client: string;
  name: string;
  /** Engineer display names (denormalised — this matches the legacy model
   *  where names, not user IDs, are stored on the project). */
  engineers: string[];
  /** Team-leader display names responsible for the project. */
  tls: string[];
  status: ProjectStatus;
  desc?: string;
  remarks?: string;
}
