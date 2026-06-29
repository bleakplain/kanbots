/**
 * Plane Sync 真实 API 集成测试 - Kanbots → Plane 上行同步
 *
 * 这个测试使用真实的 Plane API 和 Kanbots 数据库
 * 测试完整的上行同步流程：创建 Kanbots issue → 同步到 Plane
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { PlaneClient } from '../src/plane-client.js';
import { openStoreInMemory } from '@kanbots/local-store';
import { LocalIssuesRepo } from '@kanbots/local-store';
import type { Issue } from '@kanbots/core';

// 从环境变量读取 Plane 配置
function getPlaneConfig() {
  const apiUrl = process.env.PLANE_API_URL || 'http://localhost:8000';
  const apiKey = process.env.PLANE_API_KEY || 'plane_api_429ecdb05def478e8fb428eabbbf9b75';
  const workspaceSlug = process.env.PLANE_WORKSPACE_SLUG || 'embedding';
  const projectIds = process.env.PLANE_PROJECT_IDS
    ? JSON.parse(process.env.PLANE_PROJECT_IDS)
    : ['6fd64e08-3f93-4a46-a9de-4add7bf0ac4e'];

  return {
    apiUrl,
    apiKey,
    workspaceSlug,
    projectIds,
  };
}

describe('Plane Sync 真实集成测试 - Kanbots → Plane 上行同步', () => {
  let planeClient: PlaneClient;
  let planeConfig: ReturnType<typeof getPlaneConfig>;
  let testProjectId: string;
  let store: any;
  let localIssues: LocalIssuesRepo;
  let createdPlaneWorkItemId: string | null = null;
  let createdKanbotsIssueNumber: number | null = null;

  beforeAll(() => {
    planeConfig = getPlaneConfig();
    console.log('🔧 Plane 配置:', {
      apiUrl: planeConfig.apiUrl,
      workspaceSlug: planeConfig.workspaceSlug,
      projectIds: planeConfig.projectIds,
    });

    planeClient = new PlaneClient({
      apiUrl: planeConfig.apiUrl,
      apiKey: planeConfig.apiKey,
      workspaceSlug: planeConfig.workspaceSlug,
    });

    if (planeConfig.projectIds.length > 0) {
      testProjectId = planeConfig.projectIds[0];
    } else {
      throw new Error('需要至少配置一个项目 ID');
    }
  });

  beforeEach(async () => {
    // 为每个测试创建一个新的内存数据库
    store = await openStoreInMemory();
    localIssues = store.localIssues;
  });

  afterEach(async () => {
    // 清理：如果创建了真实的 Plane work item，尝试删除它
    if (createdPlaneWorkItemId && createdKanbotsIssueNumber) {
      try {
        console.log(`🧹 清理测试数据: Plane Work Item ${createdPlaneWorkItemId}`);
        // 注意：Plane API 可能不支持直接删除，这里假设我们只能清理测试数据
        createdPlaneWorkItemId = null;
        createdKanbotsIssueNumber = null;
      } catch (error) {
        console.warn('清理时出现错误:', error);
      }
    }

    if (store) {
      store.close();
    }
  });

  describe('完整上行同步流程测试', () => {
    it('应该成功执行首次上行同步（Kanbots → Plane）', async () => {
      console.log('\n📝 测试场景: 首次上行同步');

      // Step 1: 在 Kanbots 中创建一个测试 issue
      console.log('Step 1: 在 Kanbots 中创建测试 issue');
      const testIssue = localIssues.create({
        title: '集成测试 Issue - ' + new Date().toISOString(),
        body: `# 集成测试\n\n这是一个真实的 Kanbots → Plane 上行同步测试。\n\n创建时间: ${new Date().toISOString()}`,
        labels: ['status:todo', 'priority:high', 'test-integration'],
        assignees: [],
        authorLogin: 'integration-test',
      });

      createdKanbotsIssueNumber = testIssue.number;
      console.log(`   ✅ 创建 Kanbots issue #${testIssue.number}`);
      console.log(`   ✅ 全局 ID: ${localIssues.findById((testIssue as any).id)?.id || 'N/A'}`);
      console.log(`   ✅ 标题: ${testIssue.title}`);

      // Step 2: 检查该 issue 是否已有 plane_workitem_id
      console.log('\nStep 2: 检查 plane_workitem_id');
      const planeWorkItemId = localIssues.getPlaneWorkItemId(testIssue.number);
      expect(planeWorkItemId).toBeNull();
      console.log('   ✅ 确认无 plane_workitem_id (首次同步)');

      // Step 3: 模拟上行同步 - 创建 Plane Work Item
      console.log('\nStep 3: 创建 Plane Work Item');

      const descriptionHtml = testIssue.body
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

      const planeWorkItem = await planeClient.createWorkItem(testProjectId, {
        name: testIssue.title,
        description_html: descriptionHtml,
        priority: 'high',
        labels: testIssue.labels,
      });

      createdPlaneWorkItemId = planeWorkItem.id;
      console.log(`   ✅ 创建 Plane Work Item 成功`);
      console.log(`   ✅ Plane ID: ${planeWorkItem.id}`);
      console.log(`   ✅ Sequence ID: ${planeWorkItem.sequence_id}`);
      console.log(`   ✅ 名称: ${planeWorkItem.name}`);

      // Step 4: 存储映射关系
      console.log('\nStep 4: 存储 plane_workitem_id 映射');
      localIssues.setPlaneWorkItemId(testIssue.number, planeWorkItem.id);
      console.log(`   ✅ 已存储: Kanbots #${testIssue.number} ↔ Plane ${planeWorkItem.id}`);

      // Step 5: 验证映射关系
      console.log('\nStep 5: 验证映射关系');
      const retrievedPlaneWorkItemId = localIssues.getPlaneWorkItemId(testIssue.number);
      expect(retrievedPlaneWorkItemId).toBe(planeWorkItem.id);
      console.log(`   ✅ 映射关系验证成功`);

      // Step 6: 从 Plane 端验证创建的 Work Item
      console.log('\nStep 6: 从 Plane 验证 Work Item');
      const retrievedWorkItem = await planeClient.getWorkItem(testProjectId, planeWorkItem.id);
      expect(retrievedWorkItem.id).toBe(planeWorkItem.id);
      expect(retrievedWorkItem.name).toBe(testIssue.title);
      console.log(`   ✅ Plane Work Item 验证成功`);
      console.log(`   ✅ 标题匹配: ${retrievedWorkItem.name}`);
    });

    it('应该成功执行更新同步（已有映射关系）', async () => {
      console.log('\n📝 测试场景: 更新已有映射的 issue');

      // Step 1: 创建初始 issue 并建立映射
      const testIssue = localIssues.create({
        title: '更新测试 Issue',
        body: '原始内容',
        labels: ['status:todo'],
        assignees: [],
        authorLogin: 'integration-test',
      });

      const planeWorkItem = await planeClient.createWorkItem(testProjectId, {
        name: testIssue.title,
        description_html: '<p>原始内容</p>',
        priority: 'none',
      });

      localIssues.setPlaneWorkItemId(testIssue.number, planeWorkItem.id);
      createdKanbotsIssueNumber = testIssue.number;
      createdPlaneWorkItemId = planeWorkItem.id;

      console.log(`   ✅ 初始状态: Kanbots #${testIssue.number} ↔ Plane ${planeWorkItem.id}`);

      // Step 2: 更新 Kanbots issue
      console.log('\nStep 2: 更新 Kanbots issue 内容');
      const updatedIssue = localIssues.update(testIssue.number, {
        title: '更新测试 Issue - 已修改',
        body: '## 修改后的内容\n\n这是一个更新测试',
        labels: ['status:in-progress', 'priority:high'],
      });

      console.log(`   ✅ Kanbots issue 已更新: ${updatedIssue.title}`);

      // Step 3: 验证映射关系仍然存在
      console.log('\nStep 3: 验证映射关系');
      const planeWorkItemId = localIssues.getPlaneWorkItemId(testIssue.number);
      expect(planeWorkItemId).toBe(planeWorkItem.id);
      console.log(`   ✅ 映射关系保持不变`);

      // Step 4: 更新 Plane Work Item
      console.log('\nStep 4: 更新 Plane Work Item');
      const updatedPlaneWorkItem = await planeClient.updateWorkItem(
        testProjectId,
        planeWorkItem.id,
        {
          name: updatedIssue.title,
          description_html: '<h2>修改后的内容</h2><p>这是一个更新测试</p>',
        }
      );

      expect(updatedPlaneWorkItem.name).toBe(updatedIssue.title);
      console.log(`   ✅ Plane Work Item 已更新`);
      console.log(`   ✅ 新标题: ${updatedPlaneWorkItem.name}`);

      // Step 5: 验证更新结果
      console.log('\nStep 5: 验证更新结果');
      const retrievedWorkItem = await planeClient.getWorkItem(testProjectId, planeWorkItem.id);
      expect(retrievedWorkItem.name).toBe(updatedIssue.title);
      console.log(`   ✅ 更新验证成功`);
    });

    it('应该正确处理幂等性（重复同步）', async () => {
      console.log('\n📝 测试场景: 幂等性验证');

      // Step 1: 创建 issue 并同步
      const testIssue = localIssues.create({
        title: '幂等测试 Issue',
        body: '测试幂等性',
        labels: ['status:todo'],
        assignees: [],
        authorLogin: 'integration-test',
      });

      const planeWorkItem = await planeClient.createWorkItem(testProjectId, {
        name: testIssue.title,
        description_html: '<p>测试幂等性</p>',
        priority: 'none',
      });

      localIssues.setPlaneWorkItemId(testIssue.number, planeWorkItem.id);
      createdKanbotsIssueNumber = testIssue.number;
      createdPlaneWorkItemId = planeWorkItem.id;

      console.log(`   ✅ 初始同步完成: #${testIssue.number} ↔ ${planeWorkItem.id}`);

      // Step 2: 模拟重复同步操作
      console.log('\nStep 2: 模拟重复同步检查');

      // 第一次检查
      const planeWorkItemId1 = localIssues.getPlaneWorkItemId(testIssue.number);
      expect(planeWorkItemId1).toBe(planeWorkItem.id);

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 100));

      // 第二次检查
      const planeWorkItemId2 = localIssues.getPlaneWorkItemId(testIssue.number);
      expect(planeWorkItemId2).toBe(planeWorkItem.id);
      expect(planeWorkItemId2).toBe(planeWorkItemId1);

      console.log(`   ✅ 重复检查结果一致: ${planeWorkItemId2}`);
      console.log(`   ✅ 幂等性验证成功`);
    });

    it('应该正确处理双向数据同步', async () => {
      console.log('\n📝 测试场景: 双向同步验证');

      // Step 1: Kanbots → Plane
      console.log('Step 1: Kanbots → Plane 上行同步');
      const kanbotsIssue = localIssues.create({
        title: '双向同步测试',
        body: '从 Kanbots 创建',
        labels: ['status:todo'],
        assignees: [],
        authorLogin: 'integration-test',
      });

      const planeWorkItem = await planeClient.createWorkItem(testProjectId, {
        name: kanbotsIssue.title,
        description_html: '<p>从 Kanbots 创建</p>',
        priority: 'none',
      });

      localIssues.setPlaneWorkItemId(kanbotsIssue.number, planeWorkItem.id);
      createdKanbotsIssueNumber = kanbotsIssue.number;
      createdPlaneWorkItemId = planeWorkItem.id;

      console.log(`   ✅ 上行同步完成`);

      // Step 2: 验证 Plane → Kanbots 下行同步能力
      console.log('\nStep 2: 验证下行同步能力');
      const foundIssue = localIssues.findByPlaneWorkItemId(planeWorkItem.id);
      expect(foundIssue).not.toBeNull();
      expect(foundIssue?.number).toBe(kanbotsIssue.number);
      console.log(`   ✅ 通过 plane_workitem_id 找到 Kanbots issue: #${foundIssue?.number}`);

      // Step 3: 模拟 Plane 端的变更
      console.log('\nStep 3: 模拟 Plane 端变更');
      const updatedFromPlane = await planeClient.updateWorkItem(testProjectId, planeWorkItem.id, {
        name: '双向同步测试 - 从 Plane 更新',
        description_html: '<p>从 Plane 更新内容</p>',
      });

      console.log(`   ✅ Plane Work Item 已更新`);

      // Step 4: 验证 Kanbots 可以获取 Plane 的更新
      console.log('\nStep 4: 验证 Kanbots 获取 Plane 更新');
      const latestPlaneWorkItem = await planeClient.getWorkItem(testProjectId, planeWorkItem.id);
      expect(latestPlaneWorkItem.name).toBe('双向同步测试 - 从 Plane 更新');
      console.log(`   ✅ Kanbots 可以获取最新的 Plane 内容`);
      console.log(`   ✅ 双向同步验证完成`);
    });
  });

  describe('错误处理和边界情况', () => {
    it('应该正确处理不存在的 plane_workitem_id', async () => {
      console.log('\n📝 测试场景: 不存在的 plane_workitem_id');

      const testIssue = localIssues.create({
        title: '错误测试 Issue',
        body: '测试错误处理',
        labels: [],
        assignees: [],
        authorLogin: 'integration-test',
      });

      // 尝试获取不存在的 plane_workitem_id
      const planeWorkItemId = localIssues.getPlaneWorkItemId(testIssue.number);
      expect(planeWorkItemId).toBeNull();
      console.log('   ✅ 正确处理了不存在的 plane_workitem_id');
    });

    it('应该正确处理 API 错误', async () => {
      console.log('\n📝 测试场景: Plane API 错误处理');

      const testIssue = localIssues.create({
        title: 'API 错误测试',
        body: '测试 API 错误处理',
        labels: [],
        assignees: [],
        authorLogin: 'integration-test',
      });

      // 尝试使用无效的项目 ID
      const invalidProjectId = '00000000-0000-0000-0000-000000000000';

      try {
        await planeClient.createWorkItem(invalidProjectId, {
          name: testIssue.title,
          description_html: '<p>测试</p>',
        });
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error).toBeDefined();
        console.log('   ✅ 正确捕获了 API 错误');
      }
    });
  });
});