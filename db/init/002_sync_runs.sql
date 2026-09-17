-- Manbadan (Davlat mulki AT) har bir yuklab olish sessiyasi tarixi

CREATE TABLE IF NOT EXISTS sync_runs (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT        NOT NULL DEFAULT 'davlat-mulki',
  received      INTEGER     NOT NULL DEFAULT 0,  -- kelgan yozuvlar soni
  created_count INTEGER     NOT NULL DEFAULT 0,  -- yangi qo'shilgani
  updated_count INTEGER     NOT NULL DEFAULT 0,  -- yangilangani
  unchanged_count INTEGER   NOT NULL DEFAULT 0,  -- o'zgarishsiz qolgani
  errors        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sync_runs_started_idx ON sync_runs (started_at DESC);
