// IPFS 客户端封装，支持浏览器端 js-ipfs 社区数据上传、拉取、搜索、收藏
// 需在 index.html 通过 CDN 引入 IPFS Core：
// <script src="https://unpkg.com/ipfs-core/dist/index.min.js"></script>

let ipfsNode = null

export async function getIpfsNode() {
  if (!ipfsNode) {
    ipfsNode = await window.IpfsCore.create()
  }
  return ipfsNode
}

// 上传社区策略，返回 CID
export async function uploadCommunityStrategy(strategyObj) {
  const ipfs = await getIpfsNode()
  const { cid } = await ipfs.add(JSON.stringify(strategyObj))
  return cid.toString()
}

// 拉取指定 CID 的社区策略
export async function fetchCommunityStrategy(cid) {
  const ipfs = await getIpfsNode()
  let content = ''
  for await (const chunk of ipfs.cat(cid)) {
    content += new TextDecoder().decode(chunk)
  }
  return JSON.parse(content)
}

// 批量拉取 CID 列表
export async function fetchCommunityStrategies(cidList) {
  const results = []
  for (const cid of cidList) {
    try {
      const data = await fetchCommunityStrategy(cid)
      results.push({ cid, data })
    } catch (e) {
      // 跳过无法拉取的
    }
  }
  return results
}

// 本地收藏（IndexedDB/LocalStorage 可选实现）
export function addFavorite(cid) {
  const favs = new Set(JSON.parse(localStorage.getItem('community_favs') || '[]'))
  favs.add(cid)
  localStorage.setItem('community_favs', JSON.stringify([...favs]))
}

export function removeFavorite(cid) {
  const favs = new Set(JSON.parse(localStorage.getItem('community_favs') || '[]'))
  favs.delete(cid)
  localStorage.setItem('community_favs', JSON.stringify([...favs]))
}

export function getFavorites() {
  return JSON.parse(localStorage.getItem('community_favs') || '[]')
}

// 搜索本地已拉取的社区策略
export function searchStrategies(strategies, keyword) {
  const kw = keyword.trim().toLowerCase()
  return strategies.filter(({ data }) =>
    Object.values(data).some(v => typeof v === 'string' && v.toLowerCase().includes(kw))
  )
}

// 检查IPFS连接状态
export async function getIpfsStatus() {
  const ipfs = await getIpfsNode();
  const id = await ipfs.id();
  return {
    id: id.id,
    agentVersion: id.agentVersion,
    protocolVersion: id.protocolVersion,
    addresses: id.addresses,
  };
}
