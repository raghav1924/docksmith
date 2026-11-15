import { DockerInstruction, DockerStage, InstructionType, ParsedDockerfile } from './types.js';

export class DockerfileParser {
  private static readonly INSTRUCTION_REGEX = /^(FROM|RUN|COPY|ADD|ENV|ARG|WORKDIR|USER|EXPOSE|ENTRYPOINT|CMD|HEALTHCHECK|LABEL|VOLUME|STOPSIGNAL|ONBUILD|SHELL)\b/i;

  /**
   * Parse raw Dockerfile content into structured stages and instructions.
   */
  public static parse(rawContent: string, filePath = 'Dockerfile'): ParsedDockerfile {
    const rawLines = rawContent.split(/\r?\n/);
    const fileName = filePath.split(/[/\\]/).pop() || 'Dockerfile';

    const allInstructions: DockerInstruction[] = [];
    const stages: DockerStage[] = [];

    let currentStage: DockerStage | null = null;
    let i = 0;

    while (i < rawLines.length) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      // Check for instruction match
      const match = trimmed.match(this.INSTRUCTION_REGEX);
      if (match) {
        const startLine = i + 1;
        const verb = match[1].toUpperCase() as InstructionType;
        let combined = trimmed.slice(verb.length).trim();
        let rawAccumulator = line;

        // Handle line continuations (trailing \)
        while (combined.endsWith('\\') && i + 1 < rawLines.length) {
          combined = combined.slice(0, -1).trimEnd();
          i++;
          const nextLine = rawLines[i];
          rawAccumulator += '\n' + nextLine;
          combined += ' ' + nextLine.trim();
        }

        // Parse flags (e.g. --from=builder, --chown=node:node)
        const flags: Record<string, string> = {};
        let remainingArgs = combined;

        while (remainingArgs.startsWith('--')) {
          const spaceIdx = remainingArgs.indexOf(' ');
          const flagToken = spaceIdx !== -1 ? remainingArgs.slice(0, spaceIdx) : remainingArgs;
          remainingArgs = spaceIdx !== -1 ? remainingArgs.slice(spaceIdx).trim() : '';

          const eqIdx = flagToken.indexOf('=');
          if (eqIdx !== -1) {
            const flagKey = flagToken.slice(2, eqIdx).trim();
            const flagVal = flagToken.slice(eqIdx + 1).trim();
            flags[flagKey] = flagVal;
          } else {
            flags[flagToken.slice(2)] = 'true';
          }
        }

        const instructionObj: DockerInstruction = {
          line: startLine,
          raw: rawAccumulator,
          instruction: verb,
          args: remainingArgs,
          flags,
          stageIndex: currentStage ? currentStage.index : 0,
        };

        // If FROM, finalize previous stage and open new stage
        if (verb === 'FROM') {
          const fromParsed = this.parseFromArgs(remainingArgs);
          const newStageIndex = stages.length;

          currentStage = {
            index: newStageIndex,
            name: fromParsed.stageName,
            baseImage: fromParsed.image,
            baseTag: fromParsed.tag,
            instructions: [],
            hasHealthcheck: false,
            copiedFromStages: [],
          };
          instructionObj.stageIndex = newStageIndex;
          stages.push(currentStage);
        }

        if (currentStage) {
          currentStage.instructions.push(instructionObj);

          if (verb === 'USER') {
            currentStage.user = remainingArgs.trim();
          } else if (verb === 'HEALTHCHECK') {
            currentStage.hasHealthcheck = true;
          } else if (verb === 'COPY' && flags['from']) {
            currentStage.copiedFromStages.push(flags['from']);
          }
        }

        allInstructions.push(instructionObj);
      }

      i++;
    }

    return {
      filePath,
      fileName,
      stages,
      allInstructions,
      rawContent,
      lines: rawLines,
    };
  }

  private static parseFromArgs(args: string): { image: string; tag?: string; stageName?: string } {
    let clean = args.trim();
    let stageName: string | undefined;

    // Check for "AS <name>"
    const asMatch = clean.match(/\s+as\s+([a-zA-Z0-9_-]+)$/i);
    if (asMatch) {
      stageName = asMatch[1];
      clean = clean.slice(0, asMatch.index).trim();
    }

    // Split image and tag / digest
    let image = clean;
    let tag: string | undefined;

    if (clean.includes('@')) {
      const parts = clean.split('@');
      image = parts[0];
      tag = '@' + parts[1];
    } else if (clean.includes(':')) {
      const parts = clean.split(':');
      image = parts[0];
      tag = parts[1];
    }

    return { image, tag, stageName };
  }
}
