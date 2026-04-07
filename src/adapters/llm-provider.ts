import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMContent,
  GenerateTextOptions,
  GenerateWithToolsOptions,
  LLMToolCallResult,
  ModelTier,
} from './types.js';

const MODEL_MAP: Record<ModelTier, string> = {
  ROUTER: 'claude-haiku-4-5-20251001',
  AGENT: 'claude-sonnet-4-6',
  WORK: 'claude-sonnet-4-6',
  EMBEDDING: '',
};

function toAnthropicMessages(
  contents: LLMContent[],
): Anthropic.MessageParam[] {
  return contents.map((c) => ({
    role: (c.role === 'model' ? 'assistant' : c.role) as 'user' | 'assistant',
    content: c.parts.map((p) => p.text ?? '').join(''),
  }));
}

export class AnthropicLLMProvider implements LLMProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateText(options: GenerateTextOptions): Promise<string> {
    const model = MODEL_MAP[options.model];
    if (!model) throw new Error(`No model configured for tier ${options.model}`);

    const response = await this.client.messages.create({
      model,
      max_tokens: 8192,
      system: options.systemInstruction || undefined,
      messages: toAnthropicMessages(options.contents),
    });

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  async generateWithTools(options: GenerateWithToolsOptions): Promise<LLMToolCallResult> {
    const model = MODEL_MAP[options.model];
    if (!model) throw new Error(`No model configured for tier ${options.model}`);

    const tools: Anthropic.Tool[] = options.tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      input_schema: (t.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool['input_schema'],
    }));

    const response = await this.client.messages.create({
      model,
      max_tokens: 8192,
      system: options.systemInstruction || undefined,
      messages: toAnthropicMessages(options.contents),
      tools,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('') || null;

    const functionCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({
        name: b.name,
        args: b.input as Record<string, unknown>,
        id: b.id,
      }));

    return { text, functionCalls, raw: response };
  }

  async embedText(_text: string): Promise<number[] | null> {
    // Anthropic has no embedding API
    return null;
  }
}
