# ================================================================
# Dockerfile — Atlas Marketing
# Aliun Travel SRL | Musculo VPS 2
# Node.js 20 LTS Alpine — imagen ligera para producción
# ================================================================

FROM node:20-alpine

# Metadata
LABEL maintainer="Aliun Travel SRL"
LABEL service="atlas-marketing"
LABEL version="1.0"

# Directorio de trabajo
WORKDIR /app

# Copiar manifiestos primero (aprovecha cache de Docker)
COPY package.json ./

# Instalar dependencias de producción solamente
RUN npm install --omit=dev && npm cache clean --force

# Copiar el código del servidor
COPY atlas_marketing_server.js ./server.js

# Crear directorio de workspace si no existe
RUN mkdir -p /workspaces/ALIUN_ATLAS

# Usuario no-root para seguridad
RUN addgroup -S aliun && adduser -S aliun -G aliun
RUN chown -R aliun:aliun /app /workspaces
USER aliun

# Puerto que expone el servicio
EXPOSE 4000

# Health check interno
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health',(r)=>{process.exit(r.statusCode===200?0:1)})" || exit 1

# Arranque
CMD ["node", "server.js"]
