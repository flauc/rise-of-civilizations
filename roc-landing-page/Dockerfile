# syntax=docker/dockerfile:1
FROM oven/bun:1 AS build
WORKDIR /app

COPY roc-landing-page/package.json roc-landing-page/bun.lock ./
RUN bun install

COPY roc-landing-page/ ./
RUN bun run build

FROM nginx:alpine AS runtime
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist ./

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
