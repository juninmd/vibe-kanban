export async function fetchTrelloCards(apiKey: string, apiToken: string, listId: string): Promise<any[]> {
  const url = `https://api.trello.com/1/lists/${listId}/cards?key=${apiKey}&token=${apiToken}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Trello cards: ${response.statusText}`);
  }

  const cards = await response.json();
  return Array.isArray(cards) ? cards : [];
}
