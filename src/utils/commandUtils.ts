import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

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
    
    // Fallback to 'where' / 'which'
    const checkCmd = isWindows ? `where ${command}` : `which ${command}`;
    const output = execSync(checkCmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    return output.split("\n")[0].trim() || null;
  } catch {
    return null;
  }
}

export function isCommandAvailable(command: string): boolean {
  return !!getGlobalCommandPath(command);
}

export function getCommandVersion(command: string): string | null {
  try {
    const cmdPath = getGlobalCommandPath(command) || command;
    const output = execSync(`"${cmdPath}" --version`, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    return output.trim() || null;
  } catch {
    return null;
  }
}
