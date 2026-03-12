import { useMemo, useState } from "react";
import type { AnalysisModel } from "@/types/analysis";
import { analyzeSnapshot } from "@/utils/analyzer/analyzeSnapshot";
import { buildAnalysisJson } from "@/utils/analyzer/jsonBuilder";
import { buildReportFiles } from "@/utils/analyzer/reportBuilder";
import { fetchWebsiteSnapshot } from "@/utils/crawler/crawlClient";
import { generatePdfs, type PdfResult } from "@/utils/pdfGenerator";
import { buildTemplateFiles } from "@/utils/template/templateGenerator";

type Status = "idle" | "analyzing" | "done" | "error";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPrintableHtml(pdf: PdfResult): string {
  const pagesHtml = pdf.pages
    .map((page) => {
      const codeHtml = page.lines.length ? page.lines.map((line) => escapeHtml(line)).join("\n") : "";
      const titleSuffix = page.continuation ? " (continued)" : "";

      return `
        <section class="page">
          <header class="page-header">
            <div class="file-path">[File] ${escapeHtml(page.filePath)}${titleSuffix}</div>
          </header>
          <main class="page-body">
            <pre>${codeHtml}</pre>
          </main>
          <footer class="page-footer">
            <span>${page.pageNumber} / ${page.totalPages}</span>
          </footer>
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(pdf.name)}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: #e5e7eb;
            color: #111827;
            font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
          }
          body { padding: 24px; }
          .toolbar {
            max-width: 210mm;
            margin: 0 auto 16px;
            padding: 12px 16px;
            background: #111827;
            color: white;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }
          .toolbar button {
            border: 0;
            border-radius: 10px;
            background: #2563eb;
            color: white;
            padding: 10px 14px;
            font-size: 13px;
            cursor: pointer;
          }
          .page {
            width: 180mm;
            min-height: 267mm;
            margin: 0 auto 16px;
            background: white;
            box-shadow: 0 10px 30px rgba(0,0,0,0.12);
            display: flex;
            flex-direction: column;
            page-break-after: always;
          }
          .page:last-child { page-break-after: auto; }
          .page-header {
            padding: 0 0 3mm;
            border-bottom: 0.3mm solid #9ca3af;
          }
          .page-body { flex: 1; padding-top: 3mm; }
          .file-path {
            font-size: 9pt;
            font-weight: 700;
            word-break: break-all;
          }
          pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            overflow-wrap: anywhere;
            font-size: 9pt;
            line-height: 1;
            font-family: "D2Coding", "NanumGothicCoding", "Consolas", monospace;
            tab-size: 4;
          }
          .page-footer {
            padding-top: 3mm;
            display: flex;
            justify-content: center;
            color: #6b7280;
            font-size: 8pt;
          }
          @media print {
            body { padding: 0; background: white; }
            .toolbar { display: none; }
            .page {
              width: auto;
              min-height: auto;
              margin: 0;
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <div>
            <strong>${escapeHtml(pdf.name)}</strong><br />
            <span>${pdf.fileCount}개 파일 / ${pdf.pageCount}페이지</span>
          </div>
          <button onclick="window.print()">인쇄 / PDF 저장</button>
        </div>
        ${pagesHtml}
      </body>
    </html>
  `;
}

export default function App() {
  const [websiteUrl, setWebsiteUrl] = useState("https://example.com");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisModel | null>(null);
  const [reportPdfs, setReportPdfs] = useState<PdfResult[]>([]);
  const [templatePdfs, setTemplatePdfs] = useState<PdfResult[]>([]);
  const [snapshotScreenshot, setSnapshotScreenshot] = useState<string>("");
  const [snapshotVia, setSnapshotVia] = useState<"external-api" | "direct" | "">("");
  const [selectedTab, setSelectedTab] = useState<"summary" | "report" | "template" | "json">("summary");
  const [selectedReportPdfId, setSelectedReportPdfId] = useState("");
  const [selectedTemplatePdfId, setSelectedTemplatePdfId] = useState("");

  const selectedReportPdf = useMemo(
    () => reportPdfs.find((pdf) => pdf.id === selectedReportPdfId) ?? reportPdfs[0] ?? null,
    [reportPdfs, selectedReportPdfId]
  );

  const selectedTemplatePdf = useMemo(
    () => templatePdfs.find((pdf) => pdf.id === selectedTemplatePdfId) ?? templatePdfs[0] ?? null,
    [templatePdfs, selectedTemplatePdfId]
  );

  const reportPreviewHtml = useMemo(
    () => (selectedReportPdf ? buildPrintableHtml(selectedReportPdf) : ""),
    [selectedReportPdf]
  );

  const templatePreviewHtml = useMemo(
    () => (selectedTemplatePdf ? buildPrintableHtml(selectedTemplatePdf) : ""),
    [selectedTemplatePdf]
  );

  const analysisJson = useMemo(() => (analysis ? buildAnalysisJson(analysis) : ""), [analysis]);

  const handleAnalyze = async () => {
    setStatus("analyzing");
    setErrorMsg("");
    setProgress("사이트 스냅샷을 가져오는 중...");
    setAnalysis(null);
    setReportPdfs([]);
    setTemplatePdfs([]);
    setSnapshotScreenshot("");
    setSnapshotVia("");
    setSelectedReportPdfId("");
    setSelectedTemplatePdfId("");

    try {
      const snapshot = await fetchWebsiteSnapshot(websiteUrl);
      setSnapshotScreenshot(snapshot.screenshot || "");
      setSnapshotVia(snapshot.via);
      setProgress("스냅샷 분석 모델 생성 중...");
      const model = analyzeSnapshot(snapshot);
      setAnalysis(model);

      setProgress("리포트 문서 생성 중...");
      const reportFiles = buildReportFiles(model);
      const reportDocs = generatePdfs(reportFiles, setProgress);
      setReportPdfs(reportDocs);
      setSelectedReportPdfId(reportDocs[0]?.id ?? "");

      setProgress("편집 가능한 템플릿 초안 생성 중...");
      const templateFiles = buildTemplateFiles(model);
      const templateDocs = generatePdfs(templateFiles, setProgress);
      setTemplatePdfs(templateDocs);
      setSelectedTemplatePdfId(templateDocs[0]?.id ?? "");

      setProgress("완료");
      setStatus("done");
    } catch (error: unknown) {
      setStatus("error");
      setProgress("");
      setErrorMsg(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <h1 className="text-2xl font-bold text-white">Site Template Analyzer</h1>
          <p className="mt-1 text-sm text-gray-400">
            사이트를 분석해 리포트, 구조화 JSON, 그리고 수정 가능한 템플릿 초안을 생성하는 실험용 도구입니다.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-gray-100">1. 사이트 입력</h2>
          <p className="mt-2 text-sm text-gray-400">
            외부 Railway Puppeteer API를 우선 호출하고, 실패 시 브라우저 직접 fetch 방식으로 폴백합니다. 외부 API가 연결되면 실제 렌더링 HTML과 스크린샷 기반 분석 정확도가 더 높아집니다.
          </p>

          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-blue-500"
            />
            <button
              onClick={() => void handleAnalyze()}
              disabled={status === "analyzing"}
              className="cursor-pointer rounded-xl bg-blue-600 px-6 py-3 font-medium whitespace-nowrap text-white transition-colors hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500"
            >
              {status === "analyzing" ? "분석 중..." : "분석 시작"}
            </button>
          </div>

          {progress ? (
            <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm text-gray-300">
              {progress}
            </div>
          ) : null}

          {errorMsg ? (
            <div className="mt-4 rounded-xl border border-red-700 bg-red-900/30 p-4 text-sm text-red-300">
              {errorMsg}
            </div>
          ) : null}
        </section>

        {analysis ? (
          <>
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <div className="flex flex-wrap gap-2">
                {(["summary", "report", "template", "json"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSelectedTab(tab)}
                    className={
                      "rounded-xl px-4 py-2 text-sm font-medium transition-colors " +
                      (selectedTab === tab
                        ? "bg-blue-600 text-white"
                        : "bg-gray-950 text-gray-300 hover:bg-gray-800")
                    }
                  >
                    {tab === "summary" && "요약"}
                    {tab === "report" && "리포트 문서"}
                    {tab === "template" && "템플릿 초안"}
                    {tab === "json" && "JSON"}
                  </button>
                ))}
              </div>

              {selectedTab === "summary" ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5">
                    <h3 className="text-base font-semibold text-white">분석 개요</h3>
                    <div className="mt-4 space-y-2 text-sm text-gray-300">
                      <p><span className="text-gray-500">제목:</span> {analysis.title}</p>
                      <p><span className="text-gray-500">원본 URL:</span> {analysis.sourceUrl}</p>
                      <p><span className="text-gray-500">최종 URL:</span> {analysis.resolvedUrl}</p>
                      <p><span className="text-gray-500">페이지 타입:</span> {analysis.pageType}</p>
                      <p><span className="text-gray-500">수집 방식:</span> {snapshotVia === "external-api" ? "Railway Puppeteer API" : snapshotVia === "direct" ? "브라우저 직접 fetch" : "-"}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5">
                    <h3 className="text-base font-semibold text-white">레이아웃 신호</h3>
                    <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-gray-300">
                      {analysis.layout.signals.map((signal, index) => (
                        <li key={index}>{signal}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5">
                    <h3 className="text-base font-semibold text-white">프레임워크 힌트</h3>
                    <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-gray-300">
                      {(analysis.frameworkHints.length > 0 ? analysis.frameworkHints : ["없음"]).map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5">
                    <h3 className="text-base font-semibold text-white">대표 토큰</h3>
                    <div className="mt-4 space-y-2 text-sm text-gray-300">
                      <p><span className="text-gray-500">색상:</span> {analysis.tokens.colors.slice(0, 8).join(", ") || "없음"}</p>
                      <p><span className="text-gray-500">폰트:</span> {analysis.tokens.fontFamilies.slice(0, 4).join(", ") || "없음"}</p>
                      <p><span className="text-gray-500">radius:</span> {analysis.tokens.radius.slice(0, 4).join(", ") || "없음"}</p>
                    </div>
                  </div>

                  {snapshotScreenshot ? (
                    <div className="lg:col-span-2 rounded-2xl border border-gray-800 bg-gray-950 p-5">
                      <h3 className="text-base font-semibold text-white">수집 스크린샷</h3>
                      <p className="mt-2 text-sm text-gray-400">
                        Puppeteer API 수집이 성공한 경우 전체 페이지 스크린샷이 함께 저장됩니다.
                      </p>
                      <img
                        src={snapshotScreenshot}
                        alt="captured website"
                        className="mt-4 w-full rounded-xl border border-gray-800"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedTab === "report" ? (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    {reportPdfs.map((pdf) => {
                      const active = selectedReportPdf?.id === pdf.id;
                      return (
                        <button
                          key={pdf.id}
                          onClick={() => setSelectedReportPdfId(pdf.id)}
                          className={
                            "rounded-xl border p-4 text-left transition-colors " +
                            (active
                              ? "border-blue-500 bg-blue-500/10"
                              : "border-gray-800 bg-gray-950 hover:border-gray-600")
                          }
                        >
                          <p className="font-medium text-white">{pdf.name}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            {pdf.fileCount}개 파일 / {pdf.pageCount}페이지
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {selectedReportPdf ? (
                    <div className="overflow-hidden rounded-xl border border-gray-800 bg-white">
                      <iframe
                        title="report preview"
                        srcDoc={reportPreviewHtml}
                        className="h-[900px] w-full bg-white"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedTab === "template" ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-emerald-700/40 bg-emerald-900/10 p-4 text-sm text-emerald-300">
                    템플릿 초안은 “원본 복제”가 아니라, 분석한 구조를 기반으로 수정 가능한 React/Tailwind 스캐폴드로 재구성한 결과입니다.
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {templatePdfs.map((pdf) => {
                      const active = selectedTemplatePdf?.id === pdf.id;
                      return (
                        <button
                          key={pdf.id}
                          onClick={() => setSelectedTemplatePdfId(pdf.id)}
                          className={
                            "rounded-xl border p-4 text-left transition-colors " +
                            (active
                              ? "border-emerald-500 bg-emerald-500/10"
                              : "border-gray-800 bg-gray-950 hover:border-gray-600")
                          }
                        >
                          <p className="font-medium text-white">{pdf.name}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            {pdf.fileCount}개 파일 / {pdf.pageCount}페이지
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {selectedTemplatePdf ? (
                    <div className="overflow-hidden rounded-xl border border-gray-800 bg-white">
                      <iframe
                        title="template preview"
                        srcDoc={templatePreviewHtml}
                        className="h-[900px] w-full bg-white"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedTab === "json" ? (
                <div className="mt-5 overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
                  <pre className="overflow-x-auto p-4 text-xs leading-6 text-gray-300">{analysisJson}</pre>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
