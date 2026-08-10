import { globalMCPRegistry } from './mcpUtils.js';

export async function searchWeb(query: string): Promise<string> {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`Web search failed with status: ${res.status}`);
        }

        const html = await res.text();

        // Basic HTML tag removal and whitespace normalization
        const text = html.replace(/<[^>]*>?/gm, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();

        // Return a chunk of it, as it could be huge
        return text.substring(0, 8000);
    } catch (err: unknown) {
        if (err instanceof Error) {
            throw new Error(`Web search error: ${err.message}`);
        }
        throw new Error('Unknown web search error');
    }
}

globalMCPRegistry.registerTool({
    name: 'web_search',
    description: 'Searches the web for information using DuckDuckGo.',
    execute: async (args: Record<string, unknown>) => {
        if (!args || typeof args.query !== 'string') {
            throw new Error('Missing or invalid argument: query');
        }
        return await searchWeb(args.query);
    }
});
