/* Radar da Certificação: login, papéis de acesso e gravação dos dados no Supabase.
   Sem o config.js preenchido, a página roda em modo demonstração (dados de exemplo, nada é salvo). */
(function () {
  'use strict';
  const CFG = window.RADAR_CONFIG || {};
  const SERVIDOR = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const NOMES = { admin: 'Administrador', editor: 'Editor', leitor: 'Leitor' };
  const SV = { sb: null, user: null, perfil: null, salvos: {}, memo: { ref: null, mapa: '', s: 'null' }, usuarios: [], atividade: [], novo: false, criado: null, linha: null, logado: {} };
  const papel = () => (!SERVIDOR ? 'admin' : SV.perfil && SV.perfil.ativo ? SV.perfil.papel : null);
  const podeEditar = () => papel() === 'admin' || papel() === 'editor';
  const ehAdmin = () => papel() === 'admin';
  const iniciais = n => (String(n || '').trim().split(/[\s@._-]+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('') || '?').toUpperCase();
  const dataHora = x => (x ? new Date(x).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const logo = () => { const s = document.querySelector('.logo img'); return s ? s.outerHTML : ''; };

  // ===== Dados gravados no banco (tabela "estado", uma linha por chave) =====
  const repVazio = () => ({ origem: 'vazio', arquivo: null, aba: null, quando: new Date(), cabecalhos: [], linhas: [], mapa: {} });
  function repParaSalvar() {
    const r = S.rep;
    if (!r || r.origem !== 'arquivo') return null;
    const cols = [...new Set(Object.values(r.mapa))]; // guarda só as colunas usadas no cálculo
    return { arquivo: r.arquivo, aba: r.aba, quando: r.quando, cabecalhos: cols, mapa: r.mapa, linhas: r.linhas.map(l => Object.fromEntries(cols.map(c => [c, l[c]]))) };
  }
  const CHAVES = {
    regras: { admin: true, ler: () => S.R, aplicar: v => { S.R = v || clone(REGRAS_EXEMPLO); } },
    meses: { ler: () => S.meses, aplicar: v => { S.meses = v || {}; S.mesesExemplo = false; } },
    qsc: {
      ler: () => ({ dados: S.qsc, fonte: S.qscFonte, arquivo: S.qscArquivo || null, quando: S.qscQuando }),
      aplicar: v => { S.qsc = (v && v.dados) || {}; S.qscFonte = v && v.fonte === 'arquivo' ? 'arquivo' : 'manual'; S.qscArquivo = v ? v.arquivo : null; S.qscQuando = new Date((v && v.quando) || Date.now()); },
    },
    oficial: { ler: () => ({ data: S.oficial.data, pontos: S.oficial.pontos }), aplicar: v => { S.oficial = { data: v ? v.data : null, pontos: v ? v.pontos : null, exemplo: false }; } },
    altas: { ler: repParaSalvar, aplicar: v => { S.rep = v && v.linhas ? { ...v, origem: 'arquivo', quando: new Date(v.quando) } : repVazio(); } },
  };
  const ROTULO = { regras: 'Alterou as regras da certificação', meses: 'Atualizou a apuração do ciclo', qsc: 'Atualizou o QSC', oficial: 'Atualizou a base oficial', altas: 'Carregou ou ajustou o relatório de altas' };
  function foto(k) {
    if (k !== 'altas') return JSON.stringify(CHAVES[k].ler());
    const m = JSON.stringify(S.rep.mapa || {});
    if (SV.memo.ref !== S.rep || SV.memo.mapa !== m) SV.memo = { ref: S.rep, mapa: m, s: JSON.stringify(repParaSalvar()) };
    return SV.memo.s;
  }
  async function carregarEstado() {
    const { data, error } = await SV.sb.from('estado').select('chave, valor');
    if (error) throw new Error('Não foi possível ler os dados: ' + error.message);
    const por = Object.fromEntries((data || []).map(r => [r.chave, r.valor]));
    for (const k in CHAVES) CHAVES[k].aplicar(por[k] ?? null);
    S.fut = null; S.corteManual = null; S.log = [];
    calcular();
    for (const k in CHAVES) SV.salvos[k] = foto(k);
  }
  let tVer = null, salvando = false;
  function agendar() { if (!SERVIDOR || !SV.perfil) return; clearTimeout(tVer); tVer = setTimeout(verificar, 700); }
  async function verificar() {
    if (salvando) { agendar(); return; }
    salvando = true;
    try {
      for (const k in CHAVES) {
        const s = foto(k);
        if (s === SV.salvos[k] || (CHAVES[k].admin ? !ehAdmin() : !podeEditar())) continue;
        status('salvando');
        const { error } = await SV.sb.from('estado').upsert({ chave: k, valor: JSON.parse(s), atualizado_em: new Date().toISOString(), atualizado_por: SV.user.id });
        if (error) { status('erro', error.message); continue; }
        SV.salvos[k] = s;
        status('ok');
        const t = Date.now();
        if (!SV.logado[k] || t - SV.logado[k] > 10 * 60 * 1000) { SV.logado[k] = t; registrar(ROTULO[k]); }
      }
    } finally { salvando = false; }
  }
  async function registrar(acao) {
    if (!SERVIDOR || !SV.user) return;
    await SV.sb.from('historico').insert({ usuario: SV.user.id, nome: (SV.perfil && SV.perfil.nome) || SV.user.email, acao });
  }
  function status(tipo, msg) {
    const el = $('#sv-status');
    if (!el) return;
    el.className = 'sv-status' + (tipo === 'erro' ? ' erro' : '');
    el.textContent = tipo === 'salvando' ? 'Salvando…' : tipo === 'ok' ? `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : tipo === 'erro' ? 'Erro ao salvar' : '';
    el.title = msg || '';
  }

  // ===== Permissões na tela (o banco também bloqueia gravações não permitidas) =====
  function aplicarPermissoes() {
    if (!SERVIDOR) return;
    const travar = sel => document.querySelectorAll(sel).forEach(el => { el.disabled = true; el.title = 'Seu papel não permite alterar'; });
    if (!podeEditar()) travar('#ap-tab input, #ap-oficial input, #q-cards input, #imp-body select, #imp-body [data-pick]');
    if (!ehAdmin()) travar('#cfg input, #cfg select, #cfg-reset');
    document.querySelectorAll('[data-reset]').forEach(el => el.remove());
    const drop = $('#drop');
    if (drop) { drop.classList.toggle('travado', !podeEditar()); drop.tabIndex = podeEditar() ? 0 : -1; }
  }

  // ===== Topo: usuário logado, menu e status =====
  function montarTopo() {
    const box = $('#user-wrap');
    if (!box) return;
    const nome = SERVIDOR ? (SV.perfil && SV.perfil.nome) || (SV.user && SV.user.email) || '' : 'Demonstração';
    const sub = SERVIDOR ? NOMES[papel()] || '' : 'Sem login · nada é salvo';
    const menu = SERVIDOR
      ? `<p class="muted" style="font-size:.78rem">Conectado como <b>${esc(SV.user ? SV.user.email : '')}</b></p>
        <div class="linha" id="ap-box"></div>
        <form class="linha" id="sv-minha-senha" autocomplete="off"><b>Trocar minha senha</b>
          <input type="password" id="sv-ns1" placeholder="Nova senha (mín. 8 caracteres)" autocomplete="new-password" aria-label="Nova senha">
          <input type="password" id="sv-ns2" placeholder="Repita a nova senha" autocomplete="new-password" aria-label="Repita a nova senha">
          <button type="submit" class="btn sm">Salvar nova senha</button><span class="muted" id="sv-ns-msg" style="font-size:.76rem" role="status"></span></form>
        <div class="linha"><button type="button" class="btn sm" data-sv="recarregar">${ic('refresh', 15)}Recarregar dados</button><button type="button" class="btn sm" data-sv="sair">Sair do sistema</button></div>`
      : '<p style="font-size:.82rem">Modo demonstração: dados de exemplo e nada é salvo. Para ativar login, senhas e banco de dados, preencha o <b>config.js</b> (veja o LEIAME.md).</p><div class="linha" id="ap-box"></div>';
    box.innerHTML = `<button type="button" class="user" id="user-btn" aria-expanded="false" aria-controls="user-menu"><span class="avatar" aria-hidden="true">${esc(iniciais(nome))}</span><span class="user-t"><strong>${esc(nome)}</strong><span>${esc(sub)}</span></span>${ic('chevdown', 16)}</button><div class="pop user-pop" id="user-menu" hidden>${menu}</div>`;
    if (window.montarAparencia) window.montarAparencia();
  }

  // ===== Login =====
  Object.assign(ICON, {
    mail: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM3 7l9 6 9-6',
    lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    eyeOff: 'M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2',
  });
  const avisoLogin = txt => (txt ? ic('alertc', 16) + esc(txt) : '');
  function telaLogin(msg, bloqueado) {
    document.documentElement.classList.add('sv-bloqueado');
    let el = $('#sv-login');
    if (!el) { document.body.insertAdjacentHTML('beforeend', '<div class="sv-login" id="sv-login"></div>'); el = $('#sv-login'); }
    el.hidden = false;
    const marca = `<section class="sv-marca"><div class="sv-logo"><span class="sv-radar" aria-hidden="true"><i></i><i></i><i></i></span>${logo()}</div>
      <h2>A certificação da sua operação, em tempo real.</h2>
      <ul><li>${ic('check', 16)}Nota, faixa e pedra calculadas com as regras do programa</li>
        <li>${ic('check', 16)}O que falta para a próxima classificação, mês a mês</li>
        <li>${ic('check', 16)}Acesso por papel: administrador, editor e leitor</li></ul></section>`;
    const cartao = bloqueado
      ? `<div class="sv-card"><div class="sv-logo-m">${logo()}</div><span class="sv-selo">${ic('alertc', 15)}Acesso bloqueado</span><h1 class="sv-h">Seu acesso não está liberado</h1>
          <p class="sv-sub">O seu usuário está bloqueado ou ainda não foi liberado. Fale com o administrador do sistema.</p>
          <button type="button" class="sv-botao sv-sec" data-sv="sair"><span>Sair</span></button></div>`
      : `<form class="sv-card" id="sv-form" novalidate><div class="sv-logo-m">${logo()}</div>
          <h1 class="sv-h">Bem-vindo de volta</h1><p class="sv-sub">Entre com o login e a senha fornecidos pelo administrador.</p>
          <div class="sv-campo"><label for="sv-email">Login (e-mail)</label><div class="sv-input">${ic('mail', 18)}<input type="email" id="sv-email" autocomplete="username" placeholder="nome@empresa.com.br" required></div></div>
          <div class="sv-campo"><label for="sv-senha">Senha</label><div class="sv-input">${ic('lock', 18)}<input type="password" id="sv-senha" autocomplete="current-password" placeholder="Sua senha" required><button type="button" class="sv-olho" data-sv="olho" aria-label="Mostrar senha" aria-pressed="false">${ic('eye', 18)}</button></div></div>
          <p class="sv-erro" id="sv-erro" role="alert">${avisoLogin(msg)}</p>
          <button type="submit" class="sv-botao" id="sv-entrar"><span>Entrar</span>${ic('arrow', 18)}</button>
          <p class="sv-ajuda">Esqueceu a senha? Peça ao administrador para redefinir.</p></form>`;
    el.innerHTML = `<div class="sv-grade">${marca}${cartao}</div><p class="sv-rodape">SM Score · Radar de Certificação · acesso restrito</p>`;
    const em = $('#sv-email');
    if (em) em.focus();
  }
  async function entrar(ev) {
    ev.preventDefault();
    const email = $('#sv-email').value.trim(), senha = $('#sv-senha').value, erro = $('#sv-erro'), bt = $('#sv-entrar'), rotulo = bt.querySelector('span');
    if (!email || !senha) { erro.innerHTML = avisoLogin('Informe o login e a senha.'); return; }
    bt.disabled = true; bt.classList.add('carregando'); rotulo.textContent = 'Entrando…'; erro.innerHTML = '';
    const { data, error } = await SV.sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      bt.disabled = false; bt.classList.remove('carregando'); rotulo.textContent = 'Entrar';
      erro.innerHTML = avisoLogin(/invalid/i.test(error.message) ? 'Login ou senha incorretos.' : 'Não foi possível entrar: ' + error.message);
      return;
    }
    await entrarCom(data.user);
  }
  function alternarSenha(b) {
    const i = $('#sv-senha'), mostrar = i.type === 'password';
    i.type = mostrar ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(mostrar));
    b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    b.innerHTML = ic(mostrar ? 'eyeOff' : 'eye', 18);
    i.focus();
  }
  async function entrarCom(user) {
    SV.user = user;
    const { data: perfil, error } = await SV.sb.from('perfis').select('nome, papel, ativo').eq('id', user.id).maybeSingle();
    if (error) { telaLogin('Não foi possível carregar o seu perfil: ' + error.message); return; }
    if (!perfil || !perfil.ativo) { telaLogin('', true); return; }
    SV.perfil = perfil;
    try { await carregarEstado(); } catch (e) { telaLogin(e.message); return; }
    if ($('#sv-login')) $('#sv-login').hidden = true;
    document.documentElement.classList.remove('sv-bloqueado');
    montarTopo();
    montarRegras();
    irPara((location.hash || '').slice(1) || 'dashboard');
    registrar('Entrou no sistema');
  }
  async function iniciarServidor() {
    if (!window.supabase || !window.supabase.createClient) { telaLogin('Não foi possível carregar a biblioteca de login. Verifique a conexão com a internet e recarregue a página.'); return; }
    SV.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await SV.sb.auth.getSession();
    if (data && data.session) await entrarCom(data.session.user); else telaLogin();
    SV.sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && SV.perfil) location.reload(); });
  }
  async function sair() { SV.perfil = null; if (SV.sb) await SV.sb.auth.signOut(); location.reload(); }
  async function recarregar() {
    status('', '');
    try { await carregarEstado(); montarRegras(); irPara(S.pagina); status('ok'); } catch (e) { status('erro', e.message); }
  }
  async function trocarMinhaSenha(ev) {
    ev.preventDefault();
    const a = $('#sv-ns1').value, b = $('#sv-ns2').value, msg = $('#sv-ns-msg');
    if (a.length < 8) { msg.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
    if (a !== b) { msg.textContent = 'As duas senhas não são iguais.'; return; }
    const { error } = await SV.sb.auth.updateUser({ password: a });
    msg.textContent = error ? 'Não foi possível trocar: ' + error.message : 'Senha alterada.';
    if (!error) { $('#sv-ns1').value = ''; $('#sv-ns2').value = ''; registrar('Trocou a própria senha'); }
  }

  // ===== Usuários (somente administrador) =====
  async function api(acao, dados) {
    const { data } = await SV.sb.auth.getSession();
    if (!data || !data.session) throw new Error('Sessão expirada. Entre novamente.');
    const r = await fetch(`${CFG.supabaseUrl}/functions/v1/admin-usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, apikey: CFG.supabaseAnonKey },
      body: JSON.stringify({ acao, ...(dados || {}) }),
    });
    let j = {};
    try { j = await r.json(); } catch (e) { /* resposta sem JSON */ }
    if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
    return j;
  }
  const gerarSenha = () => { const al = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%'; const v = new Uint32Array(12); crypto.getRandomValues(v); return Array.from(v, x => al[x % al.length]).join(''); };
  const cardPapeis = () => `<section class="card"><div class="ch"><span class="tile sm gold">${ic('shield')}</span><h2>Papéis</h2></div><div class="cb papeis">
    <div><b>Administrador</b>Tudo o que o Editor faz, mais as regras da certificação e o cadastro de usuários.</div>
    <div><b>Editor</b>Carrega relatórios e preenche a apuração do ciclo, o QSC e a base oficial.</div>
    <div><b>Leitor</b>Consulta todas as telas e usa o simulador, sem alterar dados.</div></div></section>`;
  function renderUsuarios() {
    const el = $('#usuarios');
    const cab = `<div class="ph"><div class="ph-t"><span class="tile">${ic('users', 22)}</span><div><h1>Usuários e Acessos</h1><p>Crie logins e senhas, defina o papel de cada pessoa e bloqueie acessos.</p></div></div>${SERVIDOR && ehAdmin() ? `<button type="button" class="btn primary" data-us-novo>${ic('users', 16)}Novo usuário</button>` : ''}</div>`;
    if (!SERVIDOR) { el.innerHTML = cab + `<section class="card"><div class="cb"><p>Esta é a versão de demonstração. Com o banco de dados configurado (arquivo <b>config.js</b>, veja o LEIAME.md), esta tela permite criar usuários com login e senha, definir papéis, bloquear acessos e redefinir senhas.</p></div></section>` + cardPapeis(); return; }
    if (!ehAdmin()) { el.innerHTML = cab + `<section class="card"><div class="cb"><p>Somente administradores gerenciam usuários.</p></div></section>` + cardPapeis(); return; }
    el.innerHTML = cab + `<div id="us-novo-box"></div><div id="us-msg" aria-live="polite"></div>
      <section class="card"><div class="ch"><span class="tile sm">${ic('users')}</span><div><h2>Usuários</h2><p id="us-sub">Carregando…</p></div><button type="button" class="btn sm more" data-us-atualizar>${ic('refresh', 15)}Atualizar</button></div><div class="tw" id="us-lista"></div></section>
      <div class="g-2"><section class="card"><div class="ch"><span class="tile sm">${ic('clock')}</span><div><h2>Atividade recente</h2><p>Últimos 50 registros</p></div></div><div class="tw" id="us-ativ"></div></section>${cardPapeis()}</div>
      <section class="card"><div class="ch"><span class="tile sm">${ic('shield')}</span><div><h2>Cópia de segurança</h2><p>O plano gratuito do Supabase não faz backup automático. Baixe uma cópia de tempos em tempos (por exemplo, toda semana).</p></div></div>
        <div class="cb"><div class="rep-acts"><button type="button" class="btn" data-bk-baixar>${ic('upload', 16)}Baixar cópia dos dados</button><button type="button" class="btn" data-bk-escolher>Restaurar uma cópia</button><input type="file" id="bk-arquivo" accept=".json,application/json" hidden></div>
        <div id="bk-msg" aria-live="polite"></div></div></section>`;
    pintarNovo();
    carregarUsuarios();
  }
  function aviso(txt, erro) { const el = $('#us-msg'); if (el) el.innerHTML = txt ? `<div class="notice${erro ? ' erro' : ''}">${ic(erro ? 'alertc' : 'check', 16)}<p>${esc(txt)}</p></div>` : ''; }
  function pintarNovo() {
    const box = $('#us-novo-box');
    if (!box) return;
    if (SV.criado) {
      box.innerHTML = `<div class="criada" role="status">${ic('check', 18)}<span>Usuário criado. Envie o login e a senha por um canal seguro; a senha não aparece de novo.</span><span>Login: <code>${esc(SV.criado.email)}</code></span><span>Senha: <code>${esc(SV.criado.senha)}</code></span><button type="button" class="btn sm" data-us-copiar>Copiar login e senha</button></div>`;
      return;
    }
    box.innerHTML = SV.novo ? `<section class="card"><div class="ch"><span class="tile sm good">${ic('users')}</span><h2>Novo usuário</h2></div>
      <form class="cb us-form" id="us-form" autocomplete="off" novalidate>
        <div class="fld"><label for="us-nome">Nome</label><input type="text" id="us-nome" maxlength="80" required></div>
        <div class="fld"><label for="us-email">Login (e-mail)</label><input type="email" id="us-email" autocomplete="off" required></div>
        <div class="fld"><label for="us-senha">Senha inicial</label><div class="senha-box"><input type="text" id="us-senha" autocomplete="new-password" required><button type="button" class="btn sm" data-us-gerar>Gerar</button></div></div>
        <div class="fld"><label for="us-papel">Papel</label><select id="us-papel"><option value="leitor">Leitor</option><option value="editor">Editor</option><option value="admin">Administrador</option></select></div>
        <div class="fld"><button type="submit" class="btn primary" id="us-criar">Criar usuário</button></div>
        <p class="erro-txt" id="us-form-erro" role="alert"></p>
      </form></section>` : '';
    if (SV.novo) $('#us-nome').focus();
  }
  async function carregarUsuarios() {
    const sub = $('#us-sub');
    if (sub) sub.textContent = 'Carregando…';
    try { SV.usuarios = (await api('listar')).usuarios || []; pintarLista(); }
    catch (e) { if (sub) sub.textContent = ''; $('#us-lista').innerHTML = `<p class="vazio">Não foi possível carregar os usuários: ${esc(e.message)}. Confira se a função <b>admin-usuarios</b> foi publicada no Supabase.</p>`; }
    carregarAtividade();
  }
  function pintarLista() {
    const tb = $('#us-lista');
    if (!tb) return;
    const eu = SV.user.id, us = SV.usuarios.slice().sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));
    $('#us-sub').textContent = `${pl(us.length, 'usuário', 'usuários')} · ${pl(us.filter(u => u.ativo).length, 'ativo', 'ativos')}`;
    tb.innerHTML = `<table class="t"><thead><tr><th>Usuário</th><th>Papel</th><th>Situação</th><th>Último acesso</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>${us.map(u => {
      const proprio = u.id === eu, dis = proprio ? ' disabled title="Você não pode alterar o seu próprio acesso"' : '';
      let extra = '';
      if (SV.linha && SV.linha.id === u.id) extra = SV.linha.tipo === 'senha'
        ? `<tr class="sub"><td colspan="6"><div class="senha-box" style="max-width:560px"><input type="text" id="us-nova-senha" placeholder="Nova senha (mín. 8 caracteres)" aria-label="Nova senha para ${esc(u.email)}" autocomplete="new-password"><button type="button" class="btn sm" data-us-gerar-linha>Gerar</button><button type="button" class="btn sm primary" data-us-gravar-senha="${u.id}">Salvar senha</button><button type="button" class="btn sm" data-us-cancelar>Cancelar</button></div></td></tr>`
        : `<tr class="sub"><td colspan="6"><div class="senha-box" style="align-items:center;flex-wrap:wrap"><span>Excluir <b>${esc(u.nome || u.email)}</b>? O login deixa de existir. Para apenas impedir o acesso, desmarque “Ativo”.</span><button type="button" class="btn sm perigo" data-us-confirmar="${u.id}">Excluir definitivamente</button><button type="button" class="btn sm" data-us-cancelar>Cancelar</button></div></td></tr>`;
      return `<tr><td><span class="iname"><span class="avatar sm" aria-hidden="true">${esc(iniciais(u.nome || u.email))}</span><span><b>${esc(u.nome || '(sem nome)')}</b>${proprio ? ' <span class="chip info">você</span>' : ''}<br><small class="muted">${esc(u.email)}</small></span></span></td>
        <td><select data-us-papel="${u.id}" aria-label="Papel de ${esc(u.email)}"${dis}>${Object.entries(NOMES).map(([k, v]) => `<option value="${k}"${u.papel === k ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><label class="ativo-l"><input type="checkbox" data-us-ativo="${u.id}"${u.ativo ? ' checked' : ''}${dis}> ${u.ativo ? 'Ativo' : 'Bloqueado'}</label></td>
        <td>${u.ultimo_acesso ? dataHora(u.ultimo_acesso) : '<span class="muted">Nunca entrou</span>'}</td><td>${dataHora(u.criado_em)}</td>
        <td><button type="button" class="btn sm" data-us-senha="${u.id}">Redefinir senha</button>${proprio ? '' : ` <button type="button" class="btn sm" data-us-excluir="${u.id}">Excluir</button>`}</td></tr>${extra}`;
    }).join('')}</tbody></table>`;
  }
  async function carregarAtividade() {
    const { data } = await SV.sb.from('historico').select('quando, nome, acao').order('quando', { ascending: false }).limit(50);
    SV.atividade = data || [];
    const el = $('#us-ativ');
    if (el) el.innerHTML = SV.atividade.length ? `<table class="t"><thead><tr><th>Quando</th><th>Quem</th><th>O que fez</th></tr></thead><tbody>${SV.atividade.map(a => `<tr><td>${dataHora(a.quando)}</td><td>${esc(a.nome || '—')}</td><td class="wrap">${esc(a.acao)}</td></tr>`).join('')}</tbody></table>` : '<p class="vazio">Nenhuma atividade registrada.</p>';
  }
  async function criarUsuario(ev) {
    ev.preventDefault();
    const nome = $('#us-nome').value.trim(), email = $('#us-email').value.trim().toLowerCase(), senha = $('#us-senha').value, pap = $('#us-papel').value, erro = $('#us-form-erro'), bt = $('#us-criar');
    if (!nome) { erro.textContent = 'Informe o nome.'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { erro.textContent = 'Informe um e-mail válido como login.'; return; }
    if (senha.length < 8) { erro.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
    bt.disabled = true; erro.textContent = '';
    try {
      await api('criar', { nome, email, senha, papel: pap });
      SV.novo = false; SV.criado = { email, senha };
      pintarNovo(); aviso('');
      carregarUsuarios();
    } catch (e) { erro.textContent = e.message; bt.disabled = false; }
  }
  async function atualizarUsuario(id, mud) {
    const u = SV.usuarios.find(x => x.id === id);
    if (!u) return;
    const novo = { id, nome: u.nome, papel: mud.papel ?? u.papel, ativo: mud.ativo ?? u.ativo };
    try {
      await api('atualizar', novo);
      Object.assign(u, novo);
      aviso(`Acesso de ${u.nome || u.email} atualizado: ${NOMES[u.papel]}, ${u.ativo ? 'ativo' : 'bloqueado'}.`);
    } catch (e) { aviso(e.message, true); }
    pintarLista(); carregarAtividade();
  }
  async function redefinirSenha(id) {
    const u = SV.usuarios.find(x => x.id === id), senha = ($('#us-nova-senha') || {}).value || '';
    if (senha.length < 8) { aviso('A nova senha precisa ter pelo menos 8 caracteres.', true); return; }
    try {
      await api('senha', { id, senha });
      SV.linha = null; pintarLista();
      SV.criado = { email: u.email, senha }; pintarNovo();
      aviso(`Senha de ${u.nome || u.email} redefinida.`);
    } catch (e) { aviso(e.message, true); }
    carregarAtividade();
  }
  async function excluirUsuario(id) {
    const u = SV.usuarios.find(x => x.id === id);
    try { await api('excluir', { id }); SV.linha = null; aviso(`Usuário ${u.nome || u.email} excluído.`); carregarUsuarios(); }
    catch (e) { aviso(e.message, true); }
  }
  // ===== Cópia de segurança (somente administrador) =====
  const msgBk = (html, erro) => { const el = $('#bk-msg'); if (el) el.innerHTML = html ? `<p class="${erro ? 'erro-txt' : 'muted'}" style="margin-top:10px">${html}</p>` : ''; };
  async function baixarCopia() {
    const { data, error } = await SV.sb.from('estado').select('chave, valor, atualizado_em');
    if (error) { msgBk('Não foi possível ler os dados: ' + esc(error.message), true); return; }
    const copia = { sistema: 'sm-score-radar', versao: 1, gerado_em: new Date().toISOString(), dados: Object.fromEntries((data || []).map(r => [r.chave, r.valor])) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `sm-score-copia-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    msgBk(`Cópia baixada com ${pl((data || []).length, 'assunto', 'assuntos')}. Guarde o arquivo em local seguro (ele contém os dados do sistema).`);
    registrar('Baixou uma cópia de segurança');
  }
  let copiaPendente = null;
  async function lerCopia(arquivo) {
    try {
      const j = JSON.parse(await arquivo.text());
      if (j.sistema !== 'sm-score-radar' || !j.dados) throw new Error('o arquivo não é uma cópia do SM Score');
      const chaves = Object.keys(j.dados).filter(k => k in CHAVES);
      if (!chaves.length) throw new Error('a cópia não tem dados');
      copiaPendente = { dados: j.dados, chaves };
      msgBk(`Cópia de ${dataHora(j.gerado_em)} com ${pl(chaves.length, 'assunto', 'assuntos')}. Restaurar substitui os dados atuais. <button type="button" class="btn sm perigo" data-bk-confirmar>Restaurar agora</button> <button type="button" class="btn sm" data-bk-cancelar>Cancelar</button>`);
    } catch (e) { copiaPendente = null; msgBk('Não foi possível ler o arquivo: ' + esc(e.message), true); }
  }
  async function restaurarCopia() {
    if (!copiaPendente) return;
    for (const k of copiaPendente.chaves) {
      const { error } = await SV.sb.from('estado').upsert({ chave: k, valor: copiaPendente.dados[k], atualizado_em: new Date().toISOString(), atualizado_por: SV.user.id });
      if (error) { msgBk(`Erro ao restaurar "${esc(k)}": ${esc(error.message)}`, true); return; }
    }
    copiaPendente = null;
    await carregarEstado(); montarRegras(); renderMoldura();
    msgBk('Cópia restaurada. Os dados do sistema foram substituídos.');
    registrar('Restaurou uma cópia de segurança');
  }

  function copiarCriado(btn) {
    const txt = `Login: ${SV.criado.email}\nSenha: ${SV.criado.senha}`;
    try { navigator.clipboard.writeText(txt).then(() => { btn.textContent = 'Copiado'; }, () => { btn.textContent = 'Copie manualmente'; }); } catch (e) { btn.textContent = 'Copie manualmente'; }
  }

  // ===== Ligações com a página =====
  PAGINAS.push(['usuarios', 'users', 'Usuários']);
  document.querySelector('.rodape').insertAdjacentHTML('beforebegin', '<section class="page" id="usuarios" aria-label="Usuários" hidden></section>');
  const userAntigo = document.querySelector('.user');
  if (userAntigo) userAntigo.outerHTML = '<span class="sv-status" id="sv-status" aria-live="polite"></span><div class="user-wrap" id="user-wrap"></div>';

  const _renderPagina = renderPagina;
  renderPagina = function () { if (S.pagina === 'usuarios') renderUsuarios(); else _renderPagina(); aplicarPermissoes(); };
  const _renderMoldura = renderMoldura;
  renderMoldura = function () {
    _renderMoldura();
    if (!ehAdmin()) { const b = document.querySelector('#nav [data-ir="usuarios"]'); if (b) b.remove(); }
    if (SERVIDOR && S.rep.origem === 'vazio') {
      const av = $('#aviso');
      av.hidden = false;
      av.innerHTML = `${ic('info', 16)}<p><strong>Nenhum relatório de altas carregado.</strong> ${podeEditar() ? 'Carregue o arquivo do mês em <button type="button" class="link" data-ir="importacoes">Importações</button> e complete os meses em <button type="button" class="link" data-ir="apuracao">Apuração do Ciclo</button>.' : 'Peça a um editor para carregar os dados do mês.'}</p>`;
    }
  };
  const _atualizar = atualizar;
  atualizar = function () { _atualizar(); agendar(); };
  const _montarRegras = montarRegras;
  montarRegras = function () { _montarRegras(); aplicarPermissoes(); };
  const _receber = receber;
  receber = async function (files, slot) { if (!podeEditar()) return; await _receber(files, slot); };

  ['input', 'change', 'click'].forEach(ev => document.addEventListener(ev, agendar, true));
  document.addEventListener('click', e => {
    const menu = $('#user-menu');
    if (menu && !menu.hidden && !e.target.closest('.user-wrap')) { menu.hidden = true; $('#user-btn').setAttribute('aria-expanded', 'false'); }
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (b.id === 'user-btn') { menu.hidden = !menu.hidden; b.setAttribute('aria-expanded', String(!menu.hidden)); }
    else if (d.sv === 'sair') sair();
    else if (d.sv === 'olho') alternarSenha(b);
    else if (d.sv === 'recarregar') recarregar();
    else if ('usNovo' in d) { SV.novo = !SV.novo; SV.criado = null; pintarNovo(); }
    else if ('usGerar' in d) $('#us-senha').value = gerarSenha();
    else if ('usGerarLinha' in d) $('#us-nova-senha').value = gerarSenha();
    else if ('usAtualizar' in d) carregarUsuarios();
    else if (d.usSenha) { SV.linha = { id: d.usSenha, tipo: 'senha' }; pintarLista(); $('#us-nova-senha').focus(); }
    else if (d.usExcluir) { SV.linha = { id: d.usExcluir, tipo: 'excluir' }; pintarLista(); }
    else if ('usCancelar' in d) { SV.linha = null; pintarLista(); }
    else if (d.usConfirmar) excluirUsuario(d.usConfirmar);
    else if (d.usGravarSenha) redefinirSenha(d.usGravarSenha);
    else if ('usCopiar' in d) copiarCriado(b);
    else if ('bkBaixar' in d) baixarCopia();
    else if ('bkEscolher' in d) $('#bk-arquivo').click();
    else if ('bkConfirmar' in d) restaurarCopia();
    else if ('bkCancelar' in d) { copiaPendente = null; msgBk(''); }
  });
  document.addEventListener('change', e => { if (e.target.id === 'bk-arquivo' && e.target.files[0]) { lerCopia(e.target.files[0]); e.target.value = ''; } });
  document.addEventListener('change', e => {
    const d = e.target.dataset || {};
    if (d.usPapel) atualizarUsuario(d.usPapel, { papel: e.target.value });
    else if (d.usAtivo) atualizarUsuario(d.usAtivo, { ativo: e.target.checked });
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'sv-form') entrar(e);
    else if (e.target.id === 'us-form') criarUsuario(e);
    else if (e.target.id === 'sv-minha-senha') trocarMinhaSenha(e);
  });

  const textoRegras = document.querySelector('#regras .ph p');
  if (textoRegras) textoRegras.textContent += SERVIDOR ? ' As alterações ficam salvas para toda a equipe; só administradores podem mudar as regras.' : ' Na demonstração, as alterações valem só enquanto a página estiver aberta.';

  montarTopo();
  if (SERVIDOR) iniciarServidor(); else renderMoldura();
})();
