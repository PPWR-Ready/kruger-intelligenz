# Web-App als statische Seite mit nginx ausliefern.
#
# Der Build-Kontext ist das Hauptverzeichnis des Repos, weil die App den
# Stream-Parser aus supabase/functions/_shared mitbenutzt.
#
# Build (im Hauptverzeichnis):
#   docker build -f web/Dockerfile -t kruger-web \
#     --build-arg VITE_SUPABASE_URL=… --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=… .
FROM node:22-alpine AS bau
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY supabase/functions/_shared /app/supabase/functions/_shared
COPY web/ ./
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_DATENSCHUTZ_URL
ARG VITE_KONTAKT_EMAIL
RUN npm run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/nginx-sicherheit.conf /etc/nginx/snippets/sicherheit.conf
COPY --from=bau /app/web/dist /usr/share/nginx/html
EXPOSE 80
