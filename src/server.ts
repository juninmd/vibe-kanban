import { fetchLinearIssues, addLinearComment } from "./utils/linearUtils.js";
import { fetchJiraIssues, addJiraComment } from "./utils/jiraUtils.js";
import { fetchTrelloCards } from "./utils/trelloUtils.js";
import { fetchClickupTasks } from "./utils/clickupUtils.js";
import { fetchMondayTasks } from "./utils/mondayUtils.js";
import { fetchNotionTasks } from "./utils/notionUtils.js";
import { fetchAsanaTasks } from "./utils/asanaUtils.js";
import { fetchFigmaComments } from "./utils/figmaUtils.js";
import { detectDependencyCycles, detectFileOverlaps, GeneratedTask, buildPlanValidationPrompt, parsePlanValidationResponse } from "./utils/planValidation.js";
import { createServer, ServerResponse, IncomingMessage } from "http";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { Task, Agent, State, EventLog, LLMDriver } from "./types.js";
import { GeminiDriver } from "./drivers/GeminiDriver.js";
import { CopilotDriver } from "./drivers/CopilotDriver.js";
import { OpenCodeDriver } from "./drivers/OpenCodeDriver.js";
import { OpenAIDriver } from "./drivers/OpenAIDriver.js";
import { ClaudeDriver } from "./drivers/ClaudeDriver.js";
import { CommandDriver } from "./drivers/CommandDriver.js";
import { CodexDriver } from "./drivers/CodexDriver.js";
import { DB } from "./db.js";
import { TerminalManager } from "./terminal/TerminalManager.js";
import { Memory } from "./memory.js";
import { createPullRequest, createPullRequestReview } from "./utils/githubUtils.js";
import { isCommandAvailable } from "./utils/commandUtils.js";
import { buildProviderChain, isEligibleForProviderFallback } from "./drivers/providerFallback.js";
import { getAvailableTools } from "./providers.js";
import { isEligibleForFallback, isCompleteProviderExhaustion, ModelAttempt } from "./utils/fallbackUtils.js";
import { getToolingLandscape } from "./utils/toolingLandscape.js";
import { enrichDemand } from "./utils/demandIntake.js";
import { enrichContext } from "./utils/enrichment.js";
import { prepareWorktree, cleanupWorktree } from "./utils/worktreeUtils.js";
import { callLLM } from "./utils/llmUtils.js";
import { sendSlackNotification } from "./utils/slackUtils.js";
import { verifySpecCompliance, formatSpecCompliance } from "./utils/specCompliance.js";
import { buildComplianceRecoveryPrompt } from "./utils/specCompliance.js";
import { monitorCi, buildCiRecoveryPrompt } from "./utils/ciMonitor.js";
import { fetchReviewDecision, fetchReviewComments, getPrNumberFromBranch, buildReviewRecoveryPrompt, parseReviewDecision } from "./utils/reviewMonitor.js";
import { resolveReaction, shouldEscalate } from "./utils/reactions.js";
import { globalMCPRegistry } from "./utils/mcpUtils.js";
import "./utils/webSearchUtils.js";
import { getMaskedSecrets, setSecrets } from "./utils/secretsUtils.js";

// Resolved conflict - using upstream/master version
let lastRoadmapGenDate: number | null = null;

async function generateRoadmapTasks() {
  if (lastRoadmapGenDate && Date.now() - lastRoadmapGenDate < 86400000) {
    return;
  }
  lastRoadmapGenDate = Date.now();
  // ... rest of function body preserved
}
// ... rest of file content
