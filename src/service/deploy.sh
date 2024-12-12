#!/usr/bin/env bash
export LANG=zh_CN.UTF-8

# Set up color variables for output
red='\033[0;31m'
green='\033[0;32m'
plain='\033[0m'

# Default values
NVM_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh"
default_node_version="18.16.0"
CHATGPT_PORT=9520
CONFIG_FILE=docker-compose.yml

# Welcome message
echo -e "${green}欢迎使用99AI一键部署和升级脚本${plain}"
echo -e "${green}----------------------------------------${plain}"
echo -e "${green}注意：${plain}"
echo -e "${green}1. Node.js 部署方式需要提前安装好 MySQL 和 Redis。${plain}"
echo -e "${green}2. Docker 部署方式可以选择新建 MySQL 和 Redis 容器。${plain}"
echo -e "${green}3. 从旧版本升级 Docker 时，请确保 data 和 SQL 文件已备份到根目录。${plain}"
echo -e "${green}----------------------------------------${plain}"

check_cpu_arch() {
  case "$(uname -m)" in
    aarch64) arch=linux_arm64 ;;
    i686) arch=linux_386 ;;
    arm) arch=linux_arm ;;
    x86_64) arch=linux_amd64 ;;
  esac
}

check_os() {
  if [[ "$(uname)" == "Darwin" ]]; then
    os_name="macOS"
    InstallMethod="brew"
  else
    if command -v lsb_release >/dev/null; then
      DISTRO=$(lsb_release -i -s)
    else
      DISTRO=$(grep -oP '^ID=\K.*' /etc/*-release)
    fi
    case "$DISTRO" in
      Debian|Ubuntu) os_name="${DISTRO}-based Linux"; InstallMethod="sudo apt-get" ;;
      centos)
        if [[ "$(grep -oP '^VERSION_ID="\K[0-9]+' /etc/*-release)" == "7" ]]; then
          os_name="CentOS 7"; InstallMethod="yum"
        else
          os_name="CentOS 8"; InstallMethod="dnf"
        fi ;;
      fedora) os_name="Fedora"; InstallMethod="dnf" ;;
      opensuse-leap) os_name="openSUSE Leap"; InstallMethod="sudo zypper" ;;
      *) echo "未知操作系统，脚本不支持"; exit 1 ;;
    esac
  fi
}

install_if_missing() {
  if ! command -v "$1" >/dev/null; then
    echo -e "${red}$1 未安装，正在安装 $1...${plain}"
    ${InstallMethod} install -y "$1"
    echo -e "${green}$1 已安装${plain}"
  else
    echo -e "${green}$1 已安装${plain}"
  fi
}

install_nvm_and_node() {
  if ! command -v node >/dev/null; then
    echo -e "${red}node 未安装${plain}"
    echo -e "${red}开始安装NVM${plain}"
    curl -o- $NVM_URL | bash || wget -qO- $NVM_URL | bash
    source ~/.bashrc
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

    echo -e "${green}列出node可用版本${plain}"
    nvm ls-remote
    read -p "请输入要安装的 Node.js 版本号 ，不知道安装啥的请回车[默认版本：$default_node_version]：" node_version
    node_version="${node_version:-$default_node_version}"
    echo -e "${red}正在安装 node-v$node_version${plain}"
    nvm install $node_version
    nvm use $node_version
    source ~/.bashrc

    if ! command -v node >/dev/null; then
      echo -e "${red}Node.js 安装失败，请检查错误信息！${plain}"
      exit 1
    fi
    installed_version=$(node -v)
    if [[ "$installed_version" != "v$node_version" ]]; then
      echo -e "${red}Node.js 安装失败，当前安装版本为 $installed_version, 期望安装版本为 v$node_version ${plain}"
      exit 1
    fi
    echo -e "${green}Node.js 安装完成!${plain}"
  else
    echo -e "${green}node 已安装${plain}"
  fi
}

install_add_docker() {
  if [ -f "/etc/alpine-release" ]; then
    echo -e "${red}docker 未安装，正在安装 docker...${plain}"
    apk update
    apk add docker docker-compose
    echo -e "${green}docker 和 docker-compose 已安装${plain}"
    rc-update add docker default
    service docker start
  else
    echo -e "${red}docker 未安装，正在安装 docker...${plain}"
    curl -fsSL https://get.docker.com | sh
    echo -e "${green}docker 已安装${plain}"
    ln -s /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin
    echo -e "${green}docker-compose 已安装${plain}"
    systemctl start docker
    systemctl enable docker
  fi
  echo -e "${green}docker 和 docker-compose 已安装${plain}"
  sleep 2
}

docker_install() {
  if ! command -v docker &>/dev/null; then
    install_add_docker
  else
    echo "Docker 已经安装"
  fi
}

check_dependencies() {
  check_cpu_arch
  check_os

  ${InstallMethod} update -y >/dev/null 2>&1

  install_if_missing git
  install_if_missing cat
  install_if_missing curl

  if [[ "$operation_choice" == "1" || "$operation_choice" == "2" ]]; then
    install_nvm_and_node
    install_if_missing npm

    if ! command -v pm2 >/dev/null; then
      echo -e "${red}pm2 未安装，正在安装 pm2...${plain}"
      npm install -g pm2
      echo -e "${green}pm2 已安装${plain}"
    else
      echo -e "${green}pm2 已安装${plain}"
    fi
  elif [[ "$operation_choice" == "3" || "$operation_choice" == "4" ]]; then
    docker_install
  fi
}

# Node.js 部署任务
node_deploy() {
  # 选择依赖管理工具
  read -p "请选择依赖管理工具（1. pnpm 2. yarn，输入q退出）[默认: 1]: " package_manager_choice
  package_manager_choice=${package_manager_choice:-1}

  if [[ "$package_manager_choice" == "q" ]]; then
    echo "退出脚本"
    exit
  fi

  if [[ "$package_manager_choice" == "2" ]]; then
    if ! command -v yarn >/dev/null; then
      echo -e "${red}yarn 未安装，正在安装 yarn...${plain}"
      npm install -g yarn
      echo -e "${green}yarn 已安装${plain}"
    else
      echo -e "${green}yarn 已安装${plain}"
    fi
    package_manager="yarn"
  else
    if ! command -v pnpm >/dev/null; then
      echo -e "${red}pnpm 未安装，正在安装 pnpm...${plain}"
      npm install -g pnpm
      echo -e "${green}pnpm 已安装${plain}"
    else
      echo -e "${green}pnpm 已安装${plain}"
    fi
    package_manager="pnpm"
  fi

  # 选择安装方式
  read -p "请选择安装方式（1. 全新安装 2. 更新，输入q退出）[默认: 1]: " install_choice
  install_choice=${install_choice:-1}

  if [[ "$install_choice" == "q" ]]; then
    echo "退出脚本"
    exit
  fi

  if [[ "$install_choice" == "2" ]]; then
    echo "开始安装依赖包"
    $package_manager install
    echo "安装完成，开始运行99AI"
    $package_manager start
    pm2 save
    exit
  fi

  echo -e "${green}请确保已安装MySQL和Redis${plain}"

  echo -e "${green}正在进行运行配置${plain}"
  read -p "设置PORT（程序访问端口）为[回车默认: 9520]: " input_port
  PORT=${input_port:-9520}

  read -p "设置DB_HOST为（数据库地址）[回车默认: 127.0.0.1]: " input_db_host
  DB_HOST=${input_db_host:-127.0.0.1}

  read -p "设置DB_PORT为（数据库端口）[回车默认: 3306]: " input_db_port
  DB_PORT=${input_db_port:-3306}

  read -p "设置DB_USER为（数据库用户名）[回车默认: root]: " input_db_user
  DB_USER=${input_db_user:-root}

  read -p "设置DB_PASS（数据库密码）为[回车默认: 空]: " input_db_pass
  DB_PASS=${input_db_pass:-""}

  read -p "设置DB_DATABASE（数据库名）为: " input_db_database
  DB_DATABASE=${input_db_database:-""}

  read -p "设置REDIS_PORT（redis端口）为[回车默认: 6379]: " input_redis_port
  REDIS_PORT=${input_redis_port:-6379}

  read -p "设置REDIS_HOST（redis地址）为[回车默认: 127.0.0.1]: " input_redis_host
  REDIS_HOST=${input_redis_host:-127.0.0.1}

  read -p "设置REDIS_PASSWORD（redis密码）为[回车默认: 空]: " input_redis_password
  REDIS_PASSWORD=${input_redis_password:-""}

  read -p "设置REDIS_DB（redis数据库）为[回车默认: 0]: " input_redis_db
  REDIS_DB=${input_redis_db:-"0"}

  cat >.env <<EOF
# server base
PORT=$PORT
PREFIX=/docs
APIPREFIX=/api

# MySQL
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASS=$DB_PASS
DB_DATABASE=$DB_DATABASE
DB_SYNC=true

# Redis
REDIS_PORT=$REDIS_PORT
REDIS_HOST=$REDIS_HOST
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_DB=$REDIS_DB

# 是否测试环境
ISDEV=FALSE

NAMESPACE=AIWEB
EOF

  declare -a NPM_MIRRORS=(
    "淘宝镜像" "https://registry.npmmirror.com"
    "阿里云镜像" "https://npm.aliyun.com"
    "腾讯云镜像" "https://mirrors.cloud.tencent.com/npm/"
    "华为云镜像" "https://mirrors.huaweicloud.com/repository/npm/"
    "网易镜像" "https://mirrors.163.com/npm/"
    "中科院大学开源镜像站" "http://mirrors.ustc.edu.cn/"
    "清华大学开源镜像站" "https://mirrors.tuna.tsinghua.edu.cn/"
  )

  echo -e "${green}请选择要使用的npm源：${plain}"

  for ((i=0; i<${#NPM_MIRRORS[@]}; i+=2)); do
    echo "$((i / 2 + 1))) ${NPM_MIRRORS[i]}"
  done

  echo "8) 不使用国内源"
  echo "9) 退出"

  read -p "请输入数字（1-9）: " selection

  case $selection in
  1 | 2 | 3 | 4 | 5 | 6 | 7)
    echo "设置npm源为：${NPM_MIRRORS[$(($selection * 2 - 1))]} ..."
    $package_manager config set registry ${NPM_MIRRORS[$(($selection * 2 - 1))]}
    echo "设置完成."
    ;;
  8)
    echo "您选择了不使用国内源."
    ;;
  9)
    echo "退出设置."
    exit
    ;;
  *)
    echo "无效选择"
    ;;
  esac

  echo "开始安装依赖包"
  $package_manager install
  echo "安装完成，开始运行99AI"
  $package_manager start
  pm2 save

  echo -e "=================================================================="
  echo -e "\033[32m安装成功!\033[0m"
  echo -e "=================================================================="

  quit
}

# Docker-compose 启动任务
start_compose() {
  echo "配置阶段完成，启动docker-compose up -d。"
  docker-compose up -d
  echo "已启动docker-compose并使用默认配置启动了以下服务："
  docker-compose ps
}

# Docker-compose 配置任务
config_compose() {
  echo "开始配置……"
  source .env.docker

  read -p "是否修改端口[默认 9520]（y/n，输入q退出）: " change_port
  if [[ $change_port == "y" ]]; then
    read -p "输入您想修改的端口: " CHATGPT_PORT
  elif [[ $change_port == "q" ]]; then
    echo "退出脚本"
    exit
  fi

  check_port() {
    netstat -tlpn | grep "\b$1\b" &> /dev/null
  }

  if [[ $change_port == "y" ]]; then
    while check_port $CHATGPT_PORT; do
      read -p "端口 $CHATGPT_PORT 被占用，请重新输入端口: " CHATGPT_PORT
    done
    echo -e "\e[34m恭喜，端口 $CHATGPT_PORT 可用\e[0m"
    sed -E -i "s/[0-9]+:9520/$CHATGPT_PORT:9520/" docker-compose.yml
  fi

  start_compose
}

# Docker-compose 升级任务
upgrade_compose() {
  echo "停止当前服务..."
  docker-compose down
  echo "重新构建并启动服务..."
  docker-compose up -d --build
  echo "服务已启动。"
  docker-compose ps
}

# 选择操作
echo "请选择操作："
echo "1. Node.js 全新部署"
echo "2. Node.js 升级"
echo "3. Docker-compose 部署"
echo "4. Docker-compose 升级"

read -p "请输入数字（1-4，输入q退出）[默认: 1]: " operation_choice
operation_choice=${operation_choice:-1}

if [[ "$operation_choice" == "q" ]]; then
  echo "退出脚本"
  exit
fi

check_dependencies

case $operation_choice in
  1)
    echo "Node.js 全新部署选择"
    node_deploy
    ;;
  2)
    echo "Node.js 升级选择"
    node_deploy
    ;;
  3)
    echo "Docker-compose 部署选择"
    config_compose
    ;;
  4)
    echo "Docker-compose 升级选择"
    upgrade_compose
    ;;
  *)
    echo "无效选择，退出。"
    quit
    ;;
esac

echo -e "=================================================================="
echo -e "\033[32m安装成功!\033[0m"
echo -e "=================================================================="
