"use client";

import { useState, useCallback, useMemo } from "react";
import type { AvailabilityReport } from "@/lib/availability";
import { NICE_CLASSES, formatClass } from "@/lib/nice-classes";
import { LEVEL_COLORS, RiskLevel } from "@/lib/risk";

const OVERALL_COPY: Record<RiskLevel, { headline: string; sub: string }> = {
  CRITICAL: {
    headline: "Don't proceed without legal advice.",
    sub: "An identical / near-identical mark is registered in your intended class. Almost certain to be opposed or refused.",
  },
  HIGH: {
    headline: "High collision risk.",
    sub: "Strong matches in your class or related classes. Get advice before filing — and review the safer-name suggestions below.",
  },
  MEDIUM: {
    headline: "Worth a closer look.",
    sub: "Some matches exist with overlapping name or class. Filing is possible but contested marks are likely to draw oppositions.",
  },
  LOW: {
    headline: "Looks promising — verify before filing.",
    sub: "Only weak overlaps detected. Still recommend a legal pre-filing review.",
  },
  MINIMAL: {
    headline: "No meaningful conflicts found.",
    sub: "Nothing in IP Australia looks like a hard block. Still recommend a final legal check before paying the filing fee.",
  },
};

type FormState = {
  candidate: string;
  productDescription: string;
  selectedClasses: number[];
  classMode: "auto" | "manual";
};

