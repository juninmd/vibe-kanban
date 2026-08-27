export async function fetchJiraIssues(domain: string, email: string, apiToken: string): Promise<any[]> {
    if (!domain || !email || !apiToken) return [];

    const query = `jql=status="To Do"`;
    const url = `https://${domain}.atlassian.net/rest/api/3/search?${query}`;

    const authString = Buffer.from(`${email}:${apiToken}`).toString('base64');

    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Basic ${authString}`
            }
        });

        if (!res.ok) {
            console.error("Jira API error", res.status);
            return [];
        }

        const data = await res.json();
        return data?.issues || [];
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error("Failed to fetch Jira issues", err.message);
        }
        return [];
    }
}

export async function addJiraComment(domain: string, email: string, apiToken: string, issueKey: string, body: string): Promise<boolean> {
    if (!domain || !email || !apiToken || !issueKey || !body) return false;

    const url = `https://${domain}.atlassian.net/rest/api/3/issue/${issueKey}/comment`;
    const authString = Buffer.from(`${email}:${apiToken}`).toString('base64');

    const payload = {
        body: {
            type: "doc",
            version: 1,
            content: [
                {
                    type: "paragraph",
                    content: [
                        {
                            text: body,
                            type: "text"
                        }
                    ]
                }
            ]
        }
    };

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Basic ${authString}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error("Jira API error adding comment", res.status);
            return false;
        }

        return true;
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error("Failed to add Jira comment", err.message);
        }
        return false;
    }
}
