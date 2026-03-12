export interface CrawlClientResult {
  sourceUrl: string;
  resolvedUrl: string;
  title: string;
  html: string;
  screenshot?: string;
  via: "api" | "direct";
}

interface CrawlApiResponse {
  success: boolean;
  sourceUrl?: string;
  resolvedUrl?: string;
  title?: string;
  html?: string;
  screenshot?: string;
  error?: string;
}

export async function fetchWebsiteSnapshot(url: string): Promise<CrawlClientResult> {
  const normalized = normalizeUrl(url);

  try {
    return await fetchViaApi(normalized);
  } catch {
    return await fetchDirect(normalized);
  }
}

async function fetchViaApi(url: string): Promise<CrawlClientResult> {
  const response = await fetch("/api/crawl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url })
  });

  const data = (await response.json()) as CrawlApiResponse;

  if (!response.ok || !data.success || !data.html) {
    throw new Error(data.error || `API 요청 실패: HTTP ${response.status}`);
  }

  return {
    sourceUrl: data.sourceUrl || url,
    resolvedUrl: data.resolvedUrl || url,
    title: data.title || url,
    html: data.html,
    screenshot: data.screenshot,
    via: "api"
  };
}

async function fetchDirect(url: string): Promise<CrawlClientResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`사이트를 불러오지 못했습니다. HTTP ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const title = (doc.title || url).trim() || url;

  return {
    sourceUrl: url,
    resolvedUrl: response.url || url,
    title,
    html,
    via: "direct"
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
