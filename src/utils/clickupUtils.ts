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

export async function addClickupComment(apiToken: string, taskId: string, comment: string) {
  const url = `https://api.clickup.com/api/v2/task/${taskId}/comment`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': apiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      comment_text: comment
    })
  });

  if (!response.ok) {
    throw new Error(`ClickUp API error adding comment: ${response.statusText}`);
  }

  return response.json();
}
