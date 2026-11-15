export type InstructionType =
  | 'FROM'
  | 'RUN'
  | 'COPY'
  | 'ADD'
  | 'ENV'
  | 'ARG'
  | 'WORKDIR'
  | 'USER'
  | 'EXPOSE'
  | 'ENTRYPOINT'
  | 'CMD'
  | 'HEALTHCHECK'
  | 'LABEL'
  | 'VOLUME'
  | 'STOPSIGNAL'
  | 'ONBUILD'
  | 'SHELL'
  | 'MAINTAINER'
  | 'UNKNOWN';

export type FindingCategory = 'SECURITY' | 'OPTIMIZATION' | 'RELIABILITY' | 'HYGIENE';
export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface DockerInstruction {
  line: number;
  raw: string;
  instruction: InstructionType;
  args: string;
  flags: Record<string, string>;
  stageIndex: number;
}

export interface DockerStage {
  index: number;
  name?: string;
  baseImage: string;
  baseTag?: string;
  instructions: DockerInstruction[];
  user?: string;
  hasHealthcheck: boolean;
  copiedFromStages: string[];
}

export interface ParsedDockerfile {
  filePath: string;
  fileName: string;
  stages: DockerStage[];
  allInstructions: DockerInstruction[];
  rawContent: string;
  lines: string[];
}

export interface AuditFinding {
  id: string;
  ruleId?: string;
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  stageName?: string;
  stageIndex?: number;
  line: number;
  instruction?: string;
  message: string;
  remediation: string;
  autoFixSnippet?: string;
}

export interface StageDagNode {
  id: string;
  name: string;
  baseImage: string;
  dependsOn: string[];
  dependents: string[];
  depth: number;
  isTargetStage: boolean;
}

export interface DockerfileAuditReport {
  filePath: string;
  fileName: string;
  score: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  findings: AuditFinding[];
  stats: {
    totalStages: number;
    totalInstructions: number;
    layerCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  dag: {
    nodes: StageDagNode[];
    criticalPath: string[];
    mermaid: string;
  };
}
