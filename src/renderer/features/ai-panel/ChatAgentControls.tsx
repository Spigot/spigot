import { useMemo } from 'react';
import type { ChatMode } from '../../../shared/modelConfiguration';
import { useAIStore } from '../../store/aiStore';
import { StyledSelect } from './StyledSelect';

const AGENT_OPTIONS = [
  { value: 'orchestrator', label: 'Orchestrator' },
  { value: 'build', label: 'Build' },
  { value: 'plan', label: 'Plan' },
  { value: 'review', label: 'Review' },
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  openrouter: 'OpenRouter',
  minimax: 'MiniMax',
};

type ChatAgentControlsProps = {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  className?: string;
};

export function ChatAgentControls({ mode, onModeChange, className = '' }: ChatAgentControlsProps) {
  const { providers, modelConfiguration, setModeModelAssignment } = useAIStore();
  const assignment = modelConfiguration.assignments[mode];
  const modelOptions = useMemo(() => Object.entries(providers).flatMap(([providerId, provider]) => (
    provider.key.trim() ? provider.availableModels.map((modelId) => ({
      value: `${encodeURIComponent(providerId)}:${encodeURIComponent(modelId)}`,
      label: modelId,
      ariaLabel: `${modelId} (${PROVIDER_LABELS[providerId] ?? providerId})`,
      assignment: { providerId, modelId },
    })) : []
  )), [providers]);
  const selectedModel = assignment
    ? `${encodeURIComponent(assignment.providerId)}:${encodeURIComponent(assignment.modelId)}`
    : '';

  return (
    <div className={`flex items-center gap-1 ${className}`} data-testid="chat-agent-controls">
      <StyledSelect
        value={mode}
        options={AGENT_OPTIONS.map((option) => ({ ...option }))}
        onChange={(value) => onModeChange(value as ChatMode)}
        placeholder="Agent"
        ariaLabel="Select chat agent"
        className="w-[112px]"
        buttonClassName="h-7 rounded-md bg-editor-sidebar px-2 py-1 text-[11px] font-medium"
      />
      <StyledSelect
        value={selectedModel}
        options={modelOptions}
        onChange={(value) => {
          const selected = modelOptions.find((option) => option.value === value);
          if (selected) void setModeModelAssignment(mode, selected.assignment);
        }}
        placeholder="Select model"
        disabled={modelOptions.length === 0}
        searchable
        ariaLabel={`Select ${AGENT_OPTIONS.find((option) => option.value === mode)?.label ?? 'chat'} model`}
        className="min-w-[120px] max-w-[180px]"
        buttonClassName="h-7 rounded-md bg-editor-sidebar px-2 py-1 text-[11px] font-medium"
      />
    </div>
  );
}

export default ChatAgentControls;
