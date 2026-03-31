# Dockerfile — ATLAS-MARKETING v1.0
# Idéntica estructura al Antigravity Squad para consistencia
FROM node:20-alpine

LABEL maintainer="ALIUN Travel SRL"
LABEL description="ATLAS-MARKETING — 5 Agentes Estratégicos de Marketing"
LABEL service="atlas-marketing"

WORKDIR /app

# Copiar dependencias
COPY package*.json ./
RUN npm install --production

# Copiar código fuente
COPY atlas_marketing_server.js .

# Puerto del servicio
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health',(r)=>{process.exit(r.statusCode===200?0:1)})"

# Usuario no-root
USER node

CMD ["node", "atlas_marketing_server.js"]
