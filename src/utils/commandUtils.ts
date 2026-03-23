import { execSync } from 'child_process';

export function isCommandAvailable(command: string): boolean {
  try {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${command}` : `which ${command}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function getCommandVersion(command: string): string | null {
  try {
    const output = execSync(`${command} --version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}
