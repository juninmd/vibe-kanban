export async function fetchNotionTasks(databaseId: string, apiToken: string) {
  const url = `https://api.notion.com/v1/databases/${databaseId}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results || [];
}

export async function addNotionComment(apiToken: string, pageId: string, text: string): Promise<boolean> {
  if (!apiToken || !pageId || !text) return false;

  const url = `https://api.notion.com/v1/comments`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: {
          page_id: pageId
        },
        rich_text: [
          {
            text: {
              content: text
            }
          }
        ]
      })
    });

    if (!response.ok) {
      console.error(`Failed to add Notion comment: ${response.statusText}`);
      return false;
    }
    return true;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("Failed to add Notion comment", err.message);
    }
    return false;
  }
}
