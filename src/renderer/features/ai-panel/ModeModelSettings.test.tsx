import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelConfiguration } from '../../../shared/modelConfiguration';
import { useAIStore } from '../../store/aiStore';
import { ModeModelSettingsButton } from './ModeModelSettings';
import { ChatAgentControls } from './ChatAgentControls';
import { AIPanel } from './AIPanel';
import AgentModeView from '../agent-mode/AgentModeView';

vi.mock('../terminal/ConsolePanel', () => ({ default: () => null }));

describe('ModeModelSettingsButton', () => {
  beforeEach(() => {
    (window as any).api = { store: { getRecentWorkspaces: vi.fn().mockResolvedValue([]) } };
    useAIStore.setState({
      providers: { openai: { key: 'key', activeModel: 'gpt-5', availableModels: ['gpt-5'] } },
      modelConfiguration: createModelConfiguration(undefined, { openai: 'gpt-5' }),
      setModeModelAssignment: vi.fn(),
      setModeModelEffort: vi.fn(),
      setRoleModelAssignment: vi.fn(),
      setRoleModelEffort: vi.fn(),
    });
  });

  it('is available beside the active mode and opens its settings', () => {
    render(<ModeModelSettingsButton mode="orchestrator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Configure Orchestrator model' }));

    expect(screen.getByRole('dialog', { name: 'Orchestrator model settings' })).toBeTruthy();
    expect(screen.getByText('Esfuerzo')).toBeTruthy();
  });

  it('is available from both chat surfaces', async () => {
    render(<AIPanel />);
    expect(screen.getByTestId('chat-agent-controls')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select chat agent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select Orchestrator model' })).toBeTruthy();

    cleanup();
    render(<AgentModeView />);
    expect(screen.getByTestId('chat-agent-controls')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select chat agent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select Orchestrator model' })).toBeTruthy();
    await waitFor(() => expect((window as any).api.store.getRecentWorkspaces).toHaveBeenCalled());
  });

  it('uses a temporary chat override without changing Gentle Settings', () => {
    const setChatModelOverride = vi.fn();
    const setChatModelOverrideEffort = vi.fn();
    useAIStore.setState({
      activeConversationId: 'conversation-1',
      chatModelOverrides: {},
      setChatModelOverride,
      setChatModelOverrideEffort,
      providers: {
        openai: { key: 'key', activeModel: 'gpt-5.6-terra', availableModels: ['gpt-5.6-terra'] },
        anthropic: { key: 'key', activeModel: 'claude-sonnet-4-6', availableModels: ['claude-sonnet-4-6'] },
      },
      modelConfiguration: {
        ...createModelConfiguration(undefined, { openai: 'gpt-5' }),
        assignments: { orchestrator: { providerId: 'openai', modelId: 'gpt-5' } },
        roleAssignments: { 'gentle-orchestrator': { providerId: 'openai', modelId: 'gpt-5.6-terra' } },
      },
    });
    render(<ChatAgentControls mode="orchestrator" onModeChange={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Orchestrator model' }));
    fireEvent.click(screen.getAllByRole('option', { name: 'claude-sonnet-4-6 (Anthropic)' })[0]);

    expect(setChatModelOverride).toHaveBeenCalledWith('orchestrator', {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    });
    fireEvent.change(screen.getByLabelText('Select Orchestrator effort'), { target: { value: 'high' } });
    expect(setChatModelOverrideEffort).toHaveBeenCalledWith('orchestrator', 'high');
    expect(useAIStore.getState().activeConversationId).toBe('conversation-1');
  });

  it('allows every primary agent to use a temporary chat override', () => {
    const setChatModelOverride = vi.fn();
    const setChatModelOverrideEffort = vi.fn();
    useAIStore.setState({
      setChatModelOverride,
      setChatModelOverrideEffort,
      chatModelOverrides: {},
      providers: { openai: { key: 'key', activeModel: 'gpt-5.6-terra', availableModels: ['gpt-5.6-terra'] } },
      modelConfiguration: {
        ...createModelConfiguration(undefined),
        assignments: { build: { providerId: 'openai', modelId: 'gpt-5.6-terra', effort: 'high' } },
      },
    });
    render(<ChatAgentControls mode="build" onModeChange={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Build model' }));
    fireEvent.click(screen.getByRole('option', { name: 'gpt-5.6-terra (OpenAI)' }));
    fireEvent.change(screen.getByLabelText('Select Build effort'), { target: { value: 'medium' } });

    expect(setChatModelOverride).toHaveBeenCalledWith('build', { providerId: 'openai', modelId: 'gpt-5.6-terra' });
    expect(setChatModelOverrideEffort).toHaveBeenCalledWith('build', 'medium');
  });
});
