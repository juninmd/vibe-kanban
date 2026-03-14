import { DriverContext } from "../types.js";

export const DEBUG_LOGS_ENABLED = process.env.VIBE_DEBUG !== "0";

export function logDebugBlock(
  ctx: DriverContext,
  taskId: number,
  label: string,
  content: string | undefined,
): void {
  if (!DEBUG_LOGS_ENABLED) return;
  const text = content?.trim();
  if (!text) return;
  ctx.onLog(taskId, `[DEBUG][${label}]`);
  ctx.onLog(taskId, text);
}

export function logDebugCommand(
  ctx: DriverContext,
  taskId: number,
  command: string,
  args: string[] = [],
): void {
  if (!DEBUG_LOGS_ENABLED) return;
  const parts = [command, ...args].filter(Boolean);
  ctx.onLog(taskId, `[DEBUG][COMMAND] ${parts.join(" ")}`);
}
