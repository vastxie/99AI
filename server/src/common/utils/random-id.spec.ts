import { FILE_ID_PATTERN } from '../constants/id-pattern.constant';
import { CHAT_GROUP_GID_PATTERN, createChatGroupGid } from './createChatGroupGid';
import { createChatLogCid, isChatLogCid } from './createChatLogCid';
import { createFileId, createStorageId } from './createFileAssetId';
import { createRandomNonceStr } from './createRandomNonceStr';
import { createRandomUniqueString } from './createRandomUniqueString';
import { createUserUid } from './createUserUid';
import { ALPHANUMERIC_ALPHABET, randomAlphanumeric, randomHex } from './random-id';

declare const describe: any;
declare const expect: any;
declare const it: any;

/** 连续生成 count 个值，断言互不重复后返回，供逐个校验格式 */
function uniqueValues(factory: () => string, count = 200): string[] {
  const values = Array.from({ length: count }, factory);
  expect(new Set(values).size).toBe(values.length);
  return values;
}

describe('random-id', () => {
  it('randomAlphanumeric 只使用给定字符集并按长度输出', () => {
    expect(ALPHANUMERIC_ALPHABET).toHaveLength(62);
    expect(randomAlphanumeric(0)).toBe('');
    for (const value of uniqueValues(() => randomAlphanumeric(32))) {
      expect(value).toMatch(/^[0-9A-Za-z]{32}$/);
    }
    for (let i = 0; i < 50; i += 1) {
      expect(randomAlphanumeric(16, 'ab')).toMatch(/^[ab]{16}$/);
    }
  });

  it('randomHex 输出小写十六进制并支持奇数长度', () => {
    expect(randomHex(0)).toBe('');
    for (const value of uniqueValues(() => randomHex(32))) {
      expect(value).toMatch(/^[0-9a-f]{32}$/);
    }
    for (let i = 0; i < 50; i += 1) {
      expect(randomHex(9)).toMatch(/^[0-9a-f]{9}$/);
    }
  });
});

describe('ID 生成器格式守卫', () => {
  it('createChatGroupGid：g_ + 24 位字母数字，支持自定义前缀', () => {
    for (const gid of uniqueValues(() => createChatGroupGid())) {
      expect(gid).toMatch(CHAT_GROUP_GID_PATTERN);
    }
    expect(createChatGroupGid('w_')).toMatch(/^w_[0-9A-Za-z]{24}$/);
  });

  it('createChatLogCid：c_ + 24 位 URL 安全字符，可缩短长度', () => {
    for (const cid of uniqueValues(() => createChatLogCid())) {
      expect(cid).toMatch(/^c_[0-9A-Za-z_-]{24}$/);
      expect(isChatLogCid(cid)).toBe(true);
    }
    expect(createChatLogCid(16)).toMatch(/^c_[0-9A-Za-z_-]{16}$/);
  });

  it('createUserUid：12 位字母数字', () => {
    for (const uid of uniqueValues(() => createUserUid())) {
      expect(uid).toMatch(/^[0-9A-Za-z]{12}$/);
    }
  });

  it('createRandomNonceStr：指定长度的字母数字串', () => {
    for (const nonce of uniqueValues(() => createRandomNonceStr(32))) {
      expect(nonce).toMatch(/^[0-9A-Za-z]{32}$/);
    }
    expect(createRandomNonceStr(8)).toMatch(/^[0-9A-Za-z]{8}$/);
  });

  it('createFileId / createStorageId：固定前缀与长度，file id 满足 FILE_ID_PATTERN', () => {
    for (const fileId of uniqueValues(() => createFileId())) {
      expect(fileId).toMatch(/^file_[0-9A-Za-z]{24}$/);
      expect(FILE_ID_PATTERN.test(fileId)).toBe(true);
    }
    for (const storageId of uniqueValues(() => createStorageId())) {
      expect(storageId).toMatch(/^stor_[0-9A-Za-z]{18}$/);
    }
  });

  it('createRandomUniqueString：默认 32 位小写十六进制，支持自定义长度', () => {
    for (const token of uniqueValues(() => createRandomUniqueString())) {
      expect(token).toMatch(/^[0-9a-f]{32}$/);
    }
    expect(createRandomUniqueString(48)).toMatch(/^[0-9a-f]{48}$/);
  });
});
