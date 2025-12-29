import sqlite3

def check_data():
    conn = sqlite3.connect('alldata.db')
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM user_unique_ac LIMIT 1")
        row = cursor.fetchone()
        print(f"Row data: {row}")
    except Exception as e:
        print(f"Error: {e}")
    conn.close()

if __name__ == "__main__":
    check_data()
