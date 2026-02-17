from playwright.sync_api import sync_playwright
import time

def verify_kanban():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        try:
            print("Navigating to http://localhost:5174")
            page.goto("http://localhost:5174")

            # Wait for the 3D canvas to load
            print("Waiting for #sceneCanvas")
            page.wait_for_selector("#sceneCanvas", timeout=10000)

            # Wait a bit for 3D scene to initialize and fetch data
            time.sleep(3)

            # Take screenshot of default view (3D)
            print("Taking screenshot of default view (3D)")
            page.screenshot(path="verification/kanban_3d.png", full_page=True)

            # Interact: Toggle view to 2D only
            print("Clicking toggle view button")
            page.click("#toggleViewBtn")

            # Wait for Kanban to be visible
            print("Waiting for .kanban to be visible")
            page.wait_for_selector(".kanban", state="visible", timeout=5000)
            time.sleep(1)

            print("Taking screenshot of 2D view")
            page.screenshot(path="verification/kanban_2d.png", full_page=True)

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png", full_page=True)
        finally:
            browser.close()

if __name__ == "__main__":
    verify_kanban()
