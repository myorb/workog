import type { CompanyConfig, Job } from "../../src/lib/schema.ts";

/**
 * A normalized job before the pipeline merges it with the previous run.
 * The merge step owns slug and the seen/closed timestamps.
 */
export type NormalizedJob = Omit<Job, "slug" | "firstSeenAt" | "lastSeenAt" | "closedAt"> & {
  /** used to build the slug the first time this job is seen */
  originalId: string;
};

export interface Fetcher<RawJob = unknown> {
  name: string;
  fetch(company: CompanyConfig): Promise<RawJob[]>;
  normalize(raw: RawJob, company: CompanyConfig): NormalizedJob;
}
