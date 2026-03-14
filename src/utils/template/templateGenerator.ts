import type { AnalysisModel } from "@/types/analysis";
import type { FileData } from "@/utils/pdfGenerator";

function normalizeBlocks(model: AnalysisModel) {
  return model.blockSchemas.slice(0, 14).map((block, index) => ({
    id: block.id,
    kind: block.kind,
    title: block.label || `${block.kind}-${index + 1}`,
    description: `${block.descriptor} 기반으로 생성된 편집용 블록`,
    childrenCount: block.childrenCount,
    confidence: block.confidence,
    repeatedItemSignature: block.repeatedItemSignature || ""
  }));
}

function buildContentData(model: AnalysisModel): string {
  const blocks = normalizeBlocks(model);

  return `export const siteMeta = {
  title: ${JSON.stringify(model.title)},
  pageType: ${JSON.stringify(model.pageType)},
  sourceUrl: ${JSON.stringify(model.sourceUrl)}
};

export const blocks = ${JSON.stringify(blocks, null, 2)} as const;
`;
}

function renderBlockComponent(): string {
  return `
type Block = {
  id: string;
  kind: string;
  title: string;
  description: string;
  childrenCount: number;
  confidence: number;
  repeatedItemSignature: string;
};

function StatsCard({ block, index }: { block: Block; index: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{block.kind}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{block.title}</h3>
      <p className="mt-3 text-2xl font-bold text-sky-300">{(block.childrenCount + index + 1) * 12}</p>
      <p className="mt-2 text-sm text-slate-400">{block.description}</p>
    </div>
  );
}

function TemplateBlock({ block }: { block: Block }) {
  if (block.kind === "search-form" || block.kind === "filter-bar") {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{block.kind}</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{block.title}</h3>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
          <input
            className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
            placeholder="검색어를 입력하세요"
          />
          <select className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200">
            <option>전체</option>
            <option>옵션 1</option>
            <option>옵션 2</option>
          </select>
          <input
            className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
            placeholder="기간 / 조건"
          />
          <button className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-medium text-white">
            조회
          </button>
        </div>
      </section>
    );
  }

  if (block.kind === "table") {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Table</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{block.title}</h3>
          </div>
          <span className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
            confidence {(block.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">메모</th>
                <th className="px-4 py-3">액션</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6].map((row) => (
                <tr key={row} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3">{block.title} #{row}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-lg bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">정상</span>
                  </td>
                  <td className="px-4 py-3">예시 데이터</td>
                  <td className="px-4 py-3">
                    <button className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-200">
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (block.kind === "toast") {
    return (
      <section className="rounded-2xl border border-amber-700/40 bg-amber-900/10 p-4">
        <p className="text-xs uppercase tracking-wide text-amber-300">Notice</p>
        <p className="mt-2 text-sm text-amber-100">{block.title}</p>
        <p className="mt-1 text-sm text-amber-200/80">{block.description}</p>
      </section>
    );
  }

  if (block.kind === "list") {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">List</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{block.title}</h3>
        </div>
        <ul className="space-y-2">
          {[1, 2, 3, 4].map((item) => (
            <li key={item} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
              {block.title} item {item}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{block.kind}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{block.title}</h3>
      <p className="mt-2 text-sm text-slate-400">{block.description}</p>
      <div className="mt-4 rounded-xl bg-slate-800/70 px-3 py-2 text-xs text-slate-300">
        repeated: {block.repeatedItemSignature || "-"}
      </div>
    </section>
  );
}
`;
}

