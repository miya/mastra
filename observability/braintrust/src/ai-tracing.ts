/**
 * Braintrust Exporter for Mastra AI Tracing
 *
 * This exporter sends tracing data to Braintrust for AI observability.
 * Root spans become top-level Braintrust spans (no trace wrapper).
 * Events are handled as zero-duration spans with matching start/end times.
 */

import type { AITracingExporter, AITracingEvent, AnyAISpan, LLMGenerationAttributes } from '@mastra/core/ai-tracing';
import { AISpanType, omitKeys } from '@mastra/core/ai-tracing';
import { ConsoleLogger } from '@mastra/core/logger';
import { initLogger } from 'braintrust';
import type { Span, Logger } from 'braintrust';

export interface BraintrustExporterConfig {
  /** Braintrust API key */
  apiKey: string;
  /** Optional custom endpoint */
  endpoint?: string;
  /** Enable realtime mode - flushes after each event for immediate visibility */
  realtime?: boolean;
  /** Logger level for diagnostic messages (default: 'warn') */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** Support tuning parameters */
  tuningParameters?: Record<string, any>;
}

type SpanData = {
  logger: Logger<true>; // Braintrust logger (for root spans)
  spans: Map<string, Span>; // Maps span.id to Braintrust span
};

// Default span type for all spans
const DEFAULT_SPAN_TYPE = 'task';

// Exceptions to the default mapping
const SPAN_TYPE_EXCEPTIONS: Partial<Record<AISpanType, string>> = {
  [AISpanType.LLM_GENERATION]: 'llm',
  [AISpanType.LLM_CHUNK]: 'llm',
  [AISpanType.TOOL_CALL]: 'tool',
  [AISpanType.MCP_TOOL_CALL]: 'tool',
  [AISpanType.WORKFLOW_CONDITIONAL_EVAL]: 'function',
  [AISpanType.WORKFLOW_WAIT_EVENT]: 'function',
};

// Mapping function - returns valid Braintrust span types
function mapSpanType(spanType: AISpanType): 'llm' | 'score' | 'function' | 'eval' | 'task' | 'tool' {
  return (SPAN_TYPE_EXCEPTIONS[spanType] as any) ?? DEFAULT_SPAN_TYPE;
}

export class BraintrustExporter implements AITracingExporter {
  name = 'braintrust';
  private realtime: boolean;
  private traceMap = new Map<string, SpanData>();
  private logger: ConsoleLogger;
  private config: BraintrustExporterConfig;

  constructor(config: BraintrustExporterConfig) {
    this.config = config;
    this.realtime = config.realtime ?? false;
    this.logger = new ConsoleLogger({ level: config.logLevel ?? 'warn' });
  }

  async exportEvent(event: AITracingEvent): Promise<void> {
    if (event.span.isEvent) {
      await this.handleEventSpan(event.span);
      return;
    }

    switch (event.type) {
      case 'span_started':
        await this.handleSpanStarted(event.span);
        break;
      case 'span_updated':
        await this.handleSpanUpdateOrEnd(event.span, false);
        break;
      case 'span_ended':
        await this.handleSpanUpdateOrEnd(event.span, true);
        break;
    }

    // Flush immediately in realtime mode for instant visibility
    if (this.realtime) {
      // Note: Braintrust doesn't have an explicit flush method like Langfuse
      // The data is sent automatically when spans are logged
    }
  }

  private async handleSpanStarted(span: AnyAISpan): Promise<void> {
    if (span.isRootSpan) {
      await this.initLogger(span);
    }

    const method = 'handleSpanStarted';
    const spanData = this.getSpanData({ span, method });
    if (!spanData) {
      return;
    }

    const braintrustParent = this.getBraintrustParent({ spanData, span, method });
    if (!braintrustParent) {
      return;
    }

    const payload = this.buildSpanPayload(span, true);

    // Create Braintrust span
    const braintrustSpan = braintrustParent.startSpan({
      name: span.name,
      type: mapSpanType(span.type),
      ...payload,
    });

    spanData.spans.set(span.id, braintrustSpan);
  }

  private async handleSpanUpdateOrEnd(span: AnyAISpan, isEnd: boolean): Promise<void> {
    const method = isEnd ? 'handleSpanEnd' : 'handleSpanUpdate';

    const spanData = this.getSpanData({ span, method });
    if (!spanData) {
      return;
    }

    const braintrustSpan = spanData.spans.get(span.id);
    if (!braintrustSpan) {
      this.logger.warn('Braintrust exporter: No Braintrust span found for span update/end', {
        traceId: span.traceId,
        spanId: span.id,
        spanName: span.name,
        spanType: span.type,
        isRootSpan: span.isRootSpan,
        parentSpanId: span.parent?.id,
        availableSpanIds: Array.from(spanData.spans.keys()),
        method,
      });
      return;
    }

    // Log the update to the span
    const payload = this.buildSpanPayload(span, false);

    // Log the update to the span
    braintrustSpan.log(payload);

    if (isEnd) {
      // End the span with the correct endTime
      if (span.endTime) {
        braintrustSpan.end({ endTime: span.endTime.getTime() });
      } else {
        braintrustSpan.end();
      }

      if (span.isRootSpan) {
        this.traceMap.delete(span.traceId);
      }
    }
  }

