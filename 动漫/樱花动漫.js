/**
* ============================================================================
* 樱花动漫资源 - OmniBox 爬虫脚本
* ============================================================================
*/
const axios = require("axios");
const http = require("http");
const https = require("https");
const cheerio = require("cheerio");
const OmniBox = require("omnibox_sdk");

// ========== 全局配置 ==========
const yinghuaConfig = {
    host: "https://www.dmvvv.com",
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.dmvvv.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
};

const PAGE_LIMIT = 36;

const axiosInstance = axios.create({
    timeout: 15000,
    httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
    httpAgent: new http.Agent({ keepAlive: true }),
});

/**
* 日志工具函数
*/
const logInfo = (message, data = null) => {
    const output = data ? `${message}: ${JSON.stringify(data)}` : message;
    OmniBox.log("info", `[樱花动漫-DEBUG] ${output}`);
};

const logError = (message, error) => {
    OmniBox.log("error", `[樱花动漫-DEBUG] ${message}: ${error.message || error}`);
};

/**
* 解析首页列表
*/
const parseHomeList = (html) => {
    const list = [];
    const $ = cheerio.load(html);

    $('li').each((i, item) => {
        const $item = $(item);
        const $link = $item.find('a');
        const href = $link.attr('href');
        const title = $link.attr('title');
        const pic = $item.find('img').data('original') || $item.find('img').attr('src');
        const remarks = $item.find('p').text().trim();

        if (href && href.includes('/detail/') && title) {
            list.push({
                vod_id: href,
                vod_name: title.trim(),
                vod_pic: pic || '',
                vod_remarks: remarks || ''
            });
        }
    });

    return list;
};

/**
* 解析总页数
*/
const parsePageCount = (html, tid) => {
    const $ = cheerio.load(html);
    let maxPage = 1;

    // 方法1: 从分页链接提取
    if (tid) {
        const pattern = new RegExp(`/type/${tid}/(\\d+)/`, 'g');
        let match;
        while ((match = pattern.exec(html)) !== null) {
            maxPage = Math.max(maxPage, parseInt(match[1]));
        }
    }

    // 方法2: 从通用分页链接提取
    const pattern2 = /\/type\/[^/]+\/(\d+)\//g;
    let match2;
    while ((match2 = pattern2.exec(html)) !== null) {
        maxPage = Math.max(maxPage, parseInt(match2[1]));
    }

    // 方法3: 从page参数提取
    const pattern3 = /[?&]page(?:no)?=(\d+)/g;
    let match3;
    while ((match3 = pattern3.exec(html)) !== null) {
        maxPage = Math.max(maxPage, parseInt(match3[1]));
    }

    return maxPage;
};

/**
* 核心:解析播放源字符串为结构化数组
*/
const parsePlaySources = (fromStr, urlStr) => {
    logInfo("开始解析播放源字符串", { from: fromStr, url: urlStr });
    const playSources = [];
    if (!fromStr || !urlStr) return playSources;

    const froms = fromStr.split('$$$');
    const urls = urlStr.split('$$$');

    for (let i = 0; i < froms.length; i++) {
        const sourceName = froms[i] || `线路${i + 1}`;
        const sourceItems = urls[i] ? urls[i].split('#') : [];

        const episodes = sourceItems.map(item => {
            const parts = item.split('$');
            return {
                name: parts[0] || '正片',
                playId: parts[1] || parts[0]
            };
        }).filter(e => e.playId);

        if (episodes.length > 0) {
            playSources.push({
                name: sourceName,
                episodes: episodes
            });
        }
    }
    logInfo("播放源解析结果", playSources);
    return playSources;
};

// ========== 接口实现 ==========

/**
* 首页接口
*/
async function home(params) {
    logInfo("进入首页");
    
    try {
        // 获取首页推荐
        const url = yinghuaConfig.host + "/";
        const response = await axiosInstance.get(url, { headers: yinghuaConfig.headers });
        const html = response.data;
        
        const list = parseHomeList(html);
        
        // 去重
        const seen = new Set();
        const uniqueList = list.filter(item => {
            if (seen.has(item.vod_id)) {
                return false;
            }
            seen.add(item.vod_id);
            return true;
        });
        
        logInfo(`获取到 ${uniqueList.length} 个首页推荐`);
        
        return {
            class: [
                { 'type_id': 'guoman', 'type_name': '国产动漫' },
                { 'type_id': 'riman', 'type_name': '日本动漫' },
                { 'type_id': 'oman', 'type_name': '欧美动漫' },
                { 'type_id': 'dmfilm', 'type_name': '动漫电影' }
            ],
            list: uniqueList.slice(0, 20)
        };
    } catch (e) {
        logError("首页获取失败", e);
        return {
            class: [
                { 'type_id': 'guoman', 'type_name': '国产动漫' },
                { 'type_id': 'riman', 'type_name': '日本动漫' },
                { 'type_id': 'oman', 'type_name': '欧美动漫' },
                { 'type_id': 'dmfilm', 'type_name': '动漫电影' }
            ],
            list: []
        };
    }
}

