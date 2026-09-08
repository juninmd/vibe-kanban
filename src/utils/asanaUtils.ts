export async function fetchAsanaTasks(personalAccessToken: string, projectId: string): Promise<any[]> {
  const url = `https://app.asana.com/api/1.0/projects/${projectId}/tasks?opt_fields=name,notes,permalink_url,completed`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${personalAccessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Asana tasks: ${response.statusText}`);
  }

  const data = await response.json();
  return Array.isArray(data.data) ? data.data.filter((t: any) => !t.completed) : [];
}
