import urllib.request
import urllib.error
import sys
import json

def check_api(room_id):
    url = f"https://www.showroom-live.com/api/live/comment_log?room_id={room_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://www.showroom-live.com/",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    }
    
    print(f"Testing URL: {url}")
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            print(f"Status Code: {response.getcode()}")
            print(f"Response Headers: {response.info()}")
            body = response.read().decode('utf-8')
            print(f"Response Body Preview: {body[:500]}")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} {e.reason}")
        print(f"Error Body: {e.read().decode('utf-8')[:500]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    room_id = sys.argv[1] if len(sys.argv) > 1 else "490133"
    check_api(room_id)
