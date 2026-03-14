import type {
  AnalysisModel,
  DesignTokenModel,
  LayoutModel,
  PageType,
  RepresentativeBlockModel,
  RepeatedPatternModel,
  SectionModel,
  SnapshotInput
} from "@/types/analysis";

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function take<T>(items: T[], limit: number): T[] {
  return items.slice(0, limit);
}

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function getElementLabel(element: Element | null): string {
  if (!element) return "";
  const htmlElement = element as HTMLElement;
  const candidates = [
    element.getAttribute("aria-label") || "",
    element.getAttribute("title") || "",
    element.getAttribute("alt") || "",
    element.getAttribute("placeholder") || "",
    element.getAttribute("name") || "",
    htmlElement.innerText || "",
    element.textContent || ""
  ];

  for (const candidate of candidates) {
    const normalized = compactWhitespace(candidate);
    if (normalized) return normalized.slice(0, 140);
  }

  return "";
}

function getElementDescriptor(element: Element): string {
  const classes = (element.getAttribute("class") || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(".");

  return [
    element.tagName.toLowerCase(),
    element.id ? `#${element.id}` : "",
    classes ? `.${classes}` : "",
    element.getAttribute("role") ? `[role=${element.getAttribute("role")}]` : ""
  ].join("");
}

function collectColors(cssText: string): string[] {
  const colorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^\)]+\)|hsla?\([^\)]+\)/g;
  return take(unique(cssText.match(colorPattern) ?? []), 40);
}

function extractCssValues(cssText: string, pattern: RegExp, limit: number): string[] {
  const matches: string[] = [];
  for (const match of cssText.matchAll(pattern)) {
    const value = compactWhitespace(match[1] || match[0] || "");
    if (value) matches.push(value);
    if (matches.length >= limit * 3) break;
  }
  return take(unique(matches), limit);
}

function buildLayout(doc: Document): LayoutModel {
  const rootDescriptors = unique(
    Array.from(doc.querySelectorAll("body > *"))
      .map((element) => getElementDescriptor(element))
      .filter(Boolean)
  );

  const signals = [
    doc.querySelector("aside,[class*='sidebar'],[class*='menu']")
      ? "사이드바 구조 후보 존재"
      : "사이드바 구조가 뚜렷하지 않음",
    doc.querySelector("header,[class*='header'],[class*='topbar']")
      ? "상단 헤더 / 탑바 후보 존재"
      : "상단 헤더 구조가 약함",
    doc.querySelector("table,[class*='table']")
      ? "테이블 또는 표형 데이터 영역 존재"
      : "테이블 데이터 영역이 뚜렷하지 않음",
    doc.querySelector("canvas,svg,[class*='chart'],[class*='graph']")
      ? "차트 / 그래프 영역 존재"
      : "차트 영역이 뚜렷하지 않음",
    doc.querySelector(".card,.panel,.tile,[class*='card'],[class*='panel']")
      ? "카드 / 패널형 위젯 구조 존재"
      : "카드 구조가 뚜렷하지 않음"
  ];

  return {
    hasHeader: Boolean(doc.querySelector("header")),
    hasNav: Boolean(doc.querySelector("nav")),
    hasMain: Boolean(doc.querySelector("main")),
    hasSidebar: Boolean(doc.querySelector("aside,[class*='sidebar']")),
    hasFooter: Boolean(doc.querySelector("footer")),
    rootDescriptors,
    signals
  };
}

