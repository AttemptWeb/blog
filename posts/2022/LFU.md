---
title: 什么是 LFU 算法？
author: shenfq
date: 2022/03/22
categories:
- 前端
tags:
- 缓存
- LRU
- LFU
- JavaScript
---

![](https://file.shenfq.com/pic/202203221024302.jpg)

上次的文章介绍了 LRU 算法，今天打算来介绍一下 LFU 算法。在上篇文章中有提到， LFU（`Least frequently used`：最少使用）算法与 LRU 算法只是在淘汰策略上有所不同，LRU 倾向于保留最近有使用的数据，而 LFU 倾向于保留使用频率较高的数据。

举一个简单的🌰：缓存中有 A、B 两个数据，且已达到上限，如果 `数据 A` 先被访问了 10 次，然后 `数据 B` 被访问 1 次，当存入新的 `数据 C` 时，如果当前是 LRU 算法，会将 `数据 A` 淘汰，而如果是 LFU 算法，则会淘汰 `数据 B`。

简单来说，就是在 LRU 算法中，不管访问的频率，只要最近访问过，就不会将这个数据淘汰，而在 LFU 算法中，将访问的频率作为权重，只要访问频率越高，该数据就越不会被淘汰，即使该数据很久没有被访问过。

## 算法实现

我们还是通过一段 JavaScript 代码来实现这个逻辑。

```js
class LFUCache {
	freqs = {} // 用于标记访问频率
	cache = {} // 用于缓存所有数据
	capacity = 0 // 缓存的最大容量
	constructor (capacity) {
    // 存储 LFU 可缓存的最大容量
		this.capacity = capacity
	}
}
```

与 LRU 算法一样，LFU 算法也需要实现 `get` 与 `put` 两个方法，用于获取缓存和设置缓存。

```js
class LFUCache {
  // 获取缓存
	get (key) { }
  // 设置缓存
	put (key, value) { }
}
```

老规矩，先看设置缓存的部分。如果该缓存的 key 之前存在，需要更新其值。

```js
class LFUCache {
  // cache 作为缓存的存储对象
  // 其解构为: { key: { freq: 0, value: '' } }
  // freq 表示该数据读取的频率；
  // value 表示缓存的数据；
	cache = {}
  // fregs 用于存储缓存数据的频率
  // 其解构为: { 0: [a], 1: [b, c], 2: [d] }
  // 表示 a 还没被读取，b/c 各被读取1次，d被读取2次
  freqs = {}
  // 设置缓存
  put (key, value) {
    // 先判断缓存是否存在
    const cache = this.cache[key]
    if (cache) {
      // 如果存在，则重置缓存的值
      cache.value = value
      // 更新使用频率
      let { freq } = cache
      // 从 freqs 中获取对应 key 的数组
      const keys = this.freqs[freq]
      const index = keys.indexOf(key)
      // 从频率数组中，删除对应的 key
      keys.splice(index, 1)
      if (keys.length === 0) {
        // 如果当前频率已经不存在 key
        // 将 key 删除
        delete this.freqs[freq]
      }
      // 更新频率加 1
      freq = (cache.freq += 1)
      // 更新频率数组
      const freqMap =
            this.freqs[freq] ||
            (this.freqs[freq] = [])
      freqMap.push(key)
      return
    }
  }
}
```

如果该缓存不存在，要先判断缓存是否超过容量，如果超过，需要淘汰掉使用频率最低的数据。

```js
class LFUCache {
  // 更新频率
  active (key, cache) {
    // 更新使用频率
    let { freq } = cache
    // 从 freqs 中获取对应 key 的数组
    const keys = this.freqs[freq]
    const index = keys.indexOf(key)
    // 从频率数组中，删除对应的 key
    keys.splice(index, 1)
    if (keys.length === 0) {
      // 如果当前频率已经不存在 key
      // 将 key 删除
      delete this.freqs[freq]
    }
    // 更新频率加 1
    freq = (cache.freq += 1)
    // 更新读取频率数组
    const freqMap = this.freqs[freq] || (this.freqs[freq] = [])
    freqMap.push(key)
  }
  // 设置缓存
  put (key, value) {
    // 先判断缓存是否存在
    const cache = this.cache[key]
    if (cache) {
      // 如果存在，则重置缓存的值
      cache.value = value
      this.active(key, cache)
      return
    }
    // 判断缓存是否超过容量
    const list = Object.keys(this.cache)
    if (list.length >= this.capacity) {
      // 超过存储大小，删除访问频率最低的数据
      const [first] = Object.keys(this.freqs)
      const keys = this.freqs[first]
      const latest = keys.shift()
      delete this.cache[latest]
      if (keys.length === 0) delete this.freqs[latest]
    }
    // 写入缓存，默认频率为0，表示还未使用过
    this.cache[key] = { value, freq: 0 }
    // 写入读取频率数组
    const freqMap = this.freqs[0] || (this.freqs[0] = [])
    freqMap.push(key)
  }
}
```

实现了设置缓存的方法后，再实现获取缓存就很容易了。

```js
class LRUCache {
  // 获取数据
	get (key) {
		if (this.cache[key] !== undefined) {
    	// 如果 key 对应的缓存存在，更新其读取频率
      // 之前已经实现过，可以直接复用
			this.active(key)
			return this.cache[key]
		}
		return undefined
  }
}
```

---

关于 LFU 缓存算法实现就到这里了，当然该算法一般使用双链表的形式来实现，这里的实现方式，只是为了方便理解其原理，感兴趣的话可以在网上搜索下更加高效的实现方式。