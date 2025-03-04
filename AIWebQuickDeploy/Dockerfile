# 编译阶段
FROM node:20.14.0-alpine AS build

WORKDIR /app

COPY package*.json ./

# 设置环境变量来忽略一些警告
ENV NPM_CONFIG_LOGLEVEL=error
ENV NODE_OPTIONS=--max-old-space-size=4096

# 合并RUN命令，更新依赖，设置镜像源，安装依赖，然后清理
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
  npm config set registry https://registry.npmmirror.com && \
  apk add --no-cache --virtual .build-deps git && \
  npm install -g npm@latest && \
  npm install --production --no-optional --legacy-peer-deps && \
  npm cache clean --force && \
  apk del .build-deps && \
  rm -rf /var/cache/apk/* /tmp/*

# 运行阶段
FROM node:20.14.0-alpine AS runner

ENV TZ="Asia/Shanghai" \
  NODE_ENV=production

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY . .

EXPOSE 9520

CMD ["node", "--max-old-space-size=4096", "./dist/main.js"]
