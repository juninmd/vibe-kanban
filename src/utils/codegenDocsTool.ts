import { globalMCPRegistry } from './mcpUtils.js';

globalMCPRegistry.registerTool({
  name: 'fetch_codegen_docs',
  description: 'Fetches Codegen documentation and parses it to plain text',
  execute: async () => {
    try {
      const res = await fetch("https://docs.codegen.com/introduction/overview");
      if (res.ok) {
        const html = await res.text();
        const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
        return cleanHtml.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ');
      }
      return "Failed to fetch docs";
    } catch (e: any) {
      return `Failed to fetch docs: ${e.message}`;
    }
  }
});
