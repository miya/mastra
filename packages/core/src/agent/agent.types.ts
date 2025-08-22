import type { JSONSchema7 } from '@ai-sdk/provider';
import type { TelemetrySettings } from 'ai';
import type { ModelMessage, ToolChoice } from 'ai-v5';
import type { z, ZodSchema } from 'zod';
import type { StreamTextOnFinishCallback, StreamTextOnStepFinishCallback } from '../llm/model/base.types';
import type { LoopConfig, LoopOptions } from '../loop/types';
import type { InputProcessor, OutputProcessor } from '../processors';
import type { RuntimeContext } from '../runtime-context';
import type { MastraScorers } from '../scores';
import type { ChunkType } from '../stream/types';
import type { MessageListInput } from './message-list';
import type { AgentMemoryOption, ToolsetsInput, ToolsInput, StructuredOutputOptions } from './types';
import type { OutputSchema } from '../stream/base/schema';

export type AgentExecutionOptions<
  OUTPUT extends OutputSchema | undefined = undefined,
  STRUCTURED_OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined,
  FORMAT extends 'mastra' | 'aisdk' | undefined = undefined,
> = {
  /** Output stream format: 'mastra' (default) or 'aisdk' for AI SDK v5 compatibility */
  format?: FORMAT;

  /** Custom instructions that override the agent's default instructions for this execution */
  instructions?: string;

  /** Additional context messages to provide to the agent */
  context?: ModelMessage[];

  /** Memory configuration for conversation persistence and retrieval */
  memory?: AgentMemoryOption;

  /** Unique identifier for this execution run */
  runId?: string;

  /** Whether to save conversation state after each step (default: true) */
  savePerStep?: boolean;

  /** Runtime context containing dynamic configuration and state */
  runtimeContext?: RuntimeContext;

  /** Schema for structured output generation (Zod schema or JSON Schema) */
  output?: OUTPUT;

  /** @deprecated Use memory.resource instead. Identifier for the resource/user */
  resourceId?: string;
  /** @deprecated Use memory.thread instead. Thread identifier for conversation continuity */
  threadId?: string;

  /** Telemetry collection settings for observability @planned */
  telemetry?: TelemetrySettings;

  /** Conditions for stopping execution (e.g., step count, token limit) @planned */
  stopWhen?: LoopOptions['stopWhen'];

  /** Provider-specific options passed to the language model @planned */
  providerOptions?: LoopOptions['providerOptions'];

  /** Advanced loop configuration options (excludes callbacks) @planned */
  options?: Omit<LoopConfig, 'onStepFinish' | 'onFinish'>;

  /** Callback fired after each execution step. Type varies by format */
  onStepFinish?: FORMAT extends 'aisdk' ? StreamTextOnStepFinishCallback<any> : LoopConfig['onStepFinish'];

  /** Callback fired when execution completes. Type varies by format */
  onFinish?: FORMAT extends 'aisdk' ? StreamTextOnFinishCallback<any> : LoopConfig['onFinish'];

  /** Input processors to use for this execution (overrides agent's default) @planned */
  inputProcessors?: InputProcessor[];
  /** Output processors to use for this execution (overrides agent's default) */
  outputProcessors?: OutputProcessor[];
  /** Structured output generation with enhanced developer experience */
  structuredOutput?: STRUCTURED_OUTPUT extends z.ZodTypeAny ? StructuredOutputOptions<STRUCTURED_OUTPUT> : never;
  /** Additional tool sets that can be used for this execution */
  toolsets?: ToolsetsInput;
  /** Client-side tools available during execution */
  clientTools?: ToolsInput;
  /** Tool selection strategy: 'auto', 'none', 'required', or specific tools */
  toolChoice?: ToolChoice<any>;

  /** Model-specific settings like temperature, maxTokens, topP, etc. */
  modelSettings?: LoopOptions['modelSettings'];

  /** Evaluation scorers to run on the execution results @planned */
  scorers?: MastraScorers;
  /** Whether to return detailed scoring data in the response @planned */
  returnScorerData?: boolean;
};

export type InnerAgentExecutionOptions<
  OUTPUT extends OutputSchema | undefined = undefined,
  FORMAT extends 'aisdk' | 'mastra' | undefined = undefined,
> = AgentExecutionOptions<OUTPUT, any, FORMAT> & {
  writableStream?: WritableStream<ChunkType>;
  messages: MessageListInput;
};
