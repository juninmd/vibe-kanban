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

export async function addLinearComment(apiKey: string, issueId: string, body: string): Promise<boolean> {
    if (!apiKey || !issueId || !body) return false;

    // Escape newlines and quotes for GraphQL string payload
    const sanitizedBody = body.replace(/"/g, '\\"').replace(/\n/g, '\\n');

    const query = `
      mutation {
        commentCreate(input: { issueId: "${issueId}", body: "${sanitizedBody}" }) {
          success
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
            return false;
        }

        const data = await res.json();
        return data?.data?.commentCreate?.success || false;
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error("Failed to add Linear comment", err.message);
        }
        return false;
    }
}
