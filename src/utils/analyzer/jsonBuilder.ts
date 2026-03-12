import type { AnalysisModel } from "@/types/analysis";

export function buildAnalysisJson(model: AnalysisModel): string {
  return JSON.stringify(model, null, 2);
}
