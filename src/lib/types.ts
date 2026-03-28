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
