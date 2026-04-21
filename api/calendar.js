// api/calendar.js — Vercel Serverless Function
// Proxy seguro para criar eventos no Google Agenda via Claude MCP

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Chave da API não configurada' });
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
        model: 'claude-sonnet-4-20250514',
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
    return res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao chamar Calendar:', error);
    return res.status(500).json({ error: 'Erro ao conectar com Google Agenda' });
  }
}
