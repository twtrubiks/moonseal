// @ts-check
/**
 * 變異測試（mutation testing）設定。執行：pnpm test:mutation
 * 報告輸出到 reports/mutation/（已 gitignore）。
 *
 * 只變異 src/lib 底下的邏輯模組；.svelte 元件目前沒有元件測試，變異只會全部 NoCoverage。
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  // pnpm 的隔離 node_modules 下 core 找不到同層 plugin，須明確指定
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: { configFile: 'vite.config.ts' },
  mutate: [
    'src/lib/**/*.ts',
    // 純型別宣告，沒有可執行程式碼
    '!src/lib/**/types.ts'
  ],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 90, low: 80, break: null },
  // fake timers / IndexedDB 測試偶有較慢的情形，放寬逾時避免誤判成 Timeout
  timeoutMS: 10000,
  tempDirName: '.stryker-tmp'
};
