import type { PdfResult } from "@/utils/pdfGenerator";

interface PdfPreviewPanelProps {
  title: string;
  description?: string;
  pdfs: PdfResult[];
  selectedPdfId: string;
  onSelectPdf: (id: string) => void;
  previewHtml: string;
  accent?: "blue" | "emerald";
  iframeHeight?: string;
}

export default function PdfPreviewPanel({
  title,
  description,
  pdfs,
  selectedPdfId,
  onSelectPdf,
  previewHtml,
  accent = "blue",
  iframeHeight = "900px"
}: PdfPreviewPanelProps) {
  const activeBorder = accent === "emerald"
    ? "border-emerald-500 bg-emerald-500/10"
    : "border-blue-500 bg-blue-500/10";

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm text-gray-400">{description}</p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {pdfs.map((pdf) => {
          const active = selectedPdfId === pdf.id;
          return (
            <button
              key={pdf.id}
              onClick={() => onSelectPdf(pdf.id)}
              className={
                "rounded-xl border p-4 text-left transition-colors " +
                (active
                  ? activeBorder
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

      {previewHtml ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-gray-800 bg-white">
          <iframe
            title={`${title} preview`}
            srcDoc={previewHtml}
            className="w-full bg-white"
            style={{ height: iframeHeight }}
          />
        </div>
      ) : null}
    </section>
  );
}
