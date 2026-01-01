-- 启用空间扩展
CREATE EXTENSION IF NOT EXISTS postgis;

-- 用户位置表（用于计算中心点）
CREATE TABLE IF NOT EXISTS public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  location GEOGRAPHY(POINT) NOT NULL,
  country TEXT,
  city TEXT,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 开启 Row Level Security (RLS)
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户插入和更新自己的位置
CREATE POLICY "Allow anonymous insert/update" ON public.user_locations
FOR ALL USING (true) WITH CHECK (true);

-- 实时计算中心点的函数
CREATE OR REPLACE FUNCTION get_group_centroid(target_city TEXT, target_country TEXT)
RETURNS JSON AS $$
DECLARE
    centroid GEOMETRY;
    result JSON;
BEGIN
    SELECT ST_Centroid(ST_Collect(location::geometry))
    INTO centroid
    FROM public.user_locations
    WHERE city = target_city 
      AND country = target_country
      AND last_seen > NOW() - INTERVAL '5 minutes';

    IF centroid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT json_build_object(
        'lng', ST_X(centroid),
        'lat', ST_Y(centroid)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;
