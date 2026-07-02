import { API_URL } from './config.js';

/* Gera um ID único no cliente (evita depender de resposta de POST no-cors) */
export function gerarId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/* ---------- GET (leitura — resposta legível) ---------- */

async function get(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const resposta = await fetch(url.toString());
  if (!resposta.ok) throw new Error('Falha ao buscar dados (' + resposta.status + ')');
  return resposta.json();
}

/* ---------- POST (escrita — no-cors, fire-and-forget) ---------- */

async function post(action, dados) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('dados', JSON.stringify(dados));

  await fetch(url.toString(), {
    method: 'POST',
    mode: 'no-cors'
  });
}

/* ---------- API pública ---------- */

export async function contarFolhas(empresa, data) {
  const resultado = await get('contarFolhas', { empresa, data });
  return resultado.count || 0;
}

export async function criarVerificacao(dados) {
  await post('criarVerificacao', dados);
}

export async function salvarItem(dados) {
  await post('salvarItem', dados);
}

export async function salvarTemperatura(dados) {
  await post('salvarTemperatura', dados);
}

export async function removerTemperatura(verificacaoId, linhaId) {
  await post('removerTemperatura', { verificacao_id: verificacaoId, linha_id: linhaId });
}

export async function finalizarVerificacao(dados) {
  await post('finalizarVerificacao', dados);
}

export async function listarVerificacoes(filtros = {}) {
  return get('listarVerificacoes', {
    empresa: filtros.empresa,
    dataInicio: filtros.dataInicio,
    dataFim: filtros.dataFim
  });
}

export async function obterVerificacao(id) {
  return get('obterVerificacao', { id });
}

/* Converte um arquivo (File) em base64 para envio ao Drive via Apps Script */
export function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}
