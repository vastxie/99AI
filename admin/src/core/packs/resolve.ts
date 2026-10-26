import { defineAsyncComponent, markRaw, type Component } from 'vue';
import type { AdminComponentLoader } from './defineAdminPack';

const resolved = new Map<string, Component>();

/** 把包贡献的组件加载器解析成可渲染的异步组件（按贡献 id 缓存） */
export function resolvePackComponent(id: string, loader: AdminComponentLoader): Component {
  let component = resolved.get(id);
  if (!component) {
    component = markRaw(defineAsyncComponent(loader));
    resolved.set(id, component);
  }
  return component;
}
