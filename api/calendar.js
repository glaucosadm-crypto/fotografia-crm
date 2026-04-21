// api/calendar.js — Vercel Serverless Function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no Vercel' });
  }

  try {
    const { prompt, system } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: system || 'Você gerencia o Google Agenda. Execute a ação e confirme com o eventId em JSON puro.',
        messages: [{ role: 'user', content: prompt }],
        mcp_servers: [
          {
            type: 'url',
            url: 'https://calendarmcp.googleapis.com/mcp/v1',
            name: 'google-calendar',
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro Anthropic Calendar:', data);
      return res.status(response.status).json({ error: data?.error?.message || 'Erro na API', detail: data });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao chamar Calendar:', error);
    return res.status(500).json({ error: 'Erro interno: ' + error.message });
  }
}