function buildTokens(doc: Document): DesignTokenModel {
  const inlineCss = Array.from(doc.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .join("\n\n");

  return {
    colors: collectColors(inlineCss),
    fontFamilies: extractCssValues(inlineCss, /font-family\s*:\s*([^;{}]+)/gi, 20),
    radius: extractCssValues(inlineCss, /border-radius\s*:\s*([^;{}]+)/gi, 20),
    shadows: extractCssValues(inlineCss, /box-shadow\s*:\s*([^;{}]+)/gi, 20),
    spacing: extractCssValues(
      inlineCss,
      /(?:padding|margin|gap|max-width|min-height|height|width)\s*:\s*([^;{}]+)/gi,
      30
    )
  };
}

function buildSections(doc: Document): SectionModel[] {
  const candidates = Array.from(
    doc.querySelectorAll("header, nav, main, section, article, aside, footer, div")
  );

  return take(
    candidates
      .map((element, index) => ({
        id: `section-${index + 1}`,
        type: element.tagName.toLowerCase(),
        descriptor: getElementDescriptor(element),
        label:
          getElementLabel(element.querySelector("h1,h2,h3,h4,h5,h6")) ||
          getElementLabel(element) ||
          element.getAttribute("id") ||
          element.getAttribute("class") ||
          `section-${index + 1}`,
        childrenCount: element.children.length
      }))
      .filter((section) => Boolean(section.descriptor)),
    80
  );
}

function buildDomOutline(doc: Document): string[] {
  const lines: string[] = [];

  function visit(element: Element, depth: number) {
    if (lines.length >= 220 || depth > 6) return;
    const label = getElementLabel(element);
    const childrenCount = element.children.length;
    const bits = [label ? `text=${label.slice(0, 70)}` : "", `children=${childrenCount}`]
      .filter(Boolean)
      .join(" | ");
    lines.push(`${" ".repeat(depth)}- ${getElementDescriptor(element)}${bits ? ` :: ${bits}` : ""}`);

    Array.from(element.children)
      .slice(0, 14)
      .forEach((child) => visit(child, depth + 1));
  }

  Array.from(doc.body?.children || [])
    .slice(0, 18)
    .forEach((child) => visit(child, 0));

  return lines;
}

function collectRepeatedPatterns(doc: Document): RepeatedPatternModel[] {
  const patterns = new Map<string, RepeatedPatternModel>();

  Array.from(doc.querySelectorAll("*"))
    .slice(0, 1200)
    .forEach((parent) => {
      const groups = new Map<string, number>();

      Array.from(parent.children).forEach((child) => {
        const classPart = (child.getAttribute("class") || "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join(".");
        const signature = `${child.tagName.toLowerCase()}${classPart ? `.${classPart}` : ""}`;
        groups.set(signature, (groups.get(signature) || 0) + 1);
      });

      groups.forEach((count, signature) => {
        if (count < 2) return;
        const key = `${getElementDescriptor(parent)} -> ${signature}`;
        patterns.set(key, {
          parent: getElementDescriptor(parent),
          signature,
          count
        });
      });
    });

  return Array.from(patterns.values())
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
    .slice(0, 30);
}

function cleanMarkupClone(root: Element): Element {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll("script,noscript,style,template").forEach((node) => node.remove());
  clone.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;

      if (name.startsWith("on")) {
        node.removeAttribute(attribute.name);
        return;
      }

      if (name === "srcset") {
        node.removeAttribute(attribute.name);
        return;
      }

      if (value.startsWith("data:")) {
        node.setAttribute(attribute.name, "[data-uri]");
        return;
      }

      if (value.length > 240) {
        node.setAttribute(attribute.name, `${value.slice(0, 240)}...`);
      }
    });
  });
  return clone;
}

function prettyPrintHtml(html: string): string {
  return html.replace(/></g, ">\n<").replace(/\n{3,}/g, "\n\n").trim();
}

function scoreRepresentativeElement(element: Element): number {
  const tag = element.tagName.toLowerCase();
  const className = (element.getAttribute("class") || "").toLowerCase();
  const id = (element.getAttribute("id") || "").toLowerCase();
  const textLength = compactWhitespace(getElementLabel(element)).length;
  const childCount = element.children.length;
  const outerLength = element.outerHTML.length;

  let score = 0;

  score += Math.min(childCount, 30) * 2;
  score += Math.min(textLength, 400) / 25;
  score += Math.min(outerLength, 12000) / 600;

  if (["header", "nav", "main", "aside", "footer", "section", "article", "form", "table"].includes(tag)) {
    score += 12;
  }

  if (/sidebar|menu|nav|header|footer|content|main|container|wrap|inner|panel|card|widget|table|chart|graph|list|item|banner|hero|form|search|filter/.test(className)) {
    score += 10;
  }

  if (/content|main|table|form|search|list|dashboard/.test(id)) {
    score += 8;
  }

  if (
    element.matches(
      "[role='dialog'],table,form,canvas,svg,.card,.panel,.tile,[class*='card'],[class*='chart'],[class*='table'],[class*='form'],[class*='search']"
    )
  ) {
    score += 8;
  }

  // 잡음 요소 감점
  if (/pace|toast|spinner|loading|loader|backdrop|tooltip|modal|alert/.test(className)) {
    score -= 12;
  }
  if (/pace|toast|spinner|loading|loader|backdrop|tooltip|modal|alert/.test(id)) {
    score -= 10;
  }

  return score;
}

