import sys
import urllib.request
import re
import json

def scrape_room_event(room_id):
    url = f"https://www.showroom-live.com/room/profile?room_id={room_id}"
    
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    try:
        # Selenium options
        options = Options()
        options.add_argument('--headless')
        options.add_argument('--disable-gpu')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        options.add_experimental_option('excludeSwitches', ['enable-logging'])

        driver = webdriver.Chrome(options=options)
        
        try:
            driver.get(url)
            # Wait briefly for dynamic content? Room profile might be static enough, but wait just in case
            # Wait for event link or any content
            try:
                WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body"))
                )
            except:
                pass
            html = driver.page_source
        finally:
            driver.quit()

        # Find Event Banner Link
        # Pattern: <a href="/event/gamicurry06?room_id=..."> or similar
        # Also need to match it with "current event" context if possible, but usually the main event banner is prominent.
        
        # Look for "event-box" or similar structure
        # Or just find any link to /event/xxxx and assume it's the current one.
        # But there might be past events.
        
        # The official API usually returns current event. If we just want the URL key for the active event ID...
        # We can search for the known event_id in the HTML if provided, but we want to find the key.
        
        # Let's look for the ranking contribution link, which is definitely for the current event.
        # href="/event/contribution/gamicurry06?room_id=..."
        
        contrib_match = re.search(r'href="/event/contribution/([^"?]+)\?room_id=', html)
        if contrib_match:
            event_url_key = contrib_match.group(1)
            print(json.dumps({"event_url_key": event_url_key}))
            return

        # Fallback: simple /event/ link
        event_match = re.search(r'href="/event/([^"?]+)\?room_id=', html)
        if event_match:
            event_url_key = event_match.group(1)
            print(json.dumps({"event_url_key": event_url_key}))
            return

        print(json.dumps({"error": "Event key not found"}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        scrape_room_event(sys.argv[1])
    else:
        print(json.dumps({"error": "No Room ID provided"}))
