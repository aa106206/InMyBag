-- SnapBag: 사진 기록/촬영 위치 저장에 필요한 bag_items 컬럼 보강
-- 기존 202607170001 마이그레이션에서 note / location_latitude / location_longitude 컬럼이
-- 누락돼 "Could not find the 'location_latitude' column of 'bag_items'" 오류가 났다.
-- Supabase Dashboard > SQL Editor에서 실행해도 됩니다. (여러 번 실행해도 안전)

alter table public.bag_items
  add column if not exists note text,
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision;
