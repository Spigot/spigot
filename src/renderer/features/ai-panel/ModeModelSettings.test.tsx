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

  it('assigns a model to the selected mode without changing the conversation', () => {
    const setModeModelAssignment = vi.fn();
    useAIStore.setState({
      activeConversationId: 'conversation-1',
      setModeModelAssignment,
      providers: {
        openai: { key: 'key', activeModel: 'gpt-5', availableModels: ['gpt-5'] },
        anthropic: { key: 'key', activeModel: 'gpt-5', availableModels: ['gpt-5'] },
      },
    });
    render(<ChatAgentControls mode="orchestrator" onModeChange={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Orchestrator model' }));
    fireEvent.click(screen.getAllByRole('option', { name: 'gpt-5 (Anthropic)' })[0]);

    expect(setModeModelAssignment).toHaveBeenCalledWith('orchestrator', {
      providerId: 'anthropic',
      modelId: 'gpt-5',
    });
    expect(useAIStore.getState().activeConversationId).toBe('conversation-1');
  });
});
