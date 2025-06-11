import { handleError } from '@/common/utils';
import { Injectable, Logger } from '@nestjs/common';
import fetch from 'cross-fetch';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';

@Injectable()
export class NetSearchService {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  /**
   * 处理网络搜索流程
   * @param prompt 搜索关键词
   * @param inputs 输入参数
   * @param result 结果对象
   * @returns 搜索结果对象
   */
  async processNetSearch(
    prompt: string,
    inputs: {
      usingNetwork?: boolean;
      onProgress?: (data: any) => void;
      onDatabase?: (data: any) => void;
    },
    result: any,
  ): Promise<{ searchResults: any[]; images: string[] }> {
    const { usingNetwork, onProgress, onDatabase } = inputs;
    let searchResults: any[] = [];
    let images: string[] = [];

    // 如果不使用网络搜索，直接返回空结果
    if (!usingNetwork) {
      return { searchResults, images };
    }

    try {
      Logger.log(`[网络搜索] 开始搜索: ${prompt}`, 'NetSearchService');

      // 调用网络搜索服务
      const searchResponse = await this.webSearchPro(prompt);
      searchResults = searchResponse.searchResults;
      images = searchResponse.images;

      Logger.log(
        `[网络搜索] 完成，获取到 ${searchResults.length} 条结果和 ${images.length} 张图片`,
        'NetSearchService',
      );

      // 更新结果对象
      result.networkSearchResult = JSON.stringify(searchResults);
      onProgress?.({
        networkSearchResult: result.networkSearchResult,
      });

      // 存储数据到数据库
      onDatabase?.({
        networkSearchResult: JSON.stringify(
          searchResults.map((item: { [x: string]: any; content: any }) => {
            const { content, ...rest } = item; // 删除 content 部分
            return rest; // 返回剩余部分
          }),
          null,
          2,
        ),
      });

      return { searchResults, images };
    } catch (error) {
      Logger.error(`[网络搜索] 失败: ${handleError(error)}`, 'NetSearchService');

      // 即时存储错误信息
      onDatabase?.({
        network_search_error: {
          error: handleError(error),
          query: prompt,
          timestamp: new Date(),
        },
      });

      return { searchResults: [], images: [] };
    }
  }

  async webSearchPro(prompt: string) {
    try {
      const { pluginUrl, pluginKey } = await this.globalConfigService.getConfigs([
        'pluginUrl',
        'pluginKey',
      ]);

      if (!pluginUrl || !pluginKey) {
        Logger.warn('搜索插件配置缺失');
        return { searchResults: [], images: [] };
      }

      // 如果有多个 key，随机选择一个
      const keys = pluginKey.split(',').filter(key => key.trim());
      const selectedKey = keys[Math.floor(Math.random() * keys.length)];

      const isBochaiApi = pluginUrl.includes('bochaai.com');
      const isBigModelApi = pluginUrl.includes('bigmodel.cn');
      const isTavilyApi = pluginUrl.includes('tavily.com');

      Logger.log(
        `[搜索] API类型: ${
          isBochaiApi ? 'Bochai' : isBigModelApi ? 'BigModel' : isTavilyApi ? 'Tavily' : '未知'
        }`,
      );
      Logger.log(`[搜索] 请求URL: ${pluginUrl}`);
      Logger.log(`[搜索] 搜索关键词: ${prompt}`);

      const requestBody = isBochaiApi
        ? {
            query: prompt,
            // freshness: 'oneWeek',
            summary: true,
            count: 20,
          }
        : isTavilyApi
        ? {
            query: prompt,
            search_depth: 'basic',
            // search_depth: 'advanced',
            include_answer: false,
            // include_raw_content: true,
            include_images: true,
            max_results: 10,
          }
        : {
            tool: 'web-search-pro',
            stream: false,
            messages: [{ role: 'user', content: prompt }],
          };

      Logger.log(`[搜索] 请求参数: ${JSON.stringify(requestBody, null, 2)}`);

      const response = await fetch(pluginUrl, {
        method: 'POST',
        headers: {
          Authorization: selectedKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        Logger.error(`[搜索] 接口返回错误: ${response.status}`);
        return { searchResults: [], images: [] };
      }

      const apiResult = await response.json();
      Logger.log(`[搜索] 原始返回数据: ${JSON.stringify(apiResult, null, 2)}`);

      let searchResults: any[] = [];

      if (isBochaiApi) {
        if (apiResult?.code === 200 && apiResult?.data?.webPages?.value) {
          searchResults = apiResult.data.webPages.value.map((item: any) => ({
            title: item?.name || '',
            link: item?.url || '',
            content: item?.summary || '',
            icon: item?.siteIcon || '',
            media: item?.siteName || '',
          }));
        }
      } else if (isBigModelApi) {
        if (apiResult?.choices?.[0]?.message?.tool_calls?.length > 0) {
          for (const toolCall of apiResult.choices[0].message.tool_calls) {
            if (Array.isArray(toolCall.search_result)) {
              searchResults = toolCall.search_result.map((item: any) => ({
                title: item?.title || '',
                link: item?.link || '',
                content: item?.content || '',
                icon: item?.icon || '',
                media: item?.media || '',
              }));
              break;
            }
          }
        }
      } else if (isTavilyApi) {
        if (Array.isArray(apiResult?.results)) {
          searchResults = apiResult.results.map((item: any) => ({
            title: item?.title || '',
            link: item?.url || '',
            content: item?.raw_content || item?.content || '',
            icon: '',
            media: '',
          }));
        }
      }

      const formattedResult = searchResults.map((item, index) => ({
        resultIndex: index + 1,
        ...item,
      }));

      // 提取 Tavily API 返回的图片
      let images: string[] = [];
      if (isTavilyApi && Array.isArray(apiResult?.images)) {
        images = apiResult.images;
      }

      // 处理博查API返回的图片
      if (isBochaiApi) {
        // 博查API的图片可能在两个不同的路径
        if (apiResult?.data?.images?.value && Array.isArray(apiResult.data.images.value)) {
          // 从博查API的图片结构中提取contentUrl
          images = apiResult.data.images.value
            .filter(img => img.contentUrl)
            .map(img => img.contentUrl);
        }
        // else if (
        //   apiResult?.images?.value &&
        //   Array.isArray(apiResult.images.value)
        // ) {
        //   // 备选路径
        //   images = apiResult.images.value
        //     .filter((img) => img.contentUrl)
        //     .map((img) => img.contentUrl);
        // }
      }

      Logger.log(`[搜索] 格式化后的结果: ${JSON.stringify(formattedResult, null, 2)}`);

      // 同时返回搜索结果和图片数组
      return {
        searchResults: formattedResult,
        images: images,
      };
    } catch (fetchError) {
      Logger.error('[搜索] 调用接口出错:', fetchError);
      return {
        searchResults: [],
        images: [],
      };
    }
  }
}
