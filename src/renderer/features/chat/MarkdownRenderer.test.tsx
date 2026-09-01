import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders markdown tables as structured HTML tables', () => {
    const tableMarkdown = `
| Operación | Argumentos |
|---|---|
| Sumar | 2 números |
| Multiplicar | 2 números |
`;

    const { container } = render(<MarkdownRenderer content={tableMarkdown} />);

    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getAllByRole('columnheader').length).toBe(2);
    expect(screen.getByText('Operación')).toBeDefined();
    expect(screen.getByText('Argumentos')).toBeDefined();
    expect(screen.getByText('Sumar')).toBeDefined();
    expect(screen.getByText('Multiplicar')).toBeDefined();
  });

  it('renders markdown headings', () => {
    const content = '# Título Principal\n## Subtítulo 1\n### Sección 2';
    render(<MarkdownRenderer content={content} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Título Principal');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Subtítulo 1');
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('Sección 2');
  });

  it('renders file pills and inline code tags', () => {
    const content = 'Revisá [README.md] y `package.json` para más detalles.';
    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('README.md')).toBeDefined();
    expect(screen.getByText('package.json')).toBeDefined();
  });

  it('renders bullet lists and ordered lists', () => {
    const content = '- Primer item\n- Segundo item\n\n1. Paso uno\n2. Paso dos';
    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText('Primer item')).toBeDefined();
    expect(screen.getByText('Segundo item')).toBeDefined();
    expect(screen.getByText('Paso uno')).toBeDefined();
    expect(screen.getByText('Paso dos')).toBeDefined();
  });
});
