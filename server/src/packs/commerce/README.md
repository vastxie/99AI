# 商业包（commerce）

积分 / 套餐 / 订单 / 支付 / 签到，以及后台的支付财务、账户明细、积分调整。服务端实现内核计费端口（BILLING_PORT），用户端与管理端分别经各自的挂载点接入。

## 开关

- 服务端：`COMMERCE_PACK_ENABLED`（默认开）
- 用户端：`VITE_COMMERCE_ENABLED`
- 管理端：`VITE_COMMERCE_ENABLED`

## 贡献

- 服务端：配置段 `commerce`（含默认值 registerSendStatus / registerSendCredits）、清单节 `packages`、端口 `BILLING_PORT`、用户画像片段 `commerce`
- 用户端：设置页签「会员与积分」、账号页权益卡、侧栏会员标识、头像菜单项、签到弹窗（#signin）、额度 / 会员类错误处理、支付宝回跳
- 管理端：「支付财务」菜单、用户运营下的账户明细、用户列表额度列与调整 / 赠送操作、用户详情权益片段、用户策略赠送卡片

## 删除影响

删掉三端的 `packs/commerce` 后：对话不再计费（内核用 Noop 计费放行）、getInfo 的 billing 为 null，用户端不再出现会员 / 积分 / 签到入口，后台没有支付财务与账户明细。数据表 `user_balance`、`order`、`package`、`signin` 等随包不再维护。

## 数据

签到的连续天数记录在本包的 `signin.consecutiveDays`；计费摘要（credits / memberCredits / sumCredits …）由本包解释，内核只原样转发。
