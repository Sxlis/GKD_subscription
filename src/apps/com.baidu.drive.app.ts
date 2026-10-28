import { defineGkdApp } from '@gkd-kit/define';

export default defineGkdApp({
  id: 'com.baidu.drive.app',
  name: '百度网盘',
  groups: [
    {
      key: 0,
      name: '权限提示-通知权限',
      desc: '点击「暂不开启」',
      fastQuery: true,
      matchTime: 10000,
      actionMaximum: 1,
      resetMatch: 'app',
      rules: [
        {
          matches: '[text="开启推送提醒"] +n * > [text="暂不开启"]',
          snapshotUrls: 'https://i.gkd.li/i/34078965',
        },
      ],
    },
  ],
});
