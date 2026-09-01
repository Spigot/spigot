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
});
