# https://just.systems

default: serve

# 清理构建产物
clean:
    cargo clean
    rm -rf pkg/
    rm -rf dist/

# 安装依赖（首次运行用）
deps:
    cargo install wasm-pack
    npm install -g serve

# 编译 WASM（核心命令）
build:
    wasm-pack build --target web --out-name demacia_rise --out-dir pkg

# 编译 + 优化（发布用）
build-release:
    wasm-pack build --target web --out-name demacia_rise --out-dir pkg --release

# 启动本地网页服务（localhost:3000）
serve:
    serve -l 8000

# 一键发布流程（clean → build → serve）
release: clean build-release serve

# 格式化代码
fmt:
    cargo fmt

# 代码检查
check:
    cargo check