export default function Home() {
  const [form, setForm] = useState<FormState>({
    candidate: "",
    productDescription: "",
    selectedClasses: [],
    classMode: "auto",
  });
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AvailabilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllFindings, setShowAllFindings] = useState(false);

  const runCheck = useCallback(async () => {
    if (!form.candidate.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    setShowAllFindings(false);
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: form.candidate.trim(),
          productDescription: form.productDescription.trim() || undefined,
          intendedClasses:
            form.classMode === "manual" && form.selectedClasses.length > 0
              ? form.selectedClasses
              : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Request failed (${res.status})`);
        return;
      }
      const data: AvailabilityReport = await res.json();
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [form]);

  const visibleFindings = useMemo(() => {
    if (!report) return [];
    if (showAllFindings) return report.findings;
    return report.findings.slice(0, 12);
  }, [report, showAllFindings]);

  const toggleClass = (n: number) => {
    setForm((s) => ({
      ...s,
      selectedClasses: s.selectedClasses.includes(n)
        ? s.selectedClasses.filter((c) => c !== n)
        : [...s.selectedClasses, n].sort((a, b) => a - b),
    }));
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Trade-mark Availability Checker
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                IP Australia — risk-classified screening for a candidate brand
                name.{" "}
                <a
                  href="/batch"
                  className="text-blue-600 hover:underline"
                >
                  Batch search
                </a>{" "}
                is also available.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Input card */}
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label
                htmlFor="candidate"
                className="block text-sm font-medium text-slate-700"
              >
                Candidate brand name
              </label>
              <input
                id="candidate"
                type="text"
                placeholder="e.g. Pauls Lemonade"
                value={form.candidate}
                onChange={(e) =>
                  setForm((s) => ({ ...s, candidate: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    runCheck();
                  }
                }}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 placeholder-slate-400"
              />
              <label
                htmlFor="product"
                className="block text-sm font-medium text-slate-700 mt-4"
              >
                What goods or services? (optional but recommended)
              </label>
              <input
                id="product"
                type="text"
                placeholder="e.g. non-alcoholic lemonade drink in cans"
                value={form.productDescription}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    productDescription: e.target.value,
                  }))
                }
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 placeholder-slate-400"
              />
              <p className="text-xs text-slate-500 mt-1">
                Used to auto-detect Nice classes for the risk score.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Nice classes
                </span>
                <div className="flex text-xs gap-1 bg-slate-100 rounded-md p-0.5">
                  <button
                    onClick={() =>
                      setForm((s) => ({ ...s, classMode: "auto" }))
                    }
                    className={`px-2 py-1 rounded ${
                      form.classMode === "auto"
                        ? "bg-white shadow-sm text-slate-900"
                        : "text-slate-500"
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    onClick={() =>
                      setForm((s) => ({ ...s, classMode: "manual" }))
                    }
                    className={`px-2 py-1 rounded ${
                      form.classMode === "manual"
                        ? "bg-white shadow-sm text-slate-900"
                        : "text-slate-500"
                    }`}
                  >
                    Manual
                  </button>
                </div>
              </div>
              {form.classMode === "auto" ? (
                <p className="text-xs text-slate-500 mt-2">
                  Classes detected from the candidate + description.
                </p>
              ) : (
                <div className="mt-2 max-h-44 overflow-y-auto border border-slate-200 rounded-md p-2 text-xs space-y-1 bg-slate-50">
                  {NICE_CLASSES.map((c) => (
                    <label
                      key={c.number}
                      className="flex items-start gap-2 cursor-pointer hover:bg-white px-1 py-0.5 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={form.selectedClasses.includes(c.number)}
                        onChange={() => toggleClass(c.number)}
                        className="mt-0.5"
                      />
                      <span className="text-slate-700">
                        <span className="font-medium">Cl. {c.number}</span> —{" "}
                        {c.heading}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Enter to search. The check fans out 3-10 variant queries per
              run, so it takes a few seconds.
            </p>
            <button
              onClick={runCheck}
              disabled={loading || !form.candidate.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Checking..." : "Check availability"}
            </button>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-6">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-slate-600">
              Running variant queries...
            </span>
          </div>
        )}

        {/* Report */}
        {report && !loading && (
          <div className="space-y-6">
            {/* Source / warnings banner */}
            {report.source === "mock" && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-md text-sm">
                <div className="font-medium mb-1">Demo data mode</div>
                {report.liveApiError ? (
                  <p>{report.liveApiError}</p>
                ) : (
                  <p>
                    Using a small fixture dataset. Set{" "}
                    <code className="bg-amber-100 px-1 rounded">
                      IPAU_MOCK_MODE
                    </code>{" "}
                    to <code>false</code> (or unset) to hit the live IP
                    Australia API.
                  </p>
                )}
              </div>
            )}

            {/* Overall verdict */}
            <section
              className={`rounded-lg border p-5 ${
                report.overall === "CRITICAL"
                  ? "bg-red-50 border-red-200"
                  : report.overall === "HIGH"
                  ? "bg-orange-50 border-orange-200"
                  : report.overall === "MEDIUM"
                  ? "bg-amber-50 border-amber-200"
                  : report.overall === "LOW"
                  ? "bg-yellow-50 border-yellow-200"
                  : "bg-emerald-50 border-emerald-200"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`px-3 py-1.5 rounded-md font-semibold text-sm ${
                    LEVEL_COLORS[report.overall].bg
                  } ${LEVEL_COLORS[report.overall].text}`}
                >
                  {LEVEL_COLORS[report.overall].label}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {OVERALL_COPY[report.overall].headline}
                  </h2>
                  <p className="text-sm text-slate-700 mt-1">
                    {OVERALL_COPY[report.overall].sub}
                  </p>
                  <div className="mt-3 text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    <div>
                      <span className="font-medium">Candidate:</span>{" "}
                      {report.candidate}
                    </div>
                    <div>
                      <span className="font-medium">Intended classes:</span>{" "}
                      {report.intendedClasses.length
                        ? report.intendedClasses
                            .map((n) => `Class ${n}`)
                            .join(", ")
                        : "(none)"}
                    </div>
                    <div>
                      <span className="font-medium">Queries fired:</span>{" "}
                      {report.searchedQueries.length} ({report.rawHitCount} raw
                      hits, {report.findings.length} after scoring)
                    </div>
                    <div>
                      <span className="font-medium">Data source:</span>{" "}
                      {report.source === "live" ? "IP Australia (live)" : "Demo fixtures"}
                    </div>
                  </div>
                </div>
              </div>
              {report.warnings.length > 0 && (
                <ul className="mt-3 text-xs text-slate-600 list-disc pl-5 space-y-1">
                  {report.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Findings list */}
              <section className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Conflicting marks{" "}
                    <span className="text-slate-400 font-normal">
                      ({report.findings.length})
                    </span>
                  </h3>
                  {report.findings.length > 12 && (
                    <button
                      onClick={() => setShowAllFindings((v) => !v)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {showAllFindings
                        ? "Show top 12"
                        : `Show all ${report.findings.length}`}
                    </button>
                  )}
                </header>
                {report.findings.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-slate-500 text-center">
                    No meaningful conflicts found across the variant queries.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {visibleFindings.map((f) => (
                      <li key={f.trademark.id} className="px-5 py-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded ${
                              LEVEL_COLORS[f.level].bg
                            } ${LEVEL_COLORS[f.level].text}`}
                          >
                            {f.level}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <h4 className="text-sm font-semibold text-slate-900 truncate">
                                {f.trademark.markName}
                              </h4>
                              <span className="text-xs text-slate-400">
                                score {f.score}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 truncate">
                              {f.trademark.owner} &middot;{" "}
                              {f.trademark.niceClasses.length
                                ? `Class ${f.trademark.niceClasses.join(", ")}`
                                : "no class data"}{" "}
                              &middot; {f.trademark.status}
                            </p>
                            <ul className="mt-1 text-xs text-slate-500 list-disc pl-4 space-y-0.5">
                              {f.reasons.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                            {f.trademark.externalUrl && (
                              <a
                                href={f.trademark.externalUrl}
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

              {/* Side panel: alternatives + safer classes */}
              <aside className="space-y-6">
                <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Alternative names
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Variations that drop or vary the blocked element. Cheap
                    heuristic — none have been re-checked against IPAU.
                  </p>
                  {report.alternativeNames.length === 0 ? (
                    <p className="text-xs text-slate-500 mt-3 italic">
                      No high-risk tokens to vary. The current name looks
                      reasonably distinctive against the hits we found.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-1.5">
                      {report.alternativeNames.map((alt, i) => (
                        <li
                          key={i}
                          className="text-sm bg-slate-50 px-3 py-1.5 rounded border border-slate-200 flex items-center justify-between"
                        >
                          <span className="text-slate-800">{alt}</span>
                          <button
                            onClick={() => {
                              setForm((s) => ({ ...s, candidate: alt }));
                              setTimeout(runCheck, 50);
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Check &rarr;
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Class-change suggestions
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Nearby Nice classes with fewer conflicts. Only valid if
                    your goods/services actually fit that class.
                  </p>
                  {report.saferClasses.length === 0 ? (
                    <p className="text-xs text-slate-500 mt-3 italic">
                      No class shift would help: either no class is hot, or
                      the related classes are equally hot.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {report.saferClasses.map((s) => (
                        <li
                          key={s.class}
                          className="text-sm bg-slate-50 px-3 py-2 rounded border border-slate-200"
                        >
                          <div className="font-medium text-slate-900">
                            {formatClass(s.class)}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {s.reason}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Queries used — diagnostic, collapsible-feeling */}
                <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Variants searched
                  </h3>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {report.searchedQueries.map((q) => (
                      <li
                        key={q}
                        className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                      >
                        {q}
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!report && !loading && !error && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center text-slate-500 text-sm">
            <p className="mb-2">
              Type a candidate brand name above and hit{" "}
              <span className="font-medium text-slate-700">
                Check availability
              </span>{" "}
              to see a risk-classified report.
            </p>
            <p className="text-xs">
              Try: <em>Pauls Lemonade</em>, <em>Sutton Coffee</em>,{" "}
              <em>Jacaranda Gin</em>.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
