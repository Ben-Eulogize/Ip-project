"use client";

import { useState, useCallback } from "react";
import type { WatchReport } from "@/lib/watch";
import { LEVEL_COLORS } from "@/lib/risk";

const DAY_OPTIONS = [7, 14, 30, 90];

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export default function WatchPage() {
  const [keywordsText, setKeywordsText] = useState("");
  const [days, setDays] = useState(7);
  const [classesText, setClassesText] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<WatchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ticked marks (by trademark id) for selective download. Empty = all.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runSweep = useCallback(async () => {
    const keywords = keywordsText
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      setError("Enter at least one watch keyword (one per line).");
      return;
    }
    const classes = classesText
      .split(/[\s,]+/)
      .map((c) => parseInt(c, 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 45);

    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords,
          days,
          classes: classes.length ? classes : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Request failed (${res.status})`);
        return;
      }
      setReport((await res.json()) as WatchReport);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [keywordsText, days, classesText]);

  // What the CSV exports: ticked matches, or everything when none ticked.
  const exportMatches = report
    ? selected.size > 0
      ? report.matches.filter((m) => selected.has(m.finding.trademark.id))
      : report.matches
    : [];

  const downloadCSV = useCallback(() => {
    if (!report) return;
    const headers = [
      "keyword",
      "level",
      "score",
      "markName",
      "applicationNumber",
      "owner",
      "status",
      "niceClasses",
      "filed",
      "kinds",
      "imageUrls",
      "imageDescription",
      "reasons",
      "atmossUrl",
    ];
    const rows = exportMatches.map((m) =>
      [
        m.keyword,
        m.finding.level,
        String(m.finding.score),
        m.finding.trademark.markName,
        m.finding.trademark.id.replace(/^AU-/, ""),
        m.finding.trademark.owner,
        m.finding.trademark.status,
        m.finding.trademark.niceClasses.join("; "),
        m.finding.trademark.appDate || "",
        m.finding.trademark.kinds.join("; "),
        m.finding.trademark.imageUrls.join(" "),
        m.finding.trademark.imageDescription.join("; "),
        m.finding.reasons.join(" | "),
        m.finding.trademark.externalUrl || "",
      ]
        .map(csvEscape)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tm-watch-${report.cutoff}-to-today.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, exportMatches]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-semibold text-slate-900">
            New-Filing Watch
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Recently filed AU trademark applications matching your watchlist,
            risk-scored.{" "}
            <a href="/" className="text-blue-600 hover:underline">
              Availability checker
            </a>{" "}
            &middot;{" "}
            <a href="/batch-check" className="text-blue-600 hover:underline">
              Batch check
            </a>{" "}
            &middot;{" "}
            <a href="/batch" className="text-blue-600 hover:underline">
              Batch search
            </a>
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label
                htmlFor="keywords"
                className="block text-sm font-medium text-slate-700"
              >
                Watch keywords (one per line, max 15)
              </label>
              <textarea
                id="keywords"
                rows={6}
                placeholder={"e.g.\nJacaranda\nPauls\nSutton"}
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 placeholder-slate-400 font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Client brands, conflict marks, firm terms. Each keyword is
                STEM-searched, so Paul / Pauls / Paul&apos;s all match.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="days"
                  className="block text-sm font-medium text-slate-700"
                >
                  Filed within
                </label>
                <select
                  id="days"
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value, 10))}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-slate-900"
                >
                  {DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      Last {d} days
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="classes"
                  className="block text-sm font-medium text-slate-700"
                >
                  Classes of interest (optional)
                </label>
                <input
                  id="classes"
                  type="text"
                  placeholder="e.g. 32, 33"
                  value={classesText}
                  onChange={(e) => setClassesText(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 placeholder-slate-400"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Sharpens the risk score. The search itself covers every
                  class so nothing is missed.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              On-demand version of the nightly watch. Same risk engine as the
              checker.
            </p>
            <button
              onClick={runSweep}
              disabled={loading || !keywordsText.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Sweeping..." : "Run sweep"}
            </button>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-slate-600">
              Sweeping recent filings...
            </span>
          </div>
        )}

        {report && !loading && (
          <div className="space-y-4">
            {report.source === "mock" && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-md text-sm">
                Demo data mode - fixture records, date window not applied.
              </div>
            )}
            {report.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs space-y-1">
                {report.errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
            {report.truncated.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-md text-xs">
                Page cap reached while still inside the window for:{" "}
                {report.truncated.join(", ")} - there may be more filings than
                shown. Narrow the window or the keyword.
              </div>
            )}

            <section className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  New filings since {report.cutoff}{" "}
                  <span className="text-slate-400 font-normal">
                    ({report.matches.length} match
                    {report.matches.length === 1 ? "" : "es"} from{" "}
                    {report.scanned} scanned
                    {report.undated > 0 ? `, ${report.undated} undated` : ""})
                  </span>
                </h3>
                {report.matches.length > 0 && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-500 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.size === report.matches.length}
                        onChange={() =>
                          setSelected(
                            selected.size === report.matches.length
                              ? new Set()
                              : new Set(
                                  report.matches.map(
                                    (m) => m.finding.trademark.id
                                  )
                                )
                          )
                        }
                      />
                      all
                    </label>
                    <button
                      onClick={downloadCSV}
                      className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
                    >
                      Download CSV{" "}
                      {selected.size > 0
                        ? `(${exportMatches.length} ticked)`
                        : `(all ${report.matches.length})`}
                    </button>
                  </div>
                )}
              </header>
              {report.matches.length === 0 ? (
                <div className="px-5 py-8 text-sm text-slate-500 text-center">
                  No new filings matched the watchlist in this window.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {report.matches.map((m) => (
                    <li key={m.finding.trademark.id} className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Include ${m.finding.trademark.markName} in download`}
                          className="mt-1 flex-shrink-0"
                          checked={selected.has(m.finding.trademark.id)}
                          onChange={() =>
                            toggleSelected(m.finding.trademark.id)
                          }
                        />
                        <span
                          className={`flex-shrink-0 inline-block text-xs font-semibold px-2 py-0.5 rounded ${LEVEL_COLORS[m.finding.level].bg} ${LEVEL_COLORS[m.finding.level].text}`}
                        >
                          {m.finding.level}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <h4 className="text-sm font-semibold text-slate-900 truncate">
                              {m.finding.trademark.markName}
                            </h4>
                            <span className="text-xs text-slate-400 flex-shrink-0">
                              filed {m.finding.trademark.appDate || "?"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5 truncate">
                            watch: <span className="font-medium">{m.keyword}</span>{" "}
                            &middot; {m.finding.trademark.owner} &middot;{" "}
                            {m.finding.trademark.niceClasses.length
                              ? `Cl ${m.finding.trademark.niceClasses.join(", ")}`
                              : "no class data"}{" "}
                            &middot; {m.finding.trademark.status}
                          </p>
                          {m.finding.trademark.externalUrl && (
                            <a
                              href={m.finding.trademark.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                            >
                              View on ATMOSS &rarr;
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <p className="text-xs text-slate-400">
              Method: {report.method}. Risk scores are heuristic, not legal
              advice - recommend a legal review before acting on any hit.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
