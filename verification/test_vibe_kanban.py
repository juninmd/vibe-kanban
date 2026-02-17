from playwright.sync_api import sync_playwright

def test_vibe_kanban():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            print("Navigating to http://localhost:5174")
            page.goto("http://localhost:5174")

            # 1. Verify Title
            print("Verifying title...")
            title = page.title()
            print(f"Title: {title}")
            assert "Vibe Kanban" in title

            # 2. Verify Driver Select
            print("Verifying Driver Select...")
            driver_select = page.locator("#driverSelect")
            if driver_select.count() == 0:
                print("Driver Select not found!")
                page.screenshot(path="verification/error_no_driver_select.png")
                return

            # 3. Change Driver
            print("Changing Driver to 'gemini'...")
            driver_select.select_option("gemini")

            # Wait for event log to update
            print("Waiting for event log...")
            page.locator("#eventLog").filter(has_text="Driver alterado: gemini").wait_for(timeout=5000)

            # 4. Create a Task
            print("Creating a task...")
            page.fill("#taskTitle", "Test Task via Playwright")
            page.click("button[type='submit']")

            # Wait for event log confirmation
            print("Waiting for creation event...")
            page.locator("#eventLog").filter(has_text="Novo card criado").wait_for(timeout=5000)

            # Toggle View
            print("Toggling to 2D view...")
            page.click("#toggleViewBtn")

            # Verify Kanban
            print("Waiting for task in Kanban...")
            # We filter for the card text
            page.locator(".task-card").filter(has_text="Test Task via Playwright").wait_for(timeout=5000)

            # Screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification/vibe_kanban_verified.png", full_page=True)
            print("Verification successful!")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    test_vibe_kanban()
