import urllib.request
import urllib.error
import sys
import json
import io

# Force stdout to use utf-8 encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def fetch_log(room_id):
    url = f"https://www.showroom-live.com/api/live/comment_log?room_id={room_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://www.showroom-live.com/",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    }
    
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            if response.getcode() == 200:
                body = response.read().decode('utf-8')
                print(body)
            else:
                print(json.dumps({"error": f"Status {response.getcode()}"}))
    except urllib.error.HTTPError as e:
        print(json.dumps({"error": f"HTTP {e.code}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        fetch_log(sys.argv[1])
    else:
        print(json.dumps({"error": "No room_id provided"}))
