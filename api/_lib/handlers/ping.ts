import type { VercelReq, VercelRes } from '../vercelAuth';

export default async function handler(_req: VercelReq, res: VercelRes) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: true, ping: true, vercel: Boolean(process.env.VERCEL) }));
}
