import '@/styles/github-markdown.less';
import '@/styles/global.less';
import '@/styles/highlight.less';
import '@/styles/tailwind.css';
import 'katex/dist/katex.min.css';

/** Tailwind's Preflight Style Override */
function naiveStyleOverride() {
  const meta = document.createElement('meta');
  meta.name = 'naive-ui-style';
  document.head.appendChild(meta);
}

function setupAssets() {
  naiveStyleOverride();
}

export default setupAssets;
