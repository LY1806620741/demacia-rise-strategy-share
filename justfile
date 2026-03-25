# https://just.systems

default: serve

# 清理本地静态服务/临时产物
clean:
    rm -rf dist/

# 安装本地静态服务依赖（首次运行用）
deps:
    npm install -g serve

# 纯前端项目无需编译，保留占位检查
build:
    @echo "No build step required. Static frontend + Helia CDN."

# 启动本地网页服务（localhost:8000）
serve:
    serve -l 8000

# 一键预览流程（clean → build → serve）
release: clean build serve

# 基础项目检查
check:
    @echo "Checking static frontend files..."
    test -f index.html
    test -f app.js
    test -f config.json
    test -f frontend/ipfs-client.js
    @echo "OK"

test:
    @echo "Running tests..."
    node --test test/*.mjs
    @echo "Tests passed!"