from playwright.sync_api import sync_playwright

def test_vibe_kanban_debug():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))

        try:
            print("Navigating to http://localhost:5174")
            page.goto("http://localhost:5174")

            # Wait for JS to load
            page.wait_for_timeout(2000)

            # Check if driverSelect exists
            if page.locator("#driverSelect").count() == 0:
                print("Element #driverSelect not found!")
                # Print HTML to see what's there
                # print(page.content())
                return

            print("Changing Driver...")
            page.select_option("#driverSelect", "gemini")

            # Wait a bit
            page.wait_for_timeout(2000)

            # Check event log content
            logs = page.locator("#eventLog").inner_text()
            print(f"Event Log Content:\n{logs}")

            if "Driver alterado: gemini" in logs:
                print("SUCCESS: Driver change event found.")
            else:
                print("FAILURE: Driver change event not found.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    test_vibe_kanban_debug()
