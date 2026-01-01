import requests
import re
import json
import sys

def find_block_info(event_url_key):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    url = f"https://www.showroom-live.com/event/{event_url_key}"
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            return {"error": f"Failed to fetch page: {response.status_code}"}
        
        html = response.text
        results = {"event_url_key": event_url_key}
        
        # 1. event_id の特定
        # ページ内のルームIDを抽出してAPIを叩く
        room_ids = re.findall(r'room_id=(\d+)', html)
        
        # room_idsが空の場合の対策 (プロフィールリンクなど別のパターンも考慮)
        if not room_ids:
             # href="/room/profile?room_id=..." パターン
             room_ids = re.findall(r'room_id=(\d+)', html)
        
        # URLキーのみでAPIが叩ける場合もあるが、確実なのはルーム経由
        found_event = False
        
        # 抽出したルームIDを使ってAPIを試し、該当イベントの情報を探す
        # 最初の数個だけ試せば十分 (全部やると遅い)
        for rid in set(room_ids[:5]): 
            api_url = f"https://www.showroom-live.com/api/room/event_and_support?room_id={rid}"
            try:
                api_res = requests.get(api_url, headers=headers, timeout=5).json()
                if 'event' in api_res and api_res['event']:
                    # イベントIDが取れたら、それが探しているイベントか確認する術はないが、
                    # イベントページのリンクにあるルームなので、そのイベントに参加している可能性が高い。
                    # ただし、複数のイベントバナーがある可能性もあるので、event_url_key比較ができればベスト。
                    
                    evt = api_res['event']
                    # イベントURLキーが含まれているかチェック (完全一致はしないこともある)
                    if event_url_key in evt.get('event_url', ''):
                        results['event_id'] = evt.get('event_id')
                        results['event_name'] = evt.get('event_name')
                        found_event = True
                        break
                    
                    # キーが一致しなくても、とりあえず確保しておき、ループ終了もしくは一致するものが見つかるまで探す
                    if 'event_id' not in results:
                         results['event_id'] = evt.get('event_id')
                         results['event_name'] = evt.get('event_name')

            except:
                continue
            
            if found_event:
                break
        
        # 2. block_id の特定 (セレクトボックスから)
        blocks = re.findall(r'<option[^>]*value=["\'](\d+)["\'][^>]*>([^<]+)</option>', html)
        if blocks:
            # 重複除外
            unique_blocks = {}
            for b in blocks:
                unique_blocks[b[0]] = b[1]
            results['blocks'] = [{"block_id": k, "name": v} for k, v in unique_blocks.items()]
        
        return results

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    # 引数がなければエラー、あれば実行
    if len(sys.argv) > 1:
        key = sys.argv[1]
        # URLキーに余計なクエリがついていたら除去
        key = key.split('?')[0].split('&')[0]
        info = find_block_info(key)
        print(json.dumps(info, indent=2, ensure_ascii=False))
    else:
        print(json.dumps({"error": "No event_url_key provided"}, indent=2))
