import { type FileRefMapping, type FileRefMappingStore } from '../../fileAsset/file-refs';
import type { ToolResult } from '../../agent/tools/tool-provider.interface';
import {
  type AgentToolAsset,
  type AgentToolResult,
  type AgentToolResultTrace,
} from '../agent-tool-result.types';

export type OutputHintType = 'image' | 'video' | 'file' | 'audio' | 'document';

export interface OutputHint {
  type: OutputHintType;
  aspectRatio?: string;
}

export interface ToolProjectionModel {
  content: string;
  output?: ToolResultOutputDescriptor;
  files?: Array<{
    fileRef: string;
    type: 'image' | 'video' | 'audio' | 'file' | 'document';
    name?: string;
    mime?: string;
    size?: number;
    role?: string;
  }>;
}

export type ToolModelPayload = ToolProjectionModel;

export type ToolResultOutputKind =
  'search' | 'web_read' | 'runtime' | 'file_parse' | 'media_generate' | 'generic';

export interface ToolResultOutputDescriptor {
  kind?: ToolResultOutputKind;
}

export interface ToolResultCompactionContext {
  toolName?: string;
  displayName?: string;
  name?: string;
  status?: 'success' | 'error' | 'loading';
  type?: string;
  output?: ToolResultOutputDescriptor;
  /** Shared Service-side allocator used to keep refs unique across one turn. */
  fileRefMappingStore?: FileRefMappingStore;
}

export type ToolDisplayFilePayload = {
  type: 'image' | 'video' | 'audio' | 'file' | 'document';
  fileRef?: string;
  id?: string;
  fileId?: string;
  title?: string;
  url?: string;
  previewUrl?: string;
  downloadUrl?: string;
  fileType?: string;
  mime?: string;
  mimeType?: string;
  size?: number;
  visibility?: string;
  privateDownloadHidden?: boolean;
  privatePreviewHidden?: boolean;
  origin?: string;
  role?: string;
  preview?: {
    contentType: string;
    content?: string;
  };
};

export interface ToolDisplayPayload {
  kind?: ToolResultOutputKind;
  statusText?: string;
  summary?: string;
  publicError?: string;
  inputSummary?: string;
  details?: Array<{
    title: string;
    subtitle?: string;
    url?: string;
    snippet?: string;
    content?: string;
    domain?: string;
  }>;
  queries?: string[];
  results?: any[];
  sources?: any[];
  files?: ToolDisplayFilePayload[];

  thought?: string;
  error?: string;
  content?: string;
  message?: string;
  title?: string;
  fileType?: string;
  previewContent?: string;
  previewContentType?: string;
  downloadUrl?: string;
  filePreview?: any;
  outputHint?: OutputHint;
  estimatedProgress?: {
    percent: number;
    startedAt: number;
    elapsedMs: number;
    estimatedTotalMs: number;
    key: string;
  };
  workflowProgress?: {
    kind: string;
    stage?: string;
    label?: string;
    current?: number;
    total?: number;
  };
}

export type ToolProjectionDisplay = ToolDisplayPayload;

export interface AgentToolCallTrace {
  callId: string;
  toolName: string;
  output?: {
    kind?: ToolResultOutputKind;
  };
  inputSummary?: string;
  outputSummary?: string;
  fileRefs?: string[];
  durationMs?: number;
  status: 'success' | 'error';
  errorCode?: string;
  errorSummary?: string;
  errorMessage?: string;
}

export interface SafeDiagnostics {
  provider?: string;
  runtimeTaskType?: string;
  runtimeOperation?: string;
  outputCount?: number;
  warningCodes?: string[];
  sanitizedErrorCode?: string;
  sanitizedErrorMessage?: string;
}

export interface ToolProjectionInternal {
  fileRefs?: FileRefMapping;
  trace?: AgentToolCallTrace;
  diagnostics?: SafeDiagnostics;
}

export interface ToolProjection {
  model: ToolProjectionModel;
  display: ToolProjectionDisplay;
  internal: ToolProjectionInternal;
}

export interface LayeredToolResult extends ToolResult {
  inputSummary?: string;
  model: ToolProjectionModel;
  display: ToolProjectionDisplay;
  internal: ToolProjectionInternal;
  toolResult: AgentToolResult;
  assets?: AgentToolAsset[];
  trace?: AgentToolResultTrace;
  control?: AgentToolResult['control'];
}
