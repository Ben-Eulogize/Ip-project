import { NormalisedTrademark } from "./types";

export function toJSON(results: NormalisedTrademark[]): string {
  return JSON.stringify(results, null, 2);
}

export function toCSV(results: NormalisedTrademark[]): string {
  const headers = [
    "id",
    "source",
    "markName",
    "owner",
    "status",
    "niceClasses",
    "appDate",
    "regDate",
    "jurisdiction",
    "externalUrl",
  ];

  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const rows = results.map((r) =>
    headers
      .map((h) => {
        const val = r[h as keyof NormalisedTrademark];
        if (Array.isArray(val)) return escape(val.join("; "));
        return escape(String(val ?? ""));
      })
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}
