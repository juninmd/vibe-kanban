import fetch from "node-fetch";

export interface CiMonitorResult {
    passed: boolean;
    skipped: boolean;
    attempts: number;
}

type CiStatus = "pending" | "success" | "failure" | "not_found";

interface CiRun {
    status: CiStatus;
    id: string;
    name: string;
    url: string;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollGitHubCi(githubRepo: string, branch: string, githubToken: string): Promise<CiRun | null> {
    try {
        const url = `https://api.github.com/repos/${githubRepo}/actions/runs?branch=${branch}&per_page=1`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json"
            }
        });

        if (!response.ok) return null;

        const data = await response.json() as { workflow_runs?: any[] };
        const runs = data.workflow_runs || [];

        if (runs.length === 0) return null;

        const run = runs[0];
        let ciStatus: CiStatus;

        if (run.status === "completed") {
            ciStatus = run.conclusion === "success" ? "success" : "failure";
        } else {
            ciStatus = "pending";
        }

        return {
            status: ciStatus,
            id: String(run.id),
            name: run.name,
            url: run.html_url,
        };
    } catch {
        return null;
    }
}

export async function extractGitHubCiLogs(githubRepo: string, runId: string, githubToken: string): Promise<string> {
    try {
        const url = `https://api.github.com/repos/${githubRepo}/actions/runs/${runId}/logs`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json"
            }
        });

        if (!response.ok) {
            return `Failed to extract CI logs: ${response.status} ${response.statusText}`;
        }

        // This is a zip file, it might be tricky to unzip without extra libraries.
        // For simplicity or fallback, we check the jobs inside the run to get their conclusion
        const jobsUrl = `https://api.github.com/repos/${githubRepo}/actions/runs/${runId}/jobs`;
        const jobsResponse = await fetch(jobsUrl, {
            headers: {
                "Authorization": `token ${githubToken}`,
                "Accept": "application/vnd.github.v3+json"
            }
        });

        if (jobsResponse.ok) {
            const jobsData = await jobsResponse.json() as { jobs?: any[] };
            const failedJobs = (jobsData.jobs || []).filter(j => j.conclusion === "failure");
            if (failedJobs.length > 0) {
                 const jobInfo = failedJobs.map(j => `Job: ${j.name}\nURL: ${j.html_url}`).join("\n\n");
                 return `Failed Jobs:\n${jobInfo}\n\nNote: Full logs are available at the URL above.`;
            }
        }

        return "See CI run URL for details (logs are zipped).";
    } catch (err: any) {
        return `Failed to extract CI logs: ${err.message}`;
    }
}

export function buildCiRecoveryPrompt(title: string, ciLogs: string, branch: string): string {
    return `You are continuing work on issue: "${title}".
A pull request was created for your changes, but the CI pipeline failed.
You MUST fix the errors and push the fix. Do NOT create a new PR — push to the existing branch.

## CI Failure Logs

\`\`\`
${ciLogs}
\`\`\`

## Instructions

1. **Analyze the CI failure logs** above carefully. Identify the root cause of each failure.
2. **Fix the issues** in the source code.
3. **Commit the fix** with a conventional commit message.
4. **Push to the existing branch**: \`git push origin ${branch}\`
   If push is rejected, pull first: \`git pull --rebase origin ${branch}\` then push again.

## Rules

- Do NOT create a new branch or a new PR.
- One fix at a time. If there are multiple errors, fix them all in a single commit.`;
}

export async function monitorCi(
    githubRepo: string,
    branch: string,
    githubToken: string,
    maxRetries: number = 3,
    pollIntervalSeconds: number = 30,
    pollTimeoutSeconds: number = 600,
    onLog?: (msg: string) => void
): Promise<{ passed: boolean; skipped: boolean; ciLogs?: string }> {
    const pollInterval = pollIntervalSeconds * 1000;
    const pollTimeout = pollTimeoutSeconds * 1000;

    let retriesLeft = maxRetries;
    const startTime = Date.now();
    let lastRun: CiRun | null = null;

    if (onLog) onLog(`Aguardando CI pipeline...`);

    while (Date.now() - startTime < pollTimeout) {
        lastRun = await pollGitHubCi(githubRepo, branch, githubToken);

        if (!lastRun) {
            // CI runs often take a few seconds to appear after push/PR.
            // Wait and continue polling instead of skipping immediately.
            await sleep(pollInterval);
            continue;
        }

        if (lastRun.status === "success") {
            if (onLog) onLog(`✅ CI pipeline aprovado: ${lastRun.name}`);
            return { passed: true, skipped: false };
        }

        if (lastRun.status === "failure") {
            if (onLog) onLog(`❌ CI pipeline falhou: ${lastRun.name}`);
            break;
        }

        await sleep(pollInterval);
    }

    if (!lastRun || lastRun.status === "pending") {
        if (onLog) onLog(`⚠️ CI pipeline não foi concluído em ${pollTimeoutSeconds}s. Pulando monitoramento.`);
        return { passed: false, skipped: false };
    }

    // Extraction
    if (onLog) onLog(`🔄 Extraindo logs do CI falho...`);
    const ciLogs = await extractGitHubCiLogs(githubRepo, lastRun.id, githubToken);

    return { passed: false, skipped: false, ciLogs };
}
