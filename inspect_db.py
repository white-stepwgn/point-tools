import sqlite3

def inspect_db():
    conn = sqlite3.connect('alldata.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    for name, sql in tables:
        print(f"--- Table: {name} ---")
        print(sql)
        print("\n")
    conn.close()

if __name__ == "__main__":
    inspect_db()
