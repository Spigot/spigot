import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubagentExecutionCard } from './SubagentExecutionCard';

describe('SubagentExecutionCard', () => {
  it('renders subagent role, label, and running status', () => {
    render(
      <SubagentExecutionCard
        role="sdd-propose"
        model="claude-sonnet-4-6"
        status="running"
      />
    );

    expect(screen.getByText('SDD: Propuesta')).toBeTruthy();
    expect(screen.getByText('sdd-propose')).toBeTruthy();
    expect(screen.getByText('(claude-sonnet-4-6)')).toBeTruthy();
    expect(screen.getByText('Ejecutando')).toBeTruthy();
  });

  it('renders completed status and allows expanding output details', () => {
    render(
      <SubagentExecutionCard
        role="sdd-design"
        status="completed"
        task="Create architecture design"
        output="Detailed design trace specifications."
      />
    );

    expect(screen.getByText('SDD: Diseño')).toBeTruthy();
    expect(screen.getByText('Completado')).toBeTruthy();

    // Details should be collapsed initially
    expect(screen.queryByText('Salida del subagente:')).toBeNull();

    // Click to expand details
    fireEvent.click(screen.getByText('SDD: Diseño'));

    expect(screen.getByText('Salida del subagente:')).toBeTruthy();
    expect(screen.getByText('Detailed design trace specifications.')).toBeTruthy();
    expect(screen.getByText('Tarea delegada:')).toBeTruthy();
    expect(screen.getByText('Create architecture design')).toBeTruthy();
  });

  it('renders error status with error message when expanded', () => {
    render(
      <SubagentExecutionCard
        role="sdd-tasks"
        status="error"
        error="[Error en Subagente sdd-tasks]: No API key configured."
      />
    );

    expect(screen.getByText('Error')).toBeTruthy();
    fireEvent.click(screen.getByText('SDD: Tareas'));
    expect(screen.getByText('[Error en Subagente sdd-tasks]: No API key configured.')).toBeTruthy();
  });
});
