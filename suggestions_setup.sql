-- 1. 创建建议表
CREATE TABLE IF NOT EXISTS suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    user_name TEXT,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 开启实时更新 (Realtime) - 使用安全检查避免重复添加报错
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'suggestions') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE suggestions;
        END IF;
    END IF;
END $$;

-- 3. 开启 RLS 并允许匿名插入和查询
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous insert" ON suggestions;
CREATE POLICY "Allow anonymous insert" ON suggestions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous select" ON suggestions;
CREATE POLICY "Allow anonymous select" ON suggestions FOR SELECT USING (true);
