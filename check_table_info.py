import sqlite3

def check_table():
    conn = sqlite3.connect('alldata.db')
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(user_unique_ac)")
        columns = cursor.fetchall()
        print(f"Found {len(columns)} columns:")
        for col in columns:
            print(f"CID: {col[0]}, Name: {col[1]}, Type: {col[2]}")
    except Exception as e:
        print(f"Error: {e}")
    conn.close()

if __name__ == "__main__":
    check_table()
