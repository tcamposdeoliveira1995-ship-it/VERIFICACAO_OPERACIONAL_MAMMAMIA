import { API_URL } from './config.js';

/* Gera um ID único no cliente */
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

/* ---------- POST (escrita — resposta conferida) ----------
   text/plain evita o preflight de CORS. O Apps Script responde 302 para
   script.googleusercontent.com/macros/echo?... e o fetch segue como GET.
   ARMADILHA: se o "echo" já expirou ou a execução não gerou saída, o Google
   redireciona de volta para /exec SEM parâmetros — o fetch segue e quem
   responde é o doGet ("Ação GET desconhecida: undefined"). Nesse caso NÃO dá
   para saber se gravou: vira ErroRespostaIncerta e quem chamou confere no
   servidor antes de tentar de novo. */

export class ErroRespostaIncerta extends Error {
  constructor(detalhe) {
    super('O servidor não confirmou a gravação (' + detalhe + ')');
    this.name = 'ErroRespostaIncerta';
    this.incerta = true;
  }
}

async function post(action, dados) {
  let resposta;
  try {
    resposta = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, dados })
    });
  } catch (e) {
    // pode ter caído depois de o servidor gravar: também é incerto
    throw new ErroRespostaIncerta('sem conexão ou conexão interrompida');
  }

  const texto = await resposta.text().catch(() => '');
  let resultado = null;
  try { resultado = JSON.parse(texto); } catch (e) { resultado = null; }

  // Resposta legítima do doPost sempre tem "ok" booleano.
  if (resultado && resultado.ok === true) return resultado;
  if (resultado && resultado.ok === false) {
    // sem ponto final: a tela completa a frase
    throw new Error(String(resultado.erro || 'Falha ao salvar').replace(/[.\s]+$/, ''));
  }

  // Qualquer outra coisa (JSON do doGet, HTML de erro do Google, 4xx/5xx) é incerto.
  let detalhe;
  if (resultado && resultado.erro) detalhe = 'resposta veio do doGet: ' + resultado.erro;
  else if (!resposta.ok) detalhe = 'HTTP ' + resposta.status + (resposta.status === 400 || resposta.status === 413 ? ', envio grande demais' : '');
  else detalhe = 'resposta não reconhecida: ' + texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  throw new ErroRespostaIncerta(detalhe);
}

/* Grava com confirmação: se a resposta for incerta, pergunta ao servidor se
   já gravou (jaGravou) e só tenta de novo se não gravou. Nunca duplica. */
export async function gravarConfirmado(enviar, jaGravou, tentativas = 3) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await enviar();
    } catch (e) {
      if (!e.incerta) throw e; // erro real do servidor: mostra como veio
      ultimoErro = e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      try {
        if (await jaGravou()) return { ok: true, confirmadoPorLeitura: true };
      } catch (_) { /* leitura falhou: tenta gravar de novo */ }
    }
  }
  throw ultimoErro;
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

export async function anexarDocumento(dados) {
  await post('anexarDocumento', dados);
}

export async function obterVerificacao(id) {
  return get('obterVerificacao', { id });
}

/* Converte qualquer arquivo (ex: PDF) em base64 sem processamento de imagem */
export function arquivoGenericoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

export async function listarNaoConformidades() {
  return get('listarNaoConformidades');
}

export async function salvarPlanoAcao(dados) {
  await post('salvarPlanoAcao', dados);
}

export async function assinarPlanoAcao(dados) {
  await post('assinarPlanoAcao', dados);
}

/* Reduz uma data URL de imagem (ex: foto extraída do PDF em resolução cheia)
   para no máximo larguraMaxima px em JPEG — o corpo do POST fica pequeno e a
   execução no Apps Script (Drive) fica rápida. */
export function comprimirDataUrl(dataUrl, larguraMaxima = 1280, qualidade = 0.72) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let largura = img.width;
      let altura = img.height;
      if (largura > larguraMaxima) {
        altura = Math.round(altura * (larguraMaxima / largura));
        largura = larguraMaxima;
      }
      const canvas = document.createElement('canvas');
      canvas.width = largura;
      canvas.height = altura;
      canvas.getContext('2d').drawImage(img, 0, 0, largura, altura);
      const menor = canvas.toDataURL('image/jpeg', qualidade);
      resolve(menor.length < dataUrl.length ? menor : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* Converte um arquivo (File) em base64, redimensionando e comprimindo
   (fotos de celular costumam vir muito grandes para enviar direto) */
export function arquivoParaBase64(arquivo, larguraMaxima = 1280, qualidade = 0.72) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        let largura = img.width;
        let altura = img.height;
        if (largura > larguraMaxima) {
          altura = Math.round(altura * (larguraMaxima / largura));
          largura = larguraMaxima;
        }
        const canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, largura, altura);
        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.onerror = reject;
      img.src = leitor.result;
    };
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}
