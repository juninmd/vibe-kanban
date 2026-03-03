from playwright.sync_api import sync_playwright

def verify_3d_avatars(page):
    page.goto("http://localhost:5174")
    # Wait for the 3D scene canvas to load
    page.wait_for_selector("canvas#sceneCanvas")

    # Wait a few seconds for the avatars to render completely
    page.wait_for_timeout(5000)

    # Take a screenshot of the 3D view
    page.screenshot(path="/app/verification_3d_avatars.png")
    print("Screenshot saved to /app/verification_3d_avatars.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_3d_avatars(page)
        finally:
            browser.close()