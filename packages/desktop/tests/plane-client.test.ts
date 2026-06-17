/**
 * Plane Client 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlaneClient, PlaneClientError } from '../src/plane-client.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PlaneClient', () => {
  let client: PlaneClient;
  const testConfig = {
    apiUrl: 'http://localhost:8000',
    apiKey: 'test-api-key',
    workspaceSlug: 'test-workspace',
  };

  beforeEach(() => {
    mockFetch.mockClear();
    client = new PlaneClient({
      ...testConfig,
      fetch: mockFetch as unknown as typeof fetch,
    });
  });

  describe('构造函数', () => {
    it('应该正确初始化客户端', () => {
      expect(client).toBeDefined();
    });

    it('应该使用默认的 fetch 如果没有提供', () => {
      const defaultClient = new PlaneClient(testConfig);
      expect(defaultClient).toBeDefined();
    });
  });

  describe('错误处理', () => {
    it('应该在请求失败时抛出 PlaneClientError', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      await expect(client.getProjects()).rejects.toThrow(PlaneClientError);
      await expect(client.getProjects()).rejects.toThrow('404');
    });

    it('应该包含响应状态码在错误中', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      try {
        await client.getProjects();
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error).toBeInstanceOf(PlaneClientError);
        expect((error as PlaneClientError).statusCode).toBe(401);
      }
    });

    it('应该处理网络错误', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.getProjects()).rejects.toThrow(PlaneClientError);
      await expect(client.getProjects()).rejects.toThrow('Network error');
    });
  });

  describe('项目相关 API', () => {
    it('应该获取项目列表', async () => {
      const mockProjects = {
        results: [
          {
            id: 'project-1',
            name: 'Test Project',
            identifier: 'TEST',
            workspace: 'test-workspace',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockProjects,
      });

      const projects = await client.getProjects();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/workspaces/test-workspace/projects/',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
          }),
        })
      );
      expect(projects).toEqual(mockProjects.results);
    });

    it('应该处理空项目列表', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const projects = await client.getProjects();
      expect(projects).toEqual([]);
    });
  });

  describe('Work Item 相关 API', () => {
    const mockProjectId = 'project-1';
    const mockWorkItem = {
      id: 'work-item-1',
      name: 'Test Work Item',
      description_html: '<p>Test description</p>',
      sequence_id: 1,
      state: 'state-1',
      priority: 'high' as const,
      assignees: [],
      labels: [],
      project: mockProjectId,
      workspace: 'test-workspace',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('应该创建 Work Item', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockWorkItem,
      });

      const input = {
        name: 'New Work Item',
        description_html: '<p>Description</p>',
        priority: 'high' as const,
      };

      const result = await client.createWorkItem(mockProjectId, input);

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:8000/api/workspaces/test-workspace/projects/${mockProjectId}/work-items/`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
        })
      );
      expect(result).toEqual(mockWorkItem);
    });

    it('应该获取 Work Item 详情', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockWorkItem,
      });

      const result = await client.getWorkItem(mockProjectId, 'work-item-1');

      expect(result).toEqual(mockWorkItem);
    });

    it('应该更新 Work Item', async () => {
      const updated = { ...mockWorkItem, name: 'Updated' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => updated,
      });

      const result = await client.updateWorkItem(mockProjectId, 'work-item-1', {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });

    it('应该列出 Work Items', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [mockWorkItem] }),
      });

      const result = await client.listWorkItems(mockProjectId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockWorkItem);
    });

    it('应该支持过滤 Work Items', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await client.listWorkItems(mockProjectId, {
        assignees: ['user-1'],
        labels: ['label-1'],
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('assignees=user-1');
      expect(url).toContain('labels=label-1');
    });
  });

  describe('Comment 相关 API', () => {
    it('应该添加评论', async () => {
      const mockComment = {
        id: 'comment-1',
        html: '<p>Test comment</p>',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockComment,
      });

      const result = await client.addComment('project-1', 'work-item-1', {
        html: '<p>Test comment</p>',
      });

      expect(result).toBeDefined();
    });
  });

  describe('成员相关 API', () => {
    it('应该获取工作区成员', async () => {
      const mockMembers = {
        results: [
          {
            id: 'member-1',
            user_id: 'user-1',
            member_id: 'member-1',
            user: {
              first_name: 'Test',
              last_name: 'User',
              email: 'test@example.com',
            },
            role: 20,
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockMembers,
      });

      const members = await client.getWorkspaceMembers();

      expect(members).toEqual(mockMembers.results);
      expect(members).toHaveLength(1);
    });
  });

  describe('搜索功能', () => {
    it('应该搜索 Work Items', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await client.searchWorkItems('test query');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('search/work-items'),
        expect.any(Object)
      );
      // URL 编码会将空格转换为 %20
      expect(mockFetch.mock.calls[0][0]).toContain('q=test%20query');
    });
  });

  describe('请求头', () => {
    it('应该包含正确的认证头', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await client.getProjects();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('应该使用正确的 API URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await client.getProjects();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/workspaces/test-workspace/projects/',
        expect.any(Object)
      );
    });
  });
});
