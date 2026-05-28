# TM Researcher

Availability + batch trademark search tool. **Primary** flow is the
risk-classified availability checker; batch search is the older raw flow.

- **Web app** (Next.js 14, App Router) — deployed on Vercel.
  - `/` — availability checker: enter one candidate name + product
    description, get a risk-classified report.
  - `/batch` — batch search: paste many terms, get raw results +
    CSV/JSON export (kept for power-user / one-off research).
- **CLI**:
  - `npm run check -- "Pauls Lemonade" -c 32 -p "non-alcoholic drink"`
    runs the availability checker, pretty-prints a coloured report.
  - `npm run search -- nike apple bmw` runs the batch flow, writes
    `tm-results.csv`.

Both call IP Australia's public Trade Mark Search API (OAuth client
credentials).

## Live API gotcha — subscription required

The token endpoint accepts the credentials and returns a valid JWT
(`scope: B2B`, `aud: api.ipaustralia.gov.au`, `customer_id:
OMJ8368626521`) — but the actual search/detail endpoints reject with
`403 Invalid Client` until the client (`b2b_ipLookup_prod`) is
subscribed to the **Trade Mark Search API product** in the portal.

**Unblock step** (one-time):

1. Sign in at https://portal.api.ipaustralia.gov.au
2. Navigate to API Products
3. Subscribe the `b2b_ipLookup_prod` app to the Trade Mark Search API
4. Wait a few minutes for propagation, re-run `npm run check`

Until that lands, every search auto-falls-back to a small demo fixture
(`src/lib/mock-data.ts`) so the prototype is still demonstrable. A
yellow "Demo data mode" banner shows in the UI, and the CLI prints the
diagnostic in the warnings block.

## Layout

```
src/
  lib/
    types.ts             — NormalisedTrademark, SearchResult, SourceStatus
    ipau.ts              — IPAU client: OAuth + /search/quick + /trade-mark/{n}
    mock-data.ts         — Demo fixture used when live API 403s or IPAU_MOCK_MODE=true
    variants.ts          — Brand-name variant generator + token/edit-distance utils
    nice-classes.ts      — Nice classification (1–45) + auto-detector from keywords
    risk.ts              — Risk scorer: name match × class match × status
    availability.ts      — Orchestrator: fan out variants → dedupe → score → suggest
    export.ts            — toCSV / toJSON (used by batch flow)
  app/
    page.tsx             — Availability checker UI (new homepage)
    batch/page.tsx       — Batch search UI (moved)
    api/availability/route.ts — POST /api/availability (new)
    api/search/route.ts  — POST /api/search (kept for batch)

scripts/
  check.ts               — Availability CLI (npm run check)
  search.ts              — Batch CLI (npm run search)
```

## Risk model

Each potential conflict gets one of five levels. Scored on three axes
that combine multiplicatively (rough approximation of real-world TM
opposition risk):

| Level    | When                                                                 |
|----------|----------------------------------------------------------------------|
| CRITICAL | Identical OR dominant-element-identical mark, same Nice class, live  |
| HIGH     | Dominant-element-identical or phonetic match, same/related class, not expired |
| MEDIUM   | Close name + same class, OR phonetic + related class                 |
| LOW      | Weak overlaps, OR strong name match in unrelated class               |
| MINIMAL  | Distant resemblance, OR any expired/lapsed mark                      |

Key insight baked into the scorer: **dominant-element matching**. A
candidate "Pauls Lemonade" against a registered "PAULS" in Class 32 is
treated as effectively-exact because "Lemonade" is a generic descriptor
that adds no distinctiveness. Same for "Paul's Beer" — apostrophes are
stripped during normalisation. See `src/lib/variants.ts` `DESCRIPTORS`
set for the canonical descriptor list — extend as needed for new
product categories.

## IPAU API contract (verified against IP Australia docs)

- Token: `POST https://production.api.ipaustralia.gov.au/public/external-token-api/v1/access_token`,
  body `grant_type=client_credentials&client_id=…&client_secret=…`
- Search: `POST .../australian-trade-mark-search-api/v1/search/quick`
  with `{ query, sort: {field, direction}, filters: {quickSearchType} }`
- Detail: `GET .../v1/trade-mark/{ipRightIdentifier}`
- **Auth is mandatory** for every request — no unauthenticated path.
  Missing creds → fail fast.

`getToken()` returns a tagged result (`ok` / `missing` / `error`) so the
caller can distinguish "no creds configured" from "token request
failed". Don't collapse these back to `string | null`.

## Local setup

```
npm install
cp .env.example .env.local   # then fill in IPAU_CLIENT_ID / IPAU_CLIENT_SECRET
# (creds live in 1Password — op://Ben/Ip australiaAPI Credentials/credential
#  for the secret, and the custom "Client Id:" field for the id)

npm run dev                                          # web app at localhost:3000
npm run check -- "Pauls Lemonade" -p "lemonade"       # availability CLI
npm run search -- nike apple bmw                      # batch CLI
```

CLI flags for `check`:

- `-c, --class <n>` — Nice class(es), comma-separated (`-c 32` or `-c 32,33`)
- `-p, --product <txt>` — Product description for auto class-detect
- `--json` — Emit JSON to stdout instead of pretty report
- `--mock` — Force demo-fixture mode (skip live calls entirely)

## Deployment

Vercel auto-deploys `main`. Env vars `IPAU_CLIENT_ID` and
`IPAU_CLIENT_SECRET` must be set in the Vercel project (Production +
Preview). Same values as `.env.local` — verify they match if the live
UI shows the demo banner unexpectedly.

## Working branch

`claude/compassionate-goodall-JuP2I` — has the availability checker,
risk scorer, CLI, mock-fallback, and the API-subscription diagnostic.
Not yet merged to `main` at time of writing.

## Conventions

- Don't reintroduce silent fallbacks for auth failures.
- Don't add EUIPO, USPTO, or other jurisdictions without an explicit
  ask — scope is IP Australia only.
- The IPAU response shape is loosely defended (`findArray`,
  `extractNumber`, `normalise`) because the field names aren't fully
  pinned down. If you see real records, tighten the types rather than
  adding more fallback keys.
- When a new product category needs different descriptor handling,
  extend the `DESCRIPTORS` set in `src/lib/variants.ts` rather than
  branching the scorer.
- The risk score is a heuristic, not legal advice. Every output
  includes a "still recommend a legal pre-filing review" line — keep
  that.

## Communication preferences

- Always fill in concrete values, not placeholders. Real repo name
  (`Ben-Eulogize/Ip-project`), real branch
  (`claude/compassionate-goodall-JuP2I`), real URLs, real file paths.
  Make every command copy-paste-runnable as-is. No `<repo>`,
  `<branch>`, `<your-thing>`, `path/to/file`, etc. — fill them.
