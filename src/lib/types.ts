export type NormalisedTrademark = {
  id: string;
  source: "IPAU" | "EUIPO";
  markName: string;
  owner: string;
  status: string;
  niceClasses: string[];
  appDate: string | null;
  regDate: string | null;
  jurisdiction: string;
  externalUrl: string | null;
  // Visual: thumbnail URLs from IPAU's CDN (figurative marks), and the
  // human-readable image description (Vienna-classification keywords).
  imageUrls: string[];
  imageDescription: string[];
  // Mark kinds: WORD, FIGURATIVE, COLOUR, SHAPE, SOUND, etc. — useful for
  // distinguishing word-only marks from logos.
  kinds: string[];
  rawData: Record<string, unknown>;
};

export type SearchResult = {
  term: string;
  results: NormalisedTrademark[];
  errors: string[];
};

export type SourceStatus = {
  source: string;
  status: "ok" | "not_configured" | "error";
  message?: string;
  count: number;
};
