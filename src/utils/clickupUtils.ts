export async function fetchClickupTasks(listId: string, apiToken: string) {
  const url = `https://api.clickup.com/api/v2/list/${listId}/task`;
  const response = await fetch(url, {
    headers: {
      Authorization: apiToken,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`ClickUp API error: ${response.statusText}`);
  }
  const data = await response.json();
  return data.tasks || [];
}
