"use client";

import { useState, useCallback } from "react";
import { SearchResult, SourceStatus } from "@/lib/types";
import { toJSON, toCSV } from "@/lib/export";

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const terms = input
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) return;

    setLoading(true);
    setResults([]);
    setSources([]);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setResults(data.results || []);
        setSources(data.sources || []);
        if (data.results?.length > 0) {
          setExpandedTerm(data.results[0].term);
        }
      }
    } catch {
      alert("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [input]);

  const allResults = results.flatMap((r) => r.results);

  const downloadJSON = () => {
    const blob = new Blob([toJSON(allResults)], { type: "application/json" });
    downloadBlob(blob, "tm-results.json");
  };

  const downloadCSV = () => {
    const blob = new Blob([toCSV(allResults)], { type: "text/csv" });
    downloadBlob(blob, "tm-results.csv");
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                TM Researcher — Batch search
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Raw IP Australia search for a list of terms.{" "}
                <a href="/" className="text-blue-600 hover:underline">
                  Availability checker
                </a>{" "}
                gives risk-classified results.
              </p>
            </div>
            {allResults.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={downloadJSON}
                  className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors"
                >
                  Export JSON
                </button>
                <button
                  onClick={downloadCSV}
                  className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors"
                >
                  Export CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <label
            htmlFor="terms"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Trade mark terms (one per line)
          </label>
          <textarea
            id="terms"
            rows={5}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y text-gray-900 placeholder-gray-400"
            placeholder={"ACME\nBlue Mountain\nSunrise IP"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSearch();
              }
            }}
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Ctrl+Enter to search &middot; Max 20 terms
            </p>
            <button
              onClick={handleSearch}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Searching..." : "Search IP Australia"}
            </button>
          </div>
        </div>

        {sources.length > 0 && (
          <div className="flex gap-3 mb-6 flex-wrap">
            {sources.map((s) => (
              <div
                key={s.source}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                  s.status === "ok"
                    ? "bg-green-50 text-green-700"
                    : s.status === "not_configured"
                    ? "bg-yellow-50 text-yellow-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    s.status === "ok"
                      ? "bg-green-500"
                      : s.status === "not_configured"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                />
                {s.source}: {s.count} result{s.count !== 1 ? "s" : ""}
                {s.status === "not_configured" && " (credentials not set)"}
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-600">
              Searching IP Australia...
            </span>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((sr) => (
              <div
                key={sr.term}
                className="bg-white rounded-lg shadow-sm border border-gray-200"
              >
                <button
                  onClick={() =>
                    setExpandedTerm(expandedTerm === sr.term ? null : sr.term)
                  }
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                      &ldquo;{sr.term}&rdquo;
                    </h2>
                    <span className="text-sm text-gray-500">
                      {sr.results.length} result
                      {sr.results.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedTerm === sr.term ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {sr.errors.length > 0 && (
                  <div className="px-6 pb-2">
                    {sr.errors.map((err, i) => (
                      <p key={i} className="text-xs text-amber-600">
                        {err}
                      </p>
                    ))}
                  </div>
                )}

                {expandedTerm === sr.term && sr.results.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-t border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <th className="px-6 py-3">Mark</th>
                          <th className="px-6 py-3">Owner</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3">Classes</th>
                          <th className="px-6 py-3">App Date</th>
                          <th className="px-6 py-3">Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sr.results.map((tm) => (
                          <tr
                            key={tm.id}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-6 py-3 font-medium text-gray-900 max-w-[200px] truncate">
                              {tm.markName}
                            </td>
                            <td className="px-6 py-3 text-gray-600 max-w-[200px] truncate">
                              {tm.owner}
                            </td>
                            <td className="px-6 py-3">
                              <span
                                className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                                  tm.status.toLowerCase().includes("register")
                                    ? "bg-green-50 text-green-700"
                                    : tm.status.toLowerCase().includes("pend")
                                    ? "bg-yellow-50 text-yellow-700"
                                    : tm.status.toLowerCase().includes("dead") ||
                                      tm.status.toLowerCase().includes("laps") ||
                                      tm.status.toLowerCase().includes("ceas")
                                    ? "bg-red-50 text-red-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {tm.status}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-gray-600">
                              {tm.niceClasses.join(", ") || "\u2014"}
                            </td>
                            <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                              {tm.appDate || "\u2014"}
                            </td>
                            <td className="px-6 py-3">
                              {tm.externalUrl && (
                                <a
                                  href={tm.externalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  View
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {expandedTerm === sr.term && sr.results.length === 0 && (
                  <div className="px-6 pb-4 text-sm text-gray-500">
                    No results found for this term.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
