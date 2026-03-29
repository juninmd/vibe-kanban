import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ValidationResult {
  success: boolean;
  output: string;
}

import { execa } from "execa";

export async function runProofOfWork(workDir: string): Promise<ValidationResult> {
  try {
    const { stdout, stderr } = await execa("npm", ["test"], { cwd: workDir });
    return { success: true, output: stdout + "\n" + stderr };
  } catch (error: any) {
    return { success: false, output: error.stdout + "\n" + error.stderr + "\n" + error.message };
  }
}
