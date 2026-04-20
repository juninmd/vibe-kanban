export async function sendSlackNotification(webhookUrl: string, message: string): Promise<void> {
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message })
        });
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error("Failed to send Slack notification", err.message);
        }
    }
}
