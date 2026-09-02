import * as path from 'path';
import * as fs from 'fs';
import { GENTLE_ROLE_IDS, type GentleRoleId } from '../../shared/modelConfiguration';

export type SDDPhase =
  | 'init'
  | 'explore'
  | 'research'
  | 'propose'
  | 'spec'
  | 'design'
  | 'tasks'
  | 'apply'
  | 'verify'
  | 'archive'
  | 'onboard';

export const SDD_PHASE_ORDER: readonly SDDPhase[] = [
  'init',
  'explore',
  'research',
  'propose',
  'spec',
  'design',
  'tasks',
  'apply',
  'verify',
  'archive',
] as const;

export const SDD_PHASE_ROLES: Record<SDDPhase, GentleRoleId> = {
  init: 'sdd-init',
  explore: 'sdd-explore',
  research: 'sdd-research',
  propose: 'sdd-propose',
  spec: 'sdd-spec',
  design: 'sdd-design',
  tasks: 'sdd-tasks',
  apply: 'sdd-apply',
  verify: 'sdd-verify',
  archive: 'sdd-archive',
  onboard: 'sdd-onboard',
};

export interface SDDArtifact {
  phase: SDDPhase;
  filePath: string;
  createdAt: number;
  contentSummary: string;
}

export interface SDDState {
  version: 1;
  currentPhase: SDDPhase;
  phaseStatus: Record<SDDPhase, 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'>;
  artifacts: SDDArtifact[];
  lastUpdated: number;
  activeTurnId?: string;
  error?: string;
}

export class SDDPipelineService {
  private readonly workspaceRoot: string;
  private readonly sddDir: string;
  private stateFile: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.sddDir = path.join(workspaceRoot, '.sdd');
    this.stateFile = path.join(this.sddDir, 'state.json');
  }

  ensureDir(): void {
    if (!fs.existsSync(this.sddDir)) {
      fs.mkdirSync(this.sddDir, { recursive: true });
    }
  }

  loadState(): SDDState {
    this.ensureDir();
    if (fs.existsSync(this.stateFile)) {
      try {
        const raw = fs.readFileSync(this.stateFile, 'utf8');
        return JSON.parse(raw) as SDDState;
      } catch {
        // Corrupted, fallback
      }
    }

    const defaultPhaseStatus = SDD_PHASE_ORDER.reduce((acc, phase) => {
      acc[phase] = 'pending';
      return acc;
    }, {} as Record<SDDPhase, 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'>);
    defaultPhaseStatus.onboard = 'pending';

    const initialState: SDDState = {
      version: 1,
      currentPhase: 'init',
      phaseStatus: defaultPhaseStatus,
      artifacts: [],
      lastUpdated: Date.now(),
    };

    this.saveState(initialState);
    return initialState;
  }

  saveState(state: SDDState): void {
    this.ensureDir();
    state.lastUpdated = Date.now();
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf8');
  }

  getNextPhase(current: SDDPhase): SDDPhase | null {
    const idx = SDD_PHASE_ORDER.indexOf(current);
    if (idx >= 0 && idx < SDD_PHASE_ORDER.length - 1) {
      return SDD_PHASE_ORDER[idx + 1];
    }
    return null;
  }

  advancePhase(state: SDDState, artifactSummary?: string): SDDState {
    const current = state.currentPhase;
    state.phaseStatus[current] = 'completed';

    if (artifactSummary) {
      state.artifacts.push({
        phase: current,
        filePath: path.join('.sdd', `${current}.md`),
        createdAt: Date.now(),
        contentSummary: artifactSummary,
      });
    }

    const next = this.getNextPhase(current);
    if (next) {
      state.currentPhase = next;
      state.phaseStatus[next] = 'in_progress';
    }

    this.saveState(state);
    return state;
  }

  failPhase(state: SDDState, error: string): SDDState {
    state.phaseStatus[state.currentPhase] = 'failed';
    state.error = error;
    this.saveState(state);
    return state;
  }

  resetPipeline(): SDDState {
    const defaultPhaseStatus = SDD_PHASE_ORDER.reduce((acc, phase) => {
      acc[phase] = 'pending';
      return acc;
    }, {} as Record<SDDPhase, 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'>);
    defaultPhaseStatus.onboard = 'pending';

    const newState: SDDState = {
      version: 1,
      currentPhase: 'init',
      phaseStatus: defaultPhaseStatus,
      artifacts: [],
      lastUpdated: Date.now(),
    };

    this.saveState(newState);
    return newState;
  }
}
