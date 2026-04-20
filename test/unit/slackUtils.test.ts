import { test } from "node:test";
import assert from "node:assert";
import { sendSlackNotification } from "../../src/utils/slackUtils.js";

test("sendSlackNotification", async (t) => {
    await t.test("should not fetch if webhookUrl is empty", async () => {
        const originalFetch = global.fetch;
        let called = false;
        global.fetch = async () => { called = true; return new Response(); };
        try {
            await sendSlackNotification("", "Test message");
            assert.strictEqual(called, false);
        } finally {
            global.fetch = originalFetch;
        }
    });

    await t.test("should fetch if webhookUrl is provided", async () => {
        const originalFetch = global.fetch;
        let called = false;
        let urlCalled = "";
        let bodyCalled: unknown = null;
        global.fetch = async (url, options) => {
            called = true;
            urlCalled = url.toString();
            bodyCalled = options?.body;
            return new Response();
        };
        try {
            await sendSlackNotification("https://example.com/webhook", "Test message");
            assert.strictEqual(called, true);
            assert.strictEqual(urlCalled, "https://example.com/webhook");
            assert.strictEqual(bodyCalled, JSON.stringify({ text: "Test message" }));
        } finally {
            global.fetch = originalFetch;
        }
    });

    await t.test("should swallow errors and not throw", async () => {
        const originalFetch = global.fetch;
        const originalError = console.error;
        let errorLogged = false;

        global.fetch = async () => { throw new Error("Network error"); };
        console.error = () => { errorLogged = true; };

        try {
            await assert.doesNotReject(async () => {
                await sendSlackNotification("https://example.com/webhook", "Test message");
            });
            assert.strictEqual(errorLogged, true);
        } finally {
            global.fetch = originalFetch;
            console.error = originalError;
        }
    });
});
