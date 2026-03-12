import type { AnalysisModel } from "@/types/analysis";
import type { FileData } from "@/utils/pdfGenerator";

function section(title: string, lines: string[]): string {
  return [title, "", ...lines].join("\n");
}

function list(items: string[], emptyText = "없음"): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${emptyText}`];
}

export function buildReportFiles(model: AnalysisModel): FileData[] {
  const overview = [
    `- 입력 주소: ${model.sourceUrl}`,
    `- 최종 주소: ${model.resolvedUrl}`,
    `- 제목: ${model.title}`,
    `- 페이지 타입: ${model.pageType}`,
    "",
    "프레임워크 / 구현 힌트",
    ...list(model.frameworkHints, "뚜렷한 기술 단서를 찾지 못했습니다."),
    "",
    "노트",
    ...list(model.notes)
  ].join("\n");

  const layout = [
    `- hasHeader: ${model.layout.hasHeader}`,
    `- hasNav: ${model.layout.hasNav}`,
    `- hasMain: ${model.layout.hasMain}`,
    `- hasSidebar: ${model.layout.hasSidebar}`,
    `- hasFooter: ${model.layout.hasFooter}`,
    "",
    "루트 디스크립터",
    ...list(model.layout.rootDescriptors),
    "",
    "구조 신호",
    ...list(model.layout.signals)
  ].join("\n");

  const tokens = [
    "대표 색상",
    ...list(model.tokens.colors, "색상 토큰 없음"),
    "",
    "font-family",
    ...list(model.tokens.fontFamilies, "font-family 없음"),
    "",
    "radius",
    ...list(model.tokens.radius, "radius 없음"),
    "",
    "shadow",
    ...list(model.tokens.shadows, "shadow 없음"),
    "",
    "spacing",
    ...list(model.tokens.spacing, "spacing 없음")
  ].join("\n");

  const sections = model.sections
    .map((item) => `- [${item.type}] ${item.descriptor} :: ${item.label} (children=${item.childrenCount})`)
    .join("\n");

  const repeated = model.repeatedPatterns
    .map((item) => `- ${item.parent} -> ${item.signature} x ${item.count}`)
    .join("\n");

  const blocks = model.representativeBlocks
    .map((block, index) =>
      [
        `### Block ${index + 1}`,
        `- descriptor: ${block.descriptor}`,
        `- label: ${block.label || "(없음)"}`,
        `- children: ${block.childrenCount}`,
        "",
        block.markup
      ].join("\n")
    )
    .join("\n\n");

  return [
    { path: "site-analysis/01-overview.txt", content: section("사이트 분석 개요", overview.split("\n")) },
    { path: "site-analysis/02-layout.txt", content: section("레이아웃 분석", layout.split("\n")) },
    { path: "site-analysis/03-design-tokens.txt", content: section("디자인 토큰", tokens.split("\n")) },
    {
      path: "site-analysis/04-sections.txt",
      content: section("섹션 인벤토리", sections ? sections.split("\n") : ["- 섹션 없음"])
    },
    {
      path: "site-analysis/05-repeated-patterns.txt",
      content: section("반복 패턴", repeated ? repeated.split("\n") : ["- 반복 패턴 없음"])
    },
    {
      path: "site-analysis/06-dom-outline.txt",
      content: section("DOM 윤곽", model.domOutline.length > 0 ? model.domOutline : ["- DOM outline 없음"])
    },
    {
      path: "site-analysis/07-representative-blocks.html",
      content: section("대표 블록 마크업", blocks ? blocks.split("\n") : ["- 대표 블록 없음"])
    }
  ];
}
