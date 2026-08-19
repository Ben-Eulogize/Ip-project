# TM Researcher

Availability + batch trademark search tool. **Primary** flow is the
risk-classified availability checker (text + logo); batch search is the
older raw flow.

**Live at:** https://ip-project-seven.vercel.app

- **Web app** (Next.js 14, App Router) — deployed on Vercel.
  - `/` — availability checker: enter one candidate name + product
    description, get a risk-classified report. Has a "Suggest classes"
    button that prefills the Nice-class tickboxes from the description
    for human review, and CSV/JSON report downloads.
  - `/batch-check` — batch availability: many candidate names, one
    shared description, risk verdict per name. Downloads: summary CSV,
    per-finding CSV, and an **AI-feed JSONL** (one self-contained record
    per line with the IP Australia application number, image URLs and
    ATMOSS link - built for piping into an external LLM pipeline).
  - `/watch` — new-filing watch: keyword watchlist + lookback window,
    returns recently filed applications risk-scored by the same engine.
    The on-demand version of the CC-IP-Watch nightly digest idea.
  - `/batch` — batch search: paste many terms, get raw results +
    CSV/JSON export (kept for power-user / one-off research).
- **CLI**:
  - `npm run check -- "Pauls Lemonade" -c 32 -p "non-alcoholic drink"`
    runs the availability checker, pretty-prints a coloured report.
  - `npm run search -- nike apple bmw` runs the batch flow, writes
    `tm-results.csv`.

Both call IP Australia's public Trade Mark Search API (OAuth client
credentials).

## Two separate auth steps required (lesson learned)

OAuth credentials alone are not enough. The IP Australia portal has
TWO independent auth layers:

1. **Client app** (gives you `client_id` / `client_secret`) — done at
   account creation. Lets you fetch an OAuth token from
   `/external-token-api/v1/access_token`.
2. **API contract** — per-app-per-product subscription you must create
   separately by visiting the API product page in the portal, clicking
   "Request Access", picking Production instance + Base Tier + your
   client app. Auto-approved instantly. **Without this contract, every
   endpoint returns `403 Invalid Client` even though the token issued
   cleanly.**

The portal: https://portal.api.ipaustralia.gov.au → APIs →
Australian Trade Mark Search API → Request Access → Production / Base
Tier (600 req/min) / select `b2b_ipLookup_prod`.

If the live API returns 403 again (e.g. the contract is removed), the
app auto-falls-back to a demo fixture in `src/lib/mock-data.ts` with a
yellow banner in the UI.

## Vision auto-extraction (for logo upload)

The logo-upload flow calls `/api/extract-image-keywords` which invokes
Claude Haiku 4.5 to extract Vienna-style visual element keywords from
the uploaded image (STAR, CIRCLE, RED, etc), then passes those into
IPAU's `image.text` advanced-search field.

This requires `ANTHROPIC_API_KEY` in Vercel env vars. Without it, the
endpoint returns 503 with a clear "type keywords manually" prompt and
the UI degrades gracefully — users can still type the visual elements
themselves to drive the image search.

To enable: `vercel env add ANTHROPIC_API_KEY production` (and preview)
with a key from console.anthropic.com.

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
- Search: `POST .../australian-trade-mark-search-api/v1/page/advanced`
  with `{ pageSize, pageNumber, sort: {field, direction}, rows: [{op, query}] }`
  - returns full detail records inline (no N+1 fan-out). Each row's
  query supports word / image / classNumber / owner / statuses / kinds.
  (An earlier version of this doc said `/search/quick` + a per-record
  detail GET; the code moved to `/page/advanced` and never looked back.)
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

There is **no `main` branch**. The Vercel project (`ip-project`,
`prj_289BNd52yCaM1mRF1j3rDnJgbKnN`, team `team_RyzX6jtGZEmdOLxTUq5gBn6D`)
deploys the working branch `claude/compassionate-goodall-JuP2I` to
production - verified live 2026-08-19. Env vars `IPAU_CLIENT_ID` and
`IPAU_CLIENT_SECRET` must be set in the Vercel project (Production +
Preview). Same values as `.env.local` — verify they match if the live
UI shows the demo banner unexpectedly. `ANTHROPIC_API_KEY` was absent
from Production as of 2026-08-19, so logo extraction 503s there until
it is added.

## Working branch

`claude/compassionate-goodall-JuP2I` — has the availability checker,
risk scorer, CLI, mock-fallback, and the API-subscription diagnostic.
Not yet merged to `main` at time of writing.

## Watch sweep recency (how /watch finds "new")

`src/lib/watch.ts` does NOT send a `date` clause - the OAS spec
advertises one but its wire shape is unverified here. It queries NUMBER
DESCENDING (application numbers are broadly sequential), paginates up to
3×100 records per keyword, and post-filters by `appDate` against the
cutoff. If every page is still in-window at the cap, the keyword is
reported in `truncated` rather than silently cut. If someone later
verifies the real `date` clause shape against the OAS spec, swapping it
in removes the pagination entirely.

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
