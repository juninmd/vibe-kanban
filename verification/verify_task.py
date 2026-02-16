from playwright.sync_api import sync_playwright
import time

def run(playwright):
    try:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:4173")
        time.sleep(2)

        print("Creating task...")
        page.fill("#taskTitle", "Verify Frontend")
        page.select_option("#taskSource", "usuario")
        page.select_option("#taskCategory", "testes")
        page.click("button[type='submit']")

        time.sleep(2)

        if page.locator("text=Verify Frontend").is_visible():
            print("Task verified visible.")
        else:
            print("Task not visible.")

        page.screenshot(path="verification/verification.png")
        print("Screenshot taken.")

        browser.close()
    except Exception as e:
        print(f"Error: {e}")

with sync_playwright() as playwright:
    run(playwright)
