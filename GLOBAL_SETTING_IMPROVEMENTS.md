# Global Setting 改进 - 错误处理与用户体验优化

## 新增功能

### 1. 自动错误处理
当数据库获取过程中出现错误时，系统会自动显示 global-setting 面板：

- **获取失败时**: 如果 `appStore.fetchDatabases()` 返回 `false`，自动打开设置面板
- **网络错误时**: 如果请求抛出异常，自动打开设置面板
- **用户友好**: 用户不需要手动查找设置入口，系统主动引导用户修正配置

#### 实现位置
- `hooks/databases.ts` 的 `fetchDatabases` 函数
- 在 `catch` 块和失败分支中调用 `appStore.updateSettings({ globalSettings: true })`

### 2. 数据库列表刷新按钮
在 database 选择器右侧添加了刷新图标：

- **位置**: 数据库选择器右侧
- **功能**: 手动刷新数据库列表
- **状态**: 在加载时显示 loading 状态
- **布局**: 使用 `a-space` 组件确保选择器和按钮正确对齐

#### UI 设计
```vue
a-space(v-else :size="8")
  a-select(style="flex: 1" ...) // 数据库选择器占据剩余空间
  a-button(size="small" ...)    // 刷新按钮固定大小
```

## 用户体验改进

### 错误处理流程
1. 用户在页面操作，触发数据库数据获取
2. 如果网络连接失败或配置错误，数据库获取失败
3. 系统自动弹出 global-setting 面板
4. 用户修正配置后，数据库列表自动更新
5. 所有订阅组件自动获取最新数据

### 手动刷新流程
1. 用户在 global-setting 中看到数据库列表
2. 点击刷新按钮手动更新列表
3. 按钮显示 loading 状态
4. 数据更新后，选择器显示最新的数据库列表

## 技术细节

### 错误处理代码
```typescript
try {
  const hasDB = await appStore.fetchDatabases()
  if (hasDB) {
    lastFetchConfig.value = currentConfig
  } else {
    databasesError.value = 'Failed to fetch databases'
    // 获取数据库失败时显示 global-setting
    appStore.updateSettings({ globalSettings: true })
  }
} catch (error) {
  console.error('Failed to fetch databases:', error)
  databasesError.value = error instanceof Error ? error.message : 'Unknown error'
  // 获取数据库出错时显示 global-setting
  appStore.updateSettings({ globalSettings: true })
}
```

### 刷新按钮样式
```less
.arco-space {
  width: 100%;
  .arco-btn {
    .icon {
      width: 14px;
      height: 14px;
    }
  }
}
```

## 系统集成

这些改进与现有的发布订阅系统完美集成：

- **自动错误处理**: 无需修改任何使用 `useDatabases` 的组件
- **刷新功能**: 通过发布订阅模式自动通知所有组件
- **状态同步**: 刷新后所有组件自动获取最新数据
- **用户体验**: 减少用户的手动操作，提供更流畅的体验

## 优势

1. **主动错误处理**: 系统主动引导用户解决配置问题
2. **便捷的手动控制**: 用户可以随时刷新数据库列表
3. **一致的用户体验**: 错误处理和手动操作都集成在同一个面板中
4. **自动化程度高**: 减少用户需要记住的操作步骤
