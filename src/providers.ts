import { isCommandAvailable } from './utils/commandUtils.js';

export interface ToolDescriptor {
  id: string;
  name: string;
}

interface ToolProvider {
  id: string;
  name: string;
  isAvailable: () => boolean;
}

const providerFactories: ToolProvider[] = [
  { id: 'gemini', name: 'Gemini CLI', isAvailable: () => isCommandAvailable('gemini') },
  { id: 'opencode', name: 'OpenCode AI', isAvailable: () => isCommandAvailable('opencode') },
  { id: 'copilot', name: 'GitHub Copilot (gh cli)', isAvailable: () => isCommandAvailable('gh') },
  { id: 'claude', name: 'Claude Code', isAvailable: () => isCommandAvailable('claude') },
  { id: 'openai', name: 'OpenAI API', isAvailable: () => Boolean(process.env.OPENAI_API_KEY) },
  {
    id: 'claude',
    name: 'Claude (API)',
    isAvailable: () => !isCommandAvailable('claude') && Boolean(process.env.ANTHROPIC_API_KEY),
  },
];

export function getAvailableTools(providers: ToolProvider[] = providerFactories): ToolDescriptor[] {
  return providers.filter((provider) => provider.isAvailable()).map(({ id, name }) => ({ id, name }));
}
