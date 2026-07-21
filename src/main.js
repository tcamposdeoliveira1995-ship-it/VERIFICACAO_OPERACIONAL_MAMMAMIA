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

const ITENS_MENU = [
  { tela: 'dash', rotulo: 'Dash', icone: '📊' },
  { tela: 'painel', rotulo: 'Painel', icone: '🏠' },
  { tela: 'nova', rotulo: 'Nova', icone: '➕' },
  { tela: 'plano', rotulo: 'Plano de Ação', icone: '✅' },
  { tela: 'historico', rotulo: 'Histórico', icone: '🕘' }
];

function render() {
  appEl.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `
    <div class="sidebar__marca">Mamma Mia<br>R&L Qualidade</div>
    ${ITENS_MENU.map(item => `
      <button class="sidebar__botao ${telaAtual === item.tela ? 'sidebar__botao--ativo' : ''}" data-tela="${item.tela}">
        <span class="sidebar__icone">${item.icone}</span>
        <span>${item.rotulo}</span>
      </button>
    `).join('')}
  `;
  sidebar.querySelectorAll('[data-tela]').forEach(botao => {
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
  appEl.appendChild(sidebar);

  const areaConteudo = document.createElement('div');
  areaConteudo.className = 'area-conteudo';
  appEl.appendChild(areaConteudo);

  const containerTela = document.createElement('div');
  areaConteudo.appendChild(containerTela);

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
