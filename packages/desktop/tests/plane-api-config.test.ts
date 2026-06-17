/**
 * Plane 配置验证测试 - 不依赖数据库
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PlaneClient } from '../src/plane-client.js';

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

describe('Plane API 配置验证测试', () => {
  let client: PlaneClient;
  let config: ReturnType<typeof getPlaneConfig>;
  let testProjectId: string;

  beforeAll(() => {
    config = getPlaneConfig();
    console.log('🔧 Plane 配置:', {
      apiUrl: config.apiUrl,
      workspaceSlug: config.workspaceSlug,
      projectIds: config.projectIds,
    });

    client = new PlaneClient({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      workspaceSlug: config.workspaceSlug,
    });

    if (config.projectIds.length > 0) {
      testProjectId = config.projectIds[0];
    }
  });

  it('应该成功连接到 Plane API', async () => {
    const members = await client.getWorkspaceMembers();
    expect(Array.isArray(members)).toBe(true);
    console.log(`✅ 找到 ${members.length} 个工作区成员`);

    if (members.length > 0) {
      console.log('成员示例:', members.slice(0, 2).map(m => ({
        email: m.user.email,
        first_name: m.user.first_name,
      })));
    }
  });

  it('应该获取项目列表', async () => {
    const projects = await client.getProjects();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
    console.log(`✅ 找到 ${projects.length} 个项目`);

    console.log('项目列表:');
    projects.forEach(project => {
      console.log(`- ${project.name} (${project.identifier})`);
      console.log(`  ID: ${project.id}`);
    });
  });

  it('应该列出 Work Items', async () => {
    if (!testProjectId) {
      console.log('跳过 Work Item 测试 (未配置项目 ID)');
      return;
    }

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
  }, 30000);
});