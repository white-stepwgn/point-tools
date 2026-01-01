import requests
from bs4 import BeautifulSoup
import math
import sys
import json

# HTMLの文字化け対策（標準出力のエンコーディング設定）
sys.stdout.reconfigure(encoding='utf-8')

def search_showroom_avatar(target_id, output_json=False):
    # 1. URLの計算ロジック
    try:
        target_id_int = int(target_id)
    except ValueError:
        if output_json: return json.dumps({"found": False, "error": "Invalid ID"})
        return "エラー: 数値のIDを入力してください。"

    # "1000450" -> "1000401" のように、そのIDが含まれるページの先頭番号を計算
    
    def get_avatar_page_url(aid):
        # Specific ranges from HTML
        if 1 <= aid <= 100: return "https://www.sr-avatar.com/ava1.html"
        if 101 <= aid <= 145: return "https://www.sr-avatar.com/ava101.html"
        if 100001 <= aid <= 100100: return "https://www.sr-avatar.com/ava100001.html"
        if 203001 <= aid <= 203086: return "https://www.sr-avatar.com/ava203001.html"
        if 204001 <= aid <= 204042: return "https://www.sr-avatar.com/ava204001.html"
        if 205001 <= aid <= 205100: return "https://www.sr-avatar.com/ava205001.html"
        if 205101 <= aid <= 205148: return "https://www.sr-avatar.com/ava205101.html"
        if 300001 <= aid <= 300029: return "https://www.sr-avatar.com/ava300001.html"

        # Block A: 1000001 - 1070000 (Approx Original 001 - 700)
        # Note: Original 700 is ava1069901, so range goes up to 1070000
        if 1000001 <= aid < 1111101: 
             # Use formula
             page_start = ((aid - 1) // 100) * 100 + 1
             return f"https://www.sr-avatar.com/ava{page_start}.html"

        # Block B: 1111101 - ... (Original 701 - 960+)
        # Last listed is 960 (1137001), assuming pattern continues or stops there
        if 1111101 <= aid < 2000000:
             page_start = ((aid - 1) // 100) * 100 + 1
             return f"https://www.sr-avatar.com/ava{page_start}.html"
             
        # Avatar Shop
        if aid >= 2000000 and aid < 3000001:
            return "https://www.sr-avatar.com/ava_shop.html"
            
        # Make Avatar
        if aid >= 3000001:
            return "EXTERNAL_MAKEAVATAR"

        # Fallback (Others)
        return "https://www.sr-avatar.com/ava999.html"

    # URL取得
    url = get_avatar_page_url(target_id_int)
    
    if url == "EXTERNAL_MAKEAVATAR":
        msg = "このアバターIDは Make Avatar (https://makeavatar.jp) の範囲です。\nSHOWROOMのルームプロフィールではありません。"
        if output_json: return json.dumps({"found": False, "error": msg, "external_url": "https://makeavatar.jp"})
        return msg
    
    # 2. ページを取得
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0"
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.encoding = response.apparent_encoding
        
        if response.status_code != 200:
            if output_json: return json.dumps({"found": False, "error": f"Page not found: {response.status_code}", "url": url})
            return f"ページが見つかりませんでした (Status: {response.status_code})\nURL: {url}"

        # 3. HTML解析
        soup = BeautifulSoup(response.text, "html.parser")
        target_id_str = str(target_id)
        
        target_text_nodes = soup.find_all(string=lambda t: t and target_id_str in t)
        target_imgs = soup.find_all('img', src=lambda s: s and target_id_str in s)
        
        if not target_text_nodes and not target_imgs:
             if output_json: return json.dumps({"found": False, "error": "ID not found in page", "url": url})
             return f"このページ内に ID: {target_id} は見つかりませんでした。\n検索URL: {url}"

        found_link = None
        
        # 画像検索からのリンク特定
        for img in target_imgs:
            link = img.find_parent('a')
            if link:
                room_name = link.get_text(strip=True)
                room_url = link.get("href")
                if room_url and ("showroom-live.com" in room_url or room_url.startswith("/room/")):
                     found_link = (room_name, room_url)
                     break

        if not found_link:
            for node in target_text_nodes:
                text = node.strip()
                if "～" in text or ("-" in text and len(text) > 15): 
                     continue
                
                element = node.parent
                link = None

                if element.name == 'a':
                    link = element
                else:
                    link = element.find_parent('a')
                    if not link:
                        p = element.previous_element
                        for _ in range(20):
                            if not p: break
                            if p.name == 'a':
                                link = p
                                break
                            p = p.previous_element
                
                if link:
                    room_name = link.get_text(strip=True)
                    room_url = link.get("href")
                    if room_url and ("showroom-live.com" in room_url or room_url.startswith("/room/")):
                         found_link = (room_name, room_url)
                         break 

        if found_link:
            room_name, room_url = found_link
            if not room_name: room_name = "(画像リンク)"
            if room_url and not room_url.startswith("http"):
                room_url = "https://www.showroom-live.com" + room_url

            if output_json:
                return json.dumps({
                    "found": True,
                    "room_name": room_name,
                    "room_url": room_url,
                    "source_url": url
                }, ensure_ascii=False)
            
            return f"特定成功\nルーム名: {room_name}\nURL: {room_url}"
        else:
            if output_json:
                 return json.dumps({"found": False, "error": "Link not found for ID", "url": url})
            
            if target_imgs or target_text_nodes:
                 return f"アバターID ({target_id}) はページ内に存在しましたが、ルームへのリンクが見つかりませんでした。\n（ルームが削除されたか、リンクが設定されていない可能性があります）"
            else:
                 return f"このページ内に ID: {target_id} は見つかりませんでした。\n検索URL: {url}"

    except Exception as e:
        if output_json: return json.dumps({"found": False, "error": str(e)})
        return f"エラーが発生しました: {e}"

# --- 実行 ---
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("target_id", nargs='?', help="Target Avatar ID")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    args = parser.parse_args()

    input_id = args.target_id
    if not input_id:
        if not args.json:
            input_id = input("探したいアバターIDを入力してください: ")
        else:
            print(json.dumps({"found": False, "error": "No ID provided"}))
            sys.exit(1)

    result = search_showroom_avatar(input_id, output_json=args.json)
    print(result)
