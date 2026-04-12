# MÚSCULO VPS 2 — Checklist de Deploy
**Fecha:** 12 de abril de 2026  
**Repo:** aliuntravelsrl-hash/musculo-vps  
**VPS:** Hostinger Ubuntu + Dokploy/Traefik

---

## ⚠️ FIX CRÍTICO ANTES DE CORRER `docker compose up`

### El problema
`docker-compose.yml` usa `image: paperclipai/paperclip:latest` — esa imagen **NO existe** en Docker Hub.  
La imagen oficial de Paperclip se construye desde su source en GitHub (no publican imagen prebuilt).

### La solución: build desde source

**En el VPS, antes del deploy:**
```bash
# Dentro del directorio musculo-vps:
git clone https://github.com/paperclipai/paperclip.git paperclip-src
```

**Luego editar `docker-compose.yml` — reemplazar el bloque `paperclip`:**

```yaml
# ANTES (línea ~3):
  paperclip:
    image: paperclipai/paperclip:latest   # ← NO EXISTE

# DESPUÉS:
  paperclip:
    build:
      context: ./paperclip-src
      dockerfile: Dockerfile
```

El resto del bloque `paperclip` (ports, environment, volumes, networks, labels) queda **exactamente igual**.

**Nota sobre env vars de Paperclip:** El compose usa `PAPERCLIP_DATA_DIR=/data/paperclip` pero el Dockerfile oficial
monta en `/paperclip`. Cambiar el volume también:
```yaml
    volumes:
      - paperclip_data:/paperclip    # era /data/paperclip
```

---

## CHECKLIST COMPLETO

### PRE-REQUISITOS (antes de conectarse al VPS)

