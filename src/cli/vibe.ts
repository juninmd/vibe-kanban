#!/usr/bin/env node
import { Command } from 'commander';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

type VibeCliConfig = {
  apiUrl: string;
  defaultRepoDir?: string;
};

function loadCliConfig(): VibeCliConfig {
  const configPath = path.resolve(process.cwd(), 'vibe_config.json');
  if (!fs.existsSync(configPath)) {
    return {
      apiUrl: process.env.VIBE_API_URL || 'http://localhost:5174',
    };
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const json = JSON.parse(raw);
    const apiUrl: string = json.apiUrl || process.env.VIBE_API_URL || 'http://localhost:5174';
    const defaultRepoDir: string | undefined = json.defaultRepoDir;
    return { apiUrl, defaultRepoDir };
  } catch {
    return {
      apiUrl: process.env.VIBE_API_URL || 'http://localhost:5174',
    };
  }
}

async function createTask(params: {
  apiUrl: string;
  title: string;
  description: string;
  category: string;
  priority: 'alta' | 'media' | 'baixa';
  githubRepo?: string;
  agentType?: string;
  workDir?: string;
}) {
  const res = await fetch(`${params.apiUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: params.title,
      source: 'cli',
      category: params.category,
      priority: params.priority,
      githubRepo: params.githubRepo,
      description: params.description,
      agentType: params.agentType,
      workDir: params.workDir,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao criar tarefa: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { task: { id: number } };
  return data.task.id;
}

async function waitForTask(apiUrl: string, taskId: number) {
  process.stdout.write(`Aguardando conclusão da tarefa #${taskId}...\n`);

  let finished = false;
  while (!finished) {
    const res = await fetch(`${apiUrl}/api/state`);
    if (!res.ok) {
      throw new Error(`Erro ao buscar estado: ${res.status}`);
    }
    const data = (await res.json()) as {
      tasks: { id: number; lane: string; logs: string[] }[];
    };

    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Tarefa #${taskId} não encontrada no estado.`);
    }

    if (task.logs && task.logs.length > 0) {
      const last = task.logs[task.logs.length - 1];
      process.stdout.write(`> ${last}\n`);
    }

    if (task.lane === 'done') {
      finished = true;
      process.stdout.write(`✅ Tarefa #${taskId} concluída.\n`);
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function main() {
  const program = new Command();
  const cfg = loadCliConfig();

  program.name('vibe').description('CLI para agentes do Vibe Kanban').version('0.1.0');

  program
    .command('plan')
    .description('Criar uma tarefa de planejamento (modo somente leitura) para um repositório')
    .requiredOption('-t, --title <title>', 'Título ou objetivo da tarefa')
    .requiredOption('-d, --description <description>', 'Descrição detalhada do que deve ser planejado')
    .option('-c, --category <category>', 'Categoria da tarefa (default: roadmap)', 'roadmap')
    .option('-p, --priority <priority>', 'Prioridade (alta|media|baixa)', 'media')
    .option('--repo-dir <path>', 'Diretório local do repositório alvo')
    .option('--github-repo <slug>', 'Slug do repositório no GitHub (org/repo)')
    .option('--no-wait', 'Não aguardar conclusão da tarefa, apenas criar o card')
    .action(async (opts) => {
      const priority = opts.priority === 'alta' || opts.priority === 'baixa' ? opts.priority : 'media';

      const workDir = opts.repoDir || cfg.defaultRepoDir ? path.resolve(opts.repoDir || cfg.defaultRepoDir) : undefined;

      const taskId = await createTask({
        apiUrl: cfg.apiUrl,
        title: opts.title,
        description: opts.description,
        category: opts.category,
        priority,
        githubRepo: opts.githubRepo,
        agentType: 'plan',
        workDir,
      });

      process.stdout.write(`Tarefa de plano criada com ID #${taskId} no servidor ${cfg.apiUrl}\n`);

      if (opts.wait) {
        await waitForTask(cfg.apiUrl, taskId);
      }
    });

  program
    .command('build')
    .description('Criar uma tarefa de execução/implementação (modo build) para um repositório')
    .requiredOption('-t, --title <title>', 'Título ou objetivo da tarefa')
    .requiredOption('-d, --description <description>', 'Descrição detalhada do que deve ser implementado')
    .option('-c, --category <category>', 'Categoria da tarefa (default: feature)', 'feature')
    .option('-p, --priority <priority>', 'Prioridade (alta|media|baixa)', 'media')
    .option('--repo-dir <path>', 'Diretório local do repositório alvo')
    .option('--github-repo <slug>', 'Slug do repositório no GitHub (org/repo)')
    .option('--no-wait', 'Não aguardar conclusão da tarefa, apenas criar o card')
    .action(async (opts) => {
      const priority = opts.priority === 'alta' || opts.priority === 'baixa' ? opts.priority : 'media';

      const workDir = opts.repoDir || cfg.defaultRepoDir ? path.resolve(opts.repoDir || cfg.defaultRepoDir) : undefined;

      const taskId = await createTask({
        apiUrl: cfg.apiUrl,
        title: opts.title,
        description: opts.description,
        category: opts.category,
        priority,
        githubRepo: opts.githubRepo,
        agentType: 'build',
        workDir,
      });

      process.stdout.write(`Tarefa de build criada com ID #${taskId} no servidor ${cfg.apiUrl}\n`);

      if (opts.wait) {
        await waitForTask(cfg.apiUrl, taskId);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error('Erro na CLI Vibe:', err);
  process.exit(1);
});
