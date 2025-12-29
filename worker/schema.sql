DROP TABLE IF EXISTS users;
CREATE TABLE users (
    uid TEXT PRIMARY KEY,
    name TEXT,
    last_seen INTEGER,
    history TEXT -- JSON文字列として過去の名前リストを保存
);
