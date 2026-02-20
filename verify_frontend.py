from playwright.sync_api import sync_playwright
import time

def verify_app():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Retry connection
        for i in range(10):
            try:
                page.goto("http://localhost:5174")
                break
            except Exception as e:
                print(f"Waiting for server... {e}")
                time.sleep(1)

        # Wait for canvas or something specific to the app
        try:
            page.wait_for_selector("canvas", timeout=10000)
            print("Canvas found.")

            # Wait a bit for 3D to render
            time.sleep(3)

            # Check for text in the DOM (e.g., "Vibe Kanban")
            title = page.locator("h1").text_content()
            print(f"Page title: {title}")

            # Take screenshot
            page.screenshot(path="verification_screenshot.png")
            print("Screenshot taken.")
        except Exception as e:
            print(f"Error: {e}")
            # Take screenshot anyway to debug
            page.screenshot(path="verification_error.png")

        browser.close()

if __name__ == "__main__":
    verify_app()
