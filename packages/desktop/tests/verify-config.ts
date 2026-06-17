#!/usr/bin/env node

/**
 * Plane 配置验证脚本
 *
 * 在运行集成测试前验证 Plane API 配置是否正确
 */

import { PlaneClient } from '../src/plane-client.js';

// 从环境变量读取配置
const PLANE_API_URL = process.env.PLANE_API_URL || 'http://localhost:8000';
const PLANE_API_KEY = process.env.PLANE_API_KEY || '';
const PLANE_WORKSPACE_SLUG = process.env.PLANE_WORKSPACE_SLUG || '';

async function verifyConfig() {
  console.log('🔍 验证 Plane API 配置...\n');

  // 检查必需的环境变量
  console.log('📋 环境变量检查:');
  console.log(`   PLANE_API_URL: ${PLANE_API_URL}`);
  console.log(`   PLANE_API_KEY: ${PLANE_API_KEY ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`   PLANE_WORKSPACE_SLUG: ${PLANE_WORKSPACE_SLUG}\n`);

  if (!PLANE_API_KEY) {
    console.error('❌ 错误: PLANE_API_KEY 未设置');
    console.log('请设置环境变量: export PLANE_API_KEY=your_api_key');
    process.exit(1);
  }

  if (!PLANE_WORKSPACE_SLUG) {
    console.error('❌ 错误: PLANE_WORKSPACE_SLUG 未设置');
    console.log('请设置环境变量: export PLANE_WORKSPACE_SLUG=your_workspace');
    process.exit(1);
  }

  try {
    // 创建 Plane 客户端
    console.log('🌐 测试 Plane API 连接...\n');
    const client = new PlaneClient({
      apiUrl: PLANE_API_URL,
      apiKey: PLANE_API_KEY,
      workspaceSlug: PLANE_WORKSPACE_SLUG,
    });

    // 测试基础连接
    console.log('📊 获取工作区成员...');
    const members = await client.getWorkspaceMembers();
    console.log(`   ✅ 成功! 找到 ${members.length} 个成员`);

    if (members.length > 0) {
      console.log('   成员示例:');
      members.slice(0, 2).forEach(member => {
        console.log(`   - ${member.user.first_name} ${member.user.last_name} (${member.user.email})`);
      });
    }

    console.log('');

    // 获取项目列表
    console.log('📁 获取项目列表...');
    const projects = await client.getProjects();
    console.log(`   ✅ 成功! 找到 ${projects.length} 个项目`);

    if (projects.length === 0) {
      console.warn('⚠️  警告: 工作区内没有项目');
      console.log('请先在 Plane 中创建一个项目用于测试');
    } else {
      console.log('   可用项目:');
      projects.forEach(project => {
        console.log(`   - ${project.name} (${project.identifier})`);
        console.log(`     ID: ${project.id}`);
      });

      console.log('');
      console.log('📝 配置 PLANE_PROJECT_IDS:');
      console.log('   export PLANE_PROJECT_IDS=\'["' + projects[0].id + '"]\'');
    }

    console.log('');
    console.log('✅ Plane API 配置验证成功!');
    console.log('可以安全运行集成测试了。');

  } catch (error) {
    console.error('❌ Plane API 连接失败:', error);

    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        console.log('\n💡 提示: API Key 可能无效或权限不足');
        console.log('请检查:');
        console.log('1. API Key 是否正确');
        console.log('2. 用户是否有工作区访问权限');
      } else if (error.message.includes('404')) {
        console.log('\n💡 提示: 工作区标识可能不存在');
        console.log('请检查 PLANE_WORKSPACE_SLUG 是否正确');
      } else if (error.message.includes('ECONNREFUSED')) {
        console.log('\n💡 提示: 无法连接到 Plane 实例');
        console.log('请检查:');
        console.log('1. Plane 实例是否正在运行');
        console.log('2. PLANE_API_URL 是否正确');
        console.log('3. 网络连接是否正常');
      }
    }

    process.exit(1);
  }
}

// 运行验证
verifyConfig().catch(error => {
  console.error('验证过程出错:', error);
  process.exit(1);
});
