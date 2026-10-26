import { VERTICAL_MANIFEST_VERSION, type VerticalManifestV1 } from '@99agent/contracts';

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const CONFIG_KEY_PATTERN = /^[a-zA-Z0-9_]+$/u;

export interface VerticalManifestValidation {
  manifest?: VerticalManifestV1;
  errors: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 校验垂直包清单的形状；只做结构与安全性检查，业务合法性由各段的应用逻辑负责 */
export function validateVerticalManifest(raw: unknown): VerticalManifestValidation {
  const errors: string[] = [];
  if (!isPlainObject(raw)) return { errors: ['清单必须是 JSON 对象'] };

  if (raw.manifestVersion !== VERTICAL_MANIFEST_VERSION) {
    errors.push(`manifestVersion 必须为 ${VERTICAL_MANIFEST_VERSION}`);
  }
  if (typeof raw.name !== 'string' || !NAME_PATTERN.test(raw.name)) {
    errors.push('name 只允许小写字母 / 数字 / 短横线，2-64 位');
  }
  for (const key of ['displayName', 'version', 'description']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') errors.push(`${key} 必须是字符串`);
  }

  if (raw.site !== undefined) {
    if (!isPlainObject(raw.site)) errors.push('site 必须是对象');
    else {
      for (const key of ['siteName', 'siteDescription', 'systemPrompt']) {
        if (raw.site[key] !== undefined && typeof raw.site[key] !== 'string') {
          errors.push(`site.${key} 必须是字符串`);
        }
      }
      if (raw.site.configs !== undefined) {
        if (!isPlainObject(raw.site.configs)) errors.push('site.configs 必须是对象');
        else {
          for (const [key, value] of Object.entries(raw.site.configs)) {
            if (!CONFIG_KEY_PATTERN.test(key)) errors.push(`site.configs 键不合法：${key}`);
            if (!['string', 'number', 'boolean'].includes(typeof value)) {
              errors.push(`site.configs.${key} 只能是字符串 / 数字 / 布尔`);
            }
          }
        }
      }
    }
  }

  if (raw.mcpServers !== undefined) {
    if (!Array.isArray(raw.mcpServers)) errors.push('mcpServers 必须是数组');
    else {
      raw.mcpServers.forEach((entry, index) => {
        if (!isPlainObject(entry) || typeof entry.name !== 'string' || !entry.name.trim()) {
          errors.push(`mcpServers[${index}] 缺少 name`);
        }
      });
    }
  }

  if (raw.sandbox !== undefined) {
    if (!isPlainObject(raw.sandbox)) errors.push('sandbox 必须是对象');
    else {
      if (raw.sandbox.image !== undefined && typeof raw.sandbox.image !== 'string') {
        errors.push('sandbox.image 必须是字符串');
      }
      if (raw.sandbox.skills !== undefined) {
        if (!Array.isArray(raw.sandbox.skills)) errors.push('sandbox.skills 必须是数组');
        else {
          raw.sandbox.skills.forEach((entry, index) => {
            if (typeof entry !== 'string' || !entry.trim()) {
              errors.push(`sandbox.skills[${index}] 必须是相对路径`);
            } else if (
              entry.startsWith('/') ||
              entry.split(/[\\/]/u).includes('..') ||
              entry.includes('\0')
            ) {
              errors.push(`sandbox.skills[${index}] 不允许绝对路径或 ..：${entry}`);
            }
          });
        }
      }
    }
  }

  if (raw.extensions !== undefined && !isPlainObject(raw.extensions)) {
    errors.push('extensions 必须是对象');
  }

  return errors.length ? { errors } : { manifest: raw as unknown as VerticalManifestV1, errors };
}
