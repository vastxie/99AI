-- U1 邮箱 / 手机号防重：部署前后的只读核对（只输出计数与排序规则名，不输出任何联系方式）。
-- 用法：mysql ... <库名> < u1-contact-gate.sql；u1-contact-dedup.manual.ts 也对构造的数据逐条执行它。
-- 门槛（必须为 0，否则停止部署）：G1 G2 G3a Q1 Q5 Q7 Q8；五列排序规则必须完全相同。
-- G3b 大于 0 时，目标版本必须启用对应的验证码渠道包（EMAIL_PACK_ENABLED / PHONE_PACK_ENABLED）。
-- Q2 Q3 Q6 记基线，部署后不得增加。「非空」用 CHAR_LENGTH(列) > 0：utf8mb4_unicode_ci 补空格比较，= '' 会把全空格也算进去。
SELECT 'collation' AS k, CONCAT(TABLE_NAME, '.', COLUMN_NAME, '=', COLLATION_NAME) AS v FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'users' AND COLUMN_NAME IN ('email', 'phone')) OR (TABLE_NAME = 'user_auth_identities' AND COLUMN_NAME IN ('providerUserId', 'email', 'phone'))) ORDER BY TABLE_NAME, COLUMN_NAME;
SELECT 'G1_email' AS k, COUNT(*) AS v FROM user_auth_identities i JOIN users u ON u.id = i.userId WHERE i.provider = 'local_email' AND u.email IS NOT NULL AND CHAR_LENGTH(u.email) > 0 AND NOT (CAST(u.email AS BINARY) <=> CAST(i.email AS BINARY));
SELECT 'G1_phone' AS k, COUNT(*) AS v FROM user_auth_identities i JOIN users u ON u.id = i.userId WHERE i.provider = 'local_phone' AND u.phone IS NOT NULL AND CHAR_LENGTH(u.phone) > 0 AND NOT (CAST(u.phone AS BINARY) <=> CAST(i.phone AS BINARY));
SELECT 'G2_email' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_email' AND NOT (CAST(i.email AS BINARY) <=> CAST(i.providerUserId AS BINARY));
SELECT 'G2_phone' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_phone' AND NOT (CAST(i.phone AS BINARY) <=> CAST(i.providerUserId AS BINARY));
SELECT 'G3a_email' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_email' AND JSON_TYPE(JSON_EXTRACT(i.extra, '$.contactField')) <=> 'STRING' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(i.extra, '$.contactField')) AS BINARY) = 'phone';
SELECT 'G3a_phone' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_phone' AND JSON_TYPE(JSON_EXTRACT(i.extra, '$.contactField')) <=> 'STRING' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(i.extra, '$.contactField')) AS BINARY) = 'email';
SELECT 'G3b_email' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_email' AND NOT (JSON_TYPE(JSON_EXTRACT(i.extra, '$.contactField')) <=> 'STRING' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(i.extra, '$.contactField')) AS BINARY) IN ('email', 'phone'));
SELECT 'G3b_phone' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_phone' AND NOT (JSON_TYPE(JSON_EXTRACT(i.extra, '$.contactField')) <=> 'STRING' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(i.extra, '$.contactField')) AS BINARY) IN ('email', 'phone'));
SELECT 'Q1_email' AS k, COUNT(*) AS v FROM (SELECT email FROM users WHERE email IS NOT NULL AND CHAR_LENGTH(email) > 0 GROUP BY email HAVING COUNT(*) > 1) t;
SELECT 'Q1_phone' AS k, COUNT(*) AS v FROM (SELECT phone FROM users WHERE phone IS NOT NULL AND CHAR_LENGTH(phone) > 0 GROUP BY phone HAVING COUNT(*) > 1) t;
SELECT 'Q2_email' AS k, COUNT(*) AS v FROM users u WHERE u.email IS NOT NULL AND CHAR_LENGTH(u.email) > 0 AND NOT EXISTS (SELECT 1 FROM user_auth_identities i WHERE i.userId = u.id AND i.provider = 'local_email');
SELECT 'Q2_phone' AS k, COUNT(*) AS v FROM users u WHERE u.phone IS NOT NULL AND CHAR_LENGTH(u.phone) > 0 AND NOT EXISTS (SELECT 1 FROM user_auth_identities i WHERE i.userId = u.id AND i.provider = 'local_phone');
SELECT 'Q3_email' AS k, COUNT(*) AS v FROM user_auth_identities i JOIN users u ON u.id = i.userId WHERE i.provider = 'local_email' AND (u.email IS NULL OR CHAR_LENGTH(u.email) = 0);
SELECT 'Q3_phone' AS k, COUNT(*) AS v FROM user_auth_identities i JOIN users u ON u.id = i.userId WHERE i.provider = 'local_phone' AND (u.phone IS NULL OR CHAR_LENGTH(u.phone) = 0);
SELECT 'Q5' AS k, COUNT(*) AS v FROM user_auth_identities i LEFT JOIN users u ON u.id = i.userId WHERE u.id IS NULL AND i.provider IN ('local_email', 'local_phone');
SELECT 'Q6_email' AS k, COUNT(*) AS v FROM users WHERE email IS NOT NULL AND CHAR_LENGTH(email) = 0;
SELECT 'Q6_phone' AS k, COUNT(*) AS v FROM users WHERE phone IS NOT NULL AND CHAR_LENGTH(phone) = 0;
SELECT 'Q7_email' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_email' AND EXISTS (SELECT 1 FROM users u WHERE u.email = i.providerUserId AND u.id <> i.userId);
SELECT 'Q7_phone' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_phone' AND EXISTS (SELECT 1 FROM users u WHERE u.phone = i.providerUserId AND u.id <> i.userId);
SELECT 'Q8_email' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_email' AND (i.email IS NULL OR CHAR_LENGTH(i.email) = 0);
SELECT 'Q8_phone' AS k, COUNT(*) AS v FROM user_auth_identities i WHERE i.provider = 'local_phone' AND (i.phone IS NULL OR CHAR_LENGTH(i.phone) = 0);
