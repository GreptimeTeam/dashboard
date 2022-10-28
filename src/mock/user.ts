import Mock from 'mockjs'
import setupMock, { successResponseWrap, failResponseWrap } from '@/utils/setup-mock'

setupMock({
  setup() {
    // Mock.XHR.prototype.withCredentials = true;

    // 用户信息
    Mock.mock(new RegExp('/api/user/info'), () => {
      const role = window.localStorage.getItem('userRole') || 'admin'
      return successResponseWrap({
        name: '王立群',
        avatar: '//lf1-xgcdn-tos.pstatp.com/obj/vcloud/vadmin/start.8e0e4855ee346a46ccff8ff3e24db27b.png',
        email: 'wangliqun@email.com',
        job: 'frontend',
        jobName: '前端艺术家',
        organization: 'Frontend',
        organizationName: '前端',
        location: 'beijing',
        locationName: '北京',
        introduction: '人潇洒，性温存',
        personalWebsite: 'https://www.arco.design',
        phone: '150****0000',
        registrationDate: '2013-05-10 12:10:00',
        accountId: '15012312300',
        certification: 1,
        role,
      })
      // return failResponseWrap(null, '未登录', 50008);
    })

    // 用户的服务端菜单
    Mock.mock(new RegExp('/api/user/menu'), () => {
      const menuList = [
        {
          path: '/dashboard',
          name: 'dashboard',
          meta: {
            locale: 'menu.server.dashboard',
            requiresAuth: true,
            icon: 'icon-dashboard',
            order: 1,
          },
          children: [
            {
              path: 'workplace',
              name: 'Workplace',
              meta: {
                locale: 'menu.server.workplace',
                requiresAuth: true,
              },
            },
          ],
        },
      ]
      return successResponseWrap(menuList)
    })
  },
})
