#!/bin/bash

set -e

cd admin/
pnpm install
pnpm build
cd ..

cd chat/
pnpm build
cd ..

cd service/
pnpm build
cd ..

rm -rf ../dist/* ../public/admin/* ../public/chat/*
mkdir -p ../dist ../public/admin ../public/chat

cp service/package.json ../package.json

cp -r service/dist/* ../dist
cp -r admin/dist/* ../public/admin
cp -r chat/dist/* ../public/chat

echo "打包完成!"
