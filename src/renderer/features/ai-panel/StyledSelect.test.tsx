import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StyledSelect } from './StyledSelect';

describe('StyledSelect', () => {
  it('renders its menu in a fixed portal outside an overflow-clipped caller', () => {
    const { container } = render(
      <div className="overflow-hidden">
        <StyledSelect
          value="openai:0"
          options={[{ value: 'openai:0', label: 'gpt-4o' }]}
          onChange={vi.fn()}
          placeholder="Model"
          ariaLabel="Select chat model"
          searchable
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select chat model' }));

    const listbox = screen.getByRole('listbox');
    expect(container.contains(listbox)).toBe(false);
    expect(listbox.parentElement?.className).toContain('fixed');
    expect(listbox.parentElement?.className).toContain('z-[100]');
  });

  it('filters searchable options by their visible model name and selects with the keyboard', () => {
    const onChange = vi.fn();
    render(
      <StyledSelect
        value="openai:0"
        options={[
          { value: 'openai:0', label: 'gpt-4o' },
          { value: 'anthropic:0', label: 'claude-3-5-sonnet', ariaLabel: 'claude-3-5-sonnet (Anthropic)' },
        ]}
        onChange={onChange}
        placeholder="Model"
        ariaLabel="Select chat model"
        searchable
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select chat model' }));
    const search = screen.getByRole('textbox', { name: 'Search Select chat model' });
    fireEvent.change(search, { target: { value: 'claude' } });

    expect(screen.getByRole('option', { name: 'claude-3-5-sonnet (Anthropic)' })).toBeDefined();
    expect(screen.queryByRole('option', { name: 'gpt-4o' })).toBeNull();
    expect(screen.getByRole('listbox').textContent).not.toContain('Anthropic');

    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('anthropic:0');
  });

  it('opens upwards when positioned near the bottom of the viewport', () => {
    render(
      <StyledSelect
        value="orchestrator"
        options={[
          { value: 'orchestrator', label: 'Orchestrator' },
          { value: 'build', label: 'Build' },
        ]}
        onChange={vi.fn()}
        placeholder="Agent"
        ariaLabel="Select chat agent"
      />
    );

    const button = screen.getByRole('button', { name: 'Select chat agent' });
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      top: 850,
      bottom: 880,
      left: 20,
      right: 130,
      width: 110,
      height: 30,
      x: 20,
      y: 850,
      toJSON: () => ({}),
    });

    Object.defineProperty(window, 'innerHeight', { value: 900, writable: true, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true, configurable: true });

    fireEvent.click(button);

    const listbox = screen.getByRole('listbox');
    const menu = listbox.closest('.fixed') as HTMLElement;
    expect(menu).not.toBeNull();
    // In upward opening mode, bottom style should be set and top should not be set
    expect(menu.style.bottom).toBeTruthy();
    expect(menu.style.top).toBeFalsy();
    expect(menu.style.left).toBe('20px');
  });
});
