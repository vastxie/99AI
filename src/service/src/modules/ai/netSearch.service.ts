import { Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';

@Injectable()
export class netSearchService {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  async webSearchPro(prompt: string) {
    try {
      const { pluginUrl, pluginKey } =
        await this.globalConfigService.getConfigs(['pluginUrl', 'pluginKey']);

      if (!pluginUrl || !pluginKey) {
        Logger.warn('搜索插件配置缺失');
        return { searchResults: [] };
      }

      // 如果有多个 key，随机选择一个
      const keys = pluginKey.split(',').filter((key) => key.trim());
      const selectedKey = keys[Math.floor(Math.random() * keys.length)];

      const isBochaiApi = pluginUrl.includes('bochaai.com');
      const isBigModelApi = pluginUrl.includes('bigmodel.cn');
      const isTavilyApi = pluginUrl.includes('tavily.com');

      Logger.log(
        `[搜索] API类型: ${
          isBochaiApi
            ? 'Bochai'
            : isBigModelApi
            ? 'BigModel'
            : isTavilyApi
            ? 'Tavily'
            : '未知'
        }`
      );
      Logger.log(`[搜索] 请求URL: ${pluginUrl}`);
      Logger.log(`[搜索] 搜索关键词: ${prompt}`);

      const requestBody = isBochaiApi
        ? {
            query: prompt,
            freshness: 'oneWeek',
            summary: true,
          }
        : isTavilyApi
        ? {
            query: prompt,
            search_depth: 'basic',
            include_answer: false,
            include_raw_content: false,
            include_images: false,
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
        return { searchResults: [] };
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
            content: item?.content || '',
            icon: '',
            media: '',
          }));
        }
      }

      const formattedResult = searchResults.map((item, index) => ({
        resultIndex: index + 1,
        ...item,
      }));

      Logger.log(
        `[搜索] 格式化后的结果: ${JSON.stringify(formattedResult, null, 2)}`
      );
      return { searchResults: formattedResult };
    } catch (fetchError) {
      Logger.error('[搜索] 调用接口出错:', fetchError);
      return { searchResults: [] };
    }
  }
}