- [ ] **DNS configurados** — los 3 subdominios apuntan al IP del VPS:
  ```
  paperclip.aliuntravelsrl.com   → IP_VPS
  antigravity.aliuntravelsrl.com → IP_VPS
  marketing.aliuntravelsrl.com   → IP_VPS
  ```
  Verificar con: `dig paperclip.aliuntravelsrl.com` — debe devolver el IP correcto antes de continuar (Traefik necesita DNS activo para emitir SSL con Let's Encrypt)

- [ ] **Docker y Docker Compose** instalados en el VPS
  ```bash
  docker --version      # >= 24.x
  docker compose version  # >= 2.x
  ```

- [ ] **Dokploy/Traefik** instalado y escuchando puertos 80/443
  ```bash
  curl http://localhost/   # debe responder (aunque sea 404)
  ```

---

### PASO 1 — Clonar repos

```bash
ssh usuario@IP_VPS
cd /opt   # o /home/usuario — donde prefieras

# Repo principal
git clone git@github.com:aliuntravelsrl-hash/musculo-vps.git
cd musculo-vps

# Paperclip source (necesario para el build)
git clone https://github.com/paperclipai/paperclip.git paperclip-src
```

---

### PASO 2 — Fix del docker-compose.yml

```bash
# Editar el compose para usar build en vez de image
nano docker-compose.yml
```

Cambiar:
```yaml
paperclip:
    image: paperclipai/paperclip:latest
```
Por:
```yaml
paperclip:
    build:
      context: ./paperclip-src
      dockerfile: Dockerfile
```

Y cambiar el volume de Paperclip:
```yaml
    volumes:
      - paperclip_data:/paperclip   # era /data/paperclip
```

---

### PASO 3 — Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Rellenar con estos valores exactos:

```bash
# ── PAPERCLIP DB ──────────────────────────────
PAPERCLIP_DB_PASS=<genera: openssl rand -base64 24>

# ── PAPERCLIP AUTH ────────────────────────────
BETTER_AUTH_SECRET=<genera: openssl rand -base64 32>
PAPERCLIP_PUBLIC_URL=https://paperclip.aliuntravelsrl.com

# ── LLMs (opcionales para Paperclip) ──────────
OPENAI_API_KEY=sk-...          # si tienes
ANTHROPIC_API_KEY=sk-ant-...   # si tienes

# ── GEMINI (Antigravity + Atlas Marketing) ─────
GEMINI_API_KEY=AIza...

# ── PERPLEXITY (Atlas Marketing) ──────────────
PERPLEXITY_API_KEY=pplx-...

# ── SUPABASE (Antigravity + Atlas Marketing) ───
SUPABASE_URL=https://oyihiyivdhfxpyiwnmqk.supabase.co
SUPABASE_KEY=<service role key>

# ── INTER-VPS TOKEN ───────────────────────────
INTER_VPS_TOKEN=<genera: openssl rand -base64 32>
```

Generar los secretos directamente en el VPS:
```bash
echo "PAPERCLIP_DB_PASS=$(openssl rand -base64 24)" >> .env
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env
echo "INTER_VPS_TOKEN=$(openssl rand -base64 32)" >> .env
```

---

### PASO 4 — Build y levantar

```bash
# Build de las imágenes locales (Paperclip tarda ~5-10min primera vez)
docker compose build

# Levantar en background
docker compose up -d
```

**Orden de inicio automático (depends_on):**
```
paperclip_db → healthy (10s)
ollama       → healthy (60s, descarga modelos)  
antigravity  → healthy (15s)  
atlas_marketing → healthy (15s)
paperclip    → healthy (30s, espera paperclip_db)
ollama_pull  → one-shot (descarga llama3.1 ~4.5GB, 10-15min)
```

---

### PASO 5 — Verificar salud

```bash
# Estado de todos los contenedores
docker compose ps

# Logs en vivo (Ctrl+C para salir)
docker compose logs -f paperclip
docker compose logs -f antigravity
docker compose logs -f atlas_marketing
docker compose logs -f ollama

# Health checks individuales
curl http://localhost:3100/health   # Paperclip
curl http://localhost:3000/health   # Antigravity
curl http://localhost:4000/health   # Atlas Marketing
curl http://localhost:11434/api/tags  # Ollama (lista modelos)
```

**Output esperado Antigravity:**
```
[ANTIGRAVITY] Server running on port 3000
[ANTIGRAVITY] Gemini connected ✓
[ANTIGRAVITY] OLLAMA_URL: http://ollama:11434
```

---

### PASO 6 — Verificar acceso HTTPS

```bash
# Con DNS ya propagado y Traefik activo:
curl https://paperclip.aliuntravelsrl.com/health
curl https://antigravity.aliuntravelsrl.com/health
curl https://marketing.aliuntravelsrl.com/health
```

---

### PASO 7 — Conectar con n8n (post-deploy)

Una vez el stack está arriba, configurar en n8n los endpoints de los agentes:

```
Antigravity endpoint: https://antigravity.aliuntravelsrl.com/api/generate
Atlas Marketing endpoint: https://marketing.aliuntravelsrl.com/api/analyze
```

Para pasar el `PAPERCLIP_HEARTBEAT_TOKEN` en los headers de n8n:
```
Authorization: Bearer <valor de INTER_VPS_TOKEN>
```

---

## RESUMEN DE ESTADO POR SERVICIO

| Servicio | Imagen/Build | Puerto | Estado esperado |
|---|---|---|---|
| `paperclip` | Build desde `./paperclip-src` ⚠️ fix requerido | 3100 | UI en paperclip.aliuntravelsrl.com |
| `paperclip_db` | `postgres:16-alpine` ✅ | interno | Solo red interna |
| `antigravity` | Build desde `./antigravity-squad` ✅ | 3000 | API en antigravity.aliuntravelsrl.com |
| `atlas_marketing` | Build desde `./atlas-marketing` ✅ | 4000 | API en marketing.aliuntravelsrl.com |
| `ollama` | `ollama/ollama:latest` ✅ | interno | Solo red interna |
| `ollama_pull` | `ollama/ollama:latest` ✅ | — | One-shot, descarga llama3.1 |

---

## COMANDOS ÚTILES POST-DEPLOY

```bash
# Reiniciar un servicio específico
docker compose restart antigravity

# Ver logs de los últimas 50 líneas
docker compose logs --tail=50 paperclip

# Actualizar código y rebuild
git pull
docker compose build antigravity
docker compose up -d antigravity

# Bajar todo (datos se conservan en volumes)
docker compose down

# Bajar y destruir volumes (CUIDADO — borra datos)
docker compose down -v
```
