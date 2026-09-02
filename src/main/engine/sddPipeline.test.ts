import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SDDPipelineService } from './sddPipeline';

describe('SDDPipelineService', () => {
  let tmpDir: string;
  let service: SDDPipelineService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spigot-sdd-test-'));
    service = new SDDPipelineService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes and saves initial state', () => {
    const state = service.loadState();
    expect(state.currentPhase).toBe('init');
    expect(state.phaseStatus.init).toBe('pending');
    expect(fs.existsSync(path.join(tmpDir, '.sdd', 'state.json'))).toBe(true);
  });

  it('advances phases sequentially with artifacts', () => {
    let state = service.loadState();
    state = service.advancePhase(state, 'Initialization complete');
    expect(state.currentPhase).toBe('explore');
    expect(state.phaseStatus.init).toBe('completed');
    expect(state.phaseStatus.explore).toBe('in_progress');
    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts[0].phase).toBe('init');
  });

  it('resets pipeline back to init', () => {
    let state = service.loadState();
    state = service.advancePhase(state, 'Init');
    state = service.advancePhase(state, 'Explore');
    expect(state.currentPhase).toBe('research');

    const resetState = service.resetPipeline();
    expect(resetState.currentPhase).toBe('init');
    expect(resetState.phaseStatus.init).toBe('pending');
    expect(resetState.artifacts).toHaveLength(0);
  });
});