function buildAppTsx(model: AnalysisModel): string {
  const isDashboardLike =
    model.pageType === "dashboard" ||
    model.layout.hasSidebar ||
    model.blockSchemas.some((block) => ["table", "search-form", "sidebar", "stats-grid"].includes(block.kind));

  return `import { siteMeta, blocks } from "./data/content";

${renderBlockComponent()}

export default function App() {
  const sidebarBlocks = blocks.filter((block) => block.kind === "sidebar" || block.kind === "list").slice(0, 6);
  const noticeBlocks = blocks.filter((block) => block.kind === "toast");
  const statsBlocks = blocks.filter((block) => block.kind === "stats-grid" || block.kind === "card-grid").slice(0, 4);
  const formBlocks = blocks.filter((block) => block.kind === "search-form" || block.kind === "filter-bar");
  const tableBlocks = blocks.filter((block) => block.kind === "table");
  const listBlocks = blocks.filter((block) => block.kind === "list");
  const genericBlocks = blocks.filter(
    (block) => !["sidebar", "toast", "stats-grid", "card-grid", "search-form", "filter-bar", "table", "list"].includes(block.kind)
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-400">Editable Template</p>
          <h1 className="mt-2 text-2xl font-bold">{siteMeta.title}</h1>
          <p className="mt-2 text-sm text-slate-400">
            분석 기반으로 생성된 수정 가능한 템플릿 초안입니다. 블록 분류 결과를 바탕으로 관리형 화면 구조를 더 강하게 반영했습니다.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 ${isDashboardLike ? "grid gap-6 lg:grid-cols-[260px_1fr]" : "space-y-6"}">
        ${
          isDashboardLike
            ? `<aside className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm font-semibold text-white">Navigation</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {sidebarBlocks.length > 0 ? sidebarBlocks.map((block) => (
              <li key={block.id} className="rounded-lg bg-slate-800/60 px-3 py-2">
                {block.title}
              </li>
            )) : (
              <>
                <li className="rounded-lg bg-slate-800/60 px-3 py-2">대시보드</li>
                <li className="rounded-lg bg-slate-800/60 px-3 py-2">목록 조회</li>
                <li className="rounded-lg bg-slate-800/60 px-3 py-2">설정</li>
              </>
            )}
          </ul>
        </aside>`
            : ""
        }

        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-sky-500/15 to-violet-500/10 p-8">
            <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Generated Layout</p>
            <h2 className="mt-3 text-3xl font-bold text-white">원본 구조를 더 반영한 편집용 초안</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              감지된 블록 타입과 반복 패턴을 바탕으로 통계 카드, 검색 필터, 표, 리스트, 알림 영역을 재구성했습니다.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white">Primary Action</button>
              <button className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200">Secondary Action</button>
            </div>
          </div>

          {noticeBlocks.map((block) => (
            <TemplateBlock key={block.id} block={block} />
          ))}

          {statsBlocks.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {statsBlocks.map((block, index) => (
                <StatsCard key={block.id} block={block} index={index} />
              ))}
            </div>
          ) : null}

          {formBlocks.map((block) => (
            <TemplateBlock key={block.id} block={block} />
          ))}

          {tableBlocks.map((block) => (
            <TemplateBlock key={block.id} block={block} />
          ))}

          {listBlocks.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {listBlocks.map((block) => (
                <TemplateBlock key={block.id} block={block} />
              ))}
            </div>
          ) : null}

          {genericBlocks.slice(0, 4).map((block) => (
            <TemplateBlock key={block.id} block={block} />
          ))}
        </section>
      </main>
    </div>
  );
}
`;
}

function buildIndexCss(): string {
  return `@import "tailwindcss";

:root {
  color-scheme: dark;
}

html, body, #root {
  min-height: 100%;
}

body {
  margin: 0;
  background: #020617;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
`;
}

function buildMainTsx(): string {
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;
}

function buildPackageJson(): string {
  return `{
  "name": "generated-site-template",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "5.1.1",
    "@tailwindcss/vite": "4.1.17",
    "tailwindcss": "4.1.17",
    "typescript": "5.9.3",
    "vite": "7.2.4"
  }
}
`;
}

function buildViteConfig(): string {
  return `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()]
});
`;
}

function buildTsConfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
`;
}

function buildIndexHtml(): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated Site Template</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function buildTemplateFiles(model: AnalysisModel): FileData[] {
  return [
    { path: "generated-template/package.json", content: buildPackageJson() },
    { path: "generated-template/tsconfig.json", content: buildTsConfig() },
    { path: "generated-template/vite.config.ts", content: buildViteConfig() },
    { path: "generated-template/index.html", content: buildIndexHtml() },
    { path: "generated-template/src/main.tsx", content: buildMainTsx() },
    { path: "generated-template/src/index.css", content: buildIndexCss() },
    { path: "generated-template/src/App.tsx", content: buildAppTsx(model) },
    { path: "generated-template/src/data/content.ts", content: buildContentData(model) }
  ];
}