  private async handleEventSpan(span: AnyAISpan): Promise<void> {
    if (span.isRootSpan) {
      this.logger.debug('Braintrust exporter: Creating logger for event', {
        traceId: span.traceId,
        spanId: span.id,
        spanName: span.name,
        method: 'handleEventSpan',
      });
      await this.initLogger(span);
    }

    const method = 'handleEventSpan';
    const spanData = this.getSpanData({ span, method });
    if (!spanData) {
      return;
    }

    const braintrustParent = this.getBraintrustParent({ spanData, span, method });
    if (!braintrustParent) {
      return;
    }

    const payload = this.buildSpanPayload(span, true);

    // Create zero-duration span for event
    const braintrustSpan = braintrustParent.startSpan({
      name: span.name,
      type: mapSpanType(span.type),
      startTime: span.startTime.getTime(),
      ...payload,
    });

    // Immediately log output and end with same timestamp
    braintrustSpan.log(payload);

    braintrustSpan.end({ endTime: span.startTime.getTime() });
    spanData.spans.set(span.id, braintrustSpan);
  }

  private async initLogger(span: AnyAISpan): Promise<void> {
    const logger = await initLogger({
      projectName: 'mastra-tracing', // TODO: Make this configurable
      apiKey: this.config.apiKey,
      appUrl: this.config.endpoint,
      ...this.config.tuningParameters,
    });

    this.traceMap.set(span.traceId, { logger, spans: new Map() });
  }

  private getSpanData(options: { span: AnyAISpan; method: string }): SpanData | undefined {
    const { span, method } = options;
    if (this.traceMap.has(span.traceId)) {
      return this.traceMap.get(span.traceId);
    }

    this.logger.warn('Braintrust exporter: No span data found for span', {
      traceId: span.traceId,
      spanId: span.id,
      spanName: span.name,
      spanType: span.type,
      isRootSpan: span.isRootSpan,
      parentSpanId: span.parent?.id,
      method,
    });
  }

  private getBraintrustParent(options: {
    spanData: SpanData;
    span: AnyAISpan;
    method: string;
  }): Logger<true> | Span | undefined {
    const { spanData, span, method } = options;

    const parentId = span.parent?.id;
    if (!parentId) {
      return spanData.logger;
    }

    if (spanData.spans.has(parentId)) {
      return spanData.spans.get(parentId);
    }

    this.logger.warn('Braintrust exporter: No parent data found for span', {
      traceId: span.traceId,
      spanId: span.id,
      spanName: span.name,
      spanType: span.type,
      isRootSpan: span.isRootSpan,
      parentSpanId: span.parent?.id,
      method,
    });
  }

  private buildSpanPayload(span: AnyAISpan, isCreate: boolean): Record<string, any> {
    const payload: Record<string, any> = {};

    if (isCreate && span.input !== undefined) {
      payload.input = span.input;
    }

    if (span.output !== undefined) {
      payload.output = span.output;
    }

    const attributes = (span.attributes ?? {}) as Record<string, any>;

    // Strip special fields from metadata if used in top-level keys
    const attributesToOmit: string[] = [];

    if (span.type === AISpanType.LLM_GENERATION) {
      const llmAttr = attributes as LLMGenerationAttributes;

      if (llmAttr.model !== undefined) {
        payload.model = llmAttr.model;
        attributesToOmit.push('model');
      }

      if (llmAttr.usage !== undefined) {
        payload.metrics = llmAttr.usage;
        attributesToOmit.push('usage');
      }

      if (llmAttr.parameters !== undefined) {
        payload.metadata = {
          ...(payload.metadata ?? {}),
          modelParameters: llmAttr.parameters,
        };
        attributesToOmit.push('parameters');
      }
    }

    // Add span metadata
    payload.metadata = {
      ...(payload.metadata ?? {}),
      spanType: span.type,
      ...omitKeys(attributes, attributesToOmit),
      ...span.metadata,
    };

    if (span.errorInfo) {
      payload.error = span.errorInfo.message;
      payload.metadata.errorDetails = span.errorInfo;
    }

    return payload;
  }

  async shutdown(): Promise<void> {
    // End all active spans
    for (const [_traceId, spanData] of this.traceMap) {
      for (const [_spanId, span] of spanData.spans) {
        span.end();
      }
      // Loggers don't have an explicit shutdown method
    }
    this.traceMap.clear();
  }
}
