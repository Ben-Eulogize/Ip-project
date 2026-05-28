"use client";

import { useState, useCallback, useMemo, useRef } from "react";
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
  imageKeywords: string;
};

export default function Home() {
  const [form, setForm] = useState<FormState>({
    candidate: "",
    productDescription: "",
    selectedClasses: [],
    classMode: "auto",
    imageKeywords: "",
  });
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AvailabilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllFindings, setShowAllFindings] = useState(false);

  // Image-upload state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageExtractStatus, setImageExtractStatus] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runCheck = useCallback(async () => {
    if (!form.candidate.trim() && !form.imageKeywords.trim()) {
      setError("Enter a candidate name or upload a logo (or both).");
      return;
    }
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
          imageKeywords: form.imageKeywords.trim() || undefined,
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

  const handleImageFile = useCallback(async (file: File) => {
    setImageExtractStatus(null);
    setExtracting(true);
    try {
      // Read as data URL for preview + API.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      setImagePreview(dataUrl);
      // Try vision extraction.
      const res = await fetch("/api/extract-image-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setForm((s) => ({ ...s, imageKeywords: data.keywords || "" }));
        setImageExtractStatus(`Extracted ${(data.keywords || "").split(",").length} elements (model: ${data.model})`);
      } else {
        const data = await res.json().catch(() => ({}));
        setImageExtractStatus(
          data.error ||
            "Auto-extraction unavailable. Type visual elements manually (e.g. STAR, CIRCLE, BLUE)."
        );
      }
    } catch (e) {
      setImageExtractStatus(
        `Image processing failed: ${e instanceof Error ? e.message : "unknown error"}`
      );
    } finally {
      setExtracting(false);
    }
  }, []);

  const clearImage = useCallback(() => {
    setImagePreview(null);
    setImageExtractStatus(null);
    setForm((s) => ({ ...s, imageKeywords: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const visibleFindings = useMemo(() => {
    if (!report) return [];
    if (showAllFindings) return report.findings;
    return report.findings.slice(0, 15);
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
          <h1 className="text-2xl font-semibold text-slate-900">
            Trade-mark Availability Checker
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            IP Australia — risk-classified screening for a candidate brand
            name + logo.{" "}
            <a href="/batch" className="text-blue-600 hover:underline">
              Batch search
            </a>{" "}
            is also available.
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Input card */}
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left two-thirds: name + product */}
            <div className="md:col-span-2 space-y-4">
              <div>
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
              </div>

              <div>
                <label
                  htmlFor="product"
                  className="block text-sm font-medium text-slate-700"
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

              {/* Image upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Logo / image (optional)
                </label>
                <div className="mt-1 flex items-start gap-3">
                  {imagePreview ? (
                    <div className="flex-shrink-0 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview}
                        alt="Uploaded logo"
                        className="h-24 w-24 object-contain border border-slate-200 rounded-md bg-white"
                      />
                      <button
                        onClick={clearImage}
                        type="button"
                        className="absolute -top-2 -right-2 bg-white border border-slate-300 rounded-full w-5 h-5 text-xs text-slate-600 hover:bg-slate-100"
                        aria-label="Remove image"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="file"
                      className="flex-shrink-0 h-24 w-24 border-2 border-dashed border-slate-300 rounded-md flex items-center justify-center text-xs text-slate-500 cursor-pointer hover:border-slate-400 hover:text-slate-600 text-center px-1"
                    >
                      Upload logo
                    </label>
                  )}
                  <input
                    id="file"
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageFile(f);
                    }}
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="imgkw"
                      className="block text-xs text-slate-600"
                    >
                      Visual elements (comma-separated)
                    </label>
                    <input
                      id="imgkw"
                      type="text"
                      placeholder="e.g. STAR, CIRCLE, BLUE, CROWN"
                      value={form.imageKeywords}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          imageKeywords: e.target.value,
                        }))
                      }
                      className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 placeholder-slate-400"
                    />
                    {extracting && (
                      <p className="text-xs text-slate-500 mt-1">
                        Extracting visual elements...
                      </p>
                    )}
                    {imageExtractStatus && !extracting && (
                      <p
                        className={`text-xs mt-1 ${
                          imageExtractStatus.startsWith("Extracted")
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }`}
                      >
                        {imageExtractStatus}
                      </p>
                    )}
                    {!imageExtractStatus && !extracting && (
                      <p className="text-xs text-slate-500 mt-1">
                        Upload a logo and Claude will extract IP-Australia-
                        style visual element keywords. Or type them yourself.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right third: class picker */}
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
                <div className="mt-2 max-h-64 overflow-y-auto border border-slate-200 rounded-md p-2 text-xs space-y-1 bg-slate-50">
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
              Enter to search. Uses IP Australia&apos;s advanced API (STEM
              word matching + class filter + image keywords).
            </p>
            <button
              onClick={runCheck}
              disabled={loading || (!form.candidate.trim() && !form.imageKeywords.trim())}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Checking..." : "Check availability"}
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
              Searching IP Australia...
            </span>
          </div>
        )}

        {report && !loading && (
          <div className="space-y-6">
            {report.source === "mock" && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-md text-sm">
                <div className="font-medium mb-1">Demo data mode</div>
                {report.liveApiError ? (
                  <p>{report.liveApiError}</p>
                ) : (
                  <p>
                    Using fixture data. Set <code>IPAU_MOCK_MODE</code> to{" "}
                    <code>false</code> to hit the live API.
                  </p>
                )}
              </div>
            )}

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
                      {report.candidate || "(image-only search)"}
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
                      <span className="font-medium">Total in IPAU:</span>{" "}
                      {report.totalAvailable} matches; fetched {report.fetched}, scored {report.findings.length}
                    </div>
                    <div>
                      <span className="font-medium">Data source:</span>{" "}
                      {report.source === "live"
                        ? "IP Australia (live)"
                        : "Demo fixtures"}
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
                  {report.findings.length > 15 && (
                    <button
                      onClick={() => setShowAllFindings((v) => !v)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {showAllFindings
                        ? "Show top 15"
                        : `Show all ${report.findings.length}`}
                    </button>
                  )}
                </header>
                {report.findings.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-slate-500 text-center">
                    No meaningful conflicts found.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {visibleFindings.map((f) => (
                      <li key={f.trademark.id} className="px-5 py-3">
                        <div className="flex items-start gap-3">
                          {f.trademark.imageUrls.length > 0 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={f.trademark.imageUrls[0]}
                              alt={f.trademark.markName}
                              className="flex-shrink-0 w-12 h-12 object-contain border border-slate-200 rounded bg-white"
                            />
                          ) : (
                            <div className="flex-shrink-0 w-12 h-12 border border-slate-100 bg-slate-50 rounded flex items-center justify-center text-[10px] text-slate-400 text-center px-0.5">
                              {f.trademark.kinds[0] || "word"}
                            </div>
                          )}
                          <div className="flex-shrink-0">
                            <span
                              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${
                                LEVEL_COLORS[f.level].bg
                              } ${LEVEL_COLORS[f.level].text}`}
                            >
                              {f.level}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <h4 className="text-sm font-semibold text-slate-900 truncate">
                                {f.trademark.markName}
                              </h4>
                              <span className="text-xs text-slate-400 flex-shrink-0">
                                score {f.score}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 truncate">
                              {f.trademark.owner} &middot;{" "}
                              {f.trademark.niceClasses.length
                                ? `Cl ${f.trademark.niceClasses.join(", ")}`
                                : "no class data"}{" "}
                              &middot; {f.trademark.status}
                            </p>
                            {f.trademark.imageDescription.length > 0 && (
                              <p className="text-xs text-slate-500 mt-0.5 italic truncate">
                                Image: {f.trademark.imageDescription.join("; ")}
                              </p>
                            )}
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

              <aside className="space-y-6">
                <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Alternative names
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Variations that drop or vary the blocked element.
                    Heuristic — none re-checked against IPAU.
                  </p>
                  {report.alternativeNames.length === 0 ? (
                    <p className="text-xs text-slate-500 mt-3 italic">
                      No high-risk tokens to vary.
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
                      No class shift would help.
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
              </aside>
            </div>
          </div>
        )}

        {!report && !loading && !error && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center text-slate-500 text-sm">
            <p className="mb-2">
              Type a brand name (and/or upload a logo) and hit{" "}
              <span className="font-medium text-slate-700">
                Check availability
              </span>{" "}
              for a risk-classified report.
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
