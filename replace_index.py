content = open('index.html', encoding='utf-8').read()
content = content.replace('<input id="taskAgentType" placeholder="ex: Gemini CLI, Copilot SDK" />', '<select id="taskAgentType">\n              <option value="">Automático / Opcional</option>\n            </select>')
open('index.html', 'w', encoding='utf-8').write(content)
