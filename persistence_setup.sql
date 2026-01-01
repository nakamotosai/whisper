-- 1. 消息表
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_avatar_seed TEXT,
    user_name TEXT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages (room_id);

-- 2. 全站存储监控表
CREATE TABLE IF NOT EXISTS site_stats (
    key TEXT PRIMARY KEY,
    value_int BIGINT DEFAULT 0
);

-- 初始化总占用字节数为 0
INSERT INTO site_stats (key, value_int) VALUES ('total_bytes_used', 0) ON CONFLICT DO NOTHING;

-- 3. 图片记录表 (增加 size 字段以便统计)
CREATE TABLE IF NOT EXISTS shared_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    file_size BIGINT DEFAULT 0,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 存储统计触发器
-- 当插入新图片时，自动累加总占用量
CREATE OR REPLACE FUNCTION update_storage_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE site_stats SET value_int = value_int + NEW.file_size WHERE key = 'total_bytes_used';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_storage_stats
AFTER INSERT ON shared_images
FOR EACH ROW EXECUTE FUNCTION update_storage_stats();

-- 5. 自动清理函数 (保持每房间 500 条消息)
CREATE OR REPLACE FUNCTION delete_old_messages()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM messages
    WHERE id NOT IN (
        SELECT id FROM messages
        WHERE room_id = NEW.room_id
        ORDER BY timestamp DESC
        LIMIT 500
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_delete_old_messages ON messages;
CREATE TRIGGER trigger_delete_old_messages AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION delete_old_messages();
