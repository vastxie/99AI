# 编译阶段
FROM node:18-alpine AS base
FROM base AS build
WORKDIR /app
COPY package.json ./

# 使用腾讯源（国内服务器可取消下方注释以提升安装速度）
# RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

# 如遇到提示网站证书无效，取消下方注释，禁止严格SS策略
# RUN npm config set strict-ssl false

# 使用淘宝源安装项目依赖（国内用户居多）
RUN npm config set registry https://registry.npmmirror.com && \
    npm install --omit=dev


# 运行阶段
FROM base AS runner
ENV TZ="Asia/Shanghai"

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY . .

EXPOSE 9520

CMD ["node", "./dist/main.js"]
