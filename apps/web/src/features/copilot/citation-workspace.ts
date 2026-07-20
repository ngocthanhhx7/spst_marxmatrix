import type { Citation, RagMode, RagResponse } from './copilot.types.js';

export type CopilotWorkspaceInput =
  | {
      scope?: 'course';
      courseId: string;
      documentIds: string[];
      mode: RagMode;
      question: string;
    }
  | {
      scope: 'private';
      documentIds: string[];
      mode: RagMode;
      question: string;
    };

export type CitationWorkspace = {
  id: string;
  input: CopilotWorkspaceInput;
  response: RagResponse;
};

const workspaces = new Map<string, CitationWorkspace>();
let fallbackId = 0;

const workspaceId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  fallbackId += 1;
  return `citation-${fallbackId}`;
};

export function createCitationWorkspace(input: Omit<CitationWorkspace, 'id'>): string {
  const id = workspaceId();
  workspaces.set(id, { id, ...input });
  return id;
}

export function getCitationWorkspace(id: string | null | undefined): CitationWorkspace | undefined {
  return id === null || id === undefined ? undefined : workspaces.get(id);
}

export function getWorkspaceCitation(
  sessionId: string | null | undefined,
  chunkId: string | null | undefined,
  documentId: string | undefined,
  pageNumber: number
): Citation | undefined {
  if (chunkId === null || chunkId === undefined) return undefined;
  const citation = getCitationWorkspace(sessionId)?.response.citations.find(
    (candidate) => candidate.chunkId === chunkId
  );
  if (
    citation === undefined ||
    citation.documentId !== documentId ||
    pageNumber < citation.pageStart ||
    pageNumber > citation.pageEnd
  )
    return undefined;
  return citation;
}

export function resetCitationWorkspaces() {
  workspaces.clear();
  fallbackId = 0;
}
