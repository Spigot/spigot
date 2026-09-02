import type { GentleRoleDefinition, GentleRoleToolScope } from './rolePrompts';
import { BASE_READ_TOOLS, WRITE_TOOLS, COMMAND_TOOLS, DELEGATE_TOOLS } from './rolePrompts';

export interface CustomAgentRoleSpec {
  id: string;
  name: string;
  group?: 'SDD' | 'Judgment Day' | 'Review' | 'Custom';
  description: string;
  toolScope: GentleRoleToolScope;
  customTools?: string[];
  systemPrompt: string;
}

export class GentleAgentBuilderService {
  private readonly customRoles = new Map<string, GentleRoleDefinition>();

  buildRole(spec: CustomAgentRoleSpec): GentleRoleDefinition {
    if (!spec.id || !spec.id.trim()) {
      throw new Error('Role ID is required');
    }
    if (!spec.name || !spec.name.trim()) {
      throw new Error('Role Name is required');
    }
    if (!spec.systemPrompt || !spec.systemPrompt.trim()) {
      throw new Error('System Prompt is required');
    }

    let allowedTools: readonly string[] = BASE_READ_TOOLS;
    switch (spec.toolScope) {
      case 'readonly':
        allowedTools = [...BASE_READ_TOOLS];
        break;
      case 'readwrite':
        allowedTools = [...BASE_READ_TOOLS, ...WRITE_TOOLS];
        break;
      case 'verify':
        allowedTools = [...BASE_READ_TOOLS, ...COMMAND_TOOLS];
        break;
      case 'full':
      case 'coordinator':
        allowedTools = [...BASE_READ_TOOLS, ...WRITE_TOOLS, ...COMMAND_TOOLS, ...DELEGATE_TOOLS];
        break;
    }

    if (spec.customTools && spec.customTools.length > 0) {
      allowedTools = Array.from(new Set([...allowedTools, ...spec.customTools]));
    }

    const roleDef: GentleRoleDefinition = {
      id: spec.id as any,
      name: spec.name,
      group: (spec.group || 'Custom') as any,
      description: spec.description || spec.name,
      toolScope: spec.toolScope,
      allowedTools,
      systemPrompt: spec.systemPrompt,
    };

    this.customRoles.set(spec.id, roleDef);
    return roleDef;
  }

  getCustomRole(id: string): GentleRoleDefinition | undefined {
    return this.customRoles.get(id);
  }

  listCustomRoles(): GentleRoleDefinition[] {
    return Array.from(this.customRoles.values());
  }

  removeCustomRole(id: string): boolean {
    return this.customRoles.delete(id);
  }
}

export const gentleAgentBuilder = new GentleAgentBuilderService();
