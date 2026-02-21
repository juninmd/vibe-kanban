from playwright.sync_api import sync_playwright

def verify_cyberpunk():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        page.goto("http://localhost:5174")

        # Check title
        print("Checking title...")
        assert "Vibe Kanban 3D" in page.title()

        # Check scanlines
        print("Checking scanlines...")
        scanlines = page.locator(".scanlines")
        assert scanlines.is_visible()

        # Open settings modal to check new inputs
        print("Opening settings...")
        page.click("#settingsBtn")
        page.wait_for_selector("#settingsModal[open]")

        # Check env inputs
        assert page.locator("#envOpenAI").is_visible()
        assert page.locator("#envGemini").is_visible()

        # Take screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/cyberpunk_verification.png")

        browser.close()
        print("Verification complete.")

if __name__ == "__main__":
    verify_cyberpunk()
