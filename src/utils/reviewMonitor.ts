import { createHash } from "crypto";
import fetch from "node-fetch";

export interface ReviewComment {
    id: string;
    author: string;
    body: string;
    path?: string;
    line?: number;
    url: string;
}

export type ReviewDecision = "approved" | "changes_requested" | "review_pending";

export function parseReviewDecision(
    decision: string | undefined,
): ReviewDecision {
    if (decision === "APPROVED") return "approved";
    if (decision === "CHANGES_REQUESTED") return "changes_requested";
    return "review_pending";
}

export function buildReviewFingerprint(comments: ReviewComment[]): string {
    if (comments.length === 0) return "";
    const sortedIds = [...comments.map((c) => c.id)].sort();
    const joined = sortedIds.join(",");
    return createHash("sha256").update(joined).digest("hex").slice(0, 16);
}

export function buildReviewRecoveryPrompt(
    issue: { id: number; title: string },
    comments: ReviewComment[],
    branch: string,
): string {
    const commentSections = comments
        .map((c) => {
            const location = c.path ? `**File:** \`${c.path}\`:${c.line || 'general'}` : "**General comment**";
            return `### ${c.author}\n${location}\n\n${c.body}`;
        })
        .join("\n\n---\n\n");

    return `You are an autonomous agent addressing pull request review feedback.
You MUST push fixes to the existing branch — do NOT create a new branch or a new PR.
Do NOT use interactive tools, ask clarifying questions, or wait for user input. You are running unattended.

## Issue

- **ID:** ${issue.id}
- **Title:** ${issue.title}

## Review Comments

${commentSections}

## Instructions

1. Read each review comment carefully and understand what needs to be changed.
2. Address every comment — fix the code, refactor as requested, or add explanations in code where appropriate.
3. Commit all changes with the message: \`fix: address review feedback\`
4. Push the fix to the existing branch: \`git push origin ${branch}\`
   If push is rejected, pull first: \`git pull --rebase origin ${branch}\` then push again.

## Rules

- All commits and messages MUST be in English.
- Do NOT create a new branch or a new PR.
- Do NOT refactor code that is unrelated to the review comments.`;
}

function parseOwnerRepo(githubRepo: string): { owner: string; repo: string } | null {
    // Expected githubRepo format: "https://github.com/owner/repo" or "owner/repo"
    const cleaned = githubRepo.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    const parts = cleaned.split('/');
    if (parts.length === 2) {
        return { owner: parts[0], repo: parts[1] };
    }
    return null;
}

export async function fetchReviewDecision(
    githubRepo: string,
    prNumber: number,
    githubToken: string
): Promise<string | undefined> {
    const ownerRepo = parseOwnerRepo(githubRepo);
    if (!ownerRepo) return undefined;

    const query = `
      query {
        repository(owner: "${ownerRepo.owner}", name: "${ownerRepo.repo}") {
          pullRequest(number: ${prNumber}) {
            reviewDecision
          }
        }
      }
    `;

    try {
        const response = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
        });

        if (!response.ok) return undefined;

        const data = await response.json() as any;
        return data?.data?.repository?.pullRequest?.reviewDecision;
    } catch (err) {
        console.warn(`Failed to fetch review decision: ${err}`);
        return undefined;
    }
}

export async function fetchReviewComments(
    githubRepo: string,
    prNumber: number,
    githubToken: string
): Promise<ReviewComment[]> {
    const ownerRepo = parseOwnerRepo(githubRepo);
    if (!ownerRepo) return [];

    try {
        const endpoint = `https://api.github.com/repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${prNumber}/comments`;
        const response = await fetch(endpoint, {
            headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
            },
        });

        if (!response.ok) return [];

        const commentsData = await response.json() as any[];
        return commentsData.map(obj => ({
            id: obj.id.toString(),
            author: obj.user.login,
            body: obj.body,
            path: obj.path,
            line: obj.line,
            url: obj.html_url
        }));
    } catch (err) {
        console.warn(`Failed to fetch review comments: ${err}`);
        return [];
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Extract prNumber using github API with the branch
export async function getPrNumberFromBranch(
    githubRepo: string,
    branchName: string,
    githubToken: string
): Promise<number | null> {
    const ownerRepo = parseOwnerRepo(githubRepo);
    if (!ownerRepo) return null;

    try {
        const endpoint = `https://api.github.com/repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls?state=open&head=${ownerRepo.owner}:${branchName}`;
        const response = await fetch(endpoint, {
             headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
            },
        });
        if (!response.ok) return null;
        const data = await response.json() as any[];
        if (data.length > 0) {
            return data[0].number;
        }
    } catch (err) {
         console.warn(`Failed to fetch PR number: ${err}`);
    }
    return null;
}
