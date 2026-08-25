import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildDataset } from './_lib/dataset.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const dataset = await buildDataset();
    // 엣지 캐시 30분, 그 뒤 1시간은 갱신하는 동안 옛 값을 계속 내보낸다
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json(dataset);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