/**
* 分类接口
*/
async function category(params) {
    const { categoryId, page } = params;
    const pg = parseInt(page) || 1;
    logInfo(`请求分类: ${categoryId}, 页码: ${pg}`);

    try {
        let url;
        if (pg <= 1) {
            url = `${yinghuaConfig.host}/type/${categoryId}/`;
        } else {
            url = `${yinghuaConfig.host}/type/${categoryId}/${pg}/`;
        }

        const response = await axiosInstance.get(url, { headers: yinghuaConfig.headers });
        const html = response.data;

        const list = parseHomeList(html);
        const maxPage = parsePageCount(html, categoryId) || (list.length >= PAGE_LIMIT ? pg + 1 : pg);

        logInfo(`分类 ${categoryId} 第 ${pg} 页获取到 ${list.length} 个项目`);

        return {
            list: list,
            page: pg,
            pagecount: maxPage
        };
    } catch (e) {
        logError("分类请求失败", e);
        return { list: [], page: pg, pagecount: 1 };
    }
}

/**
* 详情接口
*/
async function detail(params) {
    const videoId = params.videoId;
    logInfo(`请求详情 ID: ${videoId}`);

    try {
        const detailUrl = videoId.startsWith('http') ? videoId : yinghuaConfig.host + videoId;
        
        const response = await axiosInstance.get(detailUrl, { headers: yinghuaConfig.headers });
        const html = response.data;
        const $ = cheerio.load(html);

        // 提取标题
        let vod_name = '';
        const titleMatch = html.match(/<div class="detail">.*?<h2>([^<]+)<\/h2>/s);
        if (titleMatch) {
            vod_name = titleMatch[1].trim();
        } else {
            const titleMatch2 = html.match(/<title>([^<]+)/);
            if (titleMatch2) {
                vod_name = titleMatch2[1].split('-')[0].trim();
            }
        }

        // 提取封面
        let vod_pic = '';
        const coverMatch = html.match(/<div class="cover">\s*<img[^>]+data-original="([^"]+)"/);
        if (coverMatch) {
            vod_pic = coverMatch[1];
        }

        // 提取基本信息
        const getInfo = (label, useEm = true) => {
            const pattern = useEm
                ? new RegExp(`<span>${label}:<\\/span><em>([^<]+)<\\/em>`)
                : new RegExp(`<span>${label}:<\\/span>([^<]+)`);
            const match = html.match(pattern);
            return match ? match[1].trim() : '';
        };

        const vod_remarks = getInfo('状态', true);
        const vod_year = getInfo('年份', false);
        const vod_area = getInfo('地区', false);
        const vod_type = getInfo('类型', false);
        const vod_actor = getInfo('主演', false);

        // 提取简介
        let vod_content = '';
        const descMatch = html.match(/class="blurb"[^>]*>.*?<span>[^<]+<\/span>(.*?)<\/li>/s);
        if (descMatch) {
            vod_content = descMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        // 从备注中提取总集数
        let totalEpisodes = 0;
        if (vod_remarks) {
            const epMatch = vod_remarks.match(/[共全更新至第]*(\d+)[集话章]/);
            if (epMatch) {
                totalEpisodes = parseInt(epMatch[1]);
            }
        }
        if (totalEpisodes === 0) {
            totalEpisodes = 24; // 默认集数
        }

        // 提取视频ID
        const vodId = videoId.replace(/^\/+|\/+$/g, '').split('/').pop();

        // 动态生成播放列表
        const sourceNames = ['高清', 'ikun', '非凡', '量子'];
        const playmap = {};
        const playLines = [];

        for (let sourceIdx = 1; sourceIdx <= 4; sourceIdx++) {
            try {
                // 测试该线路是否可用
                const testUrl = `${yinghuaConfig.host}/play/${vodId}-${sourceIdx}-1/`;
                await axiosInstance.get(testUrl, {
                    headers: yinghuaConfig.headers,
                    timeout: 5000
                });

                // 如果能访问,生成该线路的所有集数
                const episodes = [];
                for (let epIdx = 1; epIdx <= totalEpisodes; epIdx++) {
                    const epName = epIdx < 10 ? `第0${epIdx}集` : `第${epIdx}集`;
                    const epUrl = `/play/${vodId}-${sourceIdx}-${epIdx}/`;
                    episodes.push(`${epName}$${epUrl}`);
                }

                if (episodes.length > 0) {
                    const lineName = sourceNames[sourceIdx - 1];
                    playmap[lineName] = episodes;
                    playLines.push(lineName);
                }
            } catch (err) {
                // 该线路不可用,跳过
                logInfo(`线路 ${sourceNames[sourceIdx - 1]} 不可用`);
                continue;
            }
        }

        const vod_play_from = playLines.join('$$$');
        const vod_play_url = playLines.map(line => playmap[line].join('#')).join('$$$');

        // 解析为结构化播放源
        const playSources = parsePlaySources(vod_play_from, vod_play_url);

        logInfo("详情获取成功", { vod_name, sources: playSources.length });

        return {
            list: [{
                vod_id: videoId,
                vod_name: vod_name,
                vod_pic: vod_pic,
                vod_content: vod_content,
                vod_play_sources: playSources, // 关键:荐片架构必须返回此数组
                vod_year: vod_year,
                vod_area: vod_area,
                vod_actor: vod_actor,
                vod_remarks: vod_remarks,
                type_name: vod_type
            }]
        };
    } catch (e) {
        logError("详情获取失败", e);
        return { list: [] };
    }
}

