# Curadoria da Nova Carta · Terraço Itália

PWA (Progressive Web App) para Diana Milena Pinilla de Oliveira curar os vinhos da nova carta.

## Stack
- **Frontend:** HTML/CSS/JS puro — sem dependências, funciona em qualquer browser
- **Backend:** Supabase PostgreSQL (`fvwlfoksplfwfcbnenwj.supabase.co`)
- **Storage:** Supabase Storage (bucket `diana-wines`) para fotos
- **Hosting:** GitHub Pages

## Setup — Passo a Passo

### 1. Criar as tabelas no Supabase

1. Acesse [supabase.com](https://supabase.com) → seu projeto
2. Vá em **SQL Editor**
3. Cole e execute o conteúdo de `schema.sql`

### 2. Criar o bucket de fotos

No Supabase Dashboard:
1. Vá em **Storage**
2. Clique em **New Bucket**
3. Nome: `diana-wines`
4. Marque **Public bucket** ✅
5. Clique em **Create bucket**

### 3. Publicar no GitHub Pages

```bash
# Clone ou crie um repositório
git init
git add .
git commit -m "feat: curadoria nova carta"

# Push para GitHub
git remote add origin https://github.com/SEU_USUARIO/curadoria-terracoitalia.git
git push -u origin main

# Ativar GitHub Pages:
# Settings → Pages → Source: main branch / root
```

A URL será: `https://SEU_USUARIO.github.io/curadoria-terracoitalia/`

### 4. Instalar no celular (iOS / Android)

**iPhone / iPad (Safari):**
1. Abrir a URL no Safari
2. Tocar no botão de compartilhar (⎋)
3. Tocar em **"Adicionar à Tela de Início"**
4. Confirmar → ícone aparece na home

**Android (Chrome):**
1. Abrir a URL no Chrome
2. Menu → **"Adicionar à tela inicial"**
3. Confirmar

## Estrutura do projeto

```
curadoria/
├── index.html      # App completo (single file)
├── manifest.json   # PWA manifest
├── schema.sql      # Schema Supabase
└── README.md       # Este arquivo
```

## Tabelas Supabase

| Tabela | Descrição |
|--------|-----------|
| `diana_config` | Configurações (ondas, metas, pesos) |
| `diana_wines` | Vinhos avaliados |
| `diana_wines_view` | View com markup e onda calculados |

## Funcionalidades

- **Dashboard:** KPIs, ABC, ondas de ticket, países, importadoras, estilos, índice de experiência, alertas
- **Vinhos:** lista com filtros, busca, cards visuais
- **Novo/Editar:** formulário completo com foto, nota, preço, status
- **Configurações:** todas as metas e parâmetros editáveis
- **Offline:** cache local (localStorage) para uso sem internet

---
*Diana Milena Pinilla de Oliveira · Sommelière · Certified Port Educator*  
*Terraço Itália · São Paulo · 2026*
