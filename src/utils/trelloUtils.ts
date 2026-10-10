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

export async function addTrelloComment(apiKey: string, apiToken: string, cardId: string, text: string): Promise<boolean> {
  if (!apiKey || !apiToken || !cardId || !text) return false;

  const url = `https://api.trello.com/1/cards/${cardId}/actions/comments?key=${apiKey}&token=${apiToken}&text=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`Failed to add Trello comment: ${response.statusText}`);
      return false;
    }
    return true;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("Failed to add Trello comment", err.message);
    }
    return false;
  }
}
