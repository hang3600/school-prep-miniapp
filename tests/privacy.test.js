/**
 * 合规回归：隐私授权链路 + 强制更新 + App 生命周期
 * 重点覆盖本次审计修复项：triggerPrivacyAuthorize 此前定义了却无任何调用方，
 * 导致审核员走查时触发不到隐私授权（本项目此前的驳回原因）。
 */

const { assert, makeState, makeEnv, loadPage, instantiate } = require('./harness.js');

function run() {
  // ---------- 1. 隐私授权：需要授权时应被主动触发 ----------
  {
    const state = makeState({ needAuthorization: true });
    const env = makeEnv(state);
    env.load('app.js');
    const app = env.appConfigs.app;
    app.onLaunch();

    assert('onLaunch 注册 onNeedPrivacyAuthorization', typeof state._privacyCb === 'function');

    // 基线：onLaunch 的 initPrivacy 已调用 1 次用于回填协议名
    const base = state.privacySettingCalls;
    assert('onLaunch 回填协议名调用过 getPrivacySetting', base === 1, base);

    const home = instantiate(loadPage(env, 'pages/home/home.js'));
    home.onShow();

    assert('首页 onShow 主动触发隐私授权', state.privacyAuthorize === 1, state.privacyAuthorize);
    assert('首页 onShow 触发一次隐私检查', state.privacySettingCalls === base + 1, state.privacySettingCalls);

    // 同一会话内重复 onShow 不应重复打扰
    home.onShow();
    home.onShow();
    assert('同一会话不重复触发授权', state.privacyAuthorize === 1, state.privacyAuthorize);
    assert('同一会话不重复检查', state.privacySettingCalls === base + 1, state.privacySettingCalls);
  }

  // ---------- 2. 隐私授权：无需授权时不打扰 ----------
  {
    const state = makeState({ needAuthorization: false });
    const env = makeEnv(state);
    env.load('app.js');
    env.appConfigs.app.onLaunch();
    const base = state.privacySettingCalls;
    const home = instantiate(loadPage(env, 'pages/home/home.js'));
    home.onShow();

    assert('已同意时不弹授权', state.privacyAuthorize === 0);
    assert('已同意时也只检查一次', state.privacySettingCalls === base + 1, state.privacySettingCalls);

    home.onShow();
    assert('已同意时 onShow 不重复检查', state.privacySettingCalls === base + 1, state.privacySettingCalls);
  }

  // ---------- 3. onNeedPrivacyAuthorization 兜底链路 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    env.load('app.js');
    const app = env.appConfigs.app;
    app.onLaunch();

    let resolved = null;
    state._privacyCb((r) => { resolved = r; });
    assert('无 popup 时走 showModal 兜底', state.modals.length === 1);
    assert('兜底弹窗含协议名', state.modals[0].content.indexOf('隐私保护指引') !== -1);
    assert('同意后 resolve agree', resolved && resolved.event === 'agree', resolved);

    // 拒绝分支
    state.modalConfirm = false;
    let resolved2 = null;
    state._privacyCb((r) => { resolved2 = r; });
    assert('拒绝后 resolve disagree', resolved2 && resolved2.event === 'disagree', resolved2);
  }

  // ---------- 4. 强制更新 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    env.load('app.js');
    env.appConfigs.app.onLaunch();

    assert('注册 onUpdateReady', typeof state._umReady === 'function');
    state._umReady();
    assert('强更弹窗无取消按钮', state.modals[0].showCancel === false);
    assert('强更按钮文案「立即重启」', state.modals[0].confirmText === '立即重启');
    assert('点击后应用更新', state.applied === true);
  }

  // ---------- 5. 更新失败不误触重启 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    env.load('app.js');
    env.appConfigs.app.onLaunch();
    state._umReady = null;
    env.appConfigs.app.initForceUpdate();
    if (typeof state._umFailed === 'function') state._umFailed();
    assert('下载失败给提示', state.modals.some((m) => m.title === '更新失败'));
    assert('下载失败不误触 applyUpdate', state.applied === false);
  }

  // ---------- 6. 隐私页面 ----------
  {
    const state = makeState();
    const env = makeEnv(state);
    const page = instantiate(loadPage(env, 'pages/privacy/privacy.js'));
    page.onLoad();
    assert('隐私页已同意状态读取正常', typeof page.data.agreed === 'boolean');

    page.onOpenContract();
    assert('查看官方协议不报错', true);

    page.onAgree();
    assert('同意后写入标记', state.storage.SP_PRIVACY_AGREED === true);
    assert('同意后更新页面状态', page.data.agreed === true);
  }
}

module.exports = { run, name: 'privacy' };
