<template>
  <kbd class="key-hint"><slot /></kbd>
</template>

<style scoped>
  /* 键帽：底边加厚一点，和普通文字区分开 */
  .key-hint {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    color: var(--u-text-secondary);
    background: var(--u-bg-container);
    border: 1px solid var(--u-border);
    border-bottom-width: 2px;
    border-radius: 4px;
  }

  .key-hint + .key-hint {
    margin-left: 3px;
  }
</style>
