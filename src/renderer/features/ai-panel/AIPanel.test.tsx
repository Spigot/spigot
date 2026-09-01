import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panelSource = readFileSync(resolve(process.cwd(), 'src/renderer/features/ai-panel/AIPanel.tsx'), 'utf8');
const agentModeSource = readFileSync(resolve(process.cwd(), 'src/renderer/features/agent-mode/AgentModeView.tsx'), 'utf8');

describe('AIPanel chat controls', () => {
  it('keeps model selection out of the chat header and places shared controls in the bottom action toolbar', () => {
    const composerStart = panelSource.indexOf('/* Embedded Input Box */');
    const inputStart = panelSource.indexOf('/* Text Input */', composerStart);
    const toolbarStart = panelSource.indexOf('/* Bottom Action Row inside Input Box */', inputStart);
    const controlsStart = panelSource.indexOf('<ChatAgentControls mode={agentModeType} onModeChange={setAgentModeType} />', toolbarStart);

    expect(composerStart).toBeGreaterThan(-1);
    expect(controlsStart).toBeGreaterThan(toolbarStart);
    expect(panelSource.indexOf('title="Adjuntar archivo o imagen"', toolbarStart)).toBeLessThan(controlsStart);
    expect(panelSource.indexOf('title="Comandos rápidos (/)"', toolbarStart)).toBeLessThan(controlsStart);
    expect(panelSource).not.toContain('<StyledSelect');
    expect(panelSource).not.toContain('selectModel');
  });

  it('places shared controls in both Agent Mode bottom action toolbars', () => {
    const toolbarPattern = /<div className="flex flex-wrap items-center justify-between gap-2 p-3 pt-0">[\s\S]*?<ChatAgentControls mode=\{agentModeType\} onModeChange=\{setAgentModeType\} \/>/g;

    expect(agentModeSource.match(toolbarPattern)).toHaveLength(2);
  });

  it('keeps exactly the original four composer modes', () => {
    expect(panelSource).not.toContain('sdd-init');
    expect(agentModeSource).not.toContain("'jd-judge-a'");
    const controlsSource = readFileSync(resolve(process.cwd(), 'src/renderer/features/ai-panel/ChatAgentControls.tsx'), 'utf8');
    expect(controlsSource.match(/value: '/g)).toHaveLength(4);
  });

  it('uses the shared progressive renderer and anchored scroll behavior in both chat surfaces', () => {
    for (const source of [panelSource, agentModeSource]) {
      expect(source).toContain('ProgressiveMessageRenderer');
      expect(source).toContain('useScrollFollow');
      expect(source).toContain('MemoizedMessageRow');
      expect(source).not.toContain("scrollIntoView({ behavior: 'smooth' })");
    }
  });

  it('uses explicit booleans for optional stream part counts so React cannot render zero', () => {
    expect(panelSource).toContain('Boolean(incomingStreamText || useAIStore.getState().activeStreams');
    expect(agentModeSource).toContain('Boolean(incomingStreamText || useAIStore.getState().activeStreams');
  });
});
