export async function fetchMondayTasks(boardId: string, apiToken: string) {
  const query = `
    query {
      boards(ids: [${boardId}]) {
        items_page {
          items {
            id
            name
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.monday.com/v2", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiToken
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`Monday.com API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Monday.com GraphQL error: ${data.errors[0].message}`);
  }

  return data?.data?.boards?.[0]?.items_page?.items || [];
}
