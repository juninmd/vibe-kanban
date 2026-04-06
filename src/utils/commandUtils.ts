import { execa } from "execa";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export interface OpenCodeResolution {
  command: string | null;
  source: "env" | "config" | "global" | "missing";
}

function readVibeConfig(cwd: string): Record<string, unknown> | null {
  try {
    const configPath = path.join(cwd, "vibe_config.json");
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

function resolveConfiguredExecutable(candidate: string | undefined, cwd: string): string | null {
  if (!candidate?.trim()) return null;

  const trimmed = candidate.trim();
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
  return fs.existsSync(resolved) ? resolved : null;
}

export function getGlobalCommandPath(command: string): string | null {
  try {
    const isWindows = process.platform === "win32";
    if (isWindows) {
      // Common pnpm global paths on Windows
      const pnpmHome = process.env.PNPM_HOME || path.join(os.homedir(), "AppData/Local/pnpm");
      const possiblePaths = [
        path.join(pnpmHome, `${command}.cmd`),
        path.join(pnpmHome, `${command}.exe`),
        // fallback to common global store if home is not set right
        path.join(os.homedir(), "AppData/Roaming/npm", `${command}.cmd`)
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
      }
    }

    // Fallback to manual PATH traversal
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of pathDirs) {
      if (!dir) continue;
      const exeExts = isWindows ? [".cmd", ".bat", ".exe", ""] : [""];
      for (const ext of exeExts) {
        const fullPath = path.join(dir, command + ext);
        if (fs.existsSync(fullPath)) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && (isWindows || (stat.mode & 0o111))) {
              return fullPath;
            }
          } catch {
            // Ignore access errors
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveOpenCodeCommand(options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): OpenCodeResolution {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;

  const envPath = resolveConfiguredExecutable(env.OPENCODE_PATH, cwd);
  if (envPath) {
    return { command: envPath, source: "env" };
  }

  const config = readVibeConfig(cwd);
  const configPath = resolveConfiguredExecutable(
    typeof config?.opencodePath === "string" ? config.opencodePath : undefined,
    cwd
  );
  if (configPath) {
    return { command: configPath, source: "config" };
  }

  const globalPath = getGlobalCommandPath("opencode");
  return globalPath
    ? { command: globalPath, source: "global" }
    : { command: null, source: "missing" };
}

export function resolveOpenCodeExecutable(options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string | null {
  return resolveOpenCodeCommand(options).command;
}

export function isCommandAvailable(command: string): boolean {
  return !!getGlobalCommandPath(command);
}

export async function getCommandVersion(command: string): Promise<string | null> {
  try {
    const cmdPath = getGlobalCommandPath(command) || command;
    const result = await execa(cmdPath, ["--version"], { encoding: "utf8", stdio: "pipe", reject: false, shell: false });
    if (result.failed || !result.stdout) return null;
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}
