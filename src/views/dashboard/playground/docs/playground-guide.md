---
title: Playground Guide
toc: true
---

# 如何使用Playground

## 从Gist加载文件

通过Gist可以灵活的加载文件，同时可以非常的方便的分享文档。

唯一需要注意的是，需要在md文件的前面加入
``` yaml
___
title: xxx
---
```
以便正确显示目录


## 语法加强

我们增加了一些md插件，对代码显示做了增强，支持了一些自定义的组件，以及对一些现有组件做了增强。

### image

传统的图片语法：
``` markdown
![](image_url)
```

但是在实际使用中，常常需要对图片的格式做一些定义，比如自定义尺寸，图片居中等，所以我们扩展了图片的语法，支持如下格式

``` markdown
![alt|{width}x{height}|classes](image_url)
```

`![it's me](https://files.catbox.moe/lhez89.jpg)`的渲染结果
![it's me](https://files.catbox.moe/lhez89.jpg)

`![it's me|200x200](https://files.catbox.moe/lhez89.jpg)`的渲染结果
![it's me|200x200](https://files.catbox.moe/lhez89.jpg)

`![it's me|200｜center](https://files.catbox.moe/lhez89.jpg)`的渲染结果
![it's me|200|center](https://files.catbox.moe/lhez89.jpg)

customImage插件会给图片做一层包装

```html
<div class="image-container ${klass}" title="${alt}">
  <img src="${src}" alt="${alt}" style="width:${width};height:${height}"/>
</div>
```

配合css可以实现显示图片的文字说明，以及支持特定的class注入

```less
.image-container {
  display: table;
  position: relative;
  margin: 6px 0;
  &.center {
    margin: 6px auto;
  }
  &::after {
    content: attr(title);
    display: block;
    color: var(--vp-c-gray);
    font-size: 16px;
    line-height: 16px;
    text-align: center;
  }
  img {
    display: initial
  }
}
```

### 高亮块
~~搬运~~支持了vitepress的 [Custom Containers](https://vitepress.dev/guide/markdown#custom-containers)

``` markdown
::: info
This is an info box.
:::

::: tip
This is a tip.
:::

::: warning
This is a warning.
:::

::: danger
This is a dangerous warning.
:::

::: details
This is a details block.
:::
```

::: info
This is an info box.
:::

::: tip
This is a tip.
:::

::: warning
This is a warning.
:::

::: danger
This is a dangerous warning.
:::

::: details
This is a details block.
:::


### 代码块

```sql
CREATE TABLE IF NOT EXISTS cpu_metrics_3 (
    hostname STRING,
    environment STRING,
    usage_user DOUBLE,
    usage_system DOUBLE,
    usage_idle DOUBLE,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TIME INDEX(ts),
    PRIMARY KEY(hostname, environment)
);
```
```sql
desc table cpu_metrics_3
```

``` sql
INSERT INTO cpu_metrics_3
VALUES
    ('host_0','test',32,58,36,1680307200),
    ('host_1','test',29,65,20,1680307200),
    ('host_1','staging',12,32,50,1680307200),
    ('host_2','staging',67,15,42,1680307200),
    ('host_2','test',98,5,40,1680307200),
    ('host_3','test',98,95,7,1680307200),
    ('host_4','test',32,44,11,1680307200),
    ('host_0','test',31,57,37,1680307260),
    ('host_1','staging',11,31,52,1680307260),
    ('host_1','test',26,68,18,1680307260),
    ('host_2','staging',66,13,41,1680307200),
    ('host_2','test',99,6,39,1680307260),
    ('host_3','test',99,95,7,1680307260),
    ('host_4','test',31,44,11,1680307260),
    ('host_0','test',29,58,36,1680307320),
    ('host_1','staging',10,32,50,1680307320),
    ('host_1','test',32,63,22,1680307320),
    ('host_2','staging',65,15,40,1680307320),
    ('host_2','test',100,5,36,1680307320);
```
使用`sql (chartType|[selectedYTypes]|[groupBySelectedTypes])`定义代码块，可以支持默认渲染方式和渲染字段。比如

``` sql (line|usage_system|hostname,environment)
-- ``` sql (line|usage_system|hostname,environment)
-- SELECT * FROM cpu_metrics_3
-- ```

SELECT * FROM cpu_metrics_3
```

``` sql (line(smooth)|data|)
-- ``` sql (line(smooth)|data|)
-- SELECT * FROM apm
-- ```

SELECT * FROM apm
```