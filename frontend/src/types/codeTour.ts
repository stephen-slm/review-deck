export interface CodeTourStep {
  title: string;
  description: string;
  file: string;
  startLine?: number;
  endLine?: number;
  changeType?: "added" | "modified" | "removed" | "context";
}

export interface CodeTourData {
  title: string;
  summary?: string;
  steps: CodeTourStep[];
}
