import { DockerStage, ParsedDockerfile, StageDagNode } from './types.js';

export interface BuildGraphResult {
  nodes: StageDagNode[];
  criticalPath: string[];
  unusedStages: string[];
  mermaid: string;
  isMultiStage: boolean;
  targetStage?: string;
}

export class DockerfileGraph {
  public static build(input: ParsedDockerfile | DockerStage[]): BuildGraphResult {
    const stages = Array.isArray(input) ? input : input.stages;
    const dag = DockerfileGraph.buildDag(stages);
    const target = stages.length > 0 ? (stages[stages.length - 1].name || `stage_${stages.length - 1}`) : undefined;
    return {
      ...dag,
      isMultiStage: stages.length > 1,
      targetStage: target,
    };
  }

  public static toMermaid(graph: { mermaid: string } | DockerStage[]): string {
    if ('mermaid' in graph) {
      return graph.mermaid;
    }
    return DockerfileGraph.buildDag(graph).mermaid;
  }

  /**
   * Build a topological DAG from multi-stage Dockerfile definitions.
   */
  public static buildDag(stages: DockerStage[]): {
    nodes: StageDagNode[];
    criticalPath: string[];
    unusedStages: string[];
    mermaid: string;
  } {
    if (stages.length === 0) {
      return {
        nodes: [],
        criticalPath: [],
        unusedStages: [],
        mermaid: 'flowchart LR\n  empty["Empty Dockerfile"]',
      };
    }

    const stageNames = new Map<string, number>();
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const key = s.name ? s.name.toLowerCase() : `stage_${i}`;
      stageNames.set(key, i);
      stageNames.set(String(i), i);
    }

    const nodeMap: Record<string, StageDagNode> = {};

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const id = s.name || `stage_${i}`;
      const isTargetStage = i === stages.length - 1;

      const dependsOnSet = new Set<string>();

      // Check if baseImage is an earlier stage name
      if (s.baseImage && stageNames.has(s.baseImage.toLowerCase())) {
        const parentIdx = stageNames.get(s.baseImage.toLowerCase())!;
        if (parentIdx < i) {
          const parentStage = stages[parentIdx];
          dependsOnSet.add(parentStage.name || `stage_${parentIdx}`);
        }
      }

      // Check cross-stage copies (--from=...)
      for (const fromRef of s.copiedFromStages) {
        if (stageNames.has(fromRef.toLowerCase())) {
          const parentIdx = stageNames.get(fromRef.toLowerCase())!;
          const parentStage = stages[parentIdx];
          dependsOnSet.add(parentStage.name || `stage_${parentIdx}`);
        }
      }

      nodeMap[id] = {
        id,
        name: s.name ? `${s.name} (${s.baseImage})` : `Stage ${i} (${s.baseImage})`,
        baseImage: s.baseImage + (s.baseTag ? `:${s.baseTag}` : ''),
        dependsOn: Array.from(dependsOnSet),
        dependents: [],
        depth: 0,
        isTargetStage,
      };
    }

    // Populate dependents
    for (const [id, node] of Object.entries(nodeMap)) {
      for (const dep of node.dependsOn) {
        if (nodeMap[dep]) {
          nodeMap[dep].dependents.push(id);
        }
      }
    }

    // Compute topological depth
    const depthMemo: Record<string, number> = {};
    function getDepth(id: string): number {
      if (depthMemo[id] !== undefined) return depthMemo[id];
      const deps: string[] = nodeMap[id]?.dependsOn || [];
      if (deps.length === 0) {
        depthMemo[id] = 0;
        return 0;
      }
      let maxDep = 0;
      for (const d of deps) {
        if (nodeMap[d]) {
          maxDep = Math.max(maxDep, getDepth(d) + 1);
        }
      }
      depthMemo[id] = maxDep;
      return maxDep;
    }

    for (const id of Object.keys(nodeMap)) {
      nodeMap[id].depth = getDepth(id);
    }

    // Find critical path ending at the target stage
    const targetStage = stages[stages.length - 1];
    const targetId = targetStage.name || `stage_${stages.length - 1}`;
    const criticalPath: string[] = [];

    let curr: string | undefined = targetId;
    while (curr) {
      criticalPath.unshift(curr);
      const deps: string[] = nodeMap[curr]?.dependsOn || [];
      if (deps.length === 0) break;
      let maxParent: string = deps[0];
      for (const p of deps) {
        if (nodeMap[p] && nodeMap[p].depth > nodeMap[maxParent].depth) {
          maxParent = p;
        }
      }
      curr = maxParent;
    }

    // Identify unused intermediate stages (stages that never reach the final target stage)
    const reachableFromTarget = new Set<string>();
    function markReachable(id: string) {
      reachableFromTarget.add(id);
      for (const dep of nodeMap[id]?.dependsOn || []) {
        if (!reachableFromTarget.has(dep)) {
          markReachable(dep);
        }
      }
    }
    markReachable(targetId);

    const unusedStages: string[] = [];
    for (const id of Object.keys(nodeMap)) {
      if (!reachableFromTarget.has(id)) {
        unusedStages.push(id);
      }
    }

    // Build Mermaid syntax
    const mermaidLines: string[] = ['flowchart TD'];
    for (const [id, node] of Object.entries(nodeMap)) {
      const safeLabel = node.name.replace(/"/g, "'");
      if (node.isTargetStage) {
        mermaidLines.push(`  ${id}["🎯 Target: ${safeLabel}"]:::target`);
      } else if (unusedStages.includes(id)) {
        mermaidLines.push(`  ${id}["⚠ Unused: ${safeLabel}"]:::unused`);
      } else {
        mermaidLines.push(`  ${id}["${safeLabel}"]`);
      }
    }

    for (const [id, node] of Object.entries(nodeMap)) {
      for (const dep of node.dependsOn) {
        if (nodeMap[dep]) {
          mermaidLines.push(`  ${dep} --> ${id}`);
        }
      }
    }

    mermaidLines.push('  classDef target fill:#06b6d422,stroke:#06b6d4,stroke-width:2px,color:#38bdf8;');
    mermaidLines.push('  classDef unused fill:#ef444422,stroke:#ef4444,stroke-width:2px,color:#f87171;');

    return {
      nodes: Object.values(nodeMap),
      criticalPath,
      unusedStages,
      mermaid: mermaidLines.join('\n'),
    };
  }
}

export { DockerfileGraph as MultiStageGraphBuilder };
