import { useMemo, useState } from 'react';
import { Settings, X } from 'lucide-react';
import {
  getAssignmentEffort,
  getModelEffortCapability,
  type ChatMode,
  type GentleRoleId,
  type ModelAssignment,
  type ModelEffort,
} from '../../../shared/modelConfiguration';
import { useAIStore } from '../../store/aiStore';
import { StyledSelect } from './StyledSelect';

export const MODE_LABELS: Record<ChatMode, string> = {
  orchestrator: 'Orchestrator',
  build: 'Build',
  plan: 'Plan',
  review: 'Review',
};

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

type AssignmentEditorProps = {
  label: string;
  assignment: ModelAssignment | undefined;
  onAssignmentChange: (assignment: ModelAssignment) => Promise<void>;
  onEffortChange: (effort: ModelEffort | undefined) => Promise<void>;
  compact?: boolean;
};

export function AssignmentEditor({ label, assignment, onAssignmentChange, onEffortChange, compact = false }: AssignmentEditorProps) {
  const { providers } = useAIStore();
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
  const selectedValue = assignment
    ? `${encodeURIComponent(assignment.providerId)}:${encodeURIComponent(assignment.modelId)}`
    : '';

  const selectAssignment = async (value: string) => {
    const selected = modelOptions.find(option => option.value === value);
    if (selected) await onAssignmentChange(selected.assignment);
  };

  const modelControl = (
    <label className={compact ? 'block min-w-0 space-y-1.5 text-xs font-medium text-editor-text' : 'block space-y-1.5 text-xs font-medium text-editor-text'}>
      <span className={compact ? 'sm:hidden' : ''}>Modelo</span>
      <StyledSelect
        value={selectedValue}
        options={modelOptions}
        onChange={(value) => void selectAssignment(value)}
        placeholder="Seleccioná un modelo configurado"
        searchable
        ariaLabel={`${label} modelo`}
      />
    </label>
  );
  const effortControl = assignment && capability ? (
    <label className={compact ? 'block min-w-0 space-y-1.5 text-xs font-medium text-editor-text' : 'block space-y-1.5 text-xs font-medium text-editor-text'}>
      <span className={compact ? 'sm:hidden' : ''}>Esfuerzo</span>
      <select
        value={effort ?? ''}
        onChange={(event) => void onEffortChange(event.target.value as ModelEffort || undefined)}
        aria-label={`${label} esfuerzo`}
        className="w-full rounded border border-editor-border bg-editor-bg px-2 py-1.5 text-xs text-editor-text outline-none focus:border-editor-accent"
      >
        <option value="">Predeterminado del proveedor</option>
        {capability.levels.map(level => <option key={level} value={level}>{level}</option>)}
      </select>
      {!compact && <span className="block font-normal text-editor-textDark">El esfuerzo se aplica solo a esta asignación.</span>}
    </label>
  ) : (
    <p className="rounded border border-editor-border bg-editor-bg px-3 py-2 text-xs text-editor-textDark">
      No disponible
    </p>
  );

  if (compact) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.7fr)] sm:items-start sm:gap-4">
        {modelControl}
        {effortControl}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {modelControl}
      {effortControl}
    </div>
  );
}

export function ModeModelSettingsFields({ mode }: { mode: ChatMode }) {
  const { modelConfiguration, setModeModelAssignment } = useAIStore();
  return (
    <AssignmentEditor
      label={MODE_LABELS[mode]}
      assignment={modelConfiguration.assignments[mode]}
      onAssignmentChange={(assignment) => setModeModelAssignment(mode, assignment)}
      onEffortChange={async () => undefined}
    />
  );
}

export function GentleRoleSettingsFields({ role, label, compact = false }: { role: GentleRoleId; label: string; compact?: boolean }) {
  const { modelConfiguration, setRoleModelAssignment, setRoleModelEffort } = useAIStore();
  return (
    <AssignmentEditor
      label={label}
      assignment={modelConfiguration.roleAssignments[role]}
      onAssignmentChange={(assignment) => setRoleModelAssignment(role, assignment)}
      onEffortChange={(effort) => setRoleModelEffort(role, effort)}
      compact={compact}
    />
  );
}

export function ModeModelSettingsButton({ mode, className = '' }: { mode: ChatMode; className?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`p-1 rounded hover:bg-editor-hover text-editor-textDark hover:text-editor-text transition-colors ${className}`}
        aria-label={`Configure ${MODE_LABELS[mode]} model`}
        title={`Configure ${MODE_LABELS[mode]} model`}
      >
        <Settings className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-label={`${MODE_LABELS[mode]} model settings`} className="w-full max-w-md rounded-lg border border-editor-border bg-editor-sidebar shadow-2xl">
            <div className="flex items-center justify-between border-b border-editor-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-editor-text">{MODE_LABELS[mode]} model</h2>
                <p className="text-xs text-editor-textDark">This assignment is independent for this mode.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close model settings" className="p-1 text-editor-textDark hover:text-editor-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4"><ModeModelSettingsFields mode={mode} /></div>
          </div>
        </div>
      )}
    </>
  );
}

export default ModeModelSettingsButton;
