type InputMode = "website" | "folder";

interface ModeSelectorProps {
  inputMode: InputMode;
  onChangeMode: (mode: InputMode) => void;
}

export default function ModeSelector({ inputMode, onChangeMode }: ModeSelectorProps) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <h2 className="text-lg font-semibold text-gray-100">1. 입력 모드 선택</h2>
      <p className="mt-2 text-sm text-gray-400">
        사이트를 분석해 템플릿 초안을 만들거나, 로컬 폴더의 코드 파일을 읽어 PDF 문서 형태로 정리할 수 있습니다.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <button
          onClick={() => onChangeMode("website")}
          className={
            "rounded-xl border p-4 text-left transition-colors " +
            (inputMode === "website"
              ? "border-blue-500 bg-blue-500/10"
              : "border-gray-800 bg-gray-950 hover:border-gray-600")
          }
        >
          <p className="font-medium text-white">사이트 분석 / 템플릿 생성</p>
          <p className="mt-1 text-sm text-gray-400">
            외부 Puppeteer API로 렌더링 결과를 수집하고 JSON, 리포트, 템플릿 초안을 생성합니다.
          </p>
        </button>

        <button
          onClick={() => onChangeMode("folder")}
          className={
            "rounded-xl border p-4 text-left transition-colors " +
            (inputMode === "folder"
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-gray-800 bg-gray-950 hover:border-gray-600")
          }
        >
          <p className="font-medium text-white">로컬 폴더 PDF 문서화</p>
          <p className="mt-1 text-sm text-gray-400">
            압축을 풀어둔 코드 폴더나 로컬 프로젝트 폴더를 선택해 파일별 PDF 문서로 정리합니다.
          </p>
        </button>
      </div>
    </section>
  );
}
