import type { AnalysisModel } from "@/types/analysis";
import type { FileData } from "@/utils/pdfGenerator";

function buildContentData(model: AnalysisModel): string {
  const topSections = model.sections.slice(0, 8).map((section, index) => ({
    id: section.id,
    type: section.type,
    title: section.label || `${section.type}-${index + 1}`,
    description: `${section.descriptor} 기반으로 생성된 편집용 섹션`,
    childrenCount: section.childrenCount
  }));

  return `export const siteMeta = {
  title: ${JSON.stringify(model.title)},
  pageType: ${JSON.stringify(model.pageType)},
  sourceUrl: ${JSON.stringify(model.sourceUrl)}
};

export const sections = ${JSON.stringify(topSections, null, 2)} as const;
`;
}

function buildAppTsx(model: AnalysisModel): string {
  const isDashboard = model.pageType === "dashboard";

  return `import { siteMeta, sections } from "./data/content";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-400">Editable Template</p>
          <h1 className="mt-2 text-2xl font-bold">{siteMeta.title}</h1>
          <p className="mt-2 text-sm text-slate-400">
            분석 기반으로 생성된 수정 가능한 템플릿 초안입니다. 섹션과 텍스트를 자유롭게 바꿔 사용하세요.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 ${isDashboard ? "grid gap-6 md:grid-cols-[260px_1fr]" : "space-y-6"}">
        ${
          isDashboard
            ? `<aside className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm font-semibold text-white">Sidebar</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {sections.slice(0, 6).map((section) => (
              <li key={section.id} className="rounded-lg bg-slate-800/60 px-3 py-2">
                {section.title}
              </li>
            ))}
          </ul>
        </aside>`
            : ""
        }

        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-sky-500/15 to-violet-500/10 p-8">
            <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Hero Section</p>
            <h2 className="mt-3 text-3xl font-bold text-white">이 영역을 원하는 소개 문구로 바꾸세요</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              현재 템플릿은 원본 사이트의 구조 신호와 대표 블록을 바탕으로 생성되었습니다.
              이후 버튼, 카드, 표, CTA, 폼 등을 직접 추가/삭제하며 커스터마이징할 수 있습니다.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white">Primary Action</button>
              <button className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200">Secondary Action</button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => (
              <article key={section.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-xs uppercase tracking-wide text-slate-500">{section.type}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{section.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{section.description}</p>
                <div className="mt-4 rounded-xl bg-slate-800/70 px-3 py-2 text-xs text-slate-300">
                  child count: {section.childrenCount}
                </div>
              </article>
            ))}
          </div>
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
