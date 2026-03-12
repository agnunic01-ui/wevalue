// api/subscribe.js
// Serverless Function - Vercel
// Recebe o e-mail, adiciona no Brevo e incrementa o contador

const COUNTER_KEY = 'wevalue_subscriber_count';

// Contador em memória persistente via Vercel KV (ou fallback com arquivo)
// Usamos uma variável global para simular persistência entre invocações quentes
// Para persistência real entre deploys, adicione Vercel KV (grátis)
let _count = null;

async function getCount() {
  // Se tiver Vercel KV configurado, usa ele
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const res = await fetch(`${process.env.KV_REST_API_URL}/get/${COUNTER_KEY}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
      });
      const data = await res.json();
      return parseInt(data.result) || 0;
    } catch (e) {
      return _count || 0;
    }
  }
  return _count || 0;
}

async function incrementCount() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const res = await fetch(`${process.env.KV_REST_API_URL}/incr/${COUNTER_KEY}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
      });
      const data = await res.json();
      _count = parseInt(data.result) || (_count || 0) + 1;
      return _count;
    } catch (e) {
      _count = (_count || 0) + 1;
      return _count;
    }
  }
  _count = (_count || 0) + 1;
  return _count;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/subscribe → retorna contador atual
  if (req.method === 'GET') {
    const count = await getCount();
    return res.status(200).json({ count });
  }

  // POST /api/subscribe → cadastra e-mail
  if (req.method === 'POST') {
    const { email } = req.body || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      // Sem chave configurada ainda — só incrementa contador (modo de teste)
      const newCount = await incrementCount();
      return res.status(200).json({ success: true, count: newCount, mode: 'test' });
    }

    try {
      // Adiciona contato no Brevo
      const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        body: JSON.stringify({
          email: email,
          listIds: [parseInt(process.env.BREVO_LIST_ID) || 2],
          updateEnabled: true,
          attributes: {
            SOURCE: 'landing-page',
            SIGNUP_DATE: new Date().toISOString().split('T')[0]
          }
        })
      });

      // 204 = criado, 400 com "Contact already exist" = já cadastrado (tudo ok)
      if (brevoRes.status === 204 || brevoRes.status === 201) {
        const newCount = await incrementCount();
        return res.status(200).json({ success: true, count: newCount });
      }

      const brevoData = await brevoRes.json();

      if (brevoData.code === 'duplicate_parameter') {
        // E-mail já cadastrado — não incrementa contador, mas retorna sucesso
        const count = await getCount();
        return res.status(200).json({ success: true, count, duplicate: true });
      }

      return res.status(500).json({ error: 'Erro ao cadastrar. Tente novamente.' });

    } catch (err) {
      return res.status(500).json({ error: 'Erro de conexão. Tente novamente.' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido.' });
}
