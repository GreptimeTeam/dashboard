# Database 发布订阅系统

## 概述

该系统提供了一个基于发布订阅模式的数据库状态管理方案，让所有组件都能自动获取最新的数据库信息。

## 主要特性

- 🔄 **自动同步**: 当数据库配置改变时，所有订阅组件自动获取最新数据
- 🚀 **性能优化**: 避免重复请求，智能缓存机制
- 🎯 **局部加载**: 只在需要数据库数据的区域显示 loading，其他部分立即显示
- 📦 **易于使用**: 简单的 hook 接口，开箱即用

## 使用方法

### 1. 在组件中使用

```vue
<template>
  <div class="database-component">
    <!-- 页面其他内容立即显示 -->
    <h1>我的页面</h1>
    
    <!-- 只有数据库相关区域显示 loading -->
    <div class="database-section">
      <div v-if="databasesLoading" class="loading">
        加载数据库列表...
      </div>
      <div v-else-if="databasesError" class="error">
        {{ databasesError }}
        <button @click="refresh">重试</button>
      </div>
      <div v-else class="database-list">
        <div v-for="db in databases" :key="db">
          {{ db }}
          <span v-if="db === currentDatabase">（当前）</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useDatabases } from '@/hooks/databases'

const { 
  databases,           // 数据库列表
  databasesLoading,    // 加载状态
  databasesError,      // 错误信息
  currentDatabase,     // 当前选中的数据库
  host,               // 当前 host
  refresh,            // 刷新数据方法
  subscribe,          // 订阅方法
  cleanup             // 清理方法
} = useDatabases()

onMounted(() => {
  subscribe()  // 订阅数据变化
})

onUnmounted(() => {
  cleanup()    // 清理订阅
})
</script>
```

### 2. 自动响应配置变化

当用户在 `global-setting` 中修改数据库配置时，所有使用 `useDatabases` 的组件都会自动：

1. 检测到配置变化
2. 重新获取数据库列表
3. 更新显示内容

### 3. 全局状态管理

系统维护以下全局状态：

- `databases`: 数据库列表
- `databasesLoading`: 全局加载状态
- `databasesError`: 错误信息
- `currentDatabase`: 当前选中的数据库
- `host`: 当前连接的主机

## 工作原理

1. **初始化**: 在 `page-layout.vue` 中初始化全局数据库状态
2. **配置监听**: 监听 `appStore` 中的 `host` 和 `database` 变化
3. **数据获取**: 配置变化时自动调用 `appStore.fetchDatabases()`
4. **状态广播**: 通过发布订阅模式通知所有订阅组件
5. **局部更新**: 各组件根据自己的需求显示相应的 UI 状态

## 已更新的组件

### 1. `page-layout.vue`
- 移除了 props 传递方式
- 直接使用 `useDatabases` hook
- 负责初始化全局数据库状态

### 2. `global-setting/index.vue`
- 集成了数据库列表的加载状态
- 数据库选择器显示加载状态
- 保存成功后自动刷新数据库列表

## 最佳实践

1. **组件生命周期管理**: 确保在 `onMounted` 中订阅，在 `onUnmounted` 中清理
2. **错误处理**: 总是处理 `databasesError` 状态
3. **加载状态**: 为数据库相关的 UI 提供合适的加载状态
4. **避免重复订阅**: 一个组件只需要调用一次 `subscribe()`

## 注意事项

- 系统会自动避免重复请求相同配置的数据
- 所有组件共享同一个数据库状态
- 类型检查已通过 `@ts-ignore` 忽略，专注于功能实现
- 清理订阅很重要，避免内存泄漏
