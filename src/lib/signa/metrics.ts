import raw from "@/data/model-metrics.json";

/** Shape of src/data/model-metrics.json, written by `ml/train.py`. */
export type ModelMetrics = {
  generatedAt: string;
  inputFormat: string;
  featureCount: number;
  handsSupported: number;
  datasetFiles: string[];
  samples: { raw: number; invalid: number; used: number };
  labels: string[];
  labelCounts: Record<string, number>;
  signers: number;
  sessions: number;
  evaluation: {
    strategy: string;
    groups: number;
    candidates: { name: string; accuracy: number; macroF1: number; folds: number; exportable: boolean }[];
    selected: string;
    accuracy: number;
    macroF1: number;
    perClass: { label: string; precision: number; recall: number; f1: number; support: number }[];
    confusion: { labels: string[]; matrix: number[][] };
  };
  deployment: { api: string; browser: string | null };
  warnings: string[];
};

export const metrics = raw as unknown as ModelMetrics;
