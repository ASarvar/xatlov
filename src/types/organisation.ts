export interface Organisation {
  id: string;
  typeid: number | null;
  source_id: string | null;
  org_name: string;
  region_id: number | null;
  district_id: number | null;
  tin: string;
  state: number;
  soato: string | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export type UpsertAction = 'created' | 'updated' | 'unchanged';

export interface BulkSummary {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
}
