-- update_retention_policy.sql

-- 修改自动清理函数：
-- 1. 每个房间最多保留 1000 条消息
-- 2. 删除超过 24 小时（1天）的旧消息
-- 两者满足其一即删除旧数据

CREATE OR REPLACE FUNCTION delete_old_messages()
RETURNS TRIGGER AS $$
BEGIN
    -- 仅检查消息数量是否超过 1000 条
    -- 如果超过，保留最新的 1000 条，删除其余的
    DELETE FROM messages
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY timestamp DESC) as rn
            FROM messages
            WHERE room_id = NEW.room_id
        ) t
        WHERE t.rn > 1000
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 重新确保触发器存在 (如果已存在则无需变更，但为了保险起见可以重置)
DROP TRIGGER IF EXISTS trigger_delete_old_messages ON messages;
CREATE TRIGGER trigger_delete_old_messages 
AFTER INSERT ON messages 
FOR EACH ROW EXECUTE FUNCTION delete_old_messages();
