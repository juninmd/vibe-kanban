from playwright.sync_api import sync_playwright
import time

def verify_visuals():
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

        # Wait for canvas
        try:
            page.wait_for_selector("canvas", timeout=10000)
            print("Canvas found.")

            # Wait for 3D
            time.sleep(3)
            page.screenshot(path="verification_initial.png")
            print("Initial screenshot taken.")

            # Open Settings
            settings_btn = page.locator("#settingsBtn")
            if settings_btn.is_visible():
                settings_btn.click()
                print("Clicked Settings button.")
                page.wait_for_selector("#settingsDialog", state="visible", timeout=2000)
                print("Settings dialog visible.")
                page.screenshot(path="verification_settings.png")

                # Close it
                page.locator("#cancelSettingsBtn").click()
                print("Closed Settings dialog.")
            else:
                print("Settings button not found!")

            # Wait for agents to potentially move/work
            print("Waiting for agents...")
            time.sleep(5)
            page.screenshot(path="verification_working.png")
            print("Working state screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification_error.png")

        browser.close()

if __name__ == "__main__":
    verify_visuals()
