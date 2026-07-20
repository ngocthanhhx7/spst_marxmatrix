export type RagMode = 'query' | 'outline' | 'comparison' | 'critique';

export type PrivateCopilotDocument = {
  id: string;
  title: string;
  status: 'uploaded' | 'parsing' | 'parsed' | 'embedding' | 'ready' | 'failed';
  mimeType: 'application/pdf';
  originalFileName: string;
  byteSize: number;
  pageCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrivateCopilotQuery = {
  documentIds: string[];
  mode: RagMode;
  question: string;
};

export type Citation = {
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  quote: string;
};

export type RagClaim = { text: string; citationIndexes: number[] };

export type RagResponse = {
  mode: RagMode;
  answer: string;
  simulated: boolean;
  claims: RagClaim[];
  citations: Citation[];
  warning: string | null;
};
