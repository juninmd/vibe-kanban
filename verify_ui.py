from playwright.sync_api import sync_playwright
import time
import os

def test_visual_alerts():
    os.makedirs('/home/jules/verification', exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:5174/')

        # Wait for the page to load
        page.wait_for_selector('h1:has-text("Vibe Kanban")')

        # Give 3D scene some time to render and let agents position themselves
        time.sleep(5)

        # Take screenshot of the 3D view
        page.screenshot(path='/home/jules/verification/fixed_3d_alerts.png')
        browser.close()

if __name__ == '__main__':
    test_visual_alerts()