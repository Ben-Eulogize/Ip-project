# Wine Sommelier Tool — Handover Document

## Branch
`wine-sommelier` (branched from `claude/tm-researcher-app-tjd6T`)

## Concept
A conversational tool where the user sends a wine list (PDF or photo) and gets back personalised picks with value ratings.

## Workflow
1. User sends a wine list as PDF or image
2. Claude reads it, identifies all wines
3. Filters to top 25% based on user preference profile
4. Searches retail prices online for those wines
5. Calculates value score based on context (merchant vs restaurant/bar)
6. Returns an annotated image showing: picked wines, online price, price difference, and a score out of 10

## Value Scoring Logic
- **Merchant/retail wine list:** Compare list price to average online retail. Lower = better deal.
- **Restaurant/bar wine list:** User provides venue name. Apply a markup modifier based on how pricey the venue is (research the venue). A "normal" restaurant markup (~2.5-3x wholesale) is baseline neutral. Below that = good value, above = poor value.
- Score out of 10 combines: preference match + value rating vs reference points

## Preference Profile (NOT YET BUILT)
Need to store preferences for two people:
- **User ("me")**
- **Wife**

When user says "I'm with her" → blend preferences, weighting wife's slightly higher.
When user says "just me" → use only his preferences.

### 10 Preference Questions to Ask (planned)
These should cover:
1. Red vs white vs rosé vs sparkling vs dessert wine preference split
2. Body preference (light, medium, full)
3. Sweetness tolerance (bone dry → sweet)
4. Tannin preference (low/silky → grippy/structured)
5. Acidity preference (soft/round → bright/crisp)
6. Favourite grape varieties or regions
7. Wines or styles they actively dislike
8. Budget comfort zone per bottle (retail context)
9. Adventurousness — stick to known vs try new regions/grapes
10. Common food pairings or occasions (weeknight dinner, steak night, seafood, cheese, just drinking)

Answers stored in a JSON file at `wine-sommelier/preferences.json` with structure:
```json
{
  "user": { ... answers ... },
  "wife": { ... answers ... },
  "blendWeight": { "user": 0.45, "wife": 0.55 }
}
```

## Technical Needs
- **PDF/image reading**: Claude Code's Read tool handles both
- **Web search**: WebSearch tool for retail price lookup
- **Image annotation**: Need a library (sharp, canvas, or similar) to draw on images — or return a markdown table if annotation is too complex
- **Preference storage**: JSON file in repo

## Status
- Branch created
- Nothing built yet — stopped before preference questions
- No code, no dependencies installed

## Next Steps
1. Ask the 10 preference questions (for both user and wife)
2. Save preferences to JSON
3. Build the analysis workflow (can be a script or just a CLAUDE.md guiding the conversation flow)
4. Test with a real wine list
