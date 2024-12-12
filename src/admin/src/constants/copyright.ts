export const copyRight = {
  wex: '5qyi6L+O5L2T6aqMTmluZUFJ',
  qnum: 'MjAyMyAtIDIwMjQ=',
  website: '',
  /* 下三个是个人的 上面是公开的 */
  // wex: 'Vng6IEpfbG9uZ3lhbg==',
  // qnum: 'UVE6IDkyNzg5ODYzOQ==',
  // website: 'aHR0cHM6Ly9haS5qaWFuZ2x5LmNvbQ==',
  name: 'TmluZSBBaQ==',
};

export function atob(str: string) {
  if (!str) {
    return '';
  }
  return decodeURIComponent(escape(window.atob(str)));
}
