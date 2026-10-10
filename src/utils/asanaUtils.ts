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

export async function addAsanaComment(personalAccessToken: string, taskGid: string, text: string): Promise<boolean> {
  if (!personalAccessToken || !taskGid || !text) return false;

  const url = `https://app.asana.com/api/1.0/tasks/${taskGid}/stories`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${personalAccessToken}`
      },
      body: JSON.stringify({
        data: {
          text
        }
      })
    });

    if (!response.ok) {
      console.error(`Failed to add Asana comment: ${response.statusText}`);
      return false;
    }
    return true;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("Failed to add Asana comment", err.message);
    }
    return false;
  }
}
