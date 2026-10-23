# TMA im2col Lab

中文交互教学网页：从卷积窗口、逻辑展开矩阵，到一次 NVIDIA 风格普通 `.im2col` 取数，再讨论 TMA 项目的接入职责。

在线阅读：https://andyzr-coder.github.io/tma-im2col-lab/

## 交互内容

- 两种视角：固定输出位置看窗口展开；固定核内偏移看 TMA 按位置取数。
- 六个场景：最小示例、padding、stride、dilation、多通道、跨 batch。
- 自定义 NHWC、核形状、stride、dilation、padding。
- 单步 / 播放、矩阵单元反查、源地址和目标地址追踪。
- TMA 参数映射：bounding box、PPC、CPP、tensor coordinates、im2col offsets。
- 项目接入流程：配置、坐标、越界、读返回、目标打包、完成。
- 四道带解释的理解题。

## 模型范围

这是浏览器里的逻辑教学模型，不运行 CUDA，不代表 NVIDIA 内部微架构，也不是 RTL 周期仿真。

采用 dense NHWC、对称 padding、二维前向互相关、零填充、2 字节元素地址。逻辑展开按 `(r,s,c)` 排列，`A[M,K]` 中每行对应 `(n,p,q)`；实际库可以采用等价的转置和维度顺序。小通道数仅用于教学，不保证所有组合能直接编码为硬件指令。

关闭 interleave / swizzle，不模拟 cache、burst 合并、bank、反压周期或硬件吞吐。通道尾段和 batch 尾部保留目标槽位并填零。

项目部分采用现有公开 CP 教学手册与项目资料中职责层面的结构作为语境。所有新增 im2col 内容都是接入建议，不表示已有 RTL 支持。不同基线的描述符位宽、折叠参数、原生能力不能混用；LD、CP_L1、CP_DLB 的源目的空间和限制需要以最终规格为准。仓库只包含教学程序和抽象说明，不包含项目 RTL、内部文档或个人资料。

## 运行和验证

无需安装依赖或构建：

```sh
python -m http.server 8786
node --test tests/engine.test.mjs
```

测试用直接卷积核对 im2col + GEMM，并检查已知列、跨 batch、padding、通道尾段、地址连续性、边界参数和空输出。

## 参考

- [NVIDIA PTX im2col mode](https://docs.nvidia.com/cuda/parallel-thread-execution/#tensor-im2col-mode)
- [CUDA Tensor Map API](https://docs.nvidia.com/cuda/cuda-driver-api/cuda_driver_api/group__CUDA__TENSOR__MEMORY.html)
- [CUTLASS implicit GEMM convolution](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/implicit_gemm_convolution.html)
- [项目 CP Design Guide](https://andyzr-coder.github.io/cp-design-guide/)

页面和模型为教学用途编写。引用资料以其官方最新文档为准。
