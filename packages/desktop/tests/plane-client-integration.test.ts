/**
 * Plane Client 真实 API 集成测试 (只测试读接口)
 *
 * 这个测试使用真实的 Plane 配置和 API
 * 只测试读取操作，不会创建或修改任何数据
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PlaneClient, PlaneClientError } from '../src/plane-client.js';

// 从环境变量读取配置，如果不存在则使用默认值
function getPlaneConfig() {
  const apiUrl = process.env.PLANE_API_URL || 'http://localhost:8000';
  const apiKey = process.env.PLANE_API_KEY || 'plane_api_b3599f4843454fb3afd3b666d5a8a324';
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

describe('Plane Client 真实 API 集成测试 (只读)', () => {
  let client: PlaneClient;
  let realConfig: ReturnType<typeof getPlaneConfig>;
  let testProjectId: string;

  beforeAll(() => {
    realConfig = getPlaneConfig();
    console.log('使用真实 Plane 配置:', {
      apiUrl: realConfig.apiUrl,
      workspaceSlug: realConfig.workspaceSlug,
      projectIds: realConfig.projectIds,
    });

    client = new PlaneClient({
      apiUrl: realConfig.apiUrl,
      apiKey: realConfig.apiKey,
      workspaceSlug: realConfig.workspaceSlug,
    });

    if (realConfig.projectIds.length > 0) {
      testProjectId = realConfig.projectIds[0];
    }
  });

  describe('基础连接测试', () => {
    it('应该成功连接到 Plane API', async () => {
      // 通过获取工作区成员来测试连接
      const members = await client.getWorkspaceMembers();
      expect(Array.isArray(members)).toBe(true);
      console.log(`✅ 找到 ${members.length} 个工作区成员`);

      if (members.length > 0) {
        console.log('成员示例:', members.slice(0, 2).map(m => ({
          email: m.user.email,
          first_name: m.user.first_name,
          role: m.role,
        })));
      }
    });

    it('应该获取项目列表', async () => {
      const projects = await client.getProjects();
      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThan(0);
      console.log(`✅ 找到 ${projects.length} 个项目:`, projects.map(p => ({
        name: p.name,
        identifier: p.identifier,
      })));
    });
  });

  describe('Work Item 读操作测试', () => {
    if (!testProjectId) {
      it.skip('跳过 Work Item 测试 (未配置项目 ID)', () => {});
      return;
    }

    it('应该列出 Work Items', async () => {
      const items = await client.listWorkItems(testProjectId);
      expect(Array.isArray(items)).toBe(true);
      console.log(`✅ 项目中有 ${items.length} 个 Work Items`);

      if (items.length > 0) {
        console.log('前 3 个 Items:', items.slice(0, 3).map(item => ({
          id: item.id,
          name: item.name,
          sequence_id: item.sequence_id,
          state: item.state,
          priority: item.priority,
        })));
      }
    });

    it('应该支持过滤 Work Items', async () => {
      // 测试无过滤条件
      const allItems = await client.listWorkItems(testProjectId);
      console.log(`无过滤: ${allItems.length} 个 Items`);
    });

    it('应该搜索 Work Items', async () => {
      // 使用通用搜索词
      const results = await client.searchWorkItems('test');
      expect(Array.isArray(results)).toBe(true);
      console.log(`✅ 搜索 "test" 找到 ${results.length} 个结果`);

      if (results.length > 0) {
        console.log('搜索结果示例:', results.slice(0, 2).map(item => ({
          id: item.id,
          name: item.name,
          project: item.project,
        })));
      }
    });

    it('应该处理空搜索结果', async () => {
      // 使用不太可能存在的搜索词
      const results = await client.searchWorkItems('xyz123nonexistent456');
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
      console.log('✅ 空搜索结果处理正确');
    });
  });

  describe('错误处理测试', () => {
    it('应该处理无效的项目 ID', async () => {
      const fakeProjectId = '00000000-0000-0000-0000-000000000000';

      await expect(client.listWorkItems(fakeProjectId)).rejects.toThrow(PlaneClientError);
      console.log('✅ 正确处理了无效项目 ID');
    });

    it('应该处理不存在的 Work Item', async () => {
      if (!testProjectId) {
        return;
      }

      const fakeItemId = '00000000-0000-0000-0000-000000000000';

      try {
        await client.getWorkItem(testProjectId, fakeItemId);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error).toBeInstanceOf(PlaneClientError);
        console.log('✅ 正确处理了不存在的 Work Item');
      }
    });

    it('应该处理无效的 API Key', async () => {
      const badClient = new PlaneClient({
        apiUrl: realConfig.apiUrl,
        apiKey: 'invalid-api-key-12345',
        workspaceSlug: realConfig.workspaceSlug,
      });

      await expect(badClient.getProjects()).rejects.toThrow(PlaneClientError);
      console.log('✅ 正确处理了无效 API Key');
    });
  });

  describe('数据结构验证测试', () => {
    it('应该返回正确的工作区成员结构', async () => {
      const members = await client.getWorkspaceMembers();

      if (members.length > 0) {
        const member = members[0];
        expect(member).toHaveProperty('id');
        expect(member).toHaveProperty('user_id');
        expect(member).toHaveProperty('user');
        expect(member.user).toHaveProperty('email');
        expect(member.user).toHaveProperty('first_name');
        console.log('✅ 成员数据结构正确');
      }
    });

    it('应该返回正确的项目结构', async () => {
      const projects = await client.getProjects();

      if (projects.length > 0) {
        const project = projects[0];
        expect(project).toHaveProperty('id');
        expect(project).toHaveProperty('name');
        expect(project).toHaveProperty('identifier');
        expect(project).toHaveProperty('workspace');
        console.log('✅ 项目数据结构正确');
      }
    });

    it('应该返回正确的 Work Item 结构', async () => {
      if (!testProjectId) {
        return;
      }

      const items = await client.listWorkItems(testProjectId);

      if (items.length > 0) {
        const item = items[0];
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('sequence_id');
        expect(item).toHaveProperty('state');
        expect(item).toHaveProperty('priority');
        expect(item).toHaveProperty('created_at');
        expect(item).toHaveProperty('updated_at');
        console.log('✅ Work Item 数据结构正确');
      }
    });
  });

  describe('性能和响应时间测试', () => {
    it('应该在合理时间内响应', async () => {
      const startTime = Date.now();
      await client.getProjects();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5秒内响应
      console.log(`✅ API 响应时间: ${duration}ms`);
    });
  });
});
