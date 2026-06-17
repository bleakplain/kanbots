#!/bin/bash

# Plane 同步集成测试运行脚本

set -e

echo "🚀 Plane 同步集成测试启动"
echo "================================"

# 检查环境变量文件
if [ ! -f "tests/.env.test" ]; then
    echo "❌ 错误: tests/.env.test 文件不存在"
    echo "请先创建 .env.test 文件并配置 Plane API 凭证"
    exit 1
fi

# 加载环境变量
export $(cat tests/.env.test | grep -v '^#' | xargs)

echo "📋 测试配置:"
echo "   Plane API URL: $PLANE_API_URL"
echo "   Workspace: $PLANE_WORKSPACE_SLUG"
echo "   Projects: $PLANE_PROJECT_IDS"
echo ""

# 验证必需的环境变量
if [ -z "$PLANE_API_URL" ] || [ -z "$PLANE_API_KEY" ]; then
    echo "❌ 错误: PLANE_API_URL 和 PLANE_API_KEY 必须设置"
    exit 1
fi

# 检查 Node.js 和 npm
if ! command -v node &> /dev/null; then
    echo "❌ 错误: Node.js 未安装"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ 错误: npm 未安装"
    exit 1
fi

echo "✅ 环境检查通过"
echo ""

# 运行测试
echo "🧪 开始运行集成测试..."
echo ""

# 运行 Plane 同步集成测试
npx vitest run tests/plane-sync-integration.test.ts \
    --reporter=verbose \
    --timeout=30000 \
    --environment=jsdom

echo ""
echo "✅ 集成测试完成"
