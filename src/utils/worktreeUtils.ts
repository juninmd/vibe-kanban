import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

export function normalizeGithubRepo(githubRepo: string): string {
    const trimmed = githubRepo.trim().replace(/\.git$/i, "");
    const withoutPrefix = trimmed
        .replace(/^https?:\/\/github\.com\//i, "")
        .replace(/^ssh:\/\/git@github\.com\//i, "")
        .replace(/^git@github\.com:/i, "");
    const parts = withoutPrefix.split("/").filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }

    return withoutPrefix;
}

export function getGithubRepoName(githubRepo: string): string {
    const normalizedRepo = normalizeGithubRepo(githubRepo);
    return normalizedRepo.split("/").pop() || normalizedRepo.replace(/\//g, "-");
}

export function buildGithubRemoteUrl(githubRepo: string, githubToken?: string): string {
    const normalizedRepo = normalizeGithubRepo(githubRepo);
    if (githubToken) {
        return `https://oauth2:${githubToken}@github.com/${normalizedRepo}.git`;
    }
    return `https://github.com/${normalizedRepo}.git`;
}

/**
 * Prepares a git worktree for a task.
 * Clones the base repository if it doesn't exist, fetches the latest changes,
 * and creates a new worktree for the specific task branch.
 *
 * @param cloneDir The root directory where clones and worktrees are stored.
 * @param githubRepo The GitHub repository in the format "owner/repo".
 * @param branchName The name of the new branch for the task.
 * @param githubToken (Optional) The GitHub token for authentication if cloning a private repo.
 * @returns An object containing the baseRepoDir and the new worktreeDir.
 */
export async function prepareWorktree(
    cloneDir: string,
    githubRepo: string,
    branchName: string,
    githubToken?: string
): Promise<{ baseRepoDir: string; worktreeDir: string }> {
    const normalizedRepo = normalizeGithubRepo(githubRepo);
    const repoName = getGithubRepoName(normalizedRepo);
    const baseRepoDir = path.join(cloneDir, repoName);
    const worktreeDir = path.join(cloneDir, `worktree-${branchName.replace(/\//g, "-")}`);

    const runGit = async (args: string[], cwd: string, hideError: boolean = false) => {
        try {
            const { stdout } = await execFileAsync("git", args, { cwd });
            return stdout.trim();
        } catch (e: any) {
            let safeMsg = e.message;
            if (githubToken) {
                safeMsg = safeMsg.replace(new RegExp(githubToken, 'g'), '***');
            }
            if (!hideError) {
                const sanitizedError = new Error(`Git command failed: git ${args.join(" ")}\n${safeMsg}`);
                if (e.stack && githubToken) {
                    (sanitizedError as any).stack = e.stack.replace(new RegExp(githubToken, 'g'), '***');
                } else {
                    (sanitizedError as any).stack = e.stack;
                }
                throw sanitizedError;
            }
            return "";
        }
    };

    // 1. Ensure base repository exists
    if (!fs.existsSync(baseRepoDir)) {
        fs.mkdirSync(baseRepoDir, { recursive: true });

        // Initialize an empty repository to avoid git clone failures when the repo is empty
        await runGit(["init"], baseRepoDir);

           await runGit(["remote", "add", "origin", buildGithubRemoteUrl(normalizedRepo, githubToken)], baseRepoDir);
    }

    // 2. Fetch the latest changes from the default branch (assuming main)
    try {
        await runGit(["fetch", "origin"], baseRepoDir);
    } catch (e) {
        console.warn(`[Worktree] Failed to fetch origin for ${normalizedRepo}, it might be an empty repository or require authentication.`);
    }

    // 3. Cleanup any existing worktree with the same path or branch
    if (fs.existsSync(worktreeDir)) {
        await runGit(["worktree", "remove", "--force", worktreeDir], baseRepoDir, true);
        fs.rmSync(worktreeDir, { recursive: true, force: true });
    }

    // Also try to remove the branch if it somehow exists locally
    await runGit(["branch", "-D", branchName], baseRepoDir, true);

    // 4. Create the new worktree and branch
    try {
        // Try to create from origin/main
        await runGit(["worktree", "add", "-b", branchName, worktreeDir, "origin/main"], baseRepoDir);
    } catch (e) {
        try {
            // Try origin/master
            await runGit(["worktree", "add", "-b", branchName, worktreeDir, "origin/master"], baseRepoDir);
        } catch (e2) {
             // Fallback: create from current HEAD or create an orphan branch if repo is empty
             try {
                 await runGit(["worktree", "add", "-b", branchName, worktreeDir], baseRepoDir);
             } catch (e3) {
                 // If it's an empty repo with no commits, worktree add might fail.
                 // We create the directory, init, and checkout -b.
                 fs.mkdirSync(worktreeDir, { recursive: true });
                 await runGit(["init"], worktreeDir);
                 await runGit(["checkout", "-b", branchName], worktreeDir);
             }
        }
    }

    return { baseRepoDir, worktreeDir };
}

/**
 * Cleans up a worktree and deletes its associated branch.
 *
 * @param baseRepoDir The path to the base repository.
 * @param worktreeDir The path to the worktree to remove.
 * @param branchName The name of the branch to delete.
 */
export async function cleanupWorktree(
    baseRepoDir: string,
    worktreeDir: string,
    branchName: string
): Promise<void> {
    const runGit = async (args: string[], cwd: string) => {
        try {
            await execFileAsync("git", args, { cwd });
        } catch (e) {
            // Ignore cleanup errors
        }
    };

    // Force remove the worktree
    await runGit(["worktree", "remove", "--force", worktreeDir], baseRepoDir);

    // Prune worktrees
    await runGit(["worktree", "prune"], baseRepoDir);

    // Delete the branch locally
    await runGit(["branch", "-D", branchName], baseRepoDir);

    // Ensure directory is deleted
    if (fs.existsSync(worktreeDir)) {
        try {
            fs.rmSync(worktreeDir, { recursive: true, force: true });
        } catch (e) {
            // Ignore
        }
    }
}
