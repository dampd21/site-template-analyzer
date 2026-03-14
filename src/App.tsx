import { useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import type { AnalysisModel } from "@/types/analysis";
import { analyzeSnapshot } from "@/utils/analyzer/analyzeSnapshot";
import { buildAnalysisJson } from "@/utils/analyzer/jsonBuilder";
import { buildReportFiles } from "@/utils/analyzer/reportBuilder";
import { fetchWebsiteSnapshot } from "@/utils/crawler/crawlClient";
import { generatePdfs, type FileData, type PdfResult } from "@/utils/pdfGenerator";
import { buildTemplateFiles } from "@/utils/template/templateGenerator";

type Status = "idle" | "reading" | "analyzing" | "generating" | "done" | "error";
type InputMode = "website" | "folder";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isBinaryFile(name: string): boolean {
  const binaryExts = [
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
    ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".exe", ".dll", ".so", ".dylib",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".pyc", ".class", ".o", ".obj",
    ".db", ".sqlite", ".lock"
  ];
  const lower = name.toLowerCase();
  return binaryExts.some((ext) => lower.endsWith(ext));
}

function shouldSkipPath(path: string): boolean {
  const skip = [
    "node_modules",
    ".git",
    "__pycache__",
    ".next",
    "dist",
    "build",
    ".cache",
    ".vscode",
    ".idea",
    "venv",
    "env",
    ".env",
    ".DS_Store"
  ];
  const parts = path.split("/");
  return parts.some((p) => skip.includes(p));
}

async function readTextWithEncodingFallback(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const brokenCharCount = (utf8.match(/�/g) || []).length;

  if (brokenCharCount === 0) {
    return utf8;
  }

  const fallbackEncodings = ["euc-kr", "windows-1252"];
  for (const encoding of fallbackEncodings) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: false }).decode(buffer);
      const decodedBrokenCharCount = (decoded.match(/�/g) || []).length;
      if (decodedBrokenCharCount < brokenCharCount) {
        return decoded;
      }
    } catch {
      // ignore unsupported encoding
    }
  }

  return utf8;
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

function buildCombinedTextFile(files: FileData[]): string {
  return files
    .map((file) => {
      return [
        `[File] ${file.path}`,
        "",
        file.content,
        "",
        "------------------------------------------------------------",
        ""
      ].join("\n");
    })
    .join("\n");
}

function SummaryCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {sub ? <p className="mt-2 text-sm text-gray-400">{sub}</p> : null}
    </div>
  );
}

function BlockChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-gray-700 bg-gray-950 px-3 py-1 text-xs text-gray-300">
      {label}
    </span>
  );
}

