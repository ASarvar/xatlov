-- 1-bosqich: "Davlat mulki" AT dan olinadigan Davlat muassasalari ro'yxati (STIR bo'yicha)

CREATE TABLE IF NOT EXISTS organisations (
  id            BIGSERIAL PRIMARY KEY,
  typeid        INTEGER,                 -- tashkilot turi (manba tizimi klassifikatori)
  source_id     TEXT,                    -- manba tizimidagi identifikator
  org_name      TEXT        NOT NULL,    -- tashkilot nomi
  region_id     INTEGER,                 -- viloyat
  district_id   INTEGER,                 -- tuman/shahar
  tin           VARCHAR(9)  NOT NULL,    -- STIR (9 xonali)
  state         SMALLINT    NOT NULL DEFAULT 1,  -- 1 = faol, 0 = nofaol/tugatilgan
  soato         VARCHAR(20),             -- MHOBT kodi
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(), -- manbadan oxirgi marta olingan vaqt
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organisations_tin_key UNIQUE (tin),
  CONSTRAINT organisations_tin_format CHECK (tin ~ '^[0-9]{9}$'),
  CONSTRAINT organisations_state_chk CHECK (state IN (0, 1))
);

CREATE INDEX IF NOT EXISTS organisations_region_idx   ON organisations (region_id);
CREATE INDEX IF NOT EXISTS organisations_district_idx ON organisations (district_id);
CREATE INDEX IF NOT EXISTS organisations_state_idx    ON organisations (state);
CREATE INDEX IF NOT EXISTS organisations_source_idx   ON organisations (typeid, source_id);
CREATE INDEX IF NOT EXISTS organisations_name_idx     ON organisations USING gin (to_tsvector('simple', org_name));

-- updated_at ni avtomatik yangilash
-- Faqat haqiqiy ma'lumot o'zgarganda updated_at yangilanadi
-- (synced_at har importda yangilanadi, bu o'zgarish hisoblanmaydi).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  IF (to_jsonb(NEW) - 'updated_at' - 'synced_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'synced_at') THEN
    NEW.updated_at = now();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organisations_set_updated_at ON organisations;
CREATE TRIGGER organisations_set_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
