const MAX_PAGES_PER_PART = 90;
const CODE_LINES_PER_PAGE = 80;
const MAX_COLUMNS = 96;

export interface FileData {
  path: string;
  content: string;
}

export interface PrintPage {
  filePath: string;
  lines: string[];
  continuation: boolean;
  pageNumber: number;
  totalPages: number;
}

export interface PdfResult {
  id: string;
  name: string;
  fileCount: number;
  pageCount: number;
  pages: PrintPage[];
  filePaths: string[];
}

interface DraftPage {
  filePath: string;
  lines: string[];
  continuation: boolean;
}

interface PackItem {
  id: string;
  filePath: string;
  pageCount: number;
  pages: DraftPage[];
  sequence: number;
}

interface DraftPart {
  items: PackItem[];
  pageCount: number;
}

interface KnapsackState {
  value: number;
  picked: number[];
}

function isWideChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    code >= 0x1100 &&
    (
      code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    )
  );
}

function charDisplayWidth(char: string): number {
  if (char === "\t") return 4;
  return isWideChar(char) ? 2 : 1;
}

function wrapVisualLine(line: string, maxColumns: number): string[] {
  const normalized = line.replace(/\t/g, " ");
  if (normalized.length === 0) return [""];
  const wrapped: string[] = [];
  let current = "";
  let width = 0;

  for (const char of Array.from(normalized)) {
    const charWidth = charDisplayWidth(char);
    if (width + charWidth > maxColumns) {
      wrapped.push(current);
      current = char;
      width = charWidth;
      continue;
    }
    current += char;
    width += charWidth;
  }

  if (current.length > 0 || wrapped.length === 0) {
    wrapped.push(current);
  }

  return wrapped;
}

function contentToWrappedLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.split("\n");
  const wrappedLines: string[] = [];

  for (const rawLine of rawLines) {
    wrappedLines.push(...wrapVisualLine(rawLine, MAX_COLUMNS));
  }

  return wrappedLines.length > 0 ? wrappedLines : [""];
}

function buildFilePages(file: FileData): DraftPage[] {
  const wrappedLines = contentToWrappedLines(file.content);
  const pages: DraftPage[] = [];

  for (let start = 0; start < wrappedLines.length; start += CODE_LINES_PER_PAGE) {
    pages.push({
      filePath: file.path,
      lines: wrappedLines.slice(start, start + CODE_LINES_PER_PAGE),
      continuation: start > 0
    });
  }

  if (pages.length === 0) {
    pages.push({
      filePath: file.path,
      lines: [""],
      continuation: false
    });
  }

  return pages;
}

function buildPackItems(files: FileData[], onProgress?: (msg: string) => void): PackItem[] {
  const packItems: PackItem[] = [];

  files.forEach((file, fileIndex) => {
    onProgress?.(`페이지 계산 중... (${fileIndex + 1}/${files.length})`);
    const filePages = buildFilePages(file);
    const segmentCount = Math.ceil(filePages.length / MAX_PAGES_PER_PART);

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
      const start = segmentIndex * MAX_PAGES_PER_PART;
      const segmentPages = filePages.slice(start, start + MAX_PAGES_PER_PART);

      packItems.push({
        id: `${file.path}::${segmentIndex}`,
        filePath: file.path,
        pageCount: segmentPages.length,
        pages: segmentPages,
        sequence: fileIndex * 1000 + segmentIndex
      });
    }
  });

  return packItems;
}

function pickBestSubset(items: PackItem[], capacity: number): number[] {
  const dp: Array<KnapsackState | null> = Array.from({ length: capacity + 1 }, () => null);
  dp[0] = { value: 0, picked: [] };

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];

    for (let currentCapacity = capacity; currentCapacity >= item.pageCount; currentCapacity--) {
      const previous = dp[currentCapacity - item.pageCount];
      if (!previous) continue;

      const candidateValue = previous.value + item.pageCount;
      const candidatePicked = [...previous.picked, itemIndex];
      const current = dp[currentCapacity];

      if (
        !current ||
        candidateValue > current.value ||
        (candidateValue === current.value && candidatePicked.length < current.picked.length)
      ) {
        dp[currentCapacity] = {
          value: candidateValue,
          picked: candidatePicked
        };
      }
    }
  }

  let bestState: KnapsackState | null = dp[0];

  for (let currentCapacity = 1; currentCapacity <= capacity; currentCapacity++) {
    const state = dp[currentCapacity];
    if (!state) continue;

    if (
      !bestState ||
      state.value > bestState.value ||
      (state.value === bestState.value && state.picked.length < bestState.picked.length)
    ) {
      bestState = state;
    }
  }

  return bestState?.picked ?? [];
}

function packItemsIntoParts(items: PackItem[]): DraftPart[] {
  const remaining = [...items].sort((a, b) => b.pageCount - a.pageCount || a.sequence - b.sequence);
  const draftParts: DraftPart[] = [];

  while (remaining.length > 0) {
    const selectedIndices = pickBestSubset(remaining, MAX_PAGES_PER_PART);

    if (selectedIndices.length === 0) {
      const fallbackItem = remaining.shift();
      if (!fallbackItem) break;
      draftParts.push({
        items: [fallbackItem],
        pageCount: fallbackItem.pageCount
      });
      continue;
    }

    const selectedSet = new Set(selectedIndices);
    const partItems = remaining.filter((_, index) => selectedSet.has(index));
    const nextRemaining = remaining.filter((_, index) => !selectedSet.has(index));

    draftParts.push({
      items: partItems,
      pageCount: partItems.reduce((sum, item) => sum + item.pageCount, 0)
    });

    remaining.length = 0;
    remaining.push(...nextRemaining);
  }

  return draftParts
    .map((part) => ({
      ...part,
      items: [...part.items].sort((a, b) => a.sequence - b.sequence)
    }))
    .sort((a, b) => {
      const aSequence = Math.min(...a.items.map((item) => item.sequence));
      const bSequence = Math.min(...b.items.map((item) => item.sequence));
      return aSequence - bSequence || b.pageCount - a.pageCount;
    });
}

function createPart(index: number, part: DraftPart, totalParts: number): PdfResult {
  const pages = part.items.flatMap((item) => item.pages);
  const filePaths = Array.from(new Set(part.items.map((item) => item.filePath)));

  return {
    id: `part-${index + 1}`,
    name: totalParts === 1 ? "analysis_export.pdf" : `analysis_export_part${index + 1}.pdf`,
    fileCount: filePaths.length,
    pageCount: pages.length,
    filePaths,
    pages: pages.map((page, pageIndex) => ({
      ...page,
      pageNumber: pageIndex + 1,
      totalPages: pages.length
    }))
  };
}

export function generatePdfs(files: FileData[], onProgress?: (msg: string) => void): PdfResult[] {
  if (files.length === 0) return [];
  const packItems = buildPackItems(files, onProgress);
  onProgress?.("문서 묶음 최적화 중...");
  const draftParts = packItemsIntoParts(packItems);
  onProgress?.("문서 준비 완료");
  return draftParts.map((part, index) => createPart(index, part, draftParts.length));
}
