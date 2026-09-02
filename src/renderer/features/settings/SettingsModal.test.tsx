import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createModelConfiguration } from '../../../shared/modelConfiguration';
import SettingsModal from './SettingsModal';
import { useAIStore } from '../../store/aiStore';
import { useLayoutStore } from '../../store/layoutStore';

const settingsSource = readFileSync(resolve(process.cwd(), 'src/renderer/features/settings/SettingsModal.tsx'), 'utf8');
const ROLE_DESCRIPTIONS = [
  'Coordina los envíos interactivos del modo Orchestrator.',
  'Prepara el contexto de SDD y la configuración del proyecto.',
  'Realiza la primera revisión adversarial independiente.',
  'Examina riesgos de producto y seguridad que afectan a las personas usuarias.',
];

describe('SettingsModal provider configuration styles', () => {
  it('uses editor theme tokens for provider surfaces and connection status', () => {
    expect(settingsSource).toContain('bg-editor-bg/80');
    expect(settingsSource).toContain('bg-editor-hover border border-editor-accent');
    expect(settingsSource).toContain('text-editor-success');
    expect(settingsSource).toContain('text-editor-error');
    expect(settingsSource).not.toMatch(/(?:bg|text|border|hover:bg|hover:text)-(?:emerald|zinc|sky|red|white|black|blue|amber)/);
  });

  beforeEach(() => {
    useLayoutStore.setState({ isSettingsModalOpen: true });
    useAIStore.setState({
      providers: { openai: { key: 'key', activeModel: 'gpt-5', availableModels: ['gpt-5'] } },
      modelConfiguration: createModelConfiguration(undefined, { openai: 'gpt-5' }),
    });
  });

  it('groups all Gentle roles under the dedicated Orchestrator category in aligned role rows', () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Orchestrator' }));

    expect(screen.getByRole('heading', { name: 'Orchestrator' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Orquestador de Gentle AI' })).toBeTruthy();
    expect(screen.getByText('Roles de SDD (11)')).toBeTruthy();
    expect(screen.getByText('Roles de Judgment Day (3)')).toBeTruthy();
    expect(screen.getByText('Roles de Review (6)')).toBeTruthy();
    expect(screen.queryByText('Estos roles aún no se ejecutan en el entorno de ejecución actual de Spigot.')).toBeNull();
    expect(screen.getAllByText('Rol')).toHaveLength(4);
    expect(screen.getByLabelText('Orquestador de Gentle AI modelo')).toBeTruthy();
    expect(screen.getByLabelText('Orquestador de Gentle AI esfuerzo')).toBeTruthy();
    expect(screen.getByLabelText('SDD: Inicialización modelo')).toBeTruthy();
    expect(screen.getAllByText('No disponible')).toHaveLength(20);
    expect(screen.getByText('El esfuerzo solo está disponible para combinaciones de proveedor y modelo con capacidad registrada.')).toBeTruthy();
    expect(screen.queryByText('Effort is unavailable because this exact provider and model has no registered capability.')).toBeNull();
    ROLE_DESCRIPTIONS.forEach((description) => expect(screen.queryByText(description)).toBeNull());
    expect(screen.getAllByLabelText(/modelo$/i)).toHaveLength(21);
    expect(settingsSource).toContain('lg:grid-cols-[minmax(11rem,1fr)_minmax(20rem,1.8fr)_minmax(11rem,0.75fr)]');
    expect(settingsSource).toContain('grid-cols-1 gap-3');
    expect(screen.queryByRole('heading', { name: 'Build agent' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Plan agent' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Review agent' })).toBeNull();
    expect(screen.queryByText('Proveedor de Inteligencia Artificial')).toBeNull();
  });
});