function buildRepresentativeBlocks(doc: Document): RepresentativeBlockModel[] {
  const candidates: Element[] = [];
  const selectors = [
    "body > *",
    "header",
    "nav",
    "aside",
    "main",
    "footer",
    "main > *",
    "section",
    "article",
    "table",
    "[role='dialog']",
    ".card,.panel,.tile,[class*='card'],[class*='panel'],[class*='widget'],[class*='chart'],[class*='table'],[class*='sidebar']"
  ];

  selectors.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((element) => {
      if (element instanceof Element) candidates.push(element);
    });
  });

  const seen = new Set<string>();

  return candidates
    .filter((element) => {
      const key = element.outerHTML.slice(0, 300);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => scoreRepresentativeElement(b) - scoreRepresentativeElement(a))
    .slice(0, 12)
    .map((element) => {
      const clone = cleanMarkupClone(element);
      return {
        descriptor: getElementDescriptor(element),
        label: getElementLabel(element),
        childrenCount: element.children.length,
        markup: truncateText(prettyPrintHtml(clone.outerHTML), 14000)
      };
    });
}

function detectFrameworkHints(html: string, doc: Document): string[] {
  const classNames = Array.from(doc.querySelectorAll("[class]"))
    .flatMap((element) => (element.getAttribute("class") || "").split(/\s+/))
    .map((name) => name.trim())
    .filter(Boolean);

  const source = [html, ...classNames].join("\n").toLowerCase();
  const hints: string[] = [];

  if (source.includes("__next_data__") || source.includes("/_next/") || source.includes("nextjs")) {
    hints.push("Next.js");
  }
  if (source.includes("data-reactroot") || source.includes("react")) {
    hints.push("React 계열");
  }
  if (source.includes("__nuxt") || source.includes("/_nuxt/")) {
    hints.push("Nuxt / Vue 계열");
  }
  if (source.includes("vue")) {
    hints.push("Vue 계열");
  }
  if (source.includes("svelte")) {
    hints.push("Svelte 계열");
  }
  if (source.includes("astro-island") || source.includes("astro")) {
    hints.push("Astro");
  }
  if (
    source.includes("tailwind") ||
    classNames.some((name) => /^(bg|text|p|m|flex|grid|gap|rounded|w|h)-/.test(name))
  ) {
    hints.push("Tailwind 유틸리티 클래스 사용 가능성");
  }
  if (source.includes("bootstrap") || classNames.includes("container") || classNames.includes("row")) {
    hints.push("Bootstrap 사용 가능성");
  }

  return unique(hints);
}

function detectPageType(doc: Document, layout: LayoutModel): PageType {
  const hasHero = Boolean(doc.querySelector("[class*='hero'], .banner, main section:first-child"));
  const hasCards = Boolean(doc.querySelector(".card,.tile,.panel,[class*='card']"));
  const hasTable = Boolean(doc.querySelector("table,[class*='table']"));
  const hasChart = Boolean(doc.querySelector("canvas,svg,[class*='chart'],[class*='graph']"));
  const articleCount = doc.querySelectorAll("article").length;
  const productHints = doc.querySelectorAll("[class*='product'], [class*='price'], [data-price]").length;

  if (layout.hasSidebar && (hasTable || hasChart || hasCards)) return "dashboard";
  if (productHints >= 2) return "commerce";
  if (articleCount >= 2) return "blog";
  if (hasHero) return "landing";
  return "generic";
}

export function analyzeSnapshot(snapshot: SnapshotInput): AnalysisModel {
  const parser = new DOMParser();
  const doc = parser.parseFromString(snapshot.html, "text/html");

  const layout = buildLayout(doc);
  const tokens = buildTokens(doc);
  const sections = buildSections(doc);
  const repeatedPatterns = collectRepeatedPatterns(doc);
  const representativeBlocks = buildRepresentativeBlocks(doc);
  const domOutline = buildDomOutline(doc);
  const frameworkHints = detectFrameworkHints(snapshot.html, doc);
  const pageType = detectPageType(doc, layout);

  return {
    sourceUrl: snapshot.sourceUrl,
    resolvedUrl: snapshot.resolvedUrl,
    title: compactWhitespace(snapshot.title || doc.title || snapshot.sourceUrl),
    pageType,
    frameworkHints,
    layout,
    tokens,
    sections,
    repeatedPatterns,
    domOutline,
    representativeBlocks,
    notes: [
      "이 분석 결과는 템플릿 초안 생성용 구조 데이터로도 사용됩니다.",
      "현재 버전은 규칙 기반 분류이며, 이후 블록 스키마와 생성 품질을 더 개선할 수 있습니다."
    ]
  };
}
