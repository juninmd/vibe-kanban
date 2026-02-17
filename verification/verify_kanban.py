from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to http://localhost:4173")
        page.goto("http://localhost:4173")

        # Wait for agents to load (confirms API is working)
        try:
            page.wait_for_selector("#agentsList .agent-item", timeout=5000)
            print("Agents loaded.")
        except:
            print("Agents not loaded - API might be down.")
            page.screenshot(path="verification/failed_load.png")
            browser.close()
            return

        # Create a task
        print("Creating task...")
        page.fill("#taskTitle", "Task de Teste Playwright")
        page.select_option("#taskSource", "product_manager")
        page.click("button[type='submit']")

        # Switch to 2D view
        print("Switching to 2D view...")
        page.click("#toggleViewBtn")

        # Wait for task card
        try:
            page.wait_for_selector("article.task-card", timeout=5000)
            print("Task card found!")
        except:
            print("Task card NOT found.")

        page.screenshot(path="verification/kanban_2d.png", full_page=True)
        print("Screenshot saved to verification/kanban_2d.png")

        browser.close()

if __name__ == "__main__":
    run()
