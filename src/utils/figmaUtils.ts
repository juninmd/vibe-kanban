export async function fetchFigmaComments(fileKey: string, apiToken: string) {
  const url = `https://api.figma.com/v1/files/${fileKey}/comments`;
  const response = await fetch(url, {
    headers: {
      'X-Figma-Token': apiToken,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Figma API error: ${response.statusText}`);
  }
  const data = await response.json();
  return data.comments || [];
}
