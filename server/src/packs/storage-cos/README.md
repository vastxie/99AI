# 腾讯云 COS 存储包

腾讯云 COS 的存储实现与按作用域（public / private）读取站点配置的工厂；工厂在构造时向内核 StorageProviderRegistry 登记。

## 开关

- 服务端：`STORAGE_COS_PACK_ENABLED`
- 管理端：`VITE_STORAGE_COS_ENABLED`

## 贡献

- 存储名 `cos`；管理端「文件存储」公共 / 私有存储下拉里的选项与配置字段

## 删除影响

删掉后 `cos` 不再出现在下拉里，已选用它的文件读写会报「不支持的文件存储服务」；内核始终自带本地目录存储。
