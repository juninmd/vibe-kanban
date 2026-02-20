from playwright.sync_api import sync_playwright
import time
import os

def verify_office():
    if not os.path.exists("verification"):
        os.makedirs("verification")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            print("Navigating to app...")
            page.goto("http://localhost:5174")

            # Wait for canvas to be present
            page.wait_for_selector("#sceneCanvas")
            print("Canvas found.")

            # Wait for some time to let 3D load and animations start
            time.sleep(5)

            # Take screenshot
            path = "verification/office_screenshot.png"
            page.screenshot(path=path)
            print(f"Screenshot saved to {path}")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_office()
