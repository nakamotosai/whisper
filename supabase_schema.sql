-- 启用 PostGIS 扩展用于空间计算
CREATE EXTENSION IF NOT EXISTS postgis;

-- 创建用户位置表
CREATE TABLE IF NOT EXISTS public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  location GEOGRAPHY(POINT) NOT NULL,
  country TEXT,
  city TEXT,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建空间索引提高查询效率
CREATE INDEX IF NOT EXISTS idx_user_locations_geo ON public.user_locations USING GIST (location);

-- 函数：计算特定城市的活跃用户中心点
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
