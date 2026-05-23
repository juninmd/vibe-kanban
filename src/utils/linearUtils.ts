export async function fetchLinearIssues(apiKey: string): Promise<any[]> {
    if (!apiKey) return [];

    const query = `
      query {
        issues(filter: { state: { type: { eq: "unstarted" } } }) {
          nodes {
            id
            title
            description
            priority
            url
          }
        }
      }
    `;

    try {
        const res = await fetch("https://api.linear.app/graphql", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": apiKey
            },
            body: JSON.stringify({ query })
        });

        if (!res.ok) {
            console.error("Linear API error", res.status);
            return [];
        }

        const data = await res.json();
        return data?.data?.issues?.nodes || [];
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error("Failed to fetch Linear issues", err.message);
        }
        return [];
    }
}
