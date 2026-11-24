# A imagem final leva só o resultado do `mastra build`, que já traz as próprias
# dependências de produção: sem TypeScript, sem a CLI do Mastra, sem o código-fonte.
FROM node:22-alpine AS build
WORKDIR /app
# Dependências numa camada própria: mudar o código não reinstala nada.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# O Studio é servido pelo próprio agente e descobre o endereço pela URL aberta.
ENV MASTRA_STUDIO_PATH=./studio MASTRA_AUTO_DETECT_URL=true MASTRA_HIDE_CLOUD_CTA=true
COPY --from=build --chown=node:node /app/.mastra/output ./
USER node
EXPOSE 4111
CMD ["node", "index.mjs"]
