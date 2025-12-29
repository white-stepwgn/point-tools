import sqlite3
import requests
import time
from datetime import datetime
import sys
import random
import os

# Windows Console Encoding Fix
if sys.platform.startswith('win') and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration
DB_PATH = 'alldata.db'
WORKER_URL = 'https://userid-names.geten777.workers.dev'
BATCH_SIZE = 10

CHECKPOINT_FILE = 'upload_checkpoint.txt'

def get_last_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r') as f:
                content = f.read().strip()
                if content:
                    parts = content.split(',')
                    if len(parts) >= 2:
                        return float(parts[0]), str(parts[1])
                    # 互換性: タイムスタンプのみの場合
                    return float(parts[0]), ""
        except Exception as e:
            print(f"Error reading checkpoint: {e}")
    return 0, ""

def save_checkpoint(timestamp, uid):
    with open(CHECKPOINT_FILE, 'w') as f:
        f.write(f"{timestamp},{uid}")

def get_users_from_db():
    last_ts, last_uid = get_last_checkpoint()
    
    print(f"Reading from {DB_PATH}...")
    if last_ts > 0:
        dt_str = datetime.fromtimestamp(last_ts).strftime('%Y-%m-%d %H:%M:%S')
        print(f"Resuming from checkpoint: {dt_str} (UID: {last_uid})")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.text_factory = str  # Force UTF-8 handling
        cursor = conn.cursor()
        
        # u: User ID (col 0)
        # ac: Account Name (col 1)
        # created_at: Timestamp seconds (col 3)
        
        # Resume logic: Sort by created_at, u. Filter > checkpoint.
        query = """
            SELECT u, ac, created_at 
            FROM user_unique_ac 
            WHERE created_at IS NOT NULL 
            AND (created_at > ? OR (created_at = ? AND u > ?))
            ORDER BY created_at ASC, u ASC
        """
        cursor.execute(query, (last_ts, last_ts, last_uid))
        rows = cursor.fetchall()
        
        users = []
        for row in rows:
            uid = row[0]
            name = row[1]
            created_at = row[2]
            
            if created_at:
                try:
                    dt = datetime.fromtimestamp(created_at)
                    last_seen = dt.isoformat()
                except:
                    last_seen = created_at
            else:
                last_seen = datetime.now().isoformat() # Fallback

            if uid and name:
                users.append({
                    'uid': str(uid),
                    'name': name,
                    'last_seen': last_seen,
                    'raw_created_at': created_at # Keep for checkpoint
                })
            
        conn.close()
        print(f"Loaded {len(users)} users from database (Newer than checkpoint).")
        return users
    except Exception as e:
        print(f"Error reading DB: {e}")
        return []

def upload_users(users):
    if not users:
        print("No users to upload.")
        return

    total_users = len(users)
    print(f"Starting upload of {total_users} users to {WORKER_URL}")
    print(f"Batch size: {BATCH_SIZE}")
    
    success_count = 0
    error_count = 0

    # Calculate total batches
    total_batches = (total_users + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, total_users, BATCH_SIZE):
        batch = users[i:i + BATCH_SIZE]
        current_batch_num = i // BATCH_SIZE + 1
        
        # API用ペイロードには raw_created_at は含めないように整理
        payload_users = []
        for u in batch:
            payload_users.append({
                'uid': u['uid'],
                'name': u['name'],
                'last_seen': u['last_seen']
            })

        payload = {
            "action": "save_users",
            "users": payload_users
        }
        
        try:
            headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'SR-Live-Server-Uploader/1.0'
            }
            response = requests.post(WORKER_URL, json=payload, headers=headers)
            
            if response.status_code == 200:
                print(f"Batch {current_batch_num}/{total_batches}: Uploaded {len(batch)} users.")
                success_count += len(batch)
                
                # Update checkpoint
                last_user = batch[-1]
                if 'raw_created_at' in last_user:
                    save_checkpoint(last_user['raw_created_at'], last_user['uid'])
                    
            else:
                # Truncate error message
                error_preview = response.text[:200].replace('\n', ' ') + "..."
                print(f"Batch {current_batch_num}/{total_batches} Failed: {response.status_code} - {error_preview}")
                error_count += len(batch)
        except Exception as e:
            print(f"Batch {current_batch_num}/{total_batches} Error: {e}")
            error_count += len(batch)
            
        # Rate limiting
        sleep_time = random.uniform(5.0, 10.0)
        print(f"Sleeping for {sleep_time:.2f}s...")
        time.sleep(sleep_time)

    print(f"Upload Complete. Success: {success_count}, Failed: {error_count}")

if __name__ == "__main__":
    users = get_users_from_db()
    upload_users(users)