export default function App() {
  const [inputMode, setInputMode] = useState<InputMode>("website");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("https://example.com");
  const [analysis, setAnalysis] = useState<AnalysisModel | null>(null);
  const [reportPdfs, setReportPdfs] = useState<PdfResult[]>([]);
  const [templatePdfs, setTemplatePdfs] = useState<PdfResult[]>([]);
  const [templateFiles, setTemplateFiles] = useState<FileData[]>([]);
  const [selectedTemplateFilePath, setSelectedTemplateFilePath] = useState("");
  const [snapshotScreenshot, setSnapshotScreenshot] = useState<string>("");
  const [snapshotVia, setSnapshotVia] = useState<"external-api" | "direct" | "">("");
  const [folderFiles, setFolderFiles] = useState<FileData[]>([]);
  const [folderPdfs, setFolderPdfs] = useState<PdfResult[]>([]);
  const [selectedFolderPdfId, setSelectedFolderPdfId] = useState("");
  const [selectedTab, setSelectedTab] = useState<"overview" | "report" | "template" | "json">("overview");
  const [selectedReportPdfId, setSelectedReportPdfId] = useState("");
  const [selectedTemplatePdfId, setSelectedTemplatePdfId] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);

  const selectedReportPdf = useMemo(
    () => reportPdfs.find((pdf) => pdf.id === selectedReportPdfId) ?? reportPdfs[0] ?? null,
    [reportPdfs, selectedReportPdfId]
  );

  const selectedTemplatePdf = useMemo(
    () => templatePdfs.find((pdf) => pdf.id === selectedTemplatePdfId) ?? templatePdfs[0] ?? null,
    [templatePdfs, selectedTemplatePdfId]
  );

  const selectedFolderPdf = useMemo(
    () => folderPdfs.find((pdf) => pdf.id === selectedFolderPdfId) ?? folderPdfs[0] ?? null,
    [folderPdfs, selectedFolderPdfId]
  );

  const reportPreviewHtml = useMemo(
    () => (selectedReportPdf ? buildPrintableHtml(selectedReportPdf) : ""),
    [selectedReportPdf]
  );

  const templatePreviewHtml = useMemo(
    () => (selectedTemplatePdf ? buildPrintableHtml(selectedTemplatePdf) : ""),
    [selectedTemplatePdf]
  );

  const folderPreviewHtml = useMemo(
    () => (selectedFolderPdf ? buildPrintableHtml(selectedFolderPdf) : ""),
    [selectedFolderPdf]
  );

  const selectedTemplateFile = useMemo(
    () => templateFiles.find((file) => file.path === selectedTemplateFilePath) ?? templateFiles[0] ?? null,
    [templateFiles, selectedTemplateFilePath]
  );

  const analysisJson = useMemo(() => (analysis ? buildAnalysisJson(analysis) : ""), [analysis]);

  const handleCopyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setErrorMsg("");
    } catch {
      setErrorMsg("클립보드 복사에 실패했습니다.");
    }
  };

  const handleDownloadTextFile = (filename: string, content: string, mime = "text/plain;charset=utf-8") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.split("/").pop() || filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async (zipName: string, files: FileData[]) => {
    try {
      setErrorMsg("");
      setProgress("ZIP 파일 생성 중...");
      const zip = new JSZip();

      files.forEach((file) => {
        zip.file(file.path, file.content);
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setProgress("ZIP 다운로드 준비 완료");
    } catch (error) {
      setStatus("error");
      setProgress("");
      setErrorMsg(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCopyAllTemplateFiles = async () => {
    try {
      const combined = buildCombinedTextFile(templateFiles);
      await navigator.clipboard.writeText(combined);
      setErrorMsg("");
    } catch {
      setErrorMsg("전체 템플릿 복사에 실패했습니다.");
    }
  };

  const handleDownloadAllTemplateFiles = () => {
    const combined = buildCombinedTextFile(templateFiles);
    handleDownloadTextFile("generated-template-all.txt", combined);
  };

  const handleCopyAllReportFiles = async () => {
    if (!analysis) return;
    try {
      const combined = buildCombinedTextFile(buildReportFiles(analysis));
      await navigator.clipboard.writeText(combined);
      setErrorMsg("");
    } catch {
      setErrorMsg("전체 리포트 복사에 실패했습니다.");
    }
  };

  const handleDownloadAllReportFiles = () => {
    if (!analysis) return;
    const combined = buildCombinedTextFile(buildReportFiles(analysis));
    handleDownloadTextFile("site-analysis-all.txt", combined);
  };

  const resetWebsiteMode = () => {
    setAnalysis(null);
    setReportPdfs([]);
    setTemplatePdfs([]);
    setTemplateFiles([]);
    setSelectedTemplateFilePath("");
    setSnapshotScreenshot("");
    setSnapshotVia("");
    setSelectedReportPdfId("");
    setSelectedTemplatePdfId("");
    setSelectedTab("overview");
    setProgress("");
    setErrorMsg("");
    setStatus("idle");
  };

  const resetFolderMode = () => {
    setFolderFiles([]);
    setFolderPdfs([]);
    setSelectedFolderPdfId("");
    setProgress("");
    setErrorMsg("");
    setStatus("idle");
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  };

  const handleAnalyzeWebsite = async () => {
    setStatus("analyzing");
    setErrorMsg("");
    setProgress("사이트 스냅샷을 가져오는 중...");
    setAnalysis(null);
    setReportPdfs([]);
    setTemplatePdfs([]);
    setTemplateFiles([]);
    setSelectedTemplateFilePath("");
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
      const generatedTemplateFiles = buildTemplateFiles(model);
      setTemplateFiles(generatedTemplateFiles);
      setSelectedTemplateFilePath(generatedTemplateFiles[0]?.path ?? "");
      const templateDocs = generatePdfs(generatedTemplateFiles, setProgress);
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

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setStatus("reading");
    setErrorMsg("");
    setProgress("폴더 파일을 읽는 중...");
    setFolderFiles([]);
    setFolderPdfs([]);
    setSelectedFolderPdfId("");

    try {
      const items: FileData[] = [];
      const total = fileList.length;

      for (let i = 0; i < total; i++) {
        const file = fileList[i];
        const relativePath =
          (file as unknown as { webkitRelativePath: string }).webkitRelativePath || file.name;

        if (shouldSkipPath(relativePath)) continue;
        if (isBinaryFile(file.name)) continue;
        if (file.size > 1024 * 1024) continue;
        if (file.size === 0) continue;

        try {
          const text = await readTextWithEncodingFallback(file);
          items.push({ path: relativePath, content: text });
        } catch {
          // skip unreadable file
        }

        if (i % 50 === 0) {
          setProgress(`폴더 읽는 중... (${i + 1}/${total})`);
        }
      }

      items.sort((a, b) => a.path.localeCompare(b.path));
      setFolderFiles(items);
      setProgress(`${items.length}개 텍스트 파일 읽기 완료`);
      setStatus("idle");
    } catch (error: unknown) {
      setStatus("error");
      setProgress("");
      setErrorMsg(error instanceof Error ? error.message : String(error));
    }
  };

  const handleGenerateFolderPdf = async () => {
    if (folderFiles.length === 0) {
      setErrorMsg("먼저 폴더를 선택해주세요.");
      return;
    }

    setStatus("generating");
    setErrorMsg("");
    setProgress("폴더 문서 PDF 생성 중...");

    try {
      const docs = generatePdfs(folderFiles, setProgress);
      setFolderPdfs(docs);
      setSelectedFolderPdfId(docs[0]?.id ?? "");
      setProgress("폴더 PDF 문서 준비 완료");
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
            사이트를 분석해 구조화된 결과와 편집 가능한 템플릿 초안을 생성하는 도구입니다.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_2fr]">
            <div>
              <h2 className="text-lg font-semibold text-gray-100">입력 모드 선택</h2>
              <p className="mt-2 text-sm text-gray-400">
                사이트 분석 또는 로컬 폴더 PDF 문서화 중 원하는 작업 흐름을 선택하세요.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                onClick={() => setInputMode("website")}
                className={
                  "rounded-xl border p-4 text-left transition-colors " +
                  (inputMode === "website"
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-gray-800 bg-gray-950 hover:border-gray-600")
                }
              >
                <p className="font-medium text-white">사이트 분석 / 템플릿 생성</p>
                <p className="mt-1 text-sm text-gray-400">
                  Render Puppeteer API를 통해 렌더링된 HTML과 스냅샷을 수집한 뒤, 리포트와 템플릿을 생성합니다.
                </p>
              </button>

              <button
                onClick={() => setInputMode("folder")}
                className={
                  "rounded-xl border p-4 text-left transition-colors " +
                  (inputMode === "folder"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-gray-800 bg-gray-950 hover:border-gray-600")
                }
              >
                <p className="font-medium text-white">로컬 폴더 PDF 문서화</p>
                <p className="mt-1 text-sm text-gray-400">
                  로컬 프로젝트의 텍스트 파일을 읽어 브라우저 인쇄 기반 PDF 문서 형태로 정리합니다.
                </p>
              </button>
            </div>
          </div>
        </section>

        {inputMode === "website" ? (
          <>
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto]">
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-blue-500"
                />
                <button
                  onClick={() => void handleAnalyzeWebsite()}
                  disabled={status === "analyzing" || status === "reading" || status === "generating"}
                  className="cursor-pointer rounded-xl bg-blue-600 px-6 py-3 font-medium whitespace-nowrap text-white transition-colors hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500"
                >
                  {status === "analyzing" ? "분석 중..." : "분석 시작"}
                </button>
                <button
                  onClick={resetWebsiteMode}
                  className="rounded-xl border border-gray-700 bg-gray-950 px-6 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-500 hover:bg-gray-800"
                >
                  초기화
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
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard title="Page Type" value={analysis.pageType} sub={analysis.title} />
                  <SummaryCard title="Blocks" value={String(analysis.blockSchemas.length)} sub="분류된 주요 블록 수" />
                  <SummaryCard title="Reports" value={String(reportPdfs.length)} sub="생성된 리포트 문서 수" />
                  <SummaryCard title="Collection" value={snapshotVia === "external-api" ? "Render API" : snapshotVia === "direct" ? "Direct Fetch" : "-"} sub={analysis.resolvedUrl} />
                </section>

                <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-white">분석 결과 워크스페이스</h2>
                      <p className="mt-1 text-sm text-gray-400">
                        원본과 생성 결과를 비교하고, 리포트/JSON/코드를 내보낼 수 있습니다.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(["overview", "report", "template", "json"] as const).map((tab) => (
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
                          {tab === "overview" && "개요"}
                          {tab === "report" && "리포트"}
                          {tab === "template" && "템플릿"}
                          {tab === "json" && "JSON"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedTab === "overview" ? (
                    <div className="mt-6 space-y-6">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5">
                          <h3 className="text-base font-semibold text-white">원본 스냅샷</h3>
                          {snapshotScreenshot ? (
                            <img
                              src={snapshotScreenshot}
                              alt="captured website"
                              className="mt-4 w-full rounded-xl border border-gray-800"
                            />
                          ) : (
                            <div className="mt-4 rounded-xl border border-dashed border-gray-700 p-8 text-sm text-gray-500">
                              스냅샷이 없습니다.
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5">
                          <h3 className="text-base font-semibold text-white">생성 기준 요약</h3>
                          <div className="mt-4 space-y-3 text-sm text-gray-300">
                            <p><span className="text-gray-500">제목:</span> {analysis.title}</p>
                            <p><span className="text-gray-500">원본 URL:</span> {analysis.sourceUrl}</p>
                            <p><span className="text-gray-500">최종 URL:</span> {analysis.resolvedUrl}</p>
                            <p><span className="text-gray-500">레이아웃 신호:</span> {analysis.layout.signals.slice(0, 3).join(", ")}</p>
                            <p><span className="text-gray-500">프레임워크 힌트:</span> {(analysis.frameworkHints.length > 0 ? analysis.frameworkHints : ["없음"]).join(", ")}</p>
                          </div>

                          <div className="mt-5">
                            <p className="text-sm font-medium text-white">주요 블록</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {analysis.blockSchemas.slice(0, 10).map((block) => (
                                <BlockChip key={block.id} label={`${block.kind} (${Math.round(block.confidence * 100)}%)`} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5">
                          <h3 className="text-base font-semibold text-white">레이아웃 / 토큰</h3>
                          <div className="mt-4 space-y-2 text-sm text-gray-300">
                            <p><span className="text-gray-500">헤더:</span> {String(analysis.layout.hasHeader)}</p>
                            <p><span className="text-gray-500">사이드바:</span> {String(analysis.layout.hasSidebar)}</p>
                            <p><span className="text-gray-500">메인:</span> {String(analysis.layout.hasMain)}</p>
                            <p><span className="text-gray-500">대표 색상:</span> {analysis.tokens.colors.slice(0, 6).join(", ") || "없음"}</p>
                            <p><span className="text-gray-500">대표 폰트:</span> {analysis.tokens.fontFamilies.slice(0, 3).join(", ") || "없음"}</p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5">
                          <h3 className="text-base font-semibold text-white">반복 패턴</h3>
                          <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-gray-300">
                            {(analysis.repeatedPatterns.length > 0 ? analysis.repeatedPatterns.slice(0, 8) : []).map((item, index) => (
                              <li key={index}>{item.parent} → {item.signature} × {item.count}</li>
                            ))}
                            {analysis.repeatedPatterns.length === 0 ? <li>반복 패턴 없음</li> : null}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {selectedTab === "report" ? (
                    <div className="mt-6 space-y-4">
                      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void handleDownloadZip("site-analysis-report.zip", buildReportFiles(analysis))}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                          >
                            리포트 ZIP 다운로드
                          </button>
                          <button
                            onClick={() => void handleCopyAllReportFiles()}
                            className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-100 transition-colors hover:border-gray-500 hover:bg-gray-800"
                          >
                            전체 리포트 복사
                          </button>
                          <button
                            onClick={handleDownloadAllReportFiles}
                            className="rounded-lg border border-blue-700 bg-blue-950 px-4 py-2 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-900"
                          >
                            전체 리포트 TXT 다운로드
                          </button>
                        </div>
                      </div>

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
                    <div className="mt-6 space-y-4">
                      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                          <h3 className="text-base font-semibold text-white">원본 vs 생성 결과</h3>
                          <p className="mt-1 text-sm text-gray-400">
                            원본 스냅샷과 생성된 템플릿을 비교해 구조 반영 품질을 확인하세요.
                          </p>

                          {snapshotScreenshot ? (
                            <img
                              src={snapshotScreenshot}
                              alt="captured website"
                              className="mt-4 w-full rounded-xl border border-gray-800"
                            />
                          ) : (
                            <div className="mt-4 rounded-xl border border-dashed border-gray-700 p-8 text-sm text-gray-500">
                              스냅샷이 없습니다.
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                          <h3 className="text-base font-semibold text-white">템플릿 내보내기</h3>
                          <p className="mt-1 text-sm text-gray-400">
                            ZIP / TXT / 전체 복사 형태로 템플릿 초안을 내보낼 수 있습니다.
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() => void handleDownloadZip("generated-template.zip", templateFiles)}
                              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                            >
                              템플릿 ZIP 다운로드
                            </button>
                            <button
                              onClick={() => void handleCopyAllTemplateFiles()}
                              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-100 transition-colors hover:border-gray-500 hover:bg-gray-800"
                            >
                              전체 템플릿 복사
                            </button>
                            <button
                              onClick={handleDownloadAllTemplateFiles}
                              className="rounded-lg border border-emerald-700 bg-emerald-950 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-900"
                            >
                              전체 템플릿 TXT 다운로드
                            </button>
                          </div>

                          <div className="mt-6">
                            <p className="text-sm font-medium text-white">핵심 블록 분류</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {analysis.blockSchemas.slice(0, 12).map((block) => (
                                <BlockChip key={block.id} label={`${block.kind} · ${block.label.slice(0, 20)}`} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {selectedTemplatePdf ? (
                        <div className="overflow-hidden rounded-xl border border-gray-800 bg-white">
                          <iframe
                            title="template preview"
                            srcDoc={templatePreviewHtml}
                            className="h-[780px] w-full bg-white"
                          />
                        </div>
                      ) : null}

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

                      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                        <div className="mb-4">
                          <h3 className="text-base font-semibold text-white">템플릿 파일 브라우저</h3>
                          <p className="mt-1 text-sm text-gray-400">
                            생성된 파일을 선택해 코드 내용을 검토하고 복사하거나 다운로드할 수 있습니다.
                          </p>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                          <div className="max-h-[700px] space-y-2 overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 p-3">
                            {templateFiles.map((file) => {
                              const active = selectedTemplateFile?.path === file.path;
                              return (
                                <button
                                  key={file.path}
                                  onClick={() => setSelectedTemplateFilePath(file.path)}
                                  className={
                                    "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                                    (active
                                      ? "border-emerald-500 bg-emerald-500/10 text-white"
                                      : "border-gray-800 bg-gray-950 text-gray-300 hover:border-gray-600")
                                  }
                                >
                                  {file.path}
                                </button>
                              );
                            })}
                          </div>

                          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
                            {selectedTemplateFile ? (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-gray-950 px-4 py-3">
                                  <div>
                                    <p className="text-sm font-medium text-white">{selectedTemplateFile.path}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      {(selectedTemplateFile.content.length / 1024).toFixed(1)} KB
                                    </p>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      onClick={() => void handleCopyText(selectedTemplateFile.content)}
                                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-100 transition-colors hover:border-gray-500 hover:bg-gray-800"
                                    >
                                      파일 내용 복사
                                    </button>

                                    <button
                                      onClick={() => handleDownloadTextFile(selectedTemplateFile.path, selectedTemplateFile.content)}
                                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                                    >
                                      파일 다운로드
                                    </button>
                                  </div>
                                </div>

                                <pre className="max-h-[640px] overflow-auto p-4 text-xs leading-6 text-gray-300">
                                  {selectedTemplateFile.content}
                                </pre>
                              </>
                            ) : (
                              <div className="p-6 text-sm text-gray-400">표시할 템플릿 파일이 없습니다.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {selectedTab === "json" ? (
                    <div className="mt-6 space-y-4">
                      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void handleCopyText(analysisJson)}
                            className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-100 transition-colors hover:border-gray-500 hover:bg-gray-800"
                          >
                            JSON 복사
                          </button>
                          <button
                            onClick={() => handleDownloadTextFile("analysis-model.json", analysisJson, "application/json;charset=utf-8")}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                          >
                            JSON 다운로드
                          </button>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
                        <pre className="overflow-x-auto p-4 text-xs leading-6 text-gray-300">{analysisJson}</pre>
                      </div>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </>
        ) : null}

        {inputMode === "folder" ? (
          <>
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-lg font-semibold text-gray-100">로컬 폴더 PDF 문서화</h2>
              <p className="mt-2 text-sm text-gray-400">
                텍스트 파일만 읽어 PDF 문서로 정리합니다. node_modules, .git, 이미지/바이너리, 1MB 초과 파일은 자동 제외됩니다.
              </p>

              {/* @ts-expect-error webkitdirectory is browser-specific */}
              <input
                ref={folderInputRef}
                type="file"
                multiple
                directory=""
                webkitdirectory="true"
                onChange={handleFolderSelect}
                className="hidden"
              />

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => folderInputRef.current?.click()}
                  disabled={status === "reading" || status === "generating" || status === "analyzing"}
                  className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500"
                >
                  {status === "reading" ? "폴더 읽는 중..." : "폴더 선택"}
                </button>

                <button
                  onClick={() => void handleGenerateFolderPdf()}
                  disabled={folderFiles.length === 0 || status === "reading" || status === "generating" || status === "analyzing"}
                  className="rounded-xl border border-gray-700 bg-gray-950 px-6 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-500 hover:bg-gray-800 disabled:border-gray-800 disabled:bg-gray-900 disabled:text-gray-500"
                >
                  {status === "generating" ? "PDF 생성 중..." : "PDF 문서 생성"}
                </button>

                <button
                  onClick={resetFolderMode}
                  className="rounded-xl border border-gray-700 bg-gray-950 px-6 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-500 hover:bg-gray-800"
                >
                  초기화
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

            {folderFiles.length > 0 ? (
              <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <h2 className="text-lg font-semibold text-gray-100">파일 목록</h2>
                <div className="mt-4 max-h-80 space-y-1 overflow-y-auto rounded-xl border border-gray-800 bg-gray-950 p-3">
                  {folderFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between gap-3 text-xs font-mono text-gray-300"
                    >
                      <span className="truncate">{file.path}</span>
                      <span className="shrink-0 text-gray-500">
                        {(file.content.length / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {folderPdfs.length > 0 ? (
              <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <h2 className="text-lg font-semibold text-gray-100">폴더 PDF 문서 미리보기</h2>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {folderPdfs.map((pdf) => {
                    const active = selectedFolderPdf?.id === pdf.id;
                    return (
                      <button
                        key={pdf.id}
                        onClick={() => setSelectedFolderPdfId(pdf.id)}
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

                {selectedFolderPdf ? (
                  <div className="mt-5 overflow-hidden rounded-xl border border-gray-800 bg-white">
                    <iframe
                      title="folder pdf preview"
                      srcDoc={folderPreviewHtml}
                      className="h-[900px] w-full bg-white"
                    />
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
