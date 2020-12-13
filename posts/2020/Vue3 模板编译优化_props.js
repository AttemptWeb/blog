import projectConfig from '/pagic.config.js';
export default {
    config: { "root": "/", ...projectConfig },
    'pagePath': "posts/2020/Vue3 模板编译优化.md",
    'layoutPath': "posts/_layout.tsx",
    'outputPath': "posts/2020/Vue3 模板编译优化.html",
    'title': "Vue3 模板编译优化",
    'content': React.createElement("article", { dangerouslySetInnerHTML: {
            __html: '<h1>Vue3 模板编译优化</h1>\n<p>Vue3 正式发布已经有一段时间了，前段时间写了一篇文章（<a href="https://blog.shenfq.com/2020/vue-%E6%A8%A1%E6%9D%BF%E7%BC%96%E8%AF%91%E5%8E%9F%E7%90%86/">《Vue 模板编译原理》</a>）分析 Vue 的模板编译原理。今天的文章打算学习下 Vue3 下的模板编译与 Vue2 下的差异，以及 VDOM 下 Diff 算法的优化。</p>\n<h2 id="%E7%BC%96%E8%AF%91%E5%85%A5%E5%8F%A3">编译入口<a class="anchor" href="#%E7%BC%96%E8%AF%91%E5%85%A5%E5%8F%A3">§</a></h2>\n<p>了解过 Vue3 的同学肯定知道 Vue3 引入了新的组合 Api，在组件 <code>mount</code> 阶段会调用 <code>setup</code> 方法，之后会判断 <code>render</code> 方法是否存在，如果不存在会调用 <code>compile</code> 方法将 <code>template</code> 转化为 <code>render</code>。</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/runtime-core/src/renderer.ts</span>\n<span class="token keyword">const</span> <span class="token function-variable function">mountComponent</span> <span class="token operator">=</span> <span class="token punctuation">(</span><span class="token parameter">initialVNode<span class="token punctuation">,</span> container</span><span class="token punctuation">)</span> <span class="token arrow operator">=></span> <span class="token punctuation">{</span>\n  <span class="token keyword">const</span> instance <span class="token operator">=</span> <span class="token punctuation">(</span>\n    initialVNode<span class="token punctuation">.</span><span class="token property-access">component</span> <span class="token operator">=</span> <span class="token function">createComponentInstance</span><span class="token punctuation">(</span>\n      <span class="token comment">// ...params</span>\n    <span class="token punctuation">)</span>\n  <span class="token punctuation">)</span>\n  <span class="token comment">// 调用 setup</span>\n  <span class="token function">setupComponent</span><span class="token punctuation">(</span>instance<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n\n<span class="token comment">// packages/runtime-core/src/component.ts</span>\n<span class="token keyword">let</span> compile\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">registerRuntimeCompiler</span><span class="token punctuation">(</span><span class="token parameter">_compile</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  compile <span class="token operator">=</span> _compile\n<span class="token punctuation">}</span>\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">setupComponent</span><span class="token punctuation">(</span><span class="token parameter">instance</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword">const</span> <span class="token maybe-class-name">Component</span> <span class="token operator">=</span> instance<span class="token punctuation">.</span><span class="token property-access">type</span>\n  <span class="token keyword">const</span> <span class="token punctuation">{</span> setup <span class="token punctuation">}</span> <span class="token operator">=</span> <span class="token maybe-class-name">Component</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>setup<span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// ...调用 setup</span>\n  <span class="token punctuation">}</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>compile <span class="token operator">&amp;&amp;</span> <span class="token maybe-class-name">Component</span><span class="token punctuation">.</span><span class="token property-access">template</span> <span class="token operator">&amp;&amp;</span> <span class="token operator">!</span><span class="token maybe-class-name">Component</span><span class="token punctuation">.</span><span class="token property-access">render</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// 如果没有 render 方法</span>\n    <span class="token comment">// 调用 compile 将 template 转为 render 方法</span>\n    <span class="token maybe-class-name">Component</span><span class="token punctuation">.</span><span class="token property-access">render</span> <span class="token operator">=</span> <span class="token function">compile</span><span class="token punctuation">(</span><span class="token maybe-class-name">Component</span><span class="token punctuation">.</span><span class="token property-access">template</span><span class="token punctuation">,</span> <span class="token punctuation">{</span><span class="token spread operator">...</span><span class="token punctuation">}</span><span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>这部分都是 runtime-core 中的代码，之前的文章有讲过 Vue 分为完整版和 runtime 版本。如果使用 <code>vue-loader</code> 处理 <code>.vue</code> 文件，一般都会将 <code>.vue</code> 文件中的 <code>template</code> 直接处理成 <code>render</code> 方法。</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">//  需要编译器</span>\n<span class="token maybe-class-name">Vue</span><span class="token punctuation">.</span><span class="token method function property-access">createApp</span><span class="token punctuation">(</span><span class="token punctuation">{</span>\n  template<span class="token operator">:</span> <span class="token string">\'&lt;div>{{ hi }}&lt;/div>\'</span>\n<span class="token punctuation">}</span><span class="token punctuation">)</span>\n\n<span class="token comment">// 不需要</span>\n<span class="token maybe-class-name">Vue</span><span class="token punctuation">.</span><span class="token method function property-access">createApp</span><span class="token punctuation">(</span><span class="token punctuation">{</span>\n  <span class="token function">render</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword control-flow">return</span> <span class="token maybe-class-name">Vue</span><span class="token punctuation">.</span><span class="token method function property-access">h</span><span class="token punctuation">(</span><span class="token string">\'div\'</span><span class="token punctuation">,</span> <span class="token punctuation">{</span><span class="token punctuation">}</span><span class="token punctuation">,</span> <span class="token keyword">this</span><span class="token punctuation">.</span><span class="token property-access">hi</span><span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span><span class="token punctuation">)</span>\n</code></pre>\n<p>完整版与 runtime 版的差异就是，完整版会引入 <code>compile</code> 方法，如果是 vue-cli 生成的项目就会抹去这部分代码，将 compile 过程都放到打包的阶段，以此优化性能。runtime-dom 中提供了 <code>registerRuntimeCompiler</code> 方法用于注入 <code>compile</code> 方法。</p>\n<p><img src="https://file.shenfq.com/pic/20201109144930.png" alt=""></p>\n<h2 id="%E4%B8%BB%E6%B5%81%E7%A8%8B">主流程<a class="anchor" href="#%E4%B8%BB%E6%B5%81%E7%A8%8B">§</a></h2>\n<p>在完整版的 <code>index.js</code> 中，调用了  <code>registerRuntimeCompiler</code> 将 <code>compile</code> 进行注入，接下来我们看看注入的 <code>compile</code> 方法主要做了什么。</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/vue/src/index.ts</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> compile <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'@vue/compiler-dom\'</span>\n\n<span class="token comment">// 编译缓存</span>\n<span class="token keyword">const</span> compileCache <span class="token operator">=</span> <span class="token known-class-name class-name">Object</span><span class="token punctuation">.</span><span class="token method function property-access">create</span><span class="token punctuation">(</span><span class="token keyword null nil">null</span><span class="token punctuation">)</span>\n\n<span class="token comment">// 注入 compile 方法</span>\n<span class="token keyword">function</span> <span class="token function">compileToFunction</span><span class="token punctuation">(</span>\n  <span class="token comment">// 模板</span>\n  template<span class="token operator">:</span> string <span class="token operator">|</span> <span class="token maybe-class-name">HTMLElement</span><span class="token punctuation">,</span>\n  <span class="token comment">// 编译配置</span>\n  options<span class="token operator">?</span><span class="token operator">:</span> <span class="token maybe-class-name">CompilerOptions</span>\n<span class="token punctuation">)</span><span class="token operator">:</span> <span class="token maybe-class-name">RenderFunction</span> <span class="token punctuation">{</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span><span class="token operator">!</span><span class="token function">isString</span><span class="token punctuation">(</span>template<span class="token punctuation">)</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// 如果 template 不是字符串</span>\n    <span class="token comment">// 则认为是一个 DOM 节点，获取 innerHTML</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>template<span class="token punctuation">.</span><span class="token property-access">nodeType</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      template <span class="token operator">=</span> template<span class="token punctuation">.</span><span class="token property-access">innerHTML</span>\n    <span class="token punctuation">}</span> <span class="token keyword control-flow">else</span> <span class="token punctuation">{</span>\n      <span class="token keyword control-flow">return</span> <span class="token constant">NOOP</span>\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span>\n\n  <span class="token comment">// 如果缓存中存在，直接从缓存中获取</span>\n  <span class="token keyword">const</span> key <span class="token operator">=</span> template\n  <span class="token keyword">const</span> cached <span class="token operator">=</span> compileCache<span class="token punctuation">[</span>key<span class="token punctuation">]</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>cached<span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword control-flow">return</span> cached\n  <span class="token punctuation">}</span>\n\n  <span class="token comment">// 如果是 ID 选择器，这获取 DOM 元素后，取 innerHTML</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>template<span class="token punctuation">[</span><span class="token number">0</span><span class="token punctuation">]</span> <span class="token operator">===</span> <span class="token string">\'#\'</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword">const</span> el <span class="token operator">=</span> <span class="token dom variable">document</span><span class="token punctuation">.</span><span class="token method function property-access">querySelector</span><span class="token punctuation">(</span>template<span class="token punctuation">)</span>\n    template <span class="token operator">=</span> el <span class="token operator">?</span> el<span class="token punctuation">.</span><span class="token property-access">innerHTML</span> <span class="token operator">:</span> <span class="token string">\'\'</span>\n  <span class="token punctuation">}</span>\n\n  <span class="token comment">// 调用 compile 获取 render code</span>\n  <span class="token keyword">const</span> <span class="token punctuation">{</span> code <span class="token punctuation">}</span> <span class="token operator">=</span> <span class="token function">compile</span><span class="token punctuation">(</span>\n    template<span class="token punctuation">,</span>\n    options\n  <span class="token punctuation">)</span>\n\n  <span class="token comment">// 将 render code 转化为 function</span>\n  <span class="token keyword">const</span> render <span class="token operator">=</span> <span class="token keyword">new</span> <span class="token class-name">Function</span><span class="token punctuation">(</span>code<span class="token punctuation">)</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>\n\n  <span class="token comment">// 返回 render 方法的同时，将其放入缓存</span>\n  <span class="token keyword control-flow">return</span> <span class="token punctuation">(</span>compileCache<span class="token punctuation">[</span>key<span class="token punctuation">]</span> <span class="token operator">=</span> render<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n\n<span class="token comment">// 注入 compile</span>\n<span class="token function">registerRuntimeCompiler</span><span class="token punctuation">(</span>compileToFunction<span class="token punctuation">)</span>\n</code></pre>\n<p>在讲 Vue2 模板编译的时候已经讲过，<code>compile</code> 方法主要分为三步，Vue3 的逻辑类似：</p>\n<ol>\n<li>模板编译，将模板代码转化为 AST；</li>\n<li>优化 AST，方便后续虚拟 DOM 更新；</li>\n<li>生成代码，将 AST 转化为可执行的代码；</li>\n</ol>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/compiler-dom/src/index.ts</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> baseCompile<span class="token punctuation">,</span> baseParse <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'@vue/compiler-core\'</span>\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">compile</span><span class="token punctuation">(</span><span class="token parameter">template<span class="token punctuation">,</span> options</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword control-flow">return</span> <span class="token function">baseCompile</span><span class="token punctuation">(</span>template<span class="token punctuation">,</span> options<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n\n<span class="token comment">// packages/compiler-core/src/compile.ts</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> baseParse <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./parse\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transform <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transform\'</span>\n\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformIf <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vIf\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformFor <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vFor\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformText <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/transformText\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformElement <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/transformElement\'</span>\n\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformOn <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vOn\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformBind <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vBind\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformModel <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vModel\'</span>\n\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">baseCompile</span><span class="token punctuation">(</span><span class="token parameter">template<span class="token punctuation">,</span> options</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token comment">// 解析 html，转化为 ast</span>\n  <span class="token keyword">const</span> ast <span class="token operator">=</span> <span class="token function">baseParse</span><span class="token punctuation">(</span>template<span class="token punctuation">,</span> options<span class="token punctuation">)</span>\n  <span class="token comment">// 优化 ast，标记静态节点</span>\n  <span class="token function">transform</span><span class="token punctuation">(</span>ast<span class="token punctuation">,</span> <span class="token punctuation">{</span>\n    <span class="token spread operator">...</span>options<span class="token punctuation">,</span>\n    nodeTransforms<span class="token operator">:</span> <span class="token punctuation">[</span>\n      transformIf<span class="token punctuation">,</span>\n      transformFor<span class="token punctuation">,</span>\n      transformText<span class="token punctuation">,</span>\n      transformElement<span class="token punctuation">,</span>\n      <span class="token comment">// ... 省略了部分 transform</span>\n    <span class="token punctuation">]</span><span class="token punctuation">,</span>\n    directiveTransforms<span class="token operator">:</span> <span class="token punctuation">{</span>\n      on<span class="token operator">:</span> transformOn<span class="token punctuation">,</span>\n      bind<span class="token operator">:</span> transformBind<span class="token punctuation">,</span>\n      model<span class="token operator">:</span> transformModel\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span><span class="token punctuation">)</span>\n  <span class="token comment">// 将 ast 转化为可执行代码</span>\n  <span class="token keyword control-flow">return</span> <span class="token function">generate</span><span class="token punctuation">(</span>ast<span class="token punctuation">,</span> options<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<h2 id="%E8%AE%A1%E7%AE%97-patchflag">计算 PatchFlag<a class="anchor" href="#%E8%AE%A1%E7%AE%97-patchflag">§</a></h2>\n<p>这里大致的逻辑与之前的并没有多大的差异，主要是 <code>optimize</code> 方法变成了  <code>transform</code> 方法，而且默认会对一些模板语法进行 <code>transform</code>。这些 <code>transform</code> 就是后续虚拟 DOM 优化的关键，我们先看看 <code>transform</code> 的代码 。</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/compiler-core/src/transform.ts</span>\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">transform</span><span class="token punctuation">(</span><span class="token parameter">root<span class="token punctuation">,</span> options</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword">const</span> context <span class="token operator">=</span> <span class="token function">createTransformContext</span><span class="token punctuation">(</span>root<span class="token punctuation">,</span> options<span class="token punctuation">)</span>\n  <span class="token function">traverseNode</span><span class="token punctuation">(</span>root<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">traverseNode</span><span class="token punctuation">(</span><span class="token parameter">node<span class="token punctuation">,</span> context</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  context<span class="token punctuation">.</span><span class="token property-access">currentNode</span> <span class="token operator">=</span> node\n  <span class="token keyword">const</span> <span class="token punctuation">{</span> nodeTransforms <span class="token punctuation">}</span> <span class="token operator">=</span> context\n  <span class="token keyword">const</span> exitFns <span class="token operator">=</span> <span class="token punctuation">[</span><span class="token punctuation">]</span>\n  <span class="token keyword control-flow">for</span> <span class="token punctuation">(</span><span class="token keyword">let</span> i <span class="token operator">=</span> <span class="token number">0</span><span class="token punctuation">;</span> i <span class="token operator">&lt;</span> nodeTransforms<span class="token punctuation">.</span><span class="token property-access">length</span><span class="token punctuation">;</span> i<span class="token operator">++</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// Transform 会返回一个退出函数，在处理完所有的子节点后再执行</span>\n    <span class="token keyword">const</span> onExit <span class="token operator">=</span> nodeTransforms<span class="token punctuation">[</span>i<span class="token punctuation">]</span><span class="token punctuation">(</span>node<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>onExit<span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span><span class="token function">isArray</span><span class="token punctuation">(</span>onExit<span class="token punctuation">)</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        exitFns<span class="token punctuation">.</span><span class="token method function property-access">push</span><span class="token punctuation">(</span><span class="token spread operator">...</span>onExit<span class="token punctuation">)</span>\n      <span class="token punctuation">}</span> <span class="token keyword control-flow">else</span> <span class="token punctuation">{</span>\n        exitFns<span class="token punctuation">.</span><span class="token method function property-access">push</span><span class="token punctuation">(</span>onExit<span class="token punctuation">)</span>\n      <span class="token punctuation">}</span>\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span>\n  <span class="token function">traverseChildren</span><span class="token punctuation">(</span>node<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n  context<span class="token punctuation">.</span><span class="token property-access">currentNode</span> <span class="token operator">=</span> node\n  <span class="token comment">// 执行所以 Transform 的退出函数</span>\n  <span class="token keyword">let</span> i <span class="token operator">=</span> exitFns<span class="token punctuation">.</span><span class="token property-access">length</span>\n  <span class="token keyword control-flow">while</span> <span class="token punctuation">(</span>i<span class="token operator">--</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    exitFns<span class="token punctuation">[</span>i<span class="token punctuation">]</span><span class="token punctuation">(</span><span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>我们重点看一下 <code>transformElement</code> 的逻辑：</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/compiler-core/src/transforms/transformElement.ts</span>\n<span class="token keyword module">export</span> <span class="token keyword">const</span> transformElement<span class="token operator">:</span> <span class="token function-variable function"><span class="token maybe-class-name">NodeTransform</span></span> <span class="token operator">=</span> <span class="token punctuation">(</span><span class="token parameter">node<span class="token punctuation">,</span> context</span><span class="token punctuation">)</span> <span class="token arrow operator">=></span> <span class="token punctuation">{</span>\n  <span class="token comment">// transformElement 没有执行任何逻辑，而是直接返回了一个退出函数</span>\n  <span class="token comment">// 说明 transformElement 需要等所有的子节点处理完后才执行</span>\n  <span class="token keyword control-flow">return</span> <span class="token keyword">function</span> <span class="token function">postTransformElement</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword">const</span> <span class="token punctuation">{</span> tag<span class="token punctuation">,</span> props <span class="token punctuation">}</span> <span class="token operator">=</span> node\n\n    <span class="token keyword">let</span> vnodeProps\n    <span class="token keyword">let</span> vnodePatchFlag\n    <span class="token keyword">const</span> vnodeTag <span class="token operator">=</span> node<span class="token punctuation">.</span><span class="token property-access">tagType</span> <span class="token operator">===</span> <span class="token maybe-class-name">ElementTypes</span><span class="token punctuation">.</span><span class="token constant">COMPONENT</span>\n      <span class="token operator">?</span> <span class="token function">resolveComponentType</span><span class="token punctuation">(</span>node<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n      <span class="token operator">:</span> <span class="token template-string"><span class="token template-punctuation string">`</span><span class="token string">"</span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>tag<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string">"</span><span class="token template-punctuation string">`</span></span>\n    \n    <span class="token keyword">let</span> patchFlag <span class="token operator">=</span> <span class="token number">0</span>\n    <span class="token comment">// 检测节点属性</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>props<span class="token punctuation">.</span><span class="token property-access">length</span> <span class="token operator">></span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      <span class="token comment">// 检测节点属性的动态部分</span>\n      <span class="token keyword">const</span> propsBuildResult <span class="token operator">=</span> <span class="token function">buildProps</span><span class="token punctuation">(</span>node<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n      vnodeProps <span class="token operator">=</span> propsBuildResult<span class="token punctuation">.</span><span class="token property-access">props</span>\n      patchFlag <span class="token operator">=</span> propsBuildResult<span class="token punctuation">.</span><span class="token property-access">patchFlag</span>\n    <span class="token punctuation">}</span>\n\n    <span class="token comment">// 检测子节点</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>node<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">.</span><span class="token property-access">length</span> <span class="token operator">></span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>node<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">.</span><span class="token property-access">length</span> <span class="token operator">===</span> <span class="token number">1</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        <span class="token keyword">const</span> child <span class="token operator">=</span> node<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">[</span><span class="token number">0</span><span class="token punctuation">]</span>\n        <span class="token comment">// 检测子节点是否为动态文本</span>\n        <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span><span class="token operator">!</span><span class="token function">getStaticType</span><span class="token punctuation">(</span>child<span class="token punctuation">)</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n          patchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">TEXT</span>\n        <span class="token punctuation">}</span>\n      <span class="token punctuation">}</span>\n    <span class="token punctuation">}</span>\n\n    <span class="token comment">// 格式化 patchFlag</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>patchFlag <span class="token operator">!==</span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        vnodePatchFlag <span class="token operator">=</span> <span class="token known-class-name class-name">String</span><span class="token punctuation">(</span>patchFlag<span class="token punctuation">)</span>\n    <span class="token punctuation">}</span>\n\n    node<span class="token punctuation">.</span><span class="token property-access">codegenNode</span> <span class="token operator">=</span> <span class="token function">createVNodeCall</span><span class="token punctuation">(</span>\n      context<span class="token punctuation">,</span>\n      vnodeTag<span class="token punctuation">,</span>\n      vnodeProps<span class="token punctuation">,</span>\n      vnodeChildren<span class="token punctuation">,</span>\n      vnodePatchFlag\n    <span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p><code>buildProps</code> 会对节点的属性进行一次遍历，由于内部源码涉及很多其他的细节，这里的代码是经过简化之后的，只保留了 <code>patchFlag</code> 相关的逻辑。</p>\n<pre class="language-js"><code class="language-js"><span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">buildProps</span><span class="token punctuation">(</span>\n  node<span class="token operator">:</span> <span class="token maybe-class-name">ElementNode</span><span class="token punctuation">,</span>\n  context<span class="token operator">:</span> <span class="token maybe-class-name">TransformContext</span><span class="token punctuation">,</span>\n  props<span class="token operator">:</span> <span class="token maybe-class-name">ElementNode</span><span class="token punctuation">[</span><span class="token string">\'props\'</span><span class="token punctuation">]</span> <span class="token operator">=</span> node<span class="token punctuation">.</span><span class="token property-access">props</span>\n<span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword">let</span> patchFlag <span class="token operator">=</span> <span class="token number">0</span>\n  <span class="token keyword control-flow">for</span> <span class="token punctuation">(</span><span class="token keyword">let</span> i <span class="token operator">=</span> <span class="token number">0</span><span class="token punctuation">;</span> i <span class="token operator">&lt;</span> props<span class="token punctuation">.</span><span class="token property-access">length</span><span class="token punctuation">;</span> i<span class="token operator">++</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword">const</span> prop <span class="token operator">=</span> props<span class="token punctuation">[</span>i<span class="token punctuation">]</span>\n    <span class="token keyword">const</span> <span class="token punctuation">[</span>key<span class="token punctuation">,</span> name<span class="token punctuation">]</span> <span class="token operator">=</span> prop<span class="token punctuation">.</span><span class="token property-access">name</span><span class="token punctuation">.</span><span class="token method function property-access">split</span><span class="token punctuation">(</span><span class="token string">\':\'</span><span class="token punctuation">)</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>key <span class="token operator">===</span> <span class="token string">\'v-bind\'</span> <span class="token operator">||</span> key <span class="token operator">===</span> <span class="token string">\'\'</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>name <span class="token operator">===</span> <span class="token string">\'class\'</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        <span class="token comment">// 如果包含 :class 属性，patchFlag | CLASS</span>\n        patchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">CLASS</span>\n      <span class="token punctuation">}</span> <span class="token keyword control-flow">else</span> <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>name <span class="token operator">===</span> <span class="token string">\'style\'</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        <span class="token comment">// 如果包含 :style 属性，patchFlag | STYLE</span>\n        patchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">STYLE</span>\n      <span class="token punctuation">}</span>\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span>\n\n  <span class="token keyword control-flow">return</span> <span class="token punctuation">{</span>\n    patchFlag\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>上面的代码只展示了三种 <code>patchFlag</code> 的类型：</p>\n<ul>\n<li><strong>节点只有一个文本子节点，且该文本包含动态的数据</strong>（<code>TEXT = 1</code>）</li>\n</ul>\n<pre class="language-html"><code class="language-html"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span><span class="token punctuation">></span></span>name: {{name}}<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>\n</code></pre>\n<ul>\n<li><strong>节点包含可变的 class 属性</strong>（<code>CLASS = 1 &lt;&lt; 1</code>）</li>\n</ul>\n<pre class="language-html"><code class="language-html"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>div</span> <span class="token attr-name">:class</span><span class="token attr-value"><span class="token punctuation attr-equals">=</span><span class="token punctuation">"</span>{ active: isActive }<span class="token punctuation">"</span></span><span class="token punctuation">></span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>div</span><span class="token punctuation">></span></span>\n</code></pre>\n<ul>\n<li><strong>节点包含可变的 style 属性</strong>（<code>STYLE = 1 &lt;&lt; 2</code>）</li>\n</ul>\n<pre class="language-html"><code class="language-html"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>div</span> <span class="token attr-name">:</span><span class="token style-attr language-css"><span class="token attr-name"><span class="token attr-name">style</span></span><span class="token punctuation">="</span><span class="token attr-value"><span class="token punctuation">{</span> <span class="token property">color</span><span class="token punctuation">:</span> color <span class="token punctuation">}</span></span><span class="token punctuation">"</span></span><span class="token punctuation">></span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>div</span><span class="token punctuation">></span></span>\n</code></pre>\n<p>可以看到 PatchFlags 都是数字 <code>1</code> 经过 <strong>左移操作符</strong> 计算得到的。</p>\n<pre class="language-js"><code class="language-js"><span class="token keyword module">export</span> <span class="token keyword">const</span> <span class="token keyword">enum</span> <span class="token maybe-class-name">PatchFlags</span> <span class="token punctuation">{</span>\n  <span class="token constant">TEXT</span> <span class="token operator">=</span> <span class="token number">1</span><span class="token punctuation">,</span>             <span class="token comment">// 1, 二进制 0000 0001</span>\n  <span class="token constant">CLASS</span> <span class="token operator">=</span> <span class="token number">1</span> <span class="token operator">&lt;&lt;</span> <span class="token number">1</span><span class="token punctuation">,</span>       <span class="token comment">// 2, 二进制 0000 0010</span>\n  <span class="token constant">STYLE</span> <span class="token operator">=</span> <span class="token number">1</span> <span class="token operator">&lt;&lt;</span> <span class="token number">2</span><span class="token punctuation">,</span>       <span class="token comment">// 4, 二进制 0000 0100</span>\n  <span class="token constant">PROPS</span> <span class="token operator">=</span> <span class="token number">1</span> <span class="token operator">&lt;&lt;</span> <span class="token number">3</span><span class="token punctuation">,</span>       <span class="token comment">// 8, 二进制 0000 1000</span>\n  <span class="token spread operator">...</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>从上面的代码能看出来，<code>patchFlag</code> 的初始值为 0，每次对 <code>patchFlag</code> 都是执行 <code>|</code> （或）操作。如果当前节点是一个只有动态文本子节点且同时具有动态 style 属性，最后得到的 <code>patchFlag</code> 为 5（<code>二进制：0000 0101</code>）。</p>\n<pre class="language-js"><code class="language-js"><span class="token operator">&lt;</span>p <span class="token operator">:</span>style<span class="token operator">=</span><span class="token string">"{ color: color }"</span><span class="token operator">></span>name<span class="token operator">:</span> <span class="token punctuation">{</span><span class="token punctuation">{</span>name<span class="token punctuation">}</span><span class="token punctuation">}</span><span class="token operator">&lt;</span><span class="token operator">/</span>p<span class="token operator">></span>\n</code></pre>\n<pre class="language-js"><code class="language-js">patchFlag <span class="token operator">=</span> <span class="token number">0</span>\npatchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">STYLE</span>\npatchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">TEXT</span>\n<span class="token comment">// 或运算：两个对应的二进制位中只要一个是1，结果对应位就是1。</span>\n<span class="token comment">// 0000 0001</span>\n<span class="token comment">// 0000 0100</span>\n<span class="token comment">// ------------</span>\n<span class="token comment">// 0000 0101  =>  十进制 5</span>\n</code></pre>\n<p><img src="https://file.shenfq.com/pic/20201111135121.png" alt="patchFlag"></p>\n<p>我们将上面的代码放到 Vue3 中运行：</p>\n<pre class="language-js"><code class="language-js"><span class="token keyword">const</span> app <span class="token operator">=</span> <span class="token maybe-class-name">Vue</span><span class="token punctuation">.</span><span class="token method function property-access">createApp</span><span class="token punctuation">(</span><span class="token punctuation">{</span>\n  <span class="token function">data</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword control-flow">return</span> <span class="token punctuation">{</span>\n      color<span class="token operator">:</span> <span class="token string">\'red\'</span><span class="token punctuation">,</span>\n      name<span class="token operator">:</span> <span class="token string">\'shenfq\'</span>\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span><span class="token punctuation">,</span>\n  template<span class="token operator">:</span> <span class="token template-string"><span class="token template-punctuation string">`</span><span class="token string">&lt;div>\n    &lt;p :style="{ color: color }">name: {{name}}&lt;/p>\n  &lt;/div></span><span class="token template-punctuation string">`</span></span>\n<span class="token punctuation">}</span><span class="token punctuation">)</span>\n\napp<span class="token punctuation">.</span><span class="token method function property-access">mount</span><span class="token punctuation">(</span><span class="token string">\'#app\'</span><span class="token punctuation">)</span>\n</code></pre>\n<p>最后生成的 <code>render</code> 方法如下，和我们之前的描述基本一致。</p>\n<p><img src="https://file.shenfq.com/pic/20201111135707.png" alt="function render() {}"></p>\n<h2 id="render-%E4%BC%98%E5%8C%96">render 优化<a class="anchor" href="#render-%E4%BC%98%E5%8C%96">§</a></h2>\n<p>Vue3 在虚拟 DOM Diff 时，会取出 <code>patchFlag</code> 和需要进行的 diff 类型进行 <code>&amp;</code>（与）操作，如果结果为 true 才进入对应的 diff。</p>\n<p><img src="https://file.shenfq.com/pic/20201111140613.png" alt="patchFlag 判断"></p>\n<p>还是拿之前的模板举例：</p>\n<pre class="language-html"><code class="language-html"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span> <span class="token attr-name">:</span><span class="token style-attr language-css"><span class="token attr-name"><span class="token attr-name">style</span></span><span class="token punctuation">="</span><span class="token attr-value"><span class="token punctuation">{</span> <span class="token property">color</span><span class="token punctuation">:</span> color <span class="token punctuation">}</span></span><span class="token punctuation">"</span></span><span class="token punctuation">></span></span>name: {{name}}<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>\n</code></pre>\n<p>如果此时的 name 发生了修改，p 节点进入了 diff 阶段，此时会将判断 <code>patchFlag &amp; PatchFlags.TEXT</code> ，这个时候结果为真，表明 p 节点存在文本修改的情况。</p>\n<p><img src="https://file.shenfq.com/pic/20201111141501.png" alt="patchFlag"></p>\n<pre class="language-js"><code class="language-js">patchFlag <span class="token operator">=</span> <span class="token number">5</span>\npatchFlag <span class="token operator">&amp;</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">TEXT</span>\n<span class="token comment">// 或运算：只有对应的两个二进位都为1时，结果位才为1。</span>\n<span class="token comment">// 0000 0101</span>\n<span class="token comment">// 0000 0001</span>\n<span class="token comment">// ------------</span>\n<span class="token comment">// 0000 0001  =>  十进制 1</span>\n</code></pre>\n<pre class="language-js"><code class="language-js"><span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>patchFlag <span class="token operator">&amp;</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">TEXT</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>oldNode<span class="token punctuation">.</span><span class="token property-access">children</span> <span class="token operator">!==</span> newNode<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// 修改文本</span>\n    <span class="token function">hostSetElementText</span><span class="token punctuation">(</span>el<span class="token punctuation">,</span> newNode<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>但是进行  <code>patchFlag &amp; PatchFlags.CLASS</code> 判断时，由于节点并没有动态 Class，返回值为 0，所以就不会对该节点的 class 属性进行 diff，以此来优化性能。</p>\n<p><img src="https://file.shenfq.com/pic/20201111141957.png" alt="patchFlag"></p>\n<pre class="language-js"><code class="language-js">patchFlag <span class="token operator">=</span> <span class="token number">5</span>\npatchFlag <span class="token operator">&amp;</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">CLASS</span>\n<span class="token comment">// 或运算：只有对应的两个二进位都为1时，结果位才为1。</span>\n<span class="token comment">// 0000 0101</span>\n<span class="token comment">// 0000 0010</span>\n<span class="token comment">// ------------</span>\n<span class="token comment">// 0000 0000  =>  十进制 0</span>\n</code></pre>\n<h2 id="%E6%80%BB%E7%BB%93">总结<a class="anchor" href="#%E6%80%BB%E7%BB%93">§</a></h2>\n<p>其实 Vue3 相关的性能优化有很多，这里只单独将 patchFlag 的十分之一的内容拿出来讲了，Vue3 还没正式发布的时候就有看到说 Diff 过程会通过 patchFlag 来进行性能优化，所以打算看看他的优化逻辑，总的来说还是有所收获。</p>'
        } }),
    'head': React.createElement(React.Fragment, null,
        React.createElement("link", { crossOrigin: "anonymous", href: "https://cdn.jsdelivr.net/npm/katex@0.12.0/dist/katex.min.css", integrity: "sha384-AfEj0r4/OFrOo5t7NnNe46zW/tFgW6x/bCJG8FqQCEo3+Aro6EYUG4+cU+KJWu/X", rel: "stylesheet" })),
    'script': React.createElement(React.Fragment, null,
        React.createElement("script", { src: "https://cdn.pagic.org/react@16.13.1/umd/react.production.min.js" }),
        React.createElement("script", { src: "https://cdn.pagic.org/react-dom@16.13.1/umd/react-dom.production.min.js" }),
        React.createElement("script", { src: "/index.js", type: "module" })),
    'contentTitle': React.createElement("h1", { key: "0" }, "Vue3 \u6A21\u677F\u7F16\u8BD1\u4F18\u5316"),
    'contentBody': React.createElement("article", { dangerouslySetInnerHTML: {
            __html: '<p>Vue3 正式发布已经有一段时间了，前段时间写了一篇文章（<a href="https://blog.shenfq.com/2020/vue-%E6%A8%A1%E6%9D%BF%E7%BC%96%E8%AF%91%E5%8E%9F%E7%90%86/">《Vue 模板编译原理》</a>）分析 Vue 的模板编译原理。今天的文章打算学习下 Vue3 下的模板编译与 Vue2 下的差异，以及 VDOM 下 Diff 算法的优化。</p>\n<h2 id="%E7%BC%96%E8%AF%91%E5%85%A5%E5%8F%A3">编译入口<a class="anchor" href="#%E7%BC%96%E8%AF%91%E5%85%A5%E5%8F%A3">§</a></h2>\n<p>了解过 Vue3 的同学肯定知道 Vue3 引入了新的组合 Api，在组件 <code>mount</code> 阶段会调用 <code>setup</code> 方法，之后会判断 <code>render</code> 方法是否存在，如果不存在会调用 <code>compile</code> 方法将 <code>template</code> 转化为 <code>render</code>。</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/runtime-core/src/renderer.ts</span>\n<span class="token keyword">const</span> <span class="token function-variable function">mountComponent</span> <span class="token operator">=</span> <span class="token punctuation">(</span><span class="token parameter">initialVNode<span class="token punctuation">,</span> container</span><span class="token punctuation">)</span> <span class="token arrow operator">=></span> <span class="token punctuation">{</span>\n  <span class="token keyword">const</span> instance <span class="token operator">=</span> <span class="token punctuation">(</span>\n    initialVNode<span class="token punctuation">.</span><span class="token property-access">component</span> <span class="token operator">=</span> <span class="token function">createComponentInstance</span><span class="token punctuation">(</span>\n      <span class="token comment">// ...params</span>\n    <span class="token punctuation">)</span>\n  <span class="token punctuation">)</span>\n  <span class="token comment">// 调用 setup</span>\n  <span class="token function">setupComponent</span><span class="token punctuation">(</span>instance<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n\n<span class="token comment">// packages/runtime-core/src/component.ts</span>\n<span class="token keyword">let</span> compile\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">registerRuntimeCompiler</span><span class="token punctuation">(</span><span class="token parameter">_compile</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  compile <span class="token operator">=</span> _compile\n<span class="token punctuation">}</span>\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">setupComponent</span><span class="token punctuation">(</span><span class="token parameter">instance</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword">const</span> <span class="token maybe-class-name">Component</span> <span class="token operator">=</span> instance<span class="token punctuation">.</span><span class="token property-access">type</span>\n  <span class="token keyword">const</span> <span class="token punctuation">{</span> setup <span class="token punctuation">}</span> <span class="token operator">=</span> <span class="token maybe-class-name">Component</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>setup<span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// ...调用 setup</span>\n  <span class="token punctuation">}</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>compile <span class="token operator">&amp;&amp;</span> <span class="token maybe-class-name">Component</span><span class="token punctuation">.</span><span class="token property-access">template</span> <span class="token operator">&amp;&amp;</span> <span class="token operator">!</span><span class="token maybe-class-name">Component</span><span class="token punctuation">.</span><span class="token property-access">render</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// 如果没有 render 方法</span>\n    <span class="token comment">// 调用 compile 将 template 转为 render 方法</span>\n    <span class="token maybe-class-name">Component</span><span class="token punctuation">.</span><span class="token property-access">render</span> <span class="token operator">=</span> <span class="token function">compile</span><span class="token punctuation">(</span><span class="token maybe-class-name">Component</span><span class="token punctuation">.</span><span class="token property-access">template</span><span class="token punctuation">,</span> <span class="token punctuation">{</span><span class="token spread operator">...</span><span class="token punctuation">}</span><span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>这部分都是 runtime-core 中的代码，之前的文章有讲过 Vue 分为完整版和 runtime 版本。如果使用 <code>vue-loader</code> 处理 <code>.vue</code> 文件，一般都会将 <code>.vue</code> 文件中的 <code>template</code> 直接处理成 <code>render</code> 方法。</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">//  需要编译器</span>\n<span class="token maybe-class-name">Vue</span><span class="token punctuation">.</span><span class="token method function property-access">createApp</span><span class="token punctuation">(</span><span class="token punctuation">{</span>\n  template<span class="token operator">:</span> <span class="token string">\'&lt;div>{{ hi }}&lt;/div>\'</span>\n<span class="token punctuation">}</span><span class="token punctuation">)</span>\n\n<span class="token comment">// 不需要</span>\n<span class="token maybe-class-name">Vue</span><span class="token punctuation">.</span><span class="token method function property-access">createApp</span><span class="token punctuation">(</span><span class="token punctuation">{</span>\n  <span class="token function">render</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword control-flow">return</span> <span class="token maybe-class-name">Vue</span><span class="token punctuation">.</span><span class="token method function property-access">h</span><span class="token punctuation">(</span><span class="token string">\'div\'</span><span class="token punctuation">,</span> <span class="token punctuation">{</span><span class="token punctuation">}</span><span class="token punctuation">,</span> <span class="token keyword">this</span><span class="token punctuation">.</span><span class="token property-access">hi</span><span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span><span class="token punctuation">)</span>\n</code></pre>\n<p>完整版与 runtime 版的差异就是，完整版会引入 <code>compile</code> 方法，如果是 vue-cli 生成的项目就会抹去这部分代码，将 compile 过程都放到打包的阶段，以此优化性能。runtime-dom 中提供了 <code>registerRuntimeCompiler</code> 方法用于注入 <code>compile</code> 方法。</p>\n<p><img src="https://file.shenfq.com/pic/20201109144930.png" alt=""></p>\n<h2 id="%E4%B8%BB%E6%B5%81%E7%A8%8B">主流程<a class="anchor" href="#%E4%B8%BB%E6%B5%81%E7%A8%8B">§</a></h2>\n<p>在完整版的 <code>index.js</code> 中，调用了  <code>registerRuntimeCompiler</code> 将 <code>compile</code> 进行注入，接下来我们看看注入的 <code>compile</code> 方法主要做了什么。</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/vue/src/index.ts</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> compile <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'@vue/compiler-dom\'</span>\n\n<span class="token comment">// 编译缓存</span>\n<span class="token keyword">const</span> compileCache <span class="token operator">=</span> <span class="token known-class-name class-name">Object</span><span class="token punctuation">.</span><span class="token method function property-access">create</span><span class="token punctuation">(</span><span class="token keyword null nil">null</span><span class="token punctuation">)</span>\n\n<span class="token comment">// 注入 compile 方法</span>\n<span class="token keyword">function</span> <span class="token function">compileToFunction</span><span class="token punctuation">(</span>\n  <span class="token comment">// 模板</span>\n  template<span class="token operator">:</span> string <span class="token operator">|</span> <span class="token maybe-class-name">HTMLElement</span><span class="token punctuation">,</span>\n  <span class="token comment">// 编译配置</span>\n  options<span class="token operator">?</span><span class="token operator">:</span> <span class="token maybe-class-name">CompilerOptions</span>\n<span class="token punctuation">)</span><span class="token operator">:</span> <span class="token maybe-class-name">RenderFunction</span> <span class="token punctuation">{</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span><span class="token operator">!</span><span class="token function">isString</span><span class="token punctuation">(</span>template<span class="token punctuation">)</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// 如果 template 不是字符串</span>\n    <span class="token comment">// 则认为是一个 DOM 节点，获取 innerHTML</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>template<span class="token punctuation">.</span><span class="token property-access">nodeType</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      template <span class="token operator">=</span> template<span class="token punctuation">.</span><span class="token property-access">innerHTML</span>\n    <span class="token punctuation">}</span> <span class="token keyword control-flow">else</span> <span class="token punctuation">{</span>\n      <span class="token keyword control-flow">return</span> <span class="token constant">NOOP</span>\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span>\n\n  <span class="token comment">// 如果缓存中存在，直接从缓存中获取</span>\n  <span class="token keyword">const</span> key <span class="token operator">=</span> template\n  <span class="token keyword">const</span> cached <span class="token operator">=</span> compileCache<span class="token punctuation">[</span>key<span class="token punctuation">]</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>cached<span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword control-flow">return</span> cached\n  <span class="token punctuation">}</span>\n\n  <span class="token comment">// 如果是 ID 选择器，这获取 DOM 元素后，取 innerHTML</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>template<span class="token punctuation">[</span><span class="token number">0</span><span class="token punctuation">]</span> <span class="token operator">===</span> <span class="token string">\'#\'</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword">const</span> el <span class="token operator">=</span> <span class="token dom variable">document</span><span class="token punctuation">.</span><span class="token method function property-access">querySelector</span><span class="token punctuation">(</span>template<span class="token punctuation">)</span>\n    template <span class="token operator">=</span> el <span class="token operator">?</span> el<span class="token punctuation">.</span><span class="token property-access">innerHTML</span> <span class="token operator">:</span> <span class="token string">\'\'</span>\n  <span class="token punctuation">}</span>\n\n  <span class="token comment">// 调用 compile 获取 render code</span>\n  <span class="token keyword">const</span> <span class="token punctuation">{</span> code <span class="token punctuation">}</span> <span class="token operator">=</span> <span class="token function">compile</span><span class="token punctuation">(</span>\n    template<span class="token punctuation">,</span>\n    options\n  <span class="token punctuation">)</span>\n\n  <span class="token comment">// 将 render code 转化为 function</span>\n  <span class="token keyword">const</span> render <span class="token operator">=</span> <span class="token keyword">new</span> <span class="token class-name">Function</span><span class="token punctuation">(</span>code<span class="token punctuation">)</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>\n\n  <span class="token comment">// 返回 render 方法的同时，将其放入缓存</span>\n  <span class="token keyword control-flow">return</span> <span class="token punctuation">(</span>compileCache<span class="token punctuation">[</span>key<span class="token punctuation">]</span> <span class="token operator">=</span> render<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n\n<span class="token comment">// 注入 compile</span>\n<span class="token function">registerRuntimeCompiler</span><span class="token punctuation">(</span>compileToFunction<span class="token punctuation">)</span>\n</code></pre>\n<p>在讲 Vue2 模板编译的时候已经讲过，<code>compile</code> 方法主要分为三步，Vue3 的逻辑类似：</p>\n<ol>\n<li>模板编译，将模板代码转化为 AST；</li>\n<li>优化 AST，方便后续虚拟 DOM 更新；</li>\n<li>生成代码，将 AST 转化为可执行的代码；</li>\n</ol>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/compiler-dom/src/index.ts</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> baseCompile<span class="token punctuation">,</span> baseParse <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'@vue/compiler-core\'</span>\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">compile</span><span class="token punctuation">(</span><span class="token parameter">template<span class="token punctuation">,</span> options</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword control-flow">return</span> <span class="token function">baseCompile</span><span class="token punctuation">(</span>template<span class="token punctuation">,</span> options<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n\n<span class="token comment">// packages/compiler-core/src/compile.ts</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> baseParse <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./parse\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transform <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transform\'</span>\n\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformIf <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vIf\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformFor <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vFor\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformText <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/transformText\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformElement <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/transformElement\'</span>\n\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformOn <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vOn\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformBind <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vBind\'</span>\n<span class="token keyword module">import</span> <span class="token imports"><span class="token punctuation">{</span> transformModel <span class="token punctuation">}</span></span> <span class="token keyword module">from</span> <span class="token string">\'./transforms/vModel\'</span>\n\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">baseCompile</span><span class="token punctuation">(</span><span class="token parameter">template<span class="token punctuation">,</span> options</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token comment">// 解析 html，转化为 ast</span>\n  <span class="token keyword">const</span> ast <span class="token operator">=</span> <span class="token function">baseParse</span><span class="token punctuation">(</span>template<span class="token punctuation">,</span> options<span class="token punctuation">)</span>\n  <span class="token comment">// 优化 ast，标记静态节点</span>\n  <span class="token function">transform</span><span class="token punctuation">(</span>ast<span class="token punctuation">,</span> <span class="token punctuation">{</span>\n    <span class="token spread operator">...</span>options<span class="token punctuation">,</span>\n    nodeTransforms<span class="token operator">:</span> <span class="token punctuation">[</span>\n      transformIf<span class="token punctuation">,</span>\n      transformFor<span class="token punctuation">,</span>\n      transformText<span class="token punctuation">,</span>\n      transformElement<span class="token punctuation">,</span>\n      <span class="token comment">// ... 省略了部分 transform</span>\n    <span class="token punctuation">]</span><span class="token punctuation">,</span>\n    directiveTransforms<span class="token operator">:</span> <span class="token punctuation">{</span>\n      on<span class="token operator">:</span> transformOn<span class="token punctuation">,</span>\n      bind<span class="token operator">:</span> transformBind<span class="token punctuation">,</span>\n      model<span class="token operator">:</span> transformModel\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span><span class="token punctuation">)</span>\n  <span class="token comment">// 将 ast 转化为可执行代码</span>\n  <span class="token keyword control-flow">return</span> <span class="token function">generate</span><span class="token punctuation">(</span>ast<span class="token punctuation">,</span> options<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<h2 id="%E8%AE%A1%E7%AE%97-patchflag">计算 PatchFlag<a class="anchor" href="#%E8%AE%A1%E7%AE%97-patchflag">§</a></h2>\n<p>这里大致的逻辑与之前的并没有多大的差异，主要是 <code>optimize</code> 方法变成了  <code>transform</code> 方法，而且默认会对一些模板语法进行 <code>transform</code>。这些 <code>transform</code> 就是后续虚拟 DOM 优化的关键，我们先看看 <code>transform</code> 的代码 。</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/compiler-core/src/transform.ts</span>\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">transform</span><span class="token punctuation">(</span><span class="token parameter">root<span class="token punctuation">,</span> options</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword">const</span> context <span class="token operator">=</span> <span class="token function">createTransformContext</span><span class="token punctuation">(</span>root<span class="token punctuation">,</span> options<span class="token punctuation">)</span>\n  <span class="token function">traverseNode</span><span class="token punctuation">(</span>root<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n<span class="token punctuation">}</span>\n<span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">traverseNode</span><span class="token punctuation">(</span><span class="token parameter">node<span class="token punctuation">,</span> context</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  context<span class="token punctuation">.</span><span class="token property-access">currentNode</span> <span class="token operator">=</span> node\n  <span class="token keyword">const</span> <span class="token punctuation">{</span> nodeTransforms <span class="token punctuation">}</span> <span class="token operator">=</span> context\n  <span class="token keyword">const</span> exitFns <span class="token operator">=</span> <span class="token punctuation">[</span><span class="token punctuation">]</span>\n  <span class="token keyword control-flow">for</span> <span class="token punctuation">(</span><span class="token keyword">let</span> i <span class="token operator">=</span> <span class="token number">0</span><span class="token punctuation">;</span> i <span class="token operator">&lt;</span> nodeTransforms<span class="token punctuation">.</span><span class="token property-access">length</span><span class="token punctuation">;</span> i<span class="token operator">++</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// Transform 会返回一个退出函数，在处理完所有的子节点后再执行</span>\n    <span class="token keyword">const</span> onExit <span class="token operator">=</span> nodeTransforms<span class="token punctuation">[</span>i<span class="token punctuation">]</span><span class="token punctuation">(</span>node<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>onExit<span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span><span class="token function">isArray</span><span class="token punctuation">(</span>onExit<span class="token punctuation">)</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        exitFns<span class="token punctuation">.</span><span class="token method function property-access">push</span><span class="token punctuation">(</span><span class="token spread operator">...</span>onExit<span class="token punctuation">)</span>\n      <span class="token punctuation">}</span> <span class="token keyword control-flow">else</span> <span class="token punctuation">{</span>\n        exitFns<span class="token punctuation">.</span><span class="token method function property-access">push</span><span class="token punctuation">(</span>onExit<span class="token punctuation">)</span>\n      <span class="token punctuation">}</span>\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span>\n  <span class="token function">traverseChildren</span><span class="token punctuation">(</span>node<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n  context<span class="token punctuation">.</span><span class="token property-access">currentNode</span> <span class="token operator">=</span> node\n  <span class="token comment">// 执行所以 Transform 的退出函数</span>\n  <span class="token keyword">let</span> i <span class="token operator">=</span> exitFns<span class="token punctuation">.</span><span class="token property-access">length</span>\n  <span class="token keyword control-flow">while</span> <span class="token punctuation">(</span>i<span class="token operator">--</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    exitFns<span class="token punctuation">[</span>i<span class="token punctuation">]</span><span class="token punctuation">(</span><span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>我们重点看一下 <code>transformElement</code> 的逻辑：</p>\n<pre class="language-js"><code class="language-js"><span class="token comment">// packages/compiler-core/src/transforms/transformElement.ts</span>\n<span class="token keyword module">export</span> <span class="token keyword">const</span> transformElement<span class="token operator">:</span> <span class="token function-variable function"><span class="token maybe-class-name">NodeTransform</span></span> <span class="token operator">=</span> <span class="token punctuation">(</span><span class="token parameter">node<span class="token punctuation">,</span> context</span><span class="token punctuation">)</span> <span class="token arrow operator">=></span> <span class="token punctuation">{</span>\n  <span class="token comment">// transformElement 没有执行任何逻辑，而是直接返回了一个退出函数</span>\n  <span class="token comment">// 说明 transformElement 需要等所有的子节点处理完后才执行</span>\n  <span class="token keyword control-flow">return</span> <span class="token keyword">function</span> <span class="token function">postTransformElement</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword">const</span> <span class="token punctuation">{</span> tag<span class="token punctuation">,</span> props <span class="token punctuation">}</span> <span class="token operator">=</span> node\n\n    <span class="token keyword">let</span> vnodeProps\n    <span class="token keyword">let</span> vnodePatchFlag\n    <span class="token keyword">const</span> vnodeTag <span class="token operator">=</span> node<span class="token punctuation">.</span><span class="token property-access">tagType</span> <span class="token operator">===</span> <span class="token maybe-class-name">ElementTypes</span><span class="token punctuation">.</span><span class="token constant">COMPONENT</span>\n      <span class="token operator">?</span> <span class="token function">resolveComponentType</span><span class="token punctuation">(</span>node<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n      <span class="token operator">:</span> <span class="token template-string"><span class="token template-punctuation string">`</span><span class="token string">"</span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">${</span>tag<span class="token interpolation-punctuation punctuation">}</span></span><span class="token string">"</span><span class="token template-punctuation string">`</span></span>\n    \n    <span class="token keyword">let</span> patchFlag <span class="token operator">=</span> <span class="token number">0</span>\n    <span class="token comment">// 检测节点属性</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>props<span class="token punctuation">.</span><span class="token property-access">length</span> <span class="token operator">></span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      <span class="token comment">// 检测节点属性的动态部分</span>\n      <span class="token keyword">const</span> propsBuildResult <span class="token operator">=</span> <span class="token function">buildProps</span><span class="token punctuation">(</span>node<span class="token punctuation">,</span> context<span class="token punctuation">)</span>\n      vnodeProps <span class="token operator">=</span> propsBuildResult<span class="token punctuation">.</span><span class="token property-access">props</span>\n      patchFlag <span class="token operator">=</span> propsBuildResult<span class="token punctuation">.</span><span class="token property-access">patchFlag</span>\n    <span class="token punctuation">}</span>\n\n    <span class="token comment">// 检测子节点</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>node<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">.</span><span class="token property-access">length</span> <span class="token operator">></span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>node<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">.</span><span class="token property-access">length</span> <span class="token operator">===</span> <span class="token number">1</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        <span class="token keyword">const</span> child <span class="token operator">=</span> node<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">[</span><span class="token number">0</span><span class="token punctuation">]</span>\n        <span class="token comment">// 检测子节点是否为动态文本</span>\n        <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span><span class="token operator">!</span><span class="token function">getStaticType</span><span class="token punctuation">(</span>child<span class="token punctuation">)</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n          patchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">TEXT</span>\n        <span class="token punctuation">}</span>\n      <span class="token punctuation">}</span>\n    <span class="token punctuation">}</span>\n\n    <span class="token comment">// 格式化 patchFlag</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>patchFlag <span class="token operator">!==</span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        vnodePatchFlag <span class="token operator">=</span> <span class="token known-class-name class-name">String</span><span class="token punctuation">(</span>patchFlag<span class="token punctuation">)</span>\n    <span class="token punctuation">}</span>\n\n    node<span class="token punctuation">.</span><span class="token property-access">codegenNode</span> <span class="token operator">=</span> <span class="token function">createVNodeCall</span><span class="token punctuation">(</span>\n      context<span class="token punctuation">,</span>\n      vnodeTag<span class="token punctuation">,</span>\n      vnodeProps<span class="token punctuation">,</span>\n      vnodeChildren<span class="token punctuation">,</span>\n      vnodePatchFlag\n    <span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p><code>buildProps</code> 会对节点的属性进行一次遍历，由于内部源码涉及很多其他的细节，这里的代码是经过简化之后的，只保留了 <code>patchFlag</code> 相关的逻辑。</p>\n<pre class="language-js"><code class="language-js"><span class="token keyword module">export</span> <span class="token keyword">function</span> <span class="token function">buildProps</span><span class="token punctuation">(</span>\n  node<span class="token operator">:</span> <span class="token maybe-class-name">ElementNode</span><span class="token punctuation">,</span>\n  context<span class="token operator">:</span> <span class="token maybe-class-name">TransformContext</span><span class="token punctuation">,</span>\n  props<span class="token operator">:</span> <span class="token maybe-class-name">ElementNode</span><span class="token punctuation">[</span><span class="token string">\'props\'</span><span class="token punctuation">]</span> <span class="token operator">=</span> node<span class="token punctuation">.</span><span class="token property-access">props</span>\n<span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword">let</span> patchFlag <span class="token operator">=</span> <span class="token number">0</span>\n  <span class="token keyword control-flow">for</span> <span class="token punctuation">(</span><span class="token keyword">let</span> i <span class="token operator">=</span> <span class="token number">0</span><span class="token punctuation">;</span> i <span class="token operator">&lt;</span> props<span class="token punctuation">.</span><span class="token property-access">length</span><span class="token punctuation">;</span> i<span class="token operator">++</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword">const</span> prop <span class="token operator">=</span> props<span class="token punctuation">[</span>i<span class="token punctuation">]</span>\n    <span class="token keyword">const</span> <span class="token punctuation">[</span>key<span class="token punctuation">,</span> name<span class="token punctuation">]</span> <span class="token operator">=</span> prop<span class="token punctuation">.</span><span class="token property-access">name</span><span class="token punctuation">.</span><span class="token method function property-access">split</span><span class="token punctuation">(</span><span class="token string">\':\'</span><span class="token punctuation">)</span>\n    <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>key <span class="token operator">===</span> <span class="token string">\'v-bind\'</span> <span class="token operator">||</span> key <span class="token operator">===</span> <span class="token string">\'\'</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n      <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>name <span class="token operator">===</span> <span class="token string">\'class\'</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        <span class="token comment">// 如果包含 :class 属性，patchFlag | CLASS</span>\n        patchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">CLASS</span>\n      <span class="token punctuation">}</span> <span class="token keyword control-flow">else</span> <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>name <span class="token operator">===</span> <span class="token string">\'style\'</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n        <span class="token comment">// 如果包含 :style 属性，patchFlag | STYLE</span>\n        patchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">STYLE</span>\n      <span class="token punctuation">}</span>\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span>\n\n  <span class="token keyword control-flow">return</span> <span class="token punctuation">{</span>\n    patchFlag\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>上面的代码只展示了三种 <code>patchFlag</code> 的类型：</p>\n<ul>\n<li><strong>节点只有一个文本子节点，且该文本包含动态的数据</strong>（<code>TEXT = 1</code>）</li>\n</ul>\n<pre class="language-html"><code class="language-html"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span><span class="token punctuation">></span></span>name: {{name}}<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>\n</code></pre>\n<ul>\n<li><strong>节点包含可变的 class 属性</strong>（<code>CLASS = 1 &lt;&lt; 1</code>）</li>\n</ul>\n<pre class="language-html"><code class="language-html"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>div</span> <span class="token attr-name">:class</span><span class="token attr-value"><span class="token punctuation attr-equals">=</span><span class="token punctuation">"</span>{ active: isActive }<span class="token punctuation">"</span></span><span class="token punctuation">></span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>div</span><span class="token punctuation">></span></span>\n</code></pre>\n<ul>\n<li><strong>节点包含可变的 style 属性</strong>（<code>STYLE = 1 &lt;&lt; 2</code>）</li>\n</ul>\n<pre class="language-html"><code class="language-html"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>div</span> <span class="token attr-name">:</span><span class="token style-attr language-css"><span class="token attr-name"><span class="token attr-name">style</span></span><span class="token punctuation">="</span><span class="token attr-value"><span class="token punctuation">{</span> <span class="token property">color</span><span class="token punctuation">:</span> color <span class="token punctuation">}</span></span><span class="token punctuation">"</span></span><span class="token punctuation">></span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>div</span><span class="token punctuation">></span></span>\n</code></pre>\n<p>可以看到 PatchFlags 都是数字 <code>1</code> 经过 <strong>左移操作符</strong> 计算得到的。</p>\n<pre class="language-js"><code class="language-js"><span class="token keyword module">export</span> <span class="token keyword">const</span> <span class="token keyword">enum</span> <span class="token maybe-class-name">PatchFlags</span> <span class="token punctuation">{</span>\n  <span class="token constant">TEXT</span> <span class="token operator">=</span> <span class="token number">1</span><span class="token punctuation">,</span>             <span class="token comment">// 1, 二进制 0000 0001</span>\n  <span class="token constant">CLASS</span> <span class="token operator">=</span> <span class="token number">1</span> <span class="token operator">&lt;&lt;</span> <span class="token number">1</span><span class="token punctuation">,</span>       <span class="token comment">// 2, 二进制 0000 0010</span>\n  <span class="token constant">STYLE</span> <span class="token operator">=</span> <span class="token number">1</span> <span class="token operator">&lt;&lt;</span> <span class="token number">2</span><span class="token punctuation">,</span>       <span class="token comment">// 4, 二进制 0000 0100</span>\n  <span class="token constant">PROPS</span> <span class="token operator">=</span> <span class="token number">1</span> <span class="token operator">&lt;&lt;</span> <span class="token number">3</span><span class="token punctuation">,</span>       <span class="token comment">// 8, 二进制 0000 1000</span>\n  <span class="token spread operator">...</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>从上面的代码能看出来，<code>patchFlag</code> 的初始值为 0，每次对 <code>patchFlag</code> 都是执行 <code>|</code> （或）操作。如果当前节点是一个只有动态文本子节点且同时具有动态 style 属性，最后得到的 <code>patchFlag</code> 为 5（<code>二进制：0000 0101</code>）。</p>\n<pre class="language-js"><code class="language-js"><span class="token operator">&lt;</span>p <span class="token operator">:</span>style<span class="token operator">=</span><span class="token string">"{ color: color }"</span><span class="token operator">></span>name<span class="token operator">:</span> <span class="token punctuation">{</span><span class="token punctuation">{</span>name<span class="token punctuation">}</span><span class="token punctuation">}</span><span class="token operator">&lt;</span><span class="token operator">/</span>p<span class="token operator">></span>\n</code></pre>\n<pre class="language-js"><code class="language-js">patchFlag <span class="token operator">=</span> <span class="token number">0</span>\npatchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">STYLE</span>\npatchFlag <span class="token operator">|=</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">TEXT</span>\n<span class="token comment">// 或运算：两个对应的二进制位中只要一个是1，结果对应位就是1。</span>\n<span class="token comment">// 0000 0001</span>\n<span class="token comment">// 0000 0100</span>\n<span class="token comment">// ------------</span>\n<span class="token comment">// 0000 0101  =>  十进制 5</span>\n</code></pre>\n<p><img src="https://file.shenfq.com/pic/20201111135121.png" alt="patchFlag"></p>\n<p>我们将上面的代码放到 Vue3 中运行：</p>\n<pre class="language-js"><code class="language-js"><span class="token keyword">const</span> app <span class="token operator">=</span> <span class="token maybe-class-name">Vue</span><span class="token punctuation">.</span><span class="token method function property-access">createApp</span><span class="token punctuation">(</span><span class="token punctuation">{</span>\n  <span class="token function">data</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token keyword control-flow">return</span> <span class="token punctuation">{</span>\n      color<span class="token operator">:</span> <span class="token string">\'red\'</span><span class="token punctuation">,</span>\n      name<span class="token operator">:</span> <span class="token string">\'shenfq\'</span>\n    <span class="token punctuation">}</span>\n  <span class="token punctuation">}</span><span class="token punctuation">,</span>\n  template<span class="token operator">:</span> <span class="token template-string"><span class="token template-punctuation string">`</span><span class="token string">&lt;div>\n    &lt;p :style="{ color: color }">name: {{name}}&lt;/p>\n  &lt;/div></span><span class="token template-punctuation string">`</span></span>\n<span class="token punctuation">}</span><span class="token punctuation">)</span>\n\napp<span class="token punctuation">.</span><span class="token method function property-access">mount</span><span class="token punctuation">(</span><span class="token string">\'#app\'</span><span class="token punctuation">)</span>\n</code></pre>\n<p>最后生成的 <code>render</code> 方法如下，和我们之前的描述基本一致。</p>\n<p><img src="https://file.shenfq.com/pic/20201111135707.png" alt="function render() {}"></p>\n<h2 id="render-%E4%BC%98%E5%8C%96">render 优化<a class="anchor" href="#render-%E4%BC%98%E5%8C%96">§</a></h2>\n<p>Vue3 在虚拟 DOM Diff 时，会取出 <code>patchFlag</code> 和需要进行的 diff 类型进行 <code>&amp;</code>（与）操作，如果结果为 true 才进入对应的 diff。</p>\n<p><img src="https://file.shenfq.com/pic/20201111140613.png" alt="patchFlag 判断"></p>\n<p>还是拿之前的模板举例：</p>\n<pre class="language-html"><code class="language-html"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span> <span class="token attr-name">:</span><span class="token style-attr language-css"><span class="token attr-name"><span class="token attr-name">style</span></span><span class="token punctuation">="</span><span class="token attr-value"><span class="token punctuation">{</span> <span class="token property">color</span><span class="token punctuation">:</span> color <span class="token punctuation">}</span></span><span class="token punctuation">"</span></span><span class="token punctuation">></span></span>name: {{name}}<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>\n</code></pre>\n<p>如果此时的 name 发生了修改，p 节点进入了 diff 阶段，此时会将判断 <code>patchFlag &amp; PatchFlags.TEXT</code> ，这个时候结果为真，表明 p 节点存在文本修改的情况。</p>\n<p><img src="https://file.shenfq.com/pic/20201111141501.png" alt="patchFlag"></p>\n<pre class="language-js"><code class="language-js">patchFlag <span class="token operator">=</span> <span class="token number">5</span>\npatchFlag <span class="token operator">&amp;</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">TEXT</span>\n<span class="token comment">// 或运算：只有对应的两个二进位都为1时，结果位才为1。</span>\n<span class="token comment">// 0000 0101</span>\n<span class="token comment">// 0000 0001</span>\n<span class="token comment">// ------------</span>\n<span class="token comment">// 0000 0001  =>  十进制 1</span>\n</code></pre>\n<pre class="language-js"><code class="language-js"><span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>patchFlag <span class="token operator">&amp;</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">TEXT</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n  <span class="token keyword control-flow">if</span> <span class="token punctuation">(</span>oldNode<span class="token punctuation">.</span><span class="token property-access">children</span> <span class="token operator">!==</span> newNode<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>\n    <span class="token comment">// 修改文本</span>\n    <span class="token function">hostSetElementText</span><span class="token punctuation">(</span>el<span class="token punctuation">,</span> newNode<span class="token punctuation">.</span><span class="token property-access">children</span><span class="token punctuation">)</span>\n  <span class="token punctuation">}</span>\n<span class="token punctuation">}</span>\n</code></pre>\n<p>但是进行  <code>patchFlag &amp; PatchFlags.CLASS</code> 判断时，由于节点并没有动态 Class，返回值为 0，所以就不会对该节点的 class 属性进行 diff，以此来优化性能。</p>\n<p><img src="https://file.shenfq.com/pic/20201111141957.png" alt="patchFlag"></p>\n<pre class="language-js"><code class="language-js">patchFlag <span class="token operator">=</span> <span class="token number">5</span>\npatchFlag <span class="token operator">&amp;</span> <span class="token maybe-class-name">PatchFlags</span><span class="token punctuation">.</span><span class="token constant">CLASS</span>\n<span class="token comment">// 或运算：只有对应的两个二进位都为1时，结果位才为1。</span>\n<span class="token comment">// 0000 0101</span>\n<span class="token comment">// 0000 0010</span>\n<span class="token comment">// ------------</span>\n<span class="token comment">// 0000 0000  =>  十进制 0</span>\n</code></pre>\n<h2 id="%E6%80%BB%E7%BB%93">总结<a class="anchor" href="#%E6%80%BB%E7%BB%93">§</a></h2>\n<p>其实 Vue3 相关的性能优化有很多，这里只单独将 patchFlag 的十分之一的内容拿出来讲了，Vue3 还没正式发布的时候就有看到说 Diff 过程会通过 patchFlag 来进行性能优化，所以打算看看他的优化逻辑，总的来说还是有所收获。</p>'
        } }),
    'toc': React.createElement("aside", { dangerouslySetInnerHTML: {
            __html: '<nav class="toc"><ol><li><a href="#%E7%BC%96%E8%AF%91%E5%85%A5%E5%8F%A3">编译入口</a></li><li><a href="#%E4%B8%BB%E6%B5%81%E7%A8%8B">主流程</a></li><li><a href="#%E8%AE%A1%E7%AE%97-patchflag">计算 PatchFlag</a></li><li><a href="#render-%E4%BC%98%E5%8C%96">render 优化</a></li><li><a href="#%E6%80%BB%E7%BB%93">总结</a></li></ol></nav>'
        } }),
    'author': "shenfq",
    'contributors': [
        "Shenfq"
    ],
    'date': "2020/11/11",
    'updated': null,
    'excerpt': "Vue3 正式发布已经有一段时间了，前段时间写了一篇文章（《Vue 模板编译原理》）分析 Vue 的模板编译原理。今天的文章打算学习下 Vue3 下的模板编译与 Vue2 下的差异，以及 VDOM 下 Diff 算法的优化。 编译入口 了解过 Vue3 的...",
    'cover': "https://file.shenfq.com/pic/20201109144930.png",
    'categories': [
        "前端"
    ],
    'tags': [
        "前端框架",
        "Vue.js",
        "编译",
        "模板"
    ],
    'blog': {
        "isPost": true,
        "posts": [
            {
                "pagePath": "posts/2020/Node.js 服务性能翻倍的秘密（一）.md",
                "title": "Node.js 服务性能翻倍的秘密（一）",
                "link": "posts/2020/Node.js 服务性能翻倍的秘密（一）.html",
                "date": "2020/12/13",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "Node.js"
                ],
                "tags": [
                    "性能",
                    "Node",
                    "JSON",
                    "fastify"
                ],
                "excerpt": "前言 用过 Node.js 开发过的同学肯定都上手过 koa，因为他简单优雅的写法，再加上丰富的社区生态，而且现存的许多 Node.js 框架都是基于 koa 进行二次封装的。但是说到性能，就不得不提到一个知名框架： fastify ，听名字就知道...",
                "cover": "https://file.shenfq.com/pic/20201213162826.png"
            },
            {
                "pagePath": "posts/2020/我是怎么读源码的.md",
                "title": "我是如何阅读源码的",
                "link": "posts/2020/我是怎么读源码的.html",
                "date": "2020/12/7",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "React",
                    "Vue.js",
                    "前端"
                ],
                "excerpt": "最近写了很多源码分析相关的文章，React、Vue 都有，想把我阅读源码的一些心得分享给大家。 React： - React 架构的演变 - 从同步到异步 - React 架构的演变 - 从递归到循环 - React 架构的演变 - 更新机制 - React 架构的演变...",
                "cover": "https://file.shenfq.com/pic/20201205210806.png"
            },
            {
                "pagePath": "posts/2020/Vue3 Teleport 组件的实践及原理.md",
                "title": "Vue3 Teleport 组件的实践及原理",
                "link": "posts/2020/Vue3 Teleport 组件的实践及原理.html",
                "date": "2020/12/1",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "Vue.js",
                    "组件"
                ],
                "excerpt": "Vue3 的组合式 API 以及基于 Proxy 响应式原理已经有很多文章介绍过了，除了这些比较亮眼的更新，Vue3 还新增了一个内置组件：Teleport。这个组件的作用主要用来将模板内的 DOM 元素移动到其他位置。 使用场景 业务开发的过程中...",
                "cover": "https://file.shenfq.com/pic/20201128210914.png"
            },
            {
                "pagePath": "posts/2020/【翻译】CommonJS 是如何导致打包体积增大的？.md",
                "title": "【翻译】CommonJS 是如何导致打包后体积增大的？",
                "link": "posts/2020/【翻译】CommonJS 是如何导致打包体积增大的？.html",
                "date": "2020/11/18",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端工程"
                ],
                "tags": [
                    "前端",
                    "翻译",
                    "模块化",
                    "前端工程化",
                    "Webpack"
                ],
                "excerpt": "今天的文章，将介绍什么是 CommonJS，以及它为什么会导致我们打包后的文件体积增大。 什么是 CommonJS？ CommonJS 是 2009 年发布的 JavaScript模块化的一项标准，最初它只打算在浏览器之外的场景使用，主要用于服务器端的应用..."
            },
            {
                "pagePath": "posts/2020/Vue3 模板编译优化.md",
                "title": "Vue3 模板编译优化",
                "link": "posts/2020/Vue3 模板编译优化.html",
                "date": "2020/11/11",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "Vue.js",
                    "编译",
                    "模板"
                ],
                "excerpt": "Vue3 正式发布已经有一段时间了，前段时间写了一篇文章（《Vue 模板编译原理》）分析 Vue 的模板编译原理。今天的文章打算学习下 Vue3 下的模板编译与 Vue2 下的差异，以及 VDOM 下 Diff 算法的优化。 编译入口 了解过 Vue3 的...",
                "cover": "https://file.shenfq.com/pic/20201109144930.png"
            },
            {
                "pagePath": "posts/2020/小程序依赖分析.md",
                "title": "小程序依赖分析",
                "link": "posts/2020/小程序依赖分析.html",
                "date": "2020/11/02",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "微信小程序"
                ],
                "tags": [
                    "小程序",
                    "微信小程序",
                    "依赖分析"
                ],
                "excerpt": "用过 webpack 的同学肯定知道 webpack-bundle-analyzer ，可以用来分析当前项目 js 文件的依赖关系。 因为最近一直在做小程序业务，而且小程序对包体大小特别敏感，所以就想着能不能做一个类似的工具，用来查看当前小程序各个主...",
                "cover": "https://file.shenfq.com/pic/20201030230741.png"
            },
            {
                "pagePath": "posts/2020/React 架构的演变 - Hooks 的实现.md",
                "title": "React 架构的演变 - Hooks 的实现",
                "link": "posts/2020/React 架构的演变 - Hooks 的实现.html",
                "date": "2020/10/27",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "JavaScript",
                    "React"
                ],
                "excerpt": "React Hooks 可以说完全颠覆了之前 Class Component 的写法，进一步增强了状态复用的能力，让 Function Component 也具有了内部状态，对于我个人来说，更加喜欢 Hooks 的写法。当然如果你是一个使用 Class Component 的老手，初...",
                "cover": "https://file.shenfq.com/pic/20201026173627.png"
            },
            {
                "pagePath": "posts/2020/Vue 3 的组合 API 如何请求数据？.md",
                "title": "Vue 3 的组合 API 如何请求数据？",
                "link": "posts/2020/Vue 3 的组合 API 如何请求数据？.html",
                "date": "2020/10/20",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端",
                    "前端框架",
                    "Vue.js"
                ],
                "excerpt": "前言 之前在学习 React Hooks 的过程中，看到一篇外网文章，通过 Hooks 来请求数据，并将这段逻辑抽象成一个新的 Hooks 给其他组件复用，我也在我的博客里翻译了一下：《在 React Hooks 中如何请求数据？》，感兴趣可以看看。虽...",
                "cover": "https://file.shenfq.com/pic/20201019144935.png"
            },
            {
                "pagePath": "posts/2020/React 架构的演变 - 更新机制.md",
                "title": "React 架构的演变 - 更新机制",
                "link": "posts/2020/React 架构的演变 - 更新机制.html",
                "date": "2020/10/12",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "JavaScript",
                    "React"
                ],
                "excerpt": "前面的文章分析了 Concurrent 模式下异步更新的逻辑，以及 Fiber 架构是如何进行时间分片的，更新过程中的很多内容都省略了，评论区也收到了一些同学对更新过程的疑惑，今天的文章就来讲解下 React Fiber 架构的更新机制。 Fib...",
                "cover": "https://file.shenfq.com/pic/20201009143621.png"
            },
            {
                "pagePath": "posts/2020/React 架构的演变 - 从递归到循环.md",
                "title": "React 架构的演变 - 从递归到循环",
                "link": "posts/2020/React 架构的演变 - 从递归到循环.html",
                "date": "2020/09/29",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "JavaScript",
                    "React"
                ],
                "excerpt": "这篇文章是 React 架构演变的第二篇，上一篇主要介绍了更新机制从同步修改为异步，这一篇重点介绍 Fiber 架构下通过循环遍历更新的过程，之所以要使用循环遍历的方式，是因为递归更新过程一旦开始就不能暂停，只能不断向下，直...",
                "cover": "https://file.shenfq.com/pic/20200926153531.png"
            },
            {
                "pagePath": "posts/2020/React 架构的演变 - 从同步到异步.md",
                "title": "React 架构的演变 - 从同步到异步",
                "link": "posts/2020/React 架构的演变 - 从同步到异步.html",
                "date": "2020/09/23",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "JavaScript",
                    "React"
                ],
                "excerpt": "写这篇文章的目的，主要是想弄懂 React 最新的 fiber 架构到底是什么东西，但是看了网上的很多文章，要不模棱两可，要不就是一顿复制粘贴，根本看不懂，于是开始认真钻研源码。钻研过程中，发现我想得太简单了，React 源码的复...",
                "cover": "https://file.shenfq.com/ipic/2020-09-22-064122.png"
            },
            {
                "pagePath": "posts/2020/Webpack5 Module Federation.md",
                "title": "Webpack5 跨应用代码共享-Module Federation",
                "link": "posts/2020/Webpack5 Module Federation.html",
                "date": "2020/09/14",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端工程"
                ],
                "tags": [
                    "前端",
                    "模块化",
                    "前端工程化",
                    "webpack"
                ],
                "excerpt": "Webpack 5 的消息尽管已经出来了许久，但是正式版一直还未发布。Webpack 5 的 ChangeLog 中，除了常规的性能优化、编译提速之外，有一个比较让人期待的功能就是 Module Federation。有些文件将 Module Federation 强行翻译成「...",
                "cover": "https://file.shenfq.com/ipic/2020-09-14-040807.png"
            },
            {
                "pagePath": "posts/2020/面向未来的前端构建工具-vite.md",
                "title": "面向未来的前端构建工具-vite",
                "link": "posts/2020/面向未来的前端构建工具-vite.html",
                "date": "2020/09/07",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端工程"
                ],
                "tags": [
                    "前端",
                    "模块化",
                    "前端工程化",
                    "Vue.js",
                    "JavaScript"
                ],
                "excerpt": "前言 如果近期你有关注 Vue 的动态，就能发现 Vue 作者最近一直在捣鼓的新工具 vite。vite 1.0 目前已经进入了 rc 版本，马上就要正式发布 1.0 的版本了。几个月前，尤雨溪就已经在微博介绍过了 vite ，是一个基于浏览器原生 E...",
                "cover": "https://file.shenfq.com/ipic/2020-09-06-031703.png"
            },
            {
                "pagePath": "posts/2020/手把手教你实现 Promise .md",
                "title": "手把手教你实现 Promise",
                "link": "posts/2020/手把手教你实现 Promise .html",
                "date": "2020/09/01",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "Promise"
                ],
                "tags": [
                    "前端",
                    "Promise",
                    "JavaScript"
                ],
                "excerpt": "前言 很多 JavaScript 的初学者都曾感受过被回调地狱支配的恐惧，直至掌握了 Promise 语法才算解脱。虽然很多语言都早已内置了 Promise ，但是 JavaScript 中真正将其发扬光大的还是 jQuery 1.5 对 $.ajax 的重构，支持了 Prom...",
                "cover": "https://file.shenfq.com/ipic/2020-08-31-120006.png"
            },
            {
                "pagePath": "posts/2020/你不知道的 TypeScript 高级类型.md",
                "title": "你不知道的 TypeScript 高级类型",
                "link": "posts/2020/你不知道的 TypeScript 高级类型.html",
                "date": "2020/08/28",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "JavaScript",
                    "TypeScript",
                    "类型系统",
                    "泛型"
                ],
                "excerpt": "前言 对于有 JavaScript 基础的同学来说，入门 TypeScript 其实很容易，只需要简单掌握其基础的类型系统就可以逐步将 JS 应用过渡到 TS 应用。 // js const double = (num) => 2 * num // ts const double = (num: number): nu...",
                "cover": "https://file.shenfq.com/ipic/2020-08-26-135150.png"
            },
            {
                "pagePath": "posts/2020/从零开始实现VS Code基金插件.md",
                "title": "从零开始实现 VS Code 基金插件",
                "link": "posts/2020/从零开始实现VS Code基金插件.html",
                "date": "2020/08/24",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "VSCode"
                ],
                "tags": [
                    "VSCode"
                ],
                "excerpt": "写在前面 随着7月一波牛市行情，越来越多的人投身A股行列，但是股市的风险巨大，有人一夜暴富，也有人血本无归，所以对于普通人来说基金定投是个不错的选择，本人也是基金定投的一枚小韭菜。 上班的时候经常心理痒痒，想看看今...",
                "cover": "https://file.shenfq.com/ipic/2020-08-22-050614.png"
            },
            {
                "pagePath": "posts/2020/Vue模板编译原理.md",
                "title": "Vue 模板编译原理",
                "link": "posts/2020/Vue模板编译原理.html",
                "date": "2020/08/20",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "Vue.js",
                    "编译",
                    "模板"
                ],
                "excerpt": "写在开头 写过 Vue 的同学肯定体验过， .vue 这种单文件组件有多么方便。但是我们也知道，Vue 底层是通过虚拟 DOM 来进行渲染的，那么 .vue 文件的模板到底是怎么转换成虚拟 DOM 的呢？这一块对我来说一直是个黑盒，之前也没有...",
                "cover": "https://file.shenfq.com/ipic/2020-08-19-032238.jpg"
            },
            {
                "pagePath": "posts/2020/小程序自动化测试.md",
                "title": "小程序自动化测试",
                "link": "posts/2020/小程序自动化测试.html",
                "date": "2020/08/09",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "微信小程序"
                ],
                "tags": [
                    "小程序",
                    "微信小程序",
                    "自动化测试"
                ],
                "excerpt": "背景 近期团队打算做一个小程序自动化测试的工具，期望能够做到业务人员操作一遍小程序后，自动还原之前的操作路径，并且捕获操作过程中发生的异常，以此来判断这次发布是否会影响小程序的基础功能。 上述描述看似简单，但是中...",
                "cover": "https://file.shenfq.com/ipic/2020-08-09-072710.png"
            },
            {
                "pagePath": "posts/2020/Node.js 与二进制数据流.md",
                "title": "Node.js 与二进制数据流",
                "link": "posts/2020/Node.js 与二进制数据流.html",
                "date": "2020/06/30",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "Node.js"
                ],
                "tags": [
                    "Node",
                    "Buffer",
                    "Stream",
                    "二进制"
                ],
                "excerpt": "认识二进制数据 二进制数据就像上图一样，由0和1来存储数据。普通的十进制数转化成二进制数一般采用\"除2取余，逆序排列\"法，用2整除十进制整数，可以得到一个商和余数；再用2去除商，又会得到一个商和余数，如此进行，直到商为...",
                "cover": "https://file.shenfq.com/ipic/2020-04-16-040056.jpg"
            },
            {
                "pagePath": "posts/2020/【翻译】Node.js CLI 工具最佳实践.md",
                "title": "【翻译】Node.js CLI 工具最佳实践",
                "link": "posts/2020/【翻译】Node.js CLI 工具最佳实践.html",
                "date": "2020/02/22",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "Node.js"
                ],
                "tags": [
                    "前端",
                    "翻译",
                    "Node"
                ],
                "excerpt": "这是一个关于如何构建成功的、可移植的、对用户友好的Node.js 命令行工具（CLI）最佳实践的集合。 为什么写这篇文章？ 一个糟糕的 CLI 工具会让用户觉得难用，而构建一个成功的 CLI 需要密切关注很多细节，同时需要站在用户的角..."
            },
            {
                "pagePath": "posts/2020/2019年终总结.md",
                "title": "2019年终总结",
                "link": "posts/2020/2019年终总结.html",
                "date": "2020/01/17",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "年终总结"
                ],
                "tags": [
                    "工作",
                    "感悟",
                    "总结"
                ],
                "excerpt": "GoodBye 2019 2019 已经结束，是时候开始回忆下自己的 2019 了。年终总结好像是 2017 年开始写的，还是毕业的第一个年头，一晃已经毕业两年多了。一年过去，总得记点流水账吧。 工作上 工作上，去年还在感叹自己进入鹅厂多么不...",
                "cover": "https://file.shenfq.com/ezdlm.png"
            },
            {
                "pagePath": "posts/2019/前端模块化的今生.md",
                "title": "前端模块化的今生",
                "link": "posts/2019/前端模块化的今生.html",
                "date": "2019/11/30",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "模块化"
                ],
                "tags": [
                    "前端",
                    "前端工程化",
                    "前端模块化",
                    "CommonJS",
                    "ES Module"
                ],
                "excerpt": "背景 众所周知，早期 JavaScript 原生并不支持模块化，直到 2015 年，TC39 发布 ES6，其中有一个规范就是 ES modules（为了方便表述，后面统一简称 ESM）。但是在 ES6 规范提出前，就已经存在了一些模块化方案，比如 CommonJS（...",
                "cover": "https://file.shenfq.com/zbsq0.png"
            },
            {
                "pagePath": "posts/2019/前端模块化的前世.md",
                "title": "前端模块化的前世",
                "link": "posts/2019/前端模块化的前世.html",
                "date": "2019/10/08",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "模块化"
                ],
                "tags": [
                    "前端",
                    "前端工程化",
                    "前端模块化",
                    "AMD",
                    "CMD",
                    "CommonJS"
                ],
                "excerpt": "随着前端项目的越来越庞大，组件化的前端框架，前端路由等技术的发展，模块化已经成为现代前端工程师的一项必备技能。无论是什么语言一旦发展到一定地步，其工程化能力和可维护性势必得到相应的发展。 模块化这件事，无论在哪个...",
                "cover": "https://file.shenfq.com/20191008214141.png"
            },
            {
                "pagePath": "posts/2019/深入理解 ESLint.md",
                "title": "深入理解 ESLint",
                "link": "posts/2019/深入理解 ESLint.html",
                "date": "2019/07/28",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端工程"
                ],
                "tags": [
                    "前端",
                    "前端工程化",
                    "前端工具",
                    "ESLint",
                    "代码格式化"
                ],
                "excerpt": "前言 小沈是一个刚刚开始工作的前端实习生，第一次进行团队开发，难免有些紧张。在导师的安排下，拿到了项目的 git 权限，开始进行 clone。 $ git clone git@github.com:company/project.git 小沈开始细细品味着同事们的代码，...",
                "cover": "https://file.shenfq.com/20190727153755.png"
            },
            {
                "pagePath": "posts/2019/USB.md",
                "title": "USB 科普",
                "link": "posts/2019/USB.html",
                "date": "2019/06/28",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "其他"
                ],
                "tags": [
                    "USB"
                ],
                "excerpt": "什么是 USB？ 维基百科的解释： 在几年前，市面上常见的 USB 数据线都使用如下结构，一边 USB Type-A（主要用于连接电脑或充电器）, 一边 USB Micro-B（主要用来连接手机或其他手持设备），主要还是因为安卓手机普遍使用这种类...",
                "cover": "https://file.shenfq.com/FpXvpHY5rIYID72c1rOVAowxtW42.png"
            },
            {
                "pagePath": "posts/2019/虚拟DOM到底是什么？.md",
                "title": "虚拟DOM到底是什么？",
                "link": "posts/2019/虚拟DOM到底是什么？.html",
                "date": "2019/06/18",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "虚拟DOM"
                ],
                "excerpt": "是什么？ 虚拟 DOM （Virtual DOM ）这个概念相信大家都不陌生，从 React 到 Vue ，虚拟 DOM 为这两个框架都带来了跨平台的能力（React-Native 和 Weex）。因为很多人是在学习 React 的过程中接触到的虚拟 DOM ，所以为先入为主...",
                "cover": "https://file.shenfq.com/FtpWFfOrYBe4E2sI3_MyVvWYYijx.png"
            },
            {
                "pagePath": "posts/2019/【翻译】基于虚拟DOM库(Snabbdom)的迷你React.md",
                "title": "【翻译】基于虚拟DOM库(Snabbdom)的迷你React",
                "link": "posts/2019/【翻译】基于虚拟DOM库(Snabbdom)的迷你React.html",
                "date": "2019/05/01",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "react",
                    "virtual dom",
                    "虚拟 DOM",
                    "Snabbdom",
                    "翻译"
                ],
                "excerpt": "React 是 JavaScript 社区的新成员，尽管 JSX （在 JavaScript 中使用 HTML 语法）存在一定的争议，但是对于虚拟 DOM 人们有不一样的看法。 对于不熟悉的人来说，虚拟 DOM 可以描述为某个时刻真实DOM的简单表示。其思想是：每次...",
                "cover": "https://file.shenfq.com/FvyObN9fMncD7cMXJYfZOFQJFQ--.png"
            },
            {
                "pagePath": "posts/2019/【翻译】Vue.js 的注意事项与技巧.md",
                "title": "【翻译】Vue.js 的注意事项与技巧",
                "link": "posts/2019/【翻译】Vue.js 的注意事项与技巧.html",
                "date": "2019/03/31",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "Vue.js",
                    "翻译"
                ],
                "excerpt": "原文链接：Vue.js — Considerations and Tricks Vue.js 是一个很棒的框架。然而，当你开始构建一个大型 JavaScript 项目的时候，你将对 Vue.js 感到一些困惑。这些困惑并不是来自框架本身，相反 Vue.js 团队会经常调整一些重要...",
                "cover": "https://file.shenfq.com/FjFxhMxwH4RWxzhXmnKlhcxjQ2Ap.png"
            },
            {
                "pagePath": "posts/2019/【翻译】在 React Hooks 中如何请求数据？.md",
                "title": "【翻译】在 React Hooks 中如何请求数据？",
                "link": "posts/2019/【翻译】在 React Hooks 中如何请求数据？.html",
                "date": "2019/03/25",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端框架",
                    "react",
                    "fetch",
                    "react hooks",
                    "翻译"
                ],
                "excerpt": "通过这个教程，我想告诉你在 React 中如何使用 state 和 effect 这两种 hooks 去请求数据。我们将使用总所周知的 Hacker News API 来获取一些热门文章。你将定义属于你自己的数据请求的 Hooks ，并且可以在你所有的应用中复用，...",
                "cover": "https://file.shenfq.com/Fp4SkemaUMnmloPIN3eWDZ9o6qZd.png"
            },
            {
                "pagePath": "posts/2019/深度神经网络原理与实践.md",
                "title": "深度神经网络原理与实践",
                "link": "posts/2019/深度神经网络原理与实践.html",
                "date": "2019/03/17",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "机器学习"
                ],
                "tags": [
                    "机器学习",
                    "深度学习",
                    "神经网络"
                ],
                "excerpt": "理论基础 什么是神经网络 我们知道深度学习是机器学习的一个分支，是一种以人工神经网络为架构，对数据进行表征学习的算法。而深度神经网络又是深度学习的一个分支，它在 wikipedia 上的解释如下： 首先我们可以知道，深度神经...",
                "cover": "https://file.shenfq.com/Fjw7fiWg-n1qXji4aX9DUz10Nrqa.png"
            },
            {
                "pagePath": "posts/2019/工作两年的迷茫.md",
                "title": "工作两年的迷茫",
                "link": "posts/2019/工作两年的迷茫.html",
                "date": "2019/02/20",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "随便写写"
                ],
                "tags": [
                    "工作",
                    "感悟",
                    "总结"
                ],
                "excerpt": "2019年着实是迷茫的一年，各大公司传来了裁员消息，再加上前段时间部门业务调整，工作开始有些闲置，调整完后，现在的业务方向与自己期望的有些偏差。工作近两年，照理来说应该还是个职场新手，却有种已经工作四五年的感觉，突..."
            },
            {
                "pagePath": "posts/2019/推荐系统入门.md",
                "title": "推荐系统入门",
                "link": "posts/2019/推荐系统入门.html",
                "date": "2019/01/30",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "机器学习"
                ],
                "tags": [
                    "机器学习",
                    "推荐系统",
                    "算法",
                    "数学"
                ],
                "excerpt": "什么是推荐系统 维基百科定义如下： 首先推荐系统是一个过滤系统，这里对“物品”的定义很宽泛，物品可以是人、消费品、服务、信息等等，不同的业务场景的“物品”是不同的。 e.g. - 电商业务（淘宝、京东）的推荐系统中物品指...",
                "cover": "https://file.shenfq.com/FscTeCfJB7rKcLbcWjC3KMh-_b6R.png"
            },
            {
                "pagePath": "posts/2019/梯度下降与线性回归.md",
                "title": "梯度下降与线性回归",
                "link": "posts/2019/梯度下降与线性回归.html",
                "date": "2019/01/28",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "机器学习"
                ],
                "tags": [
                    "机器学习",
                    "算法",
                    "数学"
                ],
                "excerpt": "基本概念 梯度下降法是机器学习中最常用的优化方法之一，主要作用是求解目标函数的极小值。基本原理就是让目标函数沿着某个方向去搜索极小值，而这个方向就是梯度下降的方向，如果搜索极大值，就是沿着梯度上升方向。 什么是梯...",
                "cover": "https://file.shenfq.com/19-01-28/1.png"
            },
            {
                "pagePath": "posts/2019/2018年终总结.md",
                "title": "2018年终总结",
                "link": "posts/2019/2018年终总结.html",
                "date": "2019/01/09",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "年终总结"
                ],
                "tags": [
                    "工作",
                    "感悟",
                    "总结"
                ],
                "excerpt": "总觉得2018年过得非常快，快到以为现在还是2018，写日期的时候才反应过来现在已经到了2019。2018对我来说是圆满的一年，入职鹅厂，认识晴子，一切都显得那幸运。 工作经历 2018年算是迈入工作的的第二个年头，一月份刚好有个鹅...",
                "cover": "https://file.shenfq.com/19-01-09/25450020.jpg"
            },
            {
                "pagePath": "posts/2018/Node.js的进程管理.md",
                "title": "Node.js的进程管理",
                "link": "posts/2018/Node.js的进程管理.html",
                "date": "2018/12/28",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "Node.js"
                ],
                "tags": [
                    "前端",
                    "Node",
                    "多进程",
                    "cluster",
                    "负载均衡"
                ],
                "excerpt": "众所周知Node基于V8，而在V8中JavaScript是单线程运行的，这里的单线程不是指Node启动的时候就只有一个线程，而是说运行JavaScript代码是在单线程上，Node还有其他线程，比如进行异步IO操作的IO线程。这种单线程模型带来的好处...",
                "cover": "https://file.shenfq.com/19-1-9/37414156.jpg"
            },
            {
                "pagePath": "posts/2018/koa-router源码解析.md",
                "title": "koa-router源码解析",
                "link": "posts/2018/koa-router源码解析.html",
                "date": "2018/12/07",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "Node.js"
                ],
                "tags": [
                    "Node",
                    "Koa",
                    "router",
                    "路由"
                ],
                "excerpt": "koa-router koa-router应该是最常使用的koa的路由库，其源码比较简单，而且有十分详细的注释与使用案例。使用方式也比tj大神的koa-route要简洁。 如何使用koa-router 按照惯例，先看看koa-router的使用方法。 var Koa = requir...",
                "cover": "https://file.shenfq.com/18-12-19/41366075.jpg"
            },
            {
                "pagePath": "posts/2018/koa2源码解析.md",
                "title": "koa2源码解析",
                "link": "posts/2018/koa2源码解析.html",
                "date": "2018/11/27",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "Node.js"
                ],
                "tags": [
                    "Node",
                    "Koa",
                    "中间件"
                ],
                "excerpt": "如何使用koa 在看koa2的源码之前，按照惯例先看看koa2的hello world的写法。 const Koa = require('koa'); const app = new Koa(); // response app.use(ctx => { ctx.body = 'Hello Koa'; }); app.listen(3000); 一开始就通过...",
                "cover": "https://file.shenfq.com/18-12-19/81578504.jpg"
            },
            {
                "pagePath": "posts/2018/前端业务组件化实践.md",
                "title": "前端业务组件化实践",
                "link": "posts/2018/前端业务组件化实践.html",
                "date": "2018/10/23",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端",
                    "组件化"
                ],
                "excerpt": "最近一直在做管理端相关的需求，管理端不比h5每天都有高流量，需要不断地做性能上的优化，以及适配不同设备兼容性。但是管理端也面临着自己的挑战，因为项目越来越大，可配置化的东西就越来越多，管理端的页面也就越多，同时面...",
                "cover": "https://file.shenfq.com/18-12-19/84472576.jpg"
            },
            {
                "pagePath": "posts/2018/ElementUI的构建流程.md",
                "title": "ElementUI的构建流程",
                "link": "posts/2018/ElementUI的构建流程.html",
                "date": "2018/09/17",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端",
                    "组件化",
                    "工程化"
                ],
                "excerpt": "背景 最近一直在着手做一个与业务强相关的组件库，一直在思考要从哪里下手，怎么来设计这个组件库，因为业务上一直在使用ElementUI（以下简称Element），于是想参考了一下Element组件库的设计，看看Element构建方式，并且总结成...",
                "cover": "https://file.shenfq.com/18-9-14/48784910.jpg"
            },
            {
                "pagePath": "posts/2018/seajs源码解读.md",
                "title": "seajs源码解读",
                "link": "posts/2018/seajs源码解读.html",
                "date": "2018/08/15",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "模块化"
                ],
                "tags": [
                    "模块化",
                    "前端",
                    "前端工程化"
                ],
                "excerpt": "近几年前端工程化越来越完善，打包工具也已经是前端标配了，像seajs这种老古董早已停止维护，而且使用的人估计也几个了。但这并不能阻止好奇的我，为了了解当年的前端前辈们是如何在浏览器进行代码模块化的，我鼓起勇气翻开了S...",
                "cover": "https://file.shenfq.com/18-8-13/86590747.jpg"
            },
            {
                "pagePath": "posts/2018/使用ESLint+Prettier来统一前端代码风格.md",
                "title": "使用ESLint+Prettier来统一前端代码风格",
                "link": "posts/2018/使用ESLint+Prettier来统一前端代码风格.html",
                "date": "2018/06/18",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "前端",
                    "代码格式化",
                    "ESLint"
                ],
                "excerpt": "正文之前，先看个段子放松一下： 去死吧！你这个异教徒！ 想起自己刚入行的时候，从svn上把代码checkout下来，看到同事写的代码，大括号居然换行了。心中暗骂，这个人是不是个**，大括号为什么要换行？年轻气盛的我，居然满腔怒...",
                "cover": "https://file.shenfq.com/18-6-18/90739745.jpg"
            },
            {
                "pagePath": "posts/2018/webpack4初探.md",
                "title": "webpack4初探",
                "link": "posts/2018/webpack4初探.html",
                "date": "2018/06/09",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端工程"
                ],
                "tags": [
                    "前端",
                    "模块化",
                    "前端工程化",
                    "webpack"
                ],
                "excerpt": "一、前言 2018/2/25，webpack4正式发布，距离现在已经过去三个多月了，也逐渐趋于稳定，而且现在的最新版本都到了4.12.0（版本迭代快得真是让人害怕）。 很多人都说webpack复杂，难以理解，很大一部分原因是webpack是基于配置的...",
                "cover": "//file.shenfq.com/18-6-9/66027398.jpg"
            },
            {
                "pagePath": "posts/2018/git快速入门.md",
                "title": "git快速入门",
                "link": "posts/2018/git快速入门.html",
                "date": "2018/04/17",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "Git"
                ],
                "tags": [
                    "git",
                    "版本管理"
                ],
                "excerpt": "背景 git作为现在最为流行的版本管理系统，大部分公司都使用git进行版本控制， 并且最大同性交友网站github也是在git的基础上建立的。 很多人认为git难，在于它的一些概念与之前流行的集中化的版本管理系统有所出入， 只要通过...",
                "cover": "//file.shenfq.com/18-4-14/34749597.jpg"
            },
            {
                "pagePath": "posts/2018/RequireJS源码分析（下）.md",
                "title": "RequireJS源码分析（下）",
                "link": "posts/2018/RequireJS源码分析（下）.html",
                "date": "2018/02/25",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "模块化"
                ],
                "tags": [
                    "模块化",
                    "前端",
                    "前端工程化"
                ],
                "excerpt": "这篇文章主要会讲述模块加载操作的主要流程，以及Module的主要功能。废话不多说，直接看代码吧。 模块加载使用方法： require.config({ paths: { jquery: 'https://cdn.bootcss.com/jquery/3.2.1/jquery' } }); require(['jque..."
            },
            {
                "pagePath": "posts/2018/2017年终总结.md",
                "title": "2017年终总结",
                "link": "posts/2018/2017年终总结.html",
                "date": "2018/01/07",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "年终总结"
                ],
                "tags": [
                    "生活",
                    "工作",
                    "感悟",
                    "总结"
                ],
                "excerpt": "想想日子过得也快，2017年算是自己正式参加工作的一年。而且也是今年毕业，正式踏入社会。 17年2月来深圳找实习工作，碰壁也蛮多次，得到的结果都是基础很好，但是没经验，我们不要实习生，还有这简历不匹配工作年限直接就被刷..."
            },
            {
                "pagePath": "posts/2017/RequireJS源码分析（上）.md",
                "title": "RequireJS源码分析（上）",
                "link": "posts/2017/RequireJS源码分析（上）.html",
                "date": "2017/12/23",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "模块化"
                ],
                "tags": [
                    "模块化",
                    "前端",
                    "前端工程化"
                ],
                "excerpt": "requirejs作为AMD（Asynchronous Module Definition--异步的模块加载机制）规范的实现，还是有必要看看的。初识requirejs源码，必须先弄清楚requirejs的模块是如何定义的，并且要知道入口在哪个地方，如果清楚了调用方式，看源...",
                "cover": "//file.shenfq.com/17-11-19/90660695.jpg"
            },
            {
                "pagePath": "posts/2017/ES6模块.md",
                "title": "【翻译】深入ES6模块",
                "link": "posts/2017/ES6模块.html",
                "date": "2017/11/13",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "模块化"
                ],
                "tags": [
                    "es6",
                    "模块化",
                    "前端"
                ],
                "excerpt": "回想2007年，那时候我刚加入Mozilla's JavaScript团队，那时候的一个典型的JavaScript程序只需要一行代码，听起来像个笑话。 两年后，Google Maps发布。在这之前，JavaScript主要用来做表单的验证，你用来处理<input onchange=..."
            },
            {
                "pagePath": "posts/2017/babel到底该如何配置？.md",
                "title": "babel到底该如何配置？",
                "link": "posts/2017/babel到底该如何配置？.html",
                "date": "2017/10/22",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端工程"
                ],
                "tags": [
                    "es6",
                    "babel",
                    "前端"
                ],
                "excerpt": "背景 说起ES6，webpack，打包，模块化总是离不开babel，babel作为一个js的编译器已经被广泛使用。在babel的官网是这样介绍它的： 大家都知道js作为宿主语言，很依赖执行的环境（浏览器、node等），不同环境对js语法的支持不尽相...",
                "cover": "//file.shenfq.com/17-10-16/10463136.jpg"
            },
            {
                "pagePath": "posts/2017/JavaScript中this关键字.md",
                "title": "JavaScript中this关键字",
                "link": "posts/2017/JavaScript中this关键字.html",
                "date": "2017/10/12",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端"
                ],
                "tags": [
                    "js基础",
                    "this",
                    "前端"
                ],
                "excerpt": "this一直是js中一个老生常谈的东西，但是我们究竟该如何来理解它呢？ 在《JavaScript高级程序设计》中，对this的解释是： 我们来逐字解读这句话： - this是一个对象 - this的产生与函数有关 - this与执行环境绑定 说通俗一点就...",
                "cover": "//file.shenfq.com/17-10-12/25450020.jpg"
            },
            {
                "pagePath": "posts/2017/linux下升级npm以及node.md",
                "title": "linux下升级npm以及node",
                "link": "posts/2017/linux下升级npm以及node.html",
                "date": "2017/06/12",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "Node.js"
                ],
                "tags": [
                    "linux",
                    "node",
                    "npm",
                    "前端"
                ],
                "excerpt": "npm升级 废话不多说，直接讲步骤。先从容易的开始，升级npm。 npm这款包管理工具虽然一直被人们诟病，很多人都推荐使用yarn，但其使用人数还是不见减少，况且npm都是随node同时安装好的，一时让我抛弃它，还是有点难做到。 npm..."
            },
            {
                "pagePath": "posts/2017/Gulp入门指南.md",
                "title": "Gulp入门指南",
                "link": "posts/2017/Gulp入门指南.html",
                "date": "2017/05/24",
                "updated": null,
                "author": "shenfq",
                "contributors": [
                    "Shenfq"
                ],
                "categories": [
                    "前端工程"
                ],
                "tags": [
                    "gulp",
                    "前端构建工具",
                    "前端"
                ],
                "excerpt": "为什么要写这篇博客？ 谈起为什么，其实就是想总结下这段时间做的工作。之前一直在用gulp，但是一直没有自己的思考，下了两个插件就开始了。这一次为公司的项目配置了一次gulp，尽可能多的考虑到了一些情况，比如本地开发调试时..."
            }
        ],
        "categories": [
            {
                "name": "前端",
                "count": 18
            },
            {
                "name": "Node.js",
                "count": 7
            },
            {
                "name": "前端工程",
                "count": 7
            },
            {
                "name": "模块化",
                "count": 6
            },
            {
                "name": "年终总结",
                "count": 3
            },
            {
                "name": "机器学习",
                "count": 3
            },
            {
                "name": "微信小程序",
                "count": 2
            },
            {
                "name": "Git",
                "count": 1
            },
            {
                "name": "Promise",
                "count": 1
            },
            {
                "name": "VSCode",
                "count": 1
            },
            {
                "name": "其他",
                "count": 1
            },
            {
                "name": "随便写写",
                "count": 1
            }
        ],
        "tags": [
            {
                "name": "前端",
                "count": 23
            },
            {
                "name": "前端框架",
                "count": 11
            },
            {
                "name": "前端工程化",
                "count": 10
            },
            {
                "name": "模块化",
                "count": 8
            },
            {
                "name": "JavaScript",
                "count": 7
            },
            {
                "name": "Vue.js",
                "count": 7
            },
            {
                "name": "Node",
                "count": 6
            },
            {
                "name": "React",
                "count": 5
            },
            {
                "name": "翻译",
                "count": 5
            },
            {
                "name": "工作",
                "count": 4
            },
            {
                "name": "总结",
                "count": 4
            },
            {
                "name": "感悟",
                "count": 4
            },
            {
                "name": "机器学习",
                "count": 3
            },
            {
                "name": "CommonJS",
                "count": 2
            },
            {
                "name": "es6",
                "count": 2
            },
            {
                "name": "ESLint",
                "count": 2
            },
            {
                "name": "Koa",
                "count": 2
            },
            {
                "name": "react",
                "count": 2
            },
            {
                "name": "webpack",
                "count": 2
            },
            {
                "name": "代码格式化",
                "count": 2
            },
            {
                "name": "前端模块化",
                "count": 2
            },
            {
                "name": "小程序",
                "count": 2
            },
            {
                "name": "微信小程序",
                "count": 2
            },
            {
                "name": "数学",
                "count": 2
            },
            {
                "name": "模板",
                "count": 2
            },
            {
                "name": "算法",
                "count": 2
            },
            {
                "name": "组件化",
                "count": 2
            },
            {
                "name": "编译",
                "count": 2
            },
            {
                "name": "AMD",
                "count": 1
            },
            {
                "name": "babel",
                "count": 1
            },
            {
                "name": "Buffer",
                "count": 1
            },
            {
                "name": "cluster",
                "count": 1
            },
            {
                "name": "CMD",
                "count": 1
            },
            {
                "name": "ES Module",
                "count": 1
            },
            {
                "name": "fastify",
                "count": 1
            },
            {
                "name": "fetch",
                "count": 1
            },
            {
                "name": "git",
                "count": 1
            },
            {
                "name": "gulp",
                "count": 1
            },
            {
                "name": "JSON",
                "count": 1
            },
            {
                "name": "js基础",
                "count": 1
            },
            {
                "name": "linux",
                "count": 1
            },
            {
                "name": "node",
                "count": 1
            },
            {
                "name": "npm",
                "count": 1
            },
            {
                "name": "Promise",
                "count": 1
            },
            {
                "name": "react hooks",
                "count": 1
            },
            {
                "name": "router",
                "count": 1
            },
            {
                "name": "Snabbdom",
                "count": 1
            },
            {
                "name": "Stream",
                "count": 1
            },
            {
                "name": "this",
                "count": 1
            },
            {
                "name": "TypeScript",
                "count": 1
            },
            {
                "name": "USB",
                "count": 1
            },
            {
                "name": "virtual dom",
                "count": 1
            },
            {
                "name": "VSCode",
                "count": 1
            },
            {
                "name": "Webpack",
                "count": 1
            },
            {
                "name": "中间件",
                "count": 1
            },
            {
                "name": "二进制",
                "count": 1
            },
            {
                "name": "依赖分析",
                "count": 1
            },
            {
                "name": "前端工具",
                "count": 1
            },
            {
                "name": "前端构建工具",
                "count": 1
            },
            {
                "name": "多进程",
                "count": 1
            },
            {
                "name": "工程化",
                "count": 1
            },
            {
                "name": "性能",
                "count": 1
            },
            {
                "name": "推荐系统",
                "count": 1
            },
            {
                "name": "泛型",
                "count": 1
            },
            {
                "name": "深度学习",
                "count": 1
            },
            {
                "name": "版本管理",
                "count": 1
            },
            {
                "name": "生活",
                "count": 1
            },
            {
                "name": "神经网络",
                "count": 1
            },
            {
                "name": "类型系统",
                "count": 1
            },
            {
                "name": "组件",
                "count": 1
            },
            {
                "name": "自动化测试",
                "count": 1
            },
            {
                "name": "虚拟 DOM",
                "count": 1
            },
            {
                "name": "虚拟DOM",
                "count": 1
            },
            {
                "name": "负载均衡",
                "count": 1
            },
            {
                "name": "路由",
                "count": 1
            }
        ]
    }
};
