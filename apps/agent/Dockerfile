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
COPY --from=build --chown=node:node /app/.mastra/output ./
USER node
EXPOSE 4111
CMD ["node", "index.mjs"]
