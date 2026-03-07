import codecs

content = codecs.open('src/app.ts', 'r', 'utf-8').read()

# 1. HTMLSelectElement
content = content.replace(
    '  agentType: document.getElementById("taskAgentType") as HTMLInputElement,',
    '  agentType: document.getElementById("taskAgentType") as HTMLSelectElement,'
)

# 2. updateTaskAgentModels
old_update = """async function updateTaskAgentModels() {
  const agentId = els.agentAssign.value;
  const driver = els.driverSelect.value;

  let tool = driver; // Fallback to global driver
  if (agentId) {
    const agent = agents.find(a => a.id === agentId);
    if (agent && agent.tool) tool = agent.tool;
  }

  if (!tool) {
    els.agentModelDropdown.innerHTML = '<option value="">Selecione um agente ou ferramenta</option>';
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/models?tool=${tool}`);
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      els.agentModelDropdown.innerHTML = data.models.map((m: string) => `<option value="${m}">${m}</option>`).join("");
    } else {
      els.agentModelDropdown.innerHTML = '<option value="">Nenhum modelo encontrado</option>';
    }
  } catch (e) {
    console.error("Erro ao carregar modelos para a tarefa:", e);
  }
}"""
new_update = """async function updateTaskAgentModels() {
  const agentId = els.agentAssign.value;
  const driver = els.driverSelect.value;
  const agentType = els.agentType ? els.agentType.value : "";

  let tool = agentType || driver; // Fallback to global driver
  if (agentId) {
    const agent = agents.find(a => a.id === agentId);
    if (agent && agent.tool) tool = agent.tool;
  }

  if (!tool) {
    els.agentModelDropdown.innerHTML = '<option value="">Selecione um agente ou ferramenta</option>';
    return;
  }

  els.agentModelDropdown.innerHTML = '<option value="">Carregando modelos...</option>';
  try {
    const res = await fetch(`${API_URL}/api/models?tool=${tool}`);
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      els.agentModelDropdown.innerHTML = data.models.map((m: string) => `<option value="${m}">${m}</option>`).join("");
    } else {
      els.agentModelDropdown.innerHTML = '<option value="">Nenhum modelo encontrado</option>';
    }
  } catch (e) {
    console.error("Erro ao carregar modelos para a tarefa:", e);
  }
}"""
content = content.replace(old_update, new_update)

# 3. Add listener
old_listeners = """els.agentAssign?.addEventListener("change", () => {
  updateTaskAgentModels();
});"""
new_listeners = """els.agentAssign?.addEventListener("change", () => {
  updateTaskAgentModels();
});
els.agentType?.addEventListener("change", () => {
  updateTaskAgentModels();
});"""
content = content.replace(old_listeners, new_listeners)

# 4. loadAvailableTools
old_loadTools = """async function loadAvailableTools() {
  try {
    const res = await fetch(`${API_URL}/api/tools`);
    const data = await res.json();
    if (data.tools && data.tools.length > 0) {
      els.driverSelect.innerHTML = data.tools.map((t: any) => `<option value="${t.id}">${t.name}</option>`).join("");
    }
  } catch (e) {
    console.error("Erro ao carregar ferramentas:", e);
  }
}"""
new_loadTools = """async function loadAvailableTools() {
  try {
    const res = await fetch(`${API_URL}/api/tools`);
    const data = await res.json();
    if (data.tools && data.tools.length > 0) {
      els.driverSelect.innerHTML = data.tools.map((t: any) => `<option value="${t.id}">${t.name}</option>`).join("");
      const agentTypeOptions = '<option value="">Automático / Opcional</option>' + data.tools.map((t: any) => `<option value="${t.id}">${t.name}</option>`).join("");
      els.agentType.innerHTML = agentTypeOptions;
    }
  } catch (e) {
    console.error("Erro ao carregar ferramentas:", e);
  }
}"""
content = content.replace(old_loadTools, new_loadTools)

codecs.open('src/app.ts', 'w', 'utf-8').write(content)
print("Replaced content successfully.")
