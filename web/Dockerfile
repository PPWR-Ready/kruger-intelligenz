# Web-App als statische Seite mit nginx ausliefern.
# Build:  docker build -t kruger-web --build-arg VITE_SUPABASE_URL=… --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=… .
FROM node:22-alpine AS bau
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_DATENSCHUTZ_URL
ARG VITE_KONTAKT_EMAIL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-sicherheit.conf /etc/nginx/snippets/sicherheit.conf
COPY --from=bau /app/dist /usr/share/nginx/html
EXPOSE 80
