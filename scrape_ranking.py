import sys
import urllib.request
import re
import json


from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def scrape(url_key):
    url = f"https://www.showroom-live.com/event/{url_key}"
    
    try:
        # Use Selenium to handle dynamic content (SPA) and bot protection
        options = Options()
        options.add_argument('--headless') # Run in background
        options.add_argument('--disable-gpu')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        # Mimic a real browser
        options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        # Suppress logging
        options.add_experimental_option('excludeSwitches', ['enable-logging'])

        driver = webdriver.Chrome(options=options)
        
        try:
            driver.get(url)
            
            # Wait for the ranking list to load (max 10 seconds)
            try:
                # Based on user provided HTML, look for listcard-ranking or contentlist-row
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "contentlist-row"))
                )
            except:
                # Continue even if wait times out, maybe it loaded partially or class changed
                pass
            
            html = driver.page_source
        finally:
            driver.quit()
        
        ranking = []
        
        # Robust parsing strategy:
        # Split HTML by list item markers to isolate each room's block
        items = html.split('class="contentlist-row"')
        
        # The first chunk is before the first item, so skip it
        if len(items) > 1:
            items.pop(0)
            
            for item in items:
                # Extract Rank
                rank_match = re.search(r'is-rank-(\d+)', item)
                
                # Extract Room ID
                id_match = re.search(r'data-room-id="(\d+)"', item)
                
                # Extract Room Name (Try 1: h4 tag text)
                name = ""
                name_match_h4 = re.search(r'listcardinfo-main-text[^>]*>([\s\S]*?)<\/', item)
                if name_match_h4:
                    name = name_match_h4.group(1).strip()
                
                # Extract Room Name (Try 2: img alt attribute)
                if not name:
                    # Look for img tag with class img-main and alt attribute
                    # Pattern: <img ... class="img-main" ... alt="NAME" ...>
                    # Be flexible with attribute order
                    alt_match = re.search(r'class="[^"]*img-main[^"]*"[^>]*alt="([^"]+)"', item)
                    if not alt_match:
                         # Try simpler alt match if class order varies
                         alt_match = re.search(r'alt="([^"]+)"', item)
                    
                    if alt_match:
                        # Filter out common non-name alts if necessary, but usually alt on main img is name
                        potential_name = alt_match.group(1).strip()
                        if potential_name not in ["Official", "Onlive", "Badge", "Profile", "Follow"]:
                             name = potential_name

                if rank_match and id_match and name:
                    ranking.append({
                        "rank": int(rank_match.group(1)),
                        "point": 0, # Points are usually not visible on this page type
                        "room": {
                            "room_id": int(id_match.group(1)),
                            "room_name": name,
                            "url_key": "" 
                        }
                    })

        # If HTML scraping yielded no results, try to find eventId and call API
        if len(ranking) == 0:
            # Look for eventId in scripts
            # Patterns: eventId:12345, "eventId":12345, event_id=12345
            eid_match = re.search(r'["\']?eventId["\']?[:=]\s*(\d+)', html)
            if not eid_match:
                eid_match = re.search(r'["\']?event_id["\']?[:=]\s*(\d+)', html)
            
            if eid_match:
                event_id = eid_match.group(1)
                # Fetch API
                api_url = f"https://www.showroom-live.com/api/event/ranking?event_id={event_id}"
                try:
                    with urllib.request.urlopen(api_url) as api_res:
                        api_data = json.loads(api_res.read().decode('utf-8'))
                        # API usually returns {"ranking": [...]} 
                        if "ranking" in api_data:
                            # Map API format to our format if necessary
                            # Showroom API ranking format: 
                            # { "rank": 1, "point": 100, "room": { "room_id": 1, "room_name": "...", "room_url_key": "..." } }
                            # It matches our output format closely.
                            ranking = api_data["ranking"]
                except Exception as e:
                    # API fetch failed, ignore and return empty
                    pass

        print(json.dumps({"ranking": ranking}, ensure_ascii=False))

    except Exception as e:
        # Output JSON error
        print(json.dumps({"error": str(e)}, ensure_ascii=False))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        # Handle full URL or just the key
        # If arg contains 'showroom-live.com/event/', extract the part after it
        match = re.search(r'showroom-live\.com/event/([^/?]+)', arg)
        if match:
            scrape(match.group(1))
        else:
            # Assume it's the key
            scrape(arg)
    else:
        print(json.dumps({"error": "No URL key provided"}))
