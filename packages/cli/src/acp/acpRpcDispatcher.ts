/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AgentLoopContext,
  AuthType,
  getVersion,
} from '@google/gemini-cli-core';
import * as acp from '@agentclientprotocol/sdk';
import { z } from 'zod';
import { SettingScope, type LoadedSettings } from '../config/settings.js';
import type { CliArgs } from '../config/config.js';
import { getAcpErrorMessage } from './acpErrors.js';
import { AcpSessionManager, type AuthDetails } from './acpSessionManager.js';

export class GeminiAgent {
  private sessionManager: AcpSessionManager;

  constructor(
    private context: AgentLoopContext,
    private settings: LoadedSettings,
    argv: CliArgs,
    connection: acp.AgentSideConnection,
  ) {
    this.sessionManager = new AcpSessionManager(settings, argv, connection);
  }

  dispose(): void {
    this.sessionManager.dispose();
  }

  async initialize(
    args: acp.InitializeRequest,
  ): Promise<acp.InitializeResponse> {
    if (args.clientCapabilities) {
      this.sessionManager.setClientCapabilities(args.clientCapabilities);
    }

    const authMethods = [
      {
        id: AuthType.AGY,
        name: 'Authenticated with AGY',
        description: 'Use the local Antigravity CLI session',
      },
    ];

    await this.context.config.initialize();
    const version = await getVersion();
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      authMethods,
      agentInfo: {
        name: 'gemini-cli',
        title: 'Gemini CLI',
        version,
      },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: true,
          audio: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
      },
    };
  }

  async authenticate(req: acp.AuthenticateRequest): Promise<void> {
    const { methodId } = req;
    const method = z.literal(AuthType.AGY).parse(methodId);
    try {
      await this.context.config.refreshAuth(method);
    } catch (e) {
      throw new acp.RequestError(-32000, getAcpErrorMessage(e));
    }
    this.settings.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      method,
    );
  }

  private getAuthDetails(): AuthDetails {
    return {};
  }

  async newSession(
    params: acp.NewSessionRequest,
  ): Promise<acp.NewSessionResponse> {
    return this.sessionManager.newSession(params, this.getAuthDetails());
  }

  async loadSession(
    params: acp.LoadSessionRequest,
  ): Promise<acp.LoadSessionResponse> {
    return this.sessionManager.loadSession(params, this.getAuthDetails());
  }

  async cancel(params: acp.CancelNotification): Promise<void> {
    const session = this.sessionManager.getSession(params.sessionId);
    if (!session) {
      throw new acp.RequestError(
        -32602,
        `Session not found: ${params.sessionId}`,
      );
    }
    await session.cancelPendingPrompt();
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const session = this.sessionManager.getSession(params.sessionId);
    if (!session) {
      throw new acp.RequestError(
        -32602,
        `Session not found: ${params.sessionId}`,
      );
    }
    return session.prompt(params);
  }

  async setSessionMode(
    params: acp.SetSessionModeRequest,
  ): Promise<acp.SetSessionModeResponse> {
    const session = this.sessionManager.getSession(params.sessionId);
    if (!session) {
      throw new acp.RequestError(
        -32602,
        `Session not found: ${params.sessionId}`,
      );
    }
    return session.setMode(params.modeId);
  }

  async unstable_setSessionModel(
    params: acp.SetSessionModelRequest,
  ): Promise<acp.SetSessionModelResponse> {
    const session = this.sessionManager.getSession(params.sessionId);
    if (!session) {
      throw new acp.RequestError(
        -32602,
        `Session not found: ${params.sessionId}`,
      );
    }
    return session.setModel(params.modelId);
  }
}