/**
* 搜索接口
*/
async function search(params) {
    const wd = params.keyword || params.wd || "";
    const pg = parseInt(params.page) || 1;
    logInfo(`搜索关键词: ${wd}, 页码: ${pg}`);

    try {
        const encodedKeyword = encodeURIComponent(wd);
        let url;
        if (pg <= 1) {
            url = `${yinghuaConfig.host}/search/?wd=${encodedKeyword}`;
        } else {
            url = `${yinghuaConfig.host}/search/?wd=${encodedKeyword}&pageno=${pg}`;
        }

        const response = await axiosInstance.get(url, { headers: yinghuaConfig.headers });
        const html = response.data;

        const list = [];

        // 按li切割提取
        const liPattern = /<li>\s*<a class="cover".*?<\/li>/gs;
        const lis = html.match(liPattern) || [];

        lis.forEach(li => {
            const hrefMatch = li.match(/<a class="cover" href="(\/detail\/\d+\/)"/);
            const titleMatch = li.match(/title="([^"]+)"/);
            const coverMatch = li.match(/data-original="([^"]+)"/);
            const remarksMatch = li.match(/<div class="item"><span>状态:<\/span>([^<]*)/);

            if (hrefMatch && titleMatch) {
                list.push({
                    vod_id: hrefMatch[1],
                    vod_name: titleMatch[1].trim(),
                    vod_pic: coverMatch ? coverMatch[1].trim() : '',
                    vod_remarks: remarksMatch ? remarksMatch[1].trim() : ''
                });
            }
        });

        // 解析总页数
        let maxPage = pg;
        const totalMatch = html.match(/找到\s*<em>(\d+)<\/em>/);
        if (totalMatch) {
            const totalCount = parseInt(totalMatch[1]);
            maxPage = Math.ceil(totalCount / 12);
        } else {
            const pagenoPattern = /pageno=(\d+)/g;
            let match;
            while ((match = pagenoPattern.exec(html)) !== null) {
                maxPage = Math.max(maxPage, parseInt(match[1]));
            }
            if (maxPage === pg && list.length >= 12) {
                maxPage = pg + 1;
            }
        }

        logInfo(`搜索 "${wd}" 找到 ${list.length} 个结果`);

        return {
            list: list,
            page: pg,
            pagecount: maxPage
        };
    } catch (e) {
        logError("搜索失败", e);
        return { list: [], page: pg, pagecount: 1 };
    }
}

/**
* 播放接口
*/
async function play(params) {
    let playUrl = params.playId;
    logInfo(`准备播放 URL: ${playUrl}`);

    try {
        // 确保URL格式正确
        if (playUrl && !playUrl.startsWith('http')) {
            playUrl = playUrl.startsWith('/')
                ? yinghuaConfig.host + playUrl
                : yinghuaConfig.host + '/' + playUrl;
        }

        logInfo(`处理后的播放URL: ${playUrl}`);

        const response = await axiosInstance.get(playUrl, { headers: yinghuaConfig.headers });
        const html = response.data;

        // 方法1: Artplayer url
        const urlMatch = html.match(/url:\s*'(https?:\/\/[^']+)'/);
        if (urlMatch) {
            logInfo(`找到播放地址: ${urlMatch[1]}`);
            return {
                urls: [{ name: "默认线路", url: urlMatch[1] }],
                parse: 0,
                header: {
                    "User-Agent": yinghuaConfig.headers["User-Agent"],
                    "Referer": yinghuaConfig.host + "/"
                }
            };
        }

        // 方法2: 兜底匹配m3u8
        const m3u8Match = html.match(/(https?:\/\/[^\s'"]+\.m3u8(?:\?[^\s'">]*)?)/);
        if (m3u8Match) {
            logInfo(`找到m3u8地址: ${m3u8Match[1]}`);
            return {
                urls: [{ name: "默认线路", url: m3u8Match[1] }],
                parse: 0,
                header: yinghuaConfig.headers
            };
        }

        logInfo("未找到播放地址,返回原URL");
        return {
            urls: [{ name: "默认线路", url: playUrl }],
            parse: 0,
            header: yinghuaConfig.headers
        };
    } catch (e) {
        logError("播放地址解析失败", e);
        return {
            urls: [{ name: "默认线路", url: playUrl }],
            parse: 0,
            header: yinghuaConfig.headers
        };
    }
}

module.exports = { home, category, search, detail, play };

const runner = require("spider_runner");
runner.run(module.exports);