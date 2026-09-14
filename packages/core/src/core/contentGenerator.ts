/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import type { Config } from '../config/config.js';

import type { UserTierId, GeminiUserTier } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { FakeContentGenerator } from './fakeContentGenerator.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import { AgyContentGenerator } from './agyContentGenerator.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;

  userTierName?: string;

  paidTier?: GeminiUserTier;
}

export enum AuthType {
  AGY = 'antigravity-cli',
  /** @deprecated Disabled in the Antigravity-backed fork. */
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  /** @deprecated Disabled in the Antigravity-backed fork. */
  USE_GEMINI = 'gemini-api-key',
  /** @deprecated Disabled in the Antigravity-backed fork. */
  USE_VERTEX_AI = 'vertex-ai',
  /** @deprecated Disabled in the Antigravity-backed fork. */
  LEGACY_CLOUD_SHELL = 'cloud-shell',
  /** @deprecated Disabled in the Antigravity-backed fork. */
  COMPUTE_ADC = 'compute-default-credentials',
  /** @deprecated Disabled in the Antigravity-backed fork. */
  GATEWAY = 'gateway',
}

/** Returns the only backend authentication type supported by this fork. */
export function getAuthTypeFromEnv(): AuthType | undefined {
  return AuthType.AGY;
}

export type ContentGeneratorConfig = {
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType;
  proxy?: string;
  baseUrl?: string;
  customHeaders?: Record<string, string>;
  vertexAiRouting?: VertexAiRoutingConfig;
};

export type VertexAiRequestType = 'dedicated' | 'shared';
export type VertexAiSharedRequestType = 'priority' | 'flex';

export interface VertexAiRoutingConfig {
  requestType?: VertexAiRequestType;
  sharedRequestType?: VertexAiSharedRequestType;
}

export async function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
  apiKey?: string,
  baseUrl?: string,
  customHeaders?: Record<string, string>,
  vertexAiRouting?: VertexAiRoutingConfig,
): Promise<ContentGeneratorConfig> {
  void config;
  void apiKey;
  void baseUrl;
  void customHeaders;
  void vertexAiRouting;
  return { authType: authType ?? AuthType.AGY };
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  _sessionId?: string,
): Promise<ContentGenerator> {
  const generator = await (async () => {
    if (gcConfig.fakeResponsesNonStrict) {
      const fakeGenerator = await FakeContentGenerator.fromFile(
        gcConfig.fakeResponsesNonStrict,
        { nonStrict: true },
      );
      return new LoggingContentGenerator(fakeGenerator, gcConfig);
    }
    if (gcConfig.fakeResponses) {
      const fakeGenerator = await FakeContentGenerator.fromFile(
        gcConfig.fakeResponses,
      );
      return new LoggingContentGenerator(fakeGenerator, gcConfig);
    }
    if (config.authType === AuthType.AGY) {
      return new LoggingContentGenerator(
        new AgyContentGenerator(gcConfig),
        gcConfig,
      );
    }
    throw new Error(
      `This fork only supports Antigravity CLI authentication; received ${String(config.authType)}.`,
    );
  })();

  if (gcConfig.recordResponses) {
    return new RecordingContentGenerator(generator, gcConfig.recordResponses);
  }

  return generator;
}
