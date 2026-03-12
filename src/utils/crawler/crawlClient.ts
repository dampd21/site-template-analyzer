export interface CrawlClientResult {
  sourceUrl: string;
  resolvedUrl: string;
  title: string;
  html: string;
  screenshot?: string;
}

export async function fetchWebsiteSnapshot(url: string): Promise<CrawlClientResult> {
  const normalized = normalizeUrl(url);

  const response = await fetch(normalized);
  if (!response.ok) {
    throw new Error(`사이트를 불러오지 못했습니다. HTTP ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const title = (doc.title || normalized).trim() || normalized;

  return {
    sourceUrl: normalized,
    resolvedUrl: response.url || normalized,
    title,
    html
  };
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("사이트 주소를 입력해주세요.");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("http 또는 https 주소만 분석할 수 있습니다.");
  }

  return url.toString();
}
