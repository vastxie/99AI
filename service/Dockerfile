# 使用官方Node.js的基础镜像
FROM node:latest

# 设置时区为上海
ENV TZ="Asia/Shanghai"

# 设置工作目录
WORKDIR /usr/src/app

# 安装pnpm
RUN npm install -g npm pm2 pnpm

# 复制package.json以利用Docker缓存机制
COPY package.json ./
RUN pnpm install

# 暴露应用端口
EXPOSE 9520

# 启动应用
CMD ["pm2-runtime", "start", "pm2.conf.json"]
