import requests
import json
import sys

def get_room_info(room_url_key):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    # 1. Get Room ID
    status_url = f"https://www.showroom-live.com/api/room/status?room_url_key={room_url_key}"
    try:
        res = requests.get(status_url, headers=headers, timeout=10)
        data = res.json()
        room_id = data.get('room_id')
        room_name = data.get('room_name')
        
        if not room_id:
            return {"error": "Room ID not found", "details": data}
            
    except Exception as e:
        return {"error": f"Failed to fetch room status: {str(e)}"}

    # 2. Get Event Info
    event_url = f"https://www.showroom-live.com/api/room/event_and_support?room_id={room_id}"
    try:
        res = requests.get(event_url, headers=headers, timeout=10)
        data = res.json()
        
        event = data.get('event')
        if not event:
            return {
                "room_id": room_id,
                "room_name": room_name,
                "event": None,
                "message": "This room is not participating in an event."
            }
            
        return {
            "room_id": room_id,
            "room_name": room_name,
            "event_id": event.get('event_id'),
            "event_name": event.get('event_name'),
            "block_id": event.get('block_id'),
            "event_url": event.get('event_url')
        }

    except Exception as e:
        return {"error": f"Failed to fetch event info: {str(e)}"}

if __name__ == "__main__":
    key = "nozomi0201" # Default
    if len(sys.argv) > 1:
        # Extract key from full URL if pasted
        arg = sys.argv[1]
        if "showroom-live.com/r/" in arg:
            key = arg.split("/r/")[-1].split("?")[0]
        else:
            key = arg
            
    info = get_room_info(key)
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(info, indent=2, ensure_ascii=False))
