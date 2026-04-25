import type { ComponentType, CSSProperties } from 'react';

// Pure brand SVG components from @lobehub/icons. Importing the bare
// Mono / Color modules avoids the antd + @lobehub/ui transitive deps
// that the package's `index.js` pulls in via Avatar / Combine / Text.
import OpenAIMono from '@lobehub/icons/es/OpenAI/components/Mono';
import ClaudeColor from '@lobehub/icons/es/Claude/components/Color';
import GeminiColor from '@lobehub/icons/es/Gemini/components/Color';
import GrokMono from '@lobehub/icons/es/Grok/components/Mono';
import MistralColor from '@lobehub/icons/es/Mistral/components/Color';
import DeepSeekColor from '@lobehub/icons/es/DeepSeek/components/Color';
import QwenColor from '@lobehub/icons/es/Qwen/components/Color';
import CohereColor from '@lobehub/icons/es/Cohere/components/Color';
import PerplexityColor from '@lobehub/icons/es/Perplexity/components/Color';
import GroqMono from '@lobehub/icons/es/Groq/components/Mono';
import OllamaMono from '@lobehub/icons/es/Ollama/components/Mono';
import OpenRouterMono from '@lobehub/icons/es/OpenRouter/components/Mono';
import TogetherColor from '@lobehub/icons/es/Together/components/Color';
import NousResearchMono from '@lobehub/icons/es/NousResearch/components/Mono';
import MetaColor from '@lobehub/icons/es/Meta/components/Color';

export interface IconComponentProps {
  size?: string | number;
  style?: CSSProperties;
  className?: string;
}

export type IconComponent = ComponentType<IconComponentProps>;

interface ProviderEntry {
  Icon: IconComponent;
  /** True when the icon already ships with brand colors. */
  brandColored?: boolean;
  /** Human label used for tooltips and aria. */
  label: string;
}

/**
 * Provider/model id substring -> icon. Matched against the lowercased
 * model id. Order matters: more specific keywords (e.g. `claude`,
 * `openrouter`) appear before broader ones (e.g. `meta`, `llama`).
 */
const PROVIDER_RULES: Array<{ test: RegExp; entry: ProviderEntry }> = [
  {
    test: /(claude|anthropic)/,
    entry: { Icon: ClaudeColor, brandColored: true, label: 'Claude' },
  },
  {
    test: /(openrouter)/,
    entry: { Icon: OpenRouterMono, label: 'OpenRouter' },
  },
  {
    test: /(openai|gpt-?\d|chatgpt|^o[134](-|$)|^o1$|^o3$|^o4$)/,
    entry: { Icon: OpenAIMono, label: 'OpenAI' },
  },
  {
    test: /(gemini|google|palm|vertex)/,
    entry: { Icon: GeminiColor, brandColored: true, label: 'Gemini' },
  },
  {
    test: /(grok|xai|x-ai)/,
    entry: { Icon: GrokMono, label: 'Grok' },
  },
  {
    test: /(mistral|mixtral|codestral)/,
    entry: { Icon: MistralColor, brandColored: true, label: 'Mistral' },
  },
  {
    test: /(deepseek)/,
    entry: { Icon: DeepSeekColor, brandColored: true, label: 'DeepSeek' },
  },
  {
    test: /(qwen|alibaba|tongyi)/,
    entry: { Icon: QwenColor, brandColored: true, label: 'Qwen' },
  },
  {
    test: /(cohere|command-r)/,
    entry: { Icon: CohereColor, brandColored: true, label: 'Cohere' },
  },
  {
    test: /(perplexity|sonar)/,
    entry: { Icon: PerplexityColor, brandColored: true, label: 'Perplexity' },
  },
  {
    test: /(groq)/,
    entry: { Icon: GroqMono, label: 'Groq' },
  },
  {
    test: /(ollama)/,
    entry: { Icon: OllamaMono, label: 'Ollama' },
  },
  {
    test: /(together)/,
    entry: { Icon: TogetherColor, brandColored: true, label: 'Together' },
  },
  {
    test: /(nous|hermes)/,
    entry: { Icon: NousResearchMono, label: 'Nous Research' },
  },
  {
    test: /(meta|llama)/,
    entry: { Icon: MetaColor, brandColored: true, label: 'Meta' },
  },
];

export interface ResolvedModelIcon {
  Icon: IconComponent;
  brandColored: boolean;
  label: string;
}

/**
 * Look up the brand icon entry for a given Hermes model id. Returns
 * `null` when the provider can't be inferred so callers can render
 * their own fallback.
 */
export function resolveModelIcon(model?: string | null): ResolvedModelIcon | null {
  if (!model) return null;
  const id = model.toLowerCase();
  const hit = PROVIDER_RULES.find((r) => r.test.test(id));
  if (!hit) return null;
  return {
    Icon: hit.entry.Icon,
    brandColored: Boolean(hit.entry.brandColored),
    label: hit.entry.label,
  };
}
