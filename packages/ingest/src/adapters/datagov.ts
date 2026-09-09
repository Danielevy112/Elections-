import type { Fetcher } from "../http";

export const CKAN_BASE = "https://data.gov.il/api/3/action";

/** The Central Elections Committee's candidate-list dataset on data.gov.il. */
export const CANDIDATES_DATASET = "candidates-lists";

export interface CkanResource {
  id: string;
  name: string;
  format: string;
}

/**
 * CKAN wraps every reply as `{success, result}`; a failed action still returns HTTP 200,
 * so the envelope has to be checked rather than the status code.
 */
function ckanResult(payload: unknown, action: string): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(`CKAN ${action}: unexpected payload`);
  }
  const body = payload as Record<string, unknown>;
  if (body.success !== true) {
    throw new Error(`CKAN ${action} reported failure: ${JSON.stringify(body.error ?? {})}`);
  }
  if (typeof body.result !== "object" || body.result === null) {
    throw new Error(`CKAN ${action}: missing result`);
  }
  return body.result as Record<string, unknown>;
}

export async function listResources(
  fetcher: Fetcher,
  datasetId = CANDIDATES_DATASET,
): Promise<CkanResource[]> {
  const result = ckanResult(
    await fetcher.json(`${CKAN_BASE}/package_show?id=${encodeURIComponent(datasetId)}`),
    "package_show",
  );
  const resources = Array.isArray(result.resources) ? result.resources : [];
  return resources
    .map((raw) => raw as Record<string, unknown>)
    .filter((raw) => typeof raw.id === "string")
    .map((raw) => ({
      id: raw.id as string,
      name: typeof raw.name === "string" ? raw.name : "",
      format: typeof raw.format === "string" ? raw.format.toUpperCase() : "",
    }));
}

/**
 * Page through a datastore resource. The Israeli portal caps `limit` well below what it
 * advertises and sits behind a WAF that rejects large pages, so 1000 is deliberate.
 */
export async function datastoreSearch(
  fetcher: Fetcher,
  resourceId: string,
  options: { limit?: number; hardLimit?: number } = {},
): Promise<Record<string, unknown>[]> {
  const limit = options.limit ?? 1000;
  const hardLimit = options.hardLimit ?? 20_000;
  const rows: Record<string, unknown>[] = [];
  let offset = 0;

  while (rows.length < hardLimit) {
    const url = `${CKAN_BASE}/datastore_search?resource_id=${encodeURIComponent(resourceId)}&limit=${limit}&offset=${offset}`;
    const result = ckanResult(await fetcher.json(url), "datastore_search");
    const page = Array.isArray(result.records) ? (result.records as Record<string, unknown>[]) : [];
    rows.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  return rows.slice(0, hardLimit);
}
