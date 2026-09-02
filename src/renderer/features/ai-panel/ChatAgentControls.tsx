import { useMemo } from 'react';
import {
  getAssignmentEffort,
  getModelEffortCapability,
  resolveRoleAssignment,
  type ChatMode,
  type ModelEffort,
} from '../../../shared/modelConfiguration';
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
  const {
    providers,
    modelConfiguration,
    chatModelOverrides,
    setChatModelOverride,
    setChatModelOverrideEffort,
  } = useAIStore();
  const configuredAssignment = mode === 'orchestrator'
    ? resolveRoleAssignment(modelConfiguration, 'gentle-orchestrator', modelConfiguration.assignments.orchestrator)
    : modelConfiguration.assignments[mode];
  const assignment = chatModelOverrides[mode] ?? configuredAssignment;
  const capability = getModelEffortCapability(assignment);
  const effort = getAssignmentEffort(assignment);
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
          if (!selected) return;
          setChatModelOverride(mode, selected.assignment);
        }}
        placeholder="Select model"
        disabled={modelOptions.length === 0}
        searchable
        ariaLabel={`Select ${AGENT_OPTIONS.find((option) => option.value === mode)?.label ?? 'chat'} model`}
        className="min-w-[120px] max-w-[180px]"
        buttonClassName="h-7 rounded-md bg-editor-sidebar px-2 py-1 text-[11px] font-medium"
      />
      {capability && (
        <select
          value={effort ?? ''}
          onChange={(event) => {
            const nextEffort = event.target.value as ModelEffort || undefined;
            setChatModelOverrideEffort(mode, nextEffort);
          }}
          aria-label={`Select ${AGENT_OPTIONS.find((option) => option.value === mode)?.label ?? 'chat'} effort`}
          className="h-7 max-w-[100px] rounded-md border border-editor-border bg-editor-sidebar px-1.5 text-[11px] font-medium text-editor-text outline-none focus:border-editor-accent disabled:cursor-default disabled:opacity-50"
        >
          <option value="">Effort</option>
          {capability.levels.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
      )}
    </div>
  );
}

export default ChatAgentControls;
