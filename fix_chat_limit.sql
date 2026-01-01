-- 修复消息清理触发器
-- 原来的触发器逻辑可能导致在子查询返回空时清空整个表
-- 新逻辑使用 WHERE id IN (... OFFSET 200)，更加安全且符合"保留200条"的需求

CREATE OR REPLACE FUNCTION delete_old_messages()
RETURNS TRIGGER AS $$
BEGIN
    -- 删除特定房间中，按时间倒序排列超过200条之后的消息
    DELETE FROM messages
    WHERE id IN (
        SELECT id FROM messages
        WHERE room_id = NEW.room_id
        ORDER BY timestamp DESC
        OFFSET 200
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 确保存储触发器被重置
DROP TRIGGER IF EXISTS trigger_delete_old_messages ON messages;
CREATE TRIGGER trigger_delete_old_messages 
    AFTER INSERT ON messages 
    FOR EACH ROW 
    EXECUTE FUNCTION delete_old_messages();
