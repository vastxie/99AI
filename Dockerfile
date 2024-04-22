# 编译阶段
FROM node:18-alpine AS base
FROM base AS build
WORKDIR /app
COPY package.json ./

# 使用腾讯源（国内服务器可取消下方注释以提升安装速度）
# RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

# 使用淘宝源（国内服务器可取消下方注释以提升安装速度）
# RUN npm config set registry https://registry.npmmirror.com

# 如遇到提示网站证书无效，取消下方注释，禁止严格SS策略
# RUN npm config set strict-ssl false

# 安装项目依赖
RUN apk add --no-cache --virtual .build-deps git && \
    npm install --omit=dev && \
    apk del .build-deps


# 运行阶段
FROM base AS runner
ENV TZ="Asia/Shanghai"

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY . .

EXPOSE 9520

CMD ["node", "./dist/main.js"]
