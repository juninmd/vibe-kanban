import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function createPullRequest(
    taskDir: string,
    taskId: number,
    taskTitle: string,
    githubRepo: string,
    githubToken: string,
    githubUser: string = "vibe-agent"
): Promise<string> {
    const branchName = `feature/task-${taskId}`;
    const commitMessage = `feat: ${taskTitle}`;

    const runGit = async (args: string[], hideError: boolean = false) => {
        try {
            const { stdout } = await execFileAsync("git", args, { cwd: taskDir });
            return stdout.trim();
        } catch (e: any) {
            if (!hideError) {
                // Ensure token is not leaked in error message
                const safeMsg = e.message.replace(new RegExp(githubToken, 'g'), '***');
                throw new Error(safeMsg);
            }
            throw e;
        }
    };

    // Configure git
    await runGit(["config", "user.name", githubUser]);
    await runGit(["config", "user.email", `${githubUser}@vibe-kanban.local`]);

    // Ensure it's a git repository
    try {
        await runGit(["status"], true);
    } catch {
        throw new Error("O diretório da tarefa não é um repositório git válido.");
    }

    // Determine current branch to branch off of (usually main or master)
    const currentBranch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);

    // Check if branch already exists locally
    try {
        await runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], true);
        await runGit(["checkout", branchName]);
    } catch {
        await runGit(["checkout", "-b", branchName]);
    }

    // Add and commit changes
    await runGit(["add", "."]);

    // Check if there are changes to commit
    try {
        await runGit(["diff-index", "--quiet", "HEAD"], true);
        return `Sem alterações para commitar na branch ${branchName}.`;
    } catch {
        await runGit(["commit", "-m", commitMessage]);
    }

    // Push to remote. We need to set up the remote URL with the token for authentication.
    // If the remote doesn't exist, we add it, otherwise we update it.
    const remoteUrl = `https://${githubUser}:${githubToken}@github.com/${githubRepo}.git`;

    try {
        await runGit(["remote", "set-url", "origin", remoteUrl], true);
    } catch {
        await runGit(["remote", "add", "origin", remoteUrl]);
    }

    await runGit(["push", "-u", "origin", branchName]);

    // Create PR via GitHub API
    const prBody = {
        title: `Task #${taskId}: ${taskTitle}`,
        body: `Pull request gerado automaticamente pelo agente do Vibe Kanban para a tarefa #${taskId}.\n\nTítulo original: ${taskTitle}`,
        head: branchName,
        base: currentBranch // Or default to main if unknown
    };

    const response = await fetch(`https://api.github.com/repos/${githubRepo}/pulls`, {
        method: "POST",
        headers: {
            "Authorization": `token ${githubToken}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(prBody)
    });

    if (!response.ok) {
        const errorData = await response.json();
        // If PR already exists, it might return a 422
        if (response.status === 422 && errorData.errors && errorData.errors.some((e: any) => e.message.includes("A pull request already exists"))) {
            return `Pull Request já existe para a branch ${branchName}.`;
        }
        throw new Error(`Falha ao criar PR na API do GitHub: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const prData = await response.json();
    return `Pull Request criado com sucesso: ${prData.html_url}`;
}