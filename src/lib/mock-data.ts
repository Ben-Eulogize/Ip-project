import { NormalisedTrademark } from "./types";

// Demo dataset used when IPAU_MOCK_MODE=true OR when the live API returns
// 403 "Invalid Client" (means: the client is provisioned but not
// subscribed to the trademark-search API product). Real-world data shape
// — verified against published IP Australia Trade Mark Search listings.
// Once the API subscription lands, this is no longer consulted.

const MOCK_DATA: NormalisedTrademark[] = [
  // Real, well-known AU mark — Parmalat's "PAULS" dairy brand. Class 29.
  {
    id: "AU-MOCK-200001",
    source: "IPAU",
    markName: "PAULS",
    owner: "Parmalat Australia Pty Ltd",
    status: "Registered",
    niceClasses: ["29"],
    appDate: "1989-04-12",
    regDate: "1991-07-23",
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200001/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
  {
    id: "AU-MOCK-200002",
    source: "IPAU",
    markName: "PAULS",
    owner: "Parmalat Australia Pty Ltd",
    status: "Registered",
    niceClasses: ["30", "32"],
    appDate: "1995-09-04",
    regDate: "1997-03-18",
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200002/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
  {
    id: "AU-MOCK-200003",
    source: "IPAU",
    markName: "PAULS PURE",
    owner: "Parmalat Australia Pty Ltd",
    status: "Registered",
    niceClasses: ["29", "32"],
    appDate: "2012-02-14",
    regDate: "2013-08-29",
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200003/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
  {
    id: "AU-MOCK-200004",
    source: "IPAU",
    markName: "PAULS ZYMIL",
    owner: "Parmalat Australia Pty Ltd",
    status: "Registered",
    niceClasses: ["29"],
    appDate: "2007-11-09",
    regDate: "2009-04-30",
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200004/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
  {
    id: "AU-MOCK-200005",
    source: "IPAU",
    markName: "PAUL'S CAFE",
    owner: "Paul Konstantinou",
    status: "Expired",
    niceClasses: ["43"],
    appDate: "2002-06-21",
    regDate: "2003-12-05",
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200005/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
  {
    id: "AU-MOCK-200006",
    source: "IPAU",
    markName: "PAUL'S BEER",
    owner: "Independent Brewing Co Pty Ltd",
    status: "Pending",
    niceClasses: ["32"],
    appDate: "2025-08-11",
    regDate: null,
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200006/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
  {
    id: "AU-MOCK-200007",
    source: "IPAU",
    markName: "ST PAUL'S",
    owner: "St Paul's Cathedral Trust",
    status: "Registered",
    niceClasses: ["41", "45"],
    appDate: "1998-03-30",
    regDate: "1999-11-17",
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200007/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
  {
    id: "AU-MOCK-200008",
    source: "IPAU",
    markName: "LEMONADE LANE",
    owner: "Bickfords Australia Pty Ltd",
    status: "Registered",
    niceClasses: ["32"],
    appDate: "2018-05-22",
    regDate: "2019-10-14",
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200008/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
  {
    id: "AU-MOCK-200009",
    source: "IPAU",
    markName: "SOLO LEMONADE",
    owner: "Asahi Beverages Pty Ltd",
    status: "Registered",
    niceClasses: ["32"],
    appDate: "1971-01-14",
    regDate: "1972-05-30",
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200009/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
  {
    id: "AU-MOCK-200010",
    source: "IPAU",
    markName: "POL LEMONADE",
    owner: "Pol Roger Australia Pty Ltd",
    status: "Lapsed",
    niceClasses: ["32"],
    appDate: "2009-07-15",
    regDate: "2010-12-02",
    jurisdiction: "AU",
    externalUrl: "https://search.ipaustralia.gov.au/trademarks/search/view/200010/details",    imageUrls: [],
    imageDescription: [],
    kinds: ["Word"],
    rawData: { mock: true },
  },
];

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export async function mockSearchIPAU(
  term: string
): Promise<{ results: NormalisedTrademark[]; error?: string }> {
  const queryTokens = new Set(tokenise(term));
  const matches = MOCK_DATA.filter((tm) => {
    const markTokens = tokenise(tm.markName);
    return markTokens.some((t) => {
      for (const q of queryTokens) {
        if (t === q) return true;
        if (t.includes(q) || q.includes(t)) return true;
      }
      return false;
    });
  });
  return { results: matches };
}
