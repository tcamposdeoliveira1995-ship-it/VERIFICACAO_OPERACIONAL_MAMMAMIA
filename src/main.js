import { criarEstadoInicial, montarTelaNovaVerificacao } from './telaNovaVerificacao.js';
import { criarEstadoHistorico, montarTelaHistorico } from './telaHistorico.js';
import { criarEstadoPlanoAcao, montarTelaPlanoAcao } from './telaPlanoAcao.js';
import { criarEstadoPainel, montarTelaPainel } from './telaPainel.js';
import { criarEstadoDash, montarTelaDash } from './telaDash.js';
import { gerarPdfVerificacao } from './gerarPdf.js';
import { obterVerificacao } from './api.js';

const appEl = document.getElementById('app');

let telaAtual = 'painel'; // painel | historico | nova | plano | dash
let estadoNovaVerificacao = criarEstadoInicial();
let estadoHistorico = criarEstadoHistorico();
let estadoPlanoAcao = criarEstadoPlanoAcao();
let estadoPainel = criarEstadoPainel();
let estadoDash = criarEstadoDash();

function render() {
  appEl.innerHTML = '';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'cabecalho-app';
  cabecalho.innerHTML = `
    <div class="cabecalho-app__marca">Mamma Mia · R&L Qualidade</div>
    <div class="cabecalho-app__titulo">Verificação Técnica Operacional</div>
  `;
  appEl.appendChild(cabecalho);

  const nav = document.createElement('div');
  nav.style.display = 'flex';
  nav.style.gap = '8px';
  nav.style.padding = '12px 20px';
  nav.style.background = 'var(--cor-superficie)';
  nav.style.borderBottom = '1px solid var(--cor-borda)';
  nav.style.overflowX = 'auto';
  nav.innerHTML = `
    <button class="botao ${telaAtual === 'painel' ? 'botao--primario' : 'botao--secundario'}" data-tela="painel" style="flex:1;white-space:nowrap;">Painel</button>
    <button class="botao ${telaAtual === 'dash' ? 'botao--primario' : 'botao--secundario'}" data-tela="dash" style="flex:1;white-space:nowrap;">Dash</button>
    <button class="botao ${telaAtual === 'historico' ? 'botao--primario' : 'botao--secundario'}" data-tela="historico" style="flex:1;white-space:nowrap;">Histórico</button>
    <button class="botao ${telaAtual === 'nova' ? 'botao--primario' : 'botao--secundario'}" data-tela="nova" style="flex:1;white-space:nowrap;">Nova</button>
    <button class="botao ${telaAtual === 'plano' ? 'botao--primario' : 'botao--secundario'}" data-tela="plano" style="flex:1;white-space:nowrap;">Plano de Ação</button>
  `;
  nav.querySelectorAll('[data-tela]').forEach(botao => {
    botao.addEventListener('click', () => {
      if (botao.dataset.tela === 'nova') {
        estadoNovaVerificacao = criarEstadoInicial();
      }
      if (botao.dataset.tela === 'historico') {
        estadoHistorico = criarEstadoHistorico();
      }
      if (botao.dataset.tela === 'plano') {
        estadoPlanoAcao = criarEstadoPlanoAcao();
      }
      if (botao.dataset.tela === 'painel') {
        estadoPainel = criarEstadoPainel();
      }
      if (botao.dataset.tela === 'dash') {
        estadoDash = criarEstadoDash();
      }
      telaAtual = botao.dataset.tela;
      render();
    });
  });
  appEl.appendChild(nav);

  const containerTela = document.createElement('div');
  appEl.appendChild(containerTela);

  if (telaAtual === 'painel') {
    montarTelaPainel(containerTela, estadoPainel, salvarEstadoPainel, abrirVerificacaoOrigem);
  } else if (telaAtual === 'dash') {
    montarTelaDash(containerTela, estadoDash, salvarEstadoDash);
  } else if (telaAtual === 'nova') {
    montarTelaNovaVerificacao(containerTela, estadoNovaVerificacao, salvarEstadoNovaVerificacao, irParaHistorico);
  } else if (telaAtual === 'plano') {
    montarTelaPlanoAcao(containerTela, estadoPlanoAcao, salvarEstadoPlanoAcao, abrirVerificacaoOrigem);
  } else {
    montarTelaHistorico(containerTela, estadoHistorico, salvarEstadoHistorico, irParaNovaVerificacao, abrirPdf, abrirPlanoDeVerificacao);
  }
}

function salvarEstadoNovaVerificacao(novoEstado) {
  estadoNovaVerificacao = novoEstado;
  render();
}

function salvarEstadoHistorico(novoEstado) {
  estadoHistorico = novoEstado;
  render();
}

function salvarEstadoPlanoAcao(novoEstado) {
  estadoPlanoAcao = novoEstado;
  render();
}

function salvarEstadoPainel(novoEstado) {
  estadoPainel = novoEstado;
  render();
}

function salvarEstadoDash(novoEstado) {
  estadoDash = novoEstado;
  render();
}

function irParaHistorico() {
  estadoNovaVerificacao = criarEstadoInicial();
  estadoHistorico = criarEstadoHistorico();
  telaAtual = 'historico';
  render();
}

function irParaNovaVerificacao() {
  estadoNovaVerificacao = criarEstadoInicial();
  telaAtual = 'nova';
  render();
}

function abrirPdf(dadosVerificacao) {
  gerarPdfVerificacao(dadosVerificacao);
}

/* Histórico -> Plano de Ação (filtrado só nessa verificação) */
function abrirPlanoDeVerificacao(verificacaoId) {
  estadoPlanoAcao = criarEstadoPlanoAcao();
  estadoPlanoAcao.filtroVerificacaoId = verificacaoId;
  telaAtual = 'plano';
  render();
}

/* Plano de Ação / Painel -> Histórico (abre direto o detalhe da verificação de origem) */
async function abrirVerificacaoOrigem(verificacaoId) {
  estadoHistorico = criarEstadoHistorico();
  estadoHistorico.verificacaoAberta = { id: verificacaoId, carregando: true };
  telaAtual = 'historico';
  render();

  const detalhe = await obterVerificacao(verificacaoId);
  estadoHistorico.verificacaoAberta = { id: verificacaoId, carregando: false, dados: detalhe };
  render();
}

render();
