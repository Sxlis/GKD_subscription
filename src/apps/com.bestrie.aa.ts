import { defineGkdApp } from '@gkd-kit/define';

export default defineGkdApp({
  id: 'com.bestrie.aa',
  name: '百事AA记账',
  groups: [
    {
      key: 0,
      name: '全屏广告-首页永久会员广告',
      desc: '点击“两周内不再提醒”',
      matchTime: 10000,
      forcedTime: 10000,
      actionMaximum: 1,
      resetMatch: 'app',
      rules: [
        {
          activityIds: '.MainActivity',
          matches: '[desc="两周内不再提醒"]',
          snapshotUrls: 'https://i.gkd.li/i/33593980',
        },
      ],
    },
    {
      key: 1,
      name: '更新提示-首页更新提示',
      desc: '点击关闭',
      matchRoot: true,
      matchTime: 10000,
      forcedTime: 5000,
      actionMaximum: 1,
      resetMatch: 'app',
      rules: [
        {
          activityIds: '.MainActivity',
          matches: '[desc="发现新版本"] + [index=2][clickable=true]',
          snapshotUrls: 'https://i.gkd.li/i/33594027',
        },
      ],
    },
  ],
});
