import { defineGkdApp } from '@gkd-kit/define';

export default defineGkdApp({
  id: 'com.bestrie.aa',
  name: '百事AA记账',
  groups: [
    {
      key: 0,
      name: '全屏广告-首页弹窗广告',
      desc: '关闭首页右上角广告弹窗',
      matchTime: 10000,
      actionMaximum: 1,
      resetMatch: 'app',
      rules: [
        {
          activityIds: 'io.dcloud.PandoraEntryActivity',
          matches: '[childCount=2] > ImageView[clickable=true][index=0]',
          snapshotUrls: 'https://i.gkd.li/i/29050791',
        },
      ],
    },
  ],
});
