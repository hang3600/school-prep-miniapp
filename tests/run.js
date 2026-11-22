/**
 * 回归总入口：node tests/run.js
 * 依次执行各测试套件，汇总通过/失败，失败时以非零码退出（便于做发布门禁）。
 */

const { summary, resetCounters } = require('./harness.js');

const SUITES = [
  require('./store.test.js'),
  require('./privacy.test.js'),
  require('./features.test.js'),
  require('./category.test.js'),
  require('./content.test.js'),
  require('./hardening.test.js')
];

let totalFailed = 0;
let totalPassed = 0;

SUITES.forEach((suite) => {
  resetCounters();
  console.log('\n── ' + suite.name + ' ──');
  try {
    suite.run();
  } catch (e) {
    console.log('  ✗ 套件执行异常: ' + e.message);
    console.log(e.stack);
    totalFailed += 1;
  }
  const s = summary();
  totalPassed += s.passed;
  totalFailed += s.failed;
  console.log('  ' + s.passed + ' passed, ' + s.failed + ' failed');
});

console.log('\n════════════════════════════');
console.log('总计: ' + totalPassed + ' passed, ' + totalFailed + ' failed');
console.log('════════════════════════════');

// 首页学段引导含 500ms setTimeout，强制退出避免进程挂起
process.exit(totalFailed ? 1 : 0);
