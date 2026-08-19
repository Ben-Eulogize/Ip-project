"use client";

import { useState, useCallback } from "react";
import type { AvailabilityReport } from "@/lib/availability";
import { LEVEL_COLORS } from "@/lib/risk";

const MAX_NAMES = 25;

type BatchRow = {
  candidate: string;
  status: "pending" | "running" | "done" | "error";
  report?: AvailabilityReport;
  error?: string;
};

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// IP Australia's canonical reference for a mark is its application
// number - our record ids are "AU-<appNumber>", and the public ATMOSS
// URL is built from the same number.
function appNumberOf(id: string): string {
  return id.replace(/^AU-/, "");
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BatchCheckPage() {
  const [namesText, setNamesText] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [running, setRunning] = useState(false);

  const runBatch = useCallback(async () => {
    const names = Array.from(
      new Set(
        namesText
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean)
      )
    ).slice(0, MAX_NAMES);
    if (names.length === 0) return;

    const initial: BatchRow[] = names.map((candidate) => ({
      candidate,
      status: "pending",
    }));
    setRows(initial);
    setRunning(true);

    // Sequential on purpose: each check fans out 2-4 IPAU calls itself,
    // and the availability route has a 30s budget per call.
    for (let i = 0; i < names.length; i++) {
      setRows((rs) =>
        rs.map((r, j) => (j === i ? { ...r, status: "running" } : r))
      );
      try {
        const res = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate: names[i],
            productDescription: productDescription.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setRows((rs) =>
            rs.map((r, j) =>
              j === i
                ? {
                    ...r,
                    status: "error",
                    error: body.error || `HTTP ${res.status}`,
                  }
                : r
            )
          );
          continue;
        }
        const report = (await res.json()) as AvailabilityReport;
        setRows((rs) =>
          rs.map((r, j) => (j === i ? { ...r, status: "done", report } : r))
        );
      } catch (e) {
        setRows((rs) =>
          rs.map((r, j) =>
            j === i
              ? {
                  ...r,
                  status: "error",
                  error: e instanceof Error ? e.message : "failed",
                }
              : r
          )
        );
      }
    }
    setRunning(false);
  }, [namesText, productDescription]);

  const doneRows = rows.filter((r) => r.status === "done" && r.report);

  const downloadSummaryCSV = useCallback(() => {
    const headers = [
      "candidate",
      "overall",
      "conflicts",
      "topConflict",
      "topConflictAppNumber",
      "topLevel",
      "topScore",
      "classesSearched",
      "source",
    ];
    const lines = doneRows.map((r) => {
      const rep = r.report!;
      const top = rep.findings[0];
      return [
        rep.candidate,
        rep.overall,
        String(rep.findings.length),
        top ? top.trademark.markName : "",
        top ? appNumberOf(top.trademark.id) : "",
        top ? top.level : "",
        top ? String(top.score) : "",
        rep.searchedClasses.join("; "),
        rep.source,
      ]
        .map(csvEscape)
        .join(",");
    });
    downloadBlob(
      [headers.join(","), ...lines].join("\n"),
      "text/csv",
      "tm-batch-availability.csv"
    );
  }, [doneRows]);

  const downloadFindingsCSV = useCallback(() => {
    const headers = [
      "candidate",
      "applicationNumber",
      "level",
      "score",
      "markName",
      "owner",
      "status",
      "niceClasses",
      "filed",
      "registered",
      "kinds",
      "imageUrls",
      "imageDescription",
      "atmossUrl",
      "reasons",
    ];
    const lines = doneRows.flatMap((r) =>
      r.report!.findings.map((f) =>
        [
          r.report!.candidate,
          appNumberOf(f.trademark.id),
          f.level,
          String(f.score),
          f.trademark.markName,
          f.trademark.owner,
          f.trademark.status,
          f.trademark.niceClasses.join("; "),
          f.trademark.appDate || "",
          f.trademark.regDate || "",
          f.trademark.kinds.join("; "),
          f.trademark.imageUrls.join(" "),
          f.trademark.imageDescription.join("; "),
          f.trademark.externalUrl || "",
          f.reasons.join(" | "),
        ]
          .map(csvEscape)
          .join(",")
      )
    );
    downloadBlob(
      [headers.join(","), ...lines].join("\n"),
      "text/csv",
      "tm-batch-findings.csv"
    );
  }, [doneRows]);

  // AI-feed export: JSONL, one fully self-contained record per line, no
  // rawData blobs. Built for dropping straight into an LLM pipeline -
  // each line carries the IP Australia application number (the canonical
  // reference), image links for figurative marks, and the ATMOSS URL.
  const downloadJSONL = useCallback(() => {
    const lines = doneRows.flatMap((r) => {
      const rep = r.report!;
      return rep.findings.map((f) =>
        JSON.stringify({
          candidate: rep.candidate,
          candidateOverall: rep.overall,
          classesSearched: rep.searchedClasses,
          applicationNumber: appNumberOf(f.trademark.id),
          markName: f.trademark.markName,
          owner: f.trademark.owner,
          status: f.trademark.status,
          niceClasses: f.trademark.niceClasses,
          filed: f.trademark.appDate,
          registered: f.trademark.regDate,
          kinds: f.trademark.kinds,
          riskLevel: f.level,
          riskScore: f.score,
          riskReasons: f.reasons,
          imageUrls: f.trademark.imageUrls,
          imageDescription: f.trademark.imageDescription,
          atmossUrl: f.trademark.externalUrl,
          jurisdiction: "AU",
          source: rep.source,
        })
      );
    });
    downloadBlob(
      lines.join("\n"),
      "application/jsonl",
      "tm-batch-ai-feed.jsonl"
    );
  }, [doneRows]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-semibold text-slate-900">
            Batch Availability Check
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Run the risk-classified checker over a shortlist of names.{" "}
            <a href="/" className="text-blue-600 hover:underline">
              Single check
            </a>{" "}
            &middot;{" "}
            <a href="/watch" className="text-blue-600 hover:underline">
              New-filing watch
            </a>{" "}
            &middot;{" "}
            <a href="/batch" className="text-blue-600 hover:underline">
              Raw batch search
            </a>
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="names"
                className="block text-sm font-medium text-slate-700"
              >
                Candidate names (one per line, max {MAX_NAMES})
              </label>
              <textarea
                id="names"
                rows={6}
                placeholder={"e.g.\nJacaranda Gin\nHarbourline Gin\nSaltgrass Distilling"}
                value={namesText}
                onChange={(e) => setNamesText(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 placeholder-slate-400 font-mono"
              />
            </div>
            <div>
              <label
                htmlFor="product"
                className="block text-sm font-medium text-slate-700"
              >
                Shared goods / services description
              </label>
              <input
                id="product"
                type="text"
                placeholder="e.g. small-batch gin distillery"
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 placeholder-slate-400"
              />
              <p className="text-xs text-slate-500 mt-1">
                Applied to every name for Nice-class detection. Names run
                one at a time; a 10-name list takes a minute or two.
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-3">
            {doneRows.length > 0 && !running && (
              <>
                <button
                  onClick={downloadSummaryCSV}
                  className="text-xs px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
                >
                  Summary CSV
                </button>
                <button
                  onClick={downloadFindingsCSV}
                  className="text-xs px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
                >
                  Findings CSV
                </button>
                <button
                  onClick={downloadJSONL}
                  className="text-xs px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-md font-medium"
                  title="One self-contained JSON record per line: application number, image links, ATMOSS URL, risk reasoning. Built for feeding an AI pipeline."
                >
                  AI feed (JSONL)
                </button>
              </>
            )}
            <button
              onClick={runBatch}
              disabled={running || !namesText.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? "Checking..." : "Check all"}
            </button>
          </div>
        </section>

        {rows.length > 0 && (
          <section className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Candidate</th>
                  <th className="px-4 py-2 font-medium">Verdict</th>
                  <th className="px-4 py-2 font-medium">Conflicts</th>
                  <th className="px-4 py-2 font-medium">Top conflict</th>
                  <th className="px-4 py-2 font-medium">Classes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.candidate}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {r.candidate}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.status === "pending" && (
                        <span className="text-xs text-slate-400">queued</span>
                      )}
                      {r.status === "running" && (
                        <span className="text-xs text-blue-600">
                          checking...
                        </span>
                      )}
                      {r.status === "error" && (
                        <span
                          className="text-xs text-red-600"
                          title={r.error}
                        >
                          error
                        </span>
                      )}
                      {r.status === "done" && r.report && (
                        <span
                          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${LEVEL_COLORS[r.report.overall].bg} ${LEVEL_COLORS[r.report.overall].text}`}
                        >
                          {r.report.overall}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {r.report ? r.report.findings.length : ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {r.report?.findings[0] ? (
                        <span>
                          {r.report.findings[0].trademark.markName}{" "}
                          <span className="text-xs text-slate-400">
                            ({r.report.findings[0].level},{" "}
                            {r.report.findings[0].trademark.owner})
                          </span>
                        </span>
                      ) : r.status === "done" ? (
                        <span className="text-xs text-slate-400">none</span>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">
                      {r.report ? r.report.searchedClasses.join(", ") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {doneRows.some((r) => r.report?.source === "mock") && (
              <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-900 text-xs">
                One or more rows used demo data (live API unavailable).
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
