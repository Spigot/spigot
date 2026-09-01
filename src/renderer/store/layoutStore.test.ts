import { beforeEach, describe, expect, it } from 'vitest';
import { AI_PANEL_MAX_WIDTH, AI_PANEL_MIN_WIDTH, useLayoutStore } from './layoutStore';

describe('AI panel width constraint', () => {
  beforeEach(() => {
    useLayoutStore.setState({ aiPanelWidth: AI_PANEL_MIN_WIDTH });
  });

  it('does not allow the chat panel to shrink below the composer toolbar width', () => {
    useLayoutStore.getState().setAIPanelWidth(260);

    expect(useLayoutStore.getState().aiPanelWidth).toBe(AI_PANEL_MIN_WIDTH);
  });

  it('continues to cap the panel at its supported maximum width', () => {
    useLayoutStore.getState().setAIPanelWidth(AI_PANEL_MAX_WIDTH + 1);

    expect(useLayoutStore.getState().aiPanelWidth).toBe(AI_PANEL_MAX_WIDTH);
  });
});
