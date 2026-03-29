import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ValidationResult {
  success: boolean;
  output: string;
}

export async function runProofOfWork(workDir: string): Promise<ValidationResult> {
  try {
    const { stdout, stderr } = await execAsync("npm test", { cwd: workDir });
    return { success: true, output: stdout + "\n" + stderr };
  } catch (error: any) {
    return { success: false, output: error.stdout + "\n" + error.stderr + "\n" + error.message };
  }
}
