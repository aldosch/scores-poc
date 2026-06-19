// apps/front/src/lib/repo.ts
//
// Central place for linking back to the source that powers this POC, so the
// explainer can point at the exact files/lines running the demo.

export const REPO_URL = "https://github.com/aldosch/scores-poc";
const BLOB = `${REPO_URL}/blob/main`;

// Build a link to a file (optionally a line or range) in the repo.
export function sourceUrl(path: string, lines?: string): string {
  return `${BLOB}/${path}${lines ? `#${lines}` : ""}`;
}
