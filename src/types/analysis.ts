export type PageType = "landing" | "dashboard" | "blog" | "commerce" | "generic";

export interface LayoutModel {
  hasHeader: boolean;
  hasNav: boolean;
  hasMain: boolean;
  hasSidebar: boolean;
  hasFooter: boolean;
  rootDescriptors: string[];
  signals: string[];
}

export interface DesignTokenModel {
  colors: string[];
  fontFamilies: string[];
  radius: string[];
  shadows: string[];
  spacing: string[];
}

export interface SectionModel {
  id: string;
  type: string;
  descriptor: string;
  label: string;
  childrenCount: number;
}

export interface RepeatedPatternModel {
  parent: string;
  signature: string;
  count: number;
}

export interface RepresentativeBlockModel {
  descriptor: string;
  label: string;
  childrenCount: number;
  markup: string;
}

export interface AnalysisModel {
  sourceUrl: string;
  resolvedUrl: string;
  title: string;
  pageType: PageType;
  frameworkHints: string[];
  layout: LayoutModel;
  tokens: DesignTokenModel;
  sections: SectionModel[];
  repeatedPatterns: RepeatedPatternModel[];
  domOutline: string[];
  representativeBlocks: RepresentativeBlockModel[];
  notes: string[];
}

export interface SnapshotInput {
  sourceUrl: string;
  resolvedUrl: string;
  title: string;
  html: string;
  screenshot?: string;
}
