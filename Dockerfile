# 编译阶段
FROM node:18-alpine AS build

WORKDIR /app
COPY . .

# 使用 pnpm 安装项目依赖
RUN npm install -g pnpm
RUN pnpm install

# 运行阶段
FROM node:18-alpine
ENV TZ="Asia/Shanghai"

WORKDIR /app
COPY --from=build /app .
EXPOSE 9520

CMD ["node", "./dist/main.js"]
