# TM Researcher

Batch trademark search tool. Two interfaces, one shared client:

- **Web app** (Next.js 14, App Router) — deployed on Vercel, paste terms → results table → CSV/JSON export
- **CLI** (`scripts/search.ts`) — `npm run search -- <terms...>` writes `tm-results.csv`

Both call the IP Australia public Trade Mark Search API (no other sources — EUIPO and AI report were stripped in `5d74cc5`).

## Layout

- `src/lib/ipau.ts` — IPAU client: OAuth token fetch, `/search/quick`, `/trade-mark/{n}` detail fan-out, normalisation
- `src/lib/export.ts` — `toCSV` / `toJSON`
- `src/lib/types.ts` — `NormalisedTrademark`, `SearchResult`, `SourceStatus`
- `src/app/api/search/route.ts` — POST endpoint the web UI calls
- `src/app/page.tsx` — single-page UI
- `scripts/search.ts` — CLI; reuses `searchIPAU` + `toCSV`

## IPAU API contract (verified against IP Australia docs)

- Token: `POST https://production.api.ipaustralia.gov.au/public/external-token-api/v1/access_token`, body `grant_type=client_credentials&client_id=…&client_secret=…`
- Search: `POST .../australian-trade-mark-search-api/v1/search/quick` with `{ query, sort: {field, direction}, filters: {quickSearchType} }`
- Detail: `GET .../v1/trade-mark/{ipRightIdentifier}`
- **Auth is mandatory** for every request — there is no unauthenticated path. Missing creds → fail fast with a clear error (don't fall through to unauthenticated calls).

`getToken()` returns a tagged result (`ok` / `missing` / `error`) so the caller can distinguish "no creds configured" from "token request failed". Don't collapse these back to `string | null`.

## Local setup

```
npm install
cp .env.example .env   # then fill in IPAU_CLIENT_ID and IPAU_CLIENT_SECRET (creds live in 1Password)
npm run dev            # web app at localhost:3000
npm run search -- nike apple bmw   # CLI; writes tm-results.csv
```

CLI flags: `--json`, `-o <file>`, `--help`.

## Deployment

Vercel auto-deploys `main`. Env vars `IPAU_CLIENT_ID` and `IPAU_CLIENT_SECRET` must be set in the Vercel project (Production + Preview).

## Working branch

`claude/compassionate-goodall-JuP2I` — has the tagged-token-result fix and the CLI. Not yet merged to `main` at time of writing.

## Conventions

- Don't reintroduce silent fallbacks for auth failures.
- Don't add EUIPO, USPTO, or other jurisdictions without an explicit ask — scope is IP Australia only.
- The IPAU response shape is loosely defended (`findArray`, `extractNumber`, `normalise`) because the field names aren't fully pinned down. If you see real records, tighten the types rather than adding more fallback keys.

## Communication preferences

- Always fill in concrete values, not placeholders. Real repo name (`Ben-Eulogize/Ip-project`), real branch (`claude/compassionate-goodall-JuP2I`), real URLs, real file paths. Make every command copy-paste-runnable as-is. No `<repo>`, `<branch>`, `<your-thing>`, `path/to/file`, etc. — fill them.
