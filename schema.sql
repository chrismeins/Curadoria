-- ============================================================
-- CURADORIA DA NOVA CARTA — DIANA MILENA · TERRAÇO ITÁLIA
-- Schema Supabase PostgreSQL
-- ============================================================

-- TABELA: Configurações gerais (chave-valor)
CREATE TABLE IF NOT EXISTS diana_config (
  id          SERIAL PRIMARY KEY,
  chave       TEXT UNIQUE NOT NULL,
  valor       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed de configurações padrão
INSERT INTO diana_config (chave, valor) VALUES
  ('ondas_ticket', '[
    {"id":1,"nome":"Entrada","ate":200,"meta_pct":15},
    {"id":2,"nome":"Acessível","de":201,"ate":500,"meta_pct":30},
    {"id":3,"nome":"Premium","de":501,"ate":900,"meta_pct":30},
    {"id":4,"nome":"Alto Padrão","de":901,"ate":1600,"meta_pct":15},
    {"id":5,"nome":"Exclusivo","de":1601,"meta_pct":10}
  ]'),
  ('metas_abc', '{"A":30,"B":45,"C":25}'),
  ('metas_estilo', '{"Espumante":8,"Branco":12,"Rosé":5,"Tinto":30,"Sobremesa":5,"Fortificado":5}'),
  ('pesos_indice', '{"estilos":2.5,"geografico":2.5,"ocasiao":2.5,"profundidade":2.5}'),
  ('limites', '{"concentracao_pais":35,"concentracao_ocasiao":40,"min_ontrade_pct":30}'),
  ('metas_profundidade', '{"onda1":10,"onda2":25,"onda3":25,"onda4":15,"onda5":8}')
ON CONFLICT (chave) DO NOTHING;

-- TABELA: Vinhos avaliados
CREATE TABLE IF NOT EXISTS diana_wines (
  id                  SERIAL PRIMARY KEY,
  nome                TEXT NOT NULL,
  produtor            TEXT,
  importadora         TEXT,
  pais                TEXT,
  regiao              TEXT,
  uvas                TEXT,
  safra               TEXT,
  formato             TEXT CHECK (formato IN ('Dose 50ml','Taça 150ml','375ml','750ml','Magnum 1,5L')),
  ontrade_exclusivo   BOOLEAN DEFAULT FALSE,
  tipo                TEXT CHECK (tipo IN ('Espumante','Branco','Rosé','Tinto','Sobremesa','Fortificado')),
  ocasiao             TEXT CHECK (ocasiao IN ('Entrada','Harmonização','Celebração','Colecionador','Versátil')),
  pontuacao_critico   INTEGER,
  fonte_critico       TEXT,
  nota_diana          NUMERIC(3,1) CHECK (nota_diana >= 1 AND nota_diana <= 10),
  notas_degustacao    TEXT,
  preco_custo         NUMERIC(10,2),
  preco_venda         NUMERIC(10,2),
  abc_projetado       TEXT CHECK (abc_projetado IN ('A','B','C')),
  status              TEXT DEFAULT 'Em Avaliação' CHECK (status IN ('Em Avaliação','Aprovado','Reprovado')),
  pontos_negativos    TEXT[],
  foto_url            TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- View: markup e onda calculados
CREATE OR REPLACE VIEW diana_wines_view AS
SELECT
  w.*,
  CASE WHEN w.preco_custo > 0 THEN ROUND(w.preco_venda / w.preco_custo, 2) END AS markup,
  CASE
    WHEN w.preco_venda <= 200   THEN 'Onda 1'
    WHEN w.preco_venda <= 500   THEN 'Onda 2'
    WHEN w.preco_venda <= 900   THEN 'Onda 3'
    WHEN w.preco_venda <= 1600  THEN 'Onda 4'
    ELSE 'Onda 5'
  END AS onda_ticket
FROM diana_wines w;

-- RLS: público para leitura/escrita (app single-user, sem auth complexa)
ALTER TABLE diana_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE diana_wines  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_config" ON diana_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_wines"  ON diana_wines  FOR ALL USING (true) WITH CHECK (true);

-- Trigger: updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wines_updated_at BEFORE UPDATE ON diana_wines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Storage bucket para fotos
-- (executar via Supabase dashboard ou API separada)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('diana-wines', 'diana-wines', true);
