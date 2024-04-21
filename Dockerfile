# 编译阶段
FROM node:18-alpine AS build

WORKDIR /app
COPY . .

# 使用腾讯源（国内服务器可取消下方注释以提升安装速度）
# RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

# 使用淘宝源（国内服务器可取消下方注释以提升安装速度）
# RUN npm config set registry https://registry.npmmirror.com

# 如遇到提示网站证书无效，取消下方注释，禁止严格SS策略
# RUN npm config set strict-ssl false

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
