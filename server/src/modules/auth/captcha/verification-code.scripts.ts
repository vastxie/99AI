/** KEYS 依次为 code、sent、fail；凭据只通过 ARGV 传入。 */
export const ISSUE_CODE_SCRIPT = `
local remaining = redis.call('TTL', KEYS[2])
if remaining ~= -2 then return math.max(1, remaining) end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
redis.call('DEL', KEYS[3])
return 0
`;

export const VERIFY_CODE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -1 end
if ARGV[2] == '1' then
  redis.call('DEL', KEYS[1], KEYS[3])
  return 0
end
local failed = redis.call('INCR', KEYS[3])
if failed == 1 then redis.call('EXPIRE', KEYS[3], ARGV[3]) end
if failed >= tonumber(ARGV[4]) then redis.call('DEL', KEYS[1], KEYS[3]) end
return failed
`;

export const DISCARD_CODE_SCRIPT = `
local saved = redis.call('GET', KEYS[1])
if saved and cjson.decode(saved).requestId == ARGV[1] then
  redis.call('DEL', KEYS[1], KEYS[3])
end
if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
return 0
`;
