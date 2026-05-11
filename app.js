/* ============================================
   SHOP ADMINISTRATION ERP
   app.js - Aplicação Principal
   ============================================ */

const App = {
  // Estado global
  state: {
    currentUser: null,
    currentRole: 'admin',
    currentPage: 'dashboard',
    sidebarCollapsed: false,
    mobileMenuOpen: false,
    produtos: [],
    categorias: [],
    vendas: [],
    caixa: [],
    bombas: [],
    movCombustivel: [],
    perdas: [],
    roubos: [],
    transferencias: [],
    fechamentos: [],
    movimentacoes: [],
    inventario: [],
    dayClosed: false,
    config: {
      nomeLoja: 'Minha Loja',
      estoqueMinimo: 10,
      alertaCombustivel: 500
    }
  },

  charts: {},

  /* === INICIALIZAÇÃO === */
  
  async init() {
    // Verificar sessão
    const session = Formulas.storageGet('session', null);
    if (session) {
      this.state.currentUser = session.user;
      this.state.currentRole = session.role;
      await this.showApp();
    }

    // Inicializar Supabase
    await SupabaseAPI.init();
    
    // Carregar configurações
    this.loadConfig();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup navegação
    this.setupNavigation();
    
    // Carregar dados iniciais se logado
    if (this.state.currentUser) {
      await this.loadAllData();
      this.updateUI();
    }
  },

  loadConfig() {
    const saved = Formulas.storageGet('app_config', {});
    this.state.config = { ...this.state.config, ...saved };
    
    // Aplicar config ao DOM
    if (this.state.config.nomeLoja) {
      document.title = `${this.state.config.nomeLoja} - Shop Administration`;
    }
  },

  async showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    // Atualizar info do utilizador
    document.getElementById('user-name').textContent = this.state.currentUser?.email || 'Utilizador';
    const roleLabels = { admin: 'Administrador', manager: 'Gestor Junior', cashier: 'Operador de Caixa' };
    document.getElementById('user-role').textContent = roleLabels[this.state.currentRole] || this.state.currentRole;
    
    // Aplicar permissões
    this.applyPermissions();
    
    // Carregar página inicial
    this.navigateTo('dashboard');
  },

  applyPermissions() {
    const { currentRole } = this.state;
    
    // Admin: acesso total
    if (currentRole === 'admin') return;
    
    // Gestor Junior e Caixa: ocultar elementos restritos
    const adminOnly = document.querySelectorAll('.admin-only');
    adminOnly.forEach(el => {
      el.classList.add('hidden');
    });
    
    // Ocultar itens de menu restritos
    const restrictedPages = ['relatorios', 'configuracoes', 'fechamento'];
    restrictedPages.forEach(page => {
      const link = document.querySelector(`[data-page="${page}"]`);
      if (link) link.style.display = 'none';
    });
    
    // Ocultar botões de lucro/margem
    if (currentRole === 'cashier' || currentRole === 'manager') {
      document.querySelectorAll('.profit-hide').forEach(el => el.style.display = 'none');
    }
  },

  /* === EVENT LISTENERS === */
  
  setupEventListeners() {
    // Login
    document.getElementById('login-form').addEventListener('submit', e => {
      e.preventDefault();
      this.handleLogin();
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());

    // Sidebar toggle
    document.getElementById('sidebar-toggle').addEventListener('click', () => this.toggleSidebar());
    document.getElementById('mobile-menu-btn').addEventListener('click', () => this.toggleMobileMenu());
    document.getElementById('sidebar-overlay').addEventListener('click', () => this.closeMobileMenu());

    // Modal
    document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-overlay')) this.closeModal();
    });

    // Global search
    document.getElementById('global-search').addEventListener('input', 
      Formulas.debounce(e => this.handleGlobalSearch(e.target.value), 300)
    );

    // Configurações
    document.getElementById('btn-salvar-supabase')?.addEventListener('click', () => this.saveSupabaseConfig());
    document.getElementById('btn-testar-supabase')?.addEventListener('click', () => this.testSupabaseConnection());
    document.getElementById('btn-salvar-geral')?.addEventListener('click', () => this.saveGeneralConfig());
    document.getElementById('btn-limpar-local')?.addEventListener('click', () => this.clearLocalData());
    document.getElementById('btn-limpar-tudo')?.addEventListener('click', () => this.clearAllData());

    // Fechamento do dia
    document.getElementById('btn-fechar-dia')?.addEventListener('click', () => this.fecharDia());
    document.getElementById('btn-iniciar-novo-dia')?.addEventListener('click', () => this.iniciarNovoDia());
    document.getElementById('btn-historico-fechamento')?.addEventListener('click', () => this.showFechamentoHistorico());

    // Reconciliação
    document.getElementById('btn-reconciliar-sistema')?.addEventListener('click', () => this.reconciliarSistema());

    // Dashboard actions
    document.getElementById('btn-notifications')?.addEventListener('click', () => this.showNotifications());
    document.getElementById('btn-day-status')?.addEventListener('click', () => this.showDayStatus());

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeModal();
    });
  },

  setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page) {
          this.navigateTo(page);
          this.closeMobileMenu();
        }
      });
    });

    // Report cards
    document.querySelectorAll('.report-card').forEach(card => {
      card.addEventListener('click', () => {
        const report = card.dataset.report;
        this.showReport(report);
      });
    });
  },

  /* === NAVEGAÇÃO === */
  
  navigateTo(page) {
    if (!page) return;
    
    // Verificar permissões
    if (!this.canAccessPage(page)) {
      this.toast('Acesso negado para o seu perfil', 'error');
      return;
    }

    // Atualizar estado
    this.state.currentPage = page;
    
    // Atualizar sidebar
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');
    
    // Atualizar página visível
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) targetPage.classList.add('active');
    
    // Atualizar título
    const titles = {
      dashboard: 'Dashboard',
      vendas: 'Vendas',
      produtos: 'Produtos',
      armazem: 'Armazém',
      loja: 'Loja',
      inventario: 'Inventário',
      combustivel: 'Combustível',
      caixa: 'Caixa',
      reconciliacao: 'Reconciliação',
      perdas: 'Perdas',
      roubos: 'Roubos',
      transferencias: 'Transferências',
      relatorios: 'Relatórios',
      fechamento: 'Fechamento',
      configuracoes: 'Configurações'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    
    // Carregar dados específicos da página
    this.loadPageData(page);
    
    // Scroll to top
    document.querySelector('.content').scrollTop = 0;
  },

  canAccessPage(page) {
    if (this.state.currentRole === 'admin') return true;
    
    const restricted = ['relatorios', 'configuracoes'];
    if (this.state.currentRole === 'manager') {
      return !['configuracoes'].includes(page);
    }
    if (this.state.currentRole === 'cashier') {
      return !restricted.includes(page);
    }
    return true;
  },

  loadPageData(page) {
    switch (page) {
      case 'dashboard': this.loadDashboard(); break;
      case 'vendas': this.loadVendasPage(); break;
      case 'produtos': this.loadProdutosPage(); break;
      case 'armazem': this.loadArmazemPage(); break;
      case 'loja': this.loadLojaPage(); break;
      case 'inventario': this.loadInventarioPage(); break;
      case 'combustivel': this.loadCombustivelPage(); break;
      case 'caixa': this.loadCaixaPage(); break;
      case 'perdas': this.loadPerdasPage(); break;
      case 'roubos': this.loadRoubosPage(); break;
      case 'transferencias': this.loadTransferenciasPage(); break;
    }
  },

  toggleSidebar() {
    this.state.sidebarCollapsed = !this.state.sidebarCollapsed;
    document.getElementById('sidebar').classList.toggle('collapsed');
  },

  toggleMobileMenu() {
    this.state.mobileMenuOpen = !this.state.mobileMenuOpen;
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
  },

  closeMobileMenu() {
    this.state.mobileMenuOpen = false;
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  },

  /* === LOGIN / LOGOUT === */
  
  handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const role = document.getElementById('login-role').value;
    const statusEl = document.getElementById('login-status');

    if (!email || !password) {
      statusEl.textContent = 'Preencha todos os campos';
      return;
    }

    // Simular autenticação
    const user = { email, id: Formulas.generateId() };
    this.state.currentUser = user;
    this.state.currentRole = role;
    Formulas.storageSet('session', { user, role, timestamp: Formulas.getAgora() });
    
    statusEl.textContent = '';
    this.showApp();
    this.loadAllData();
    this.updateUI();
    this.toast(`Bem-vindo, ${email}!`, 'success');
  },

  handleLogout() {
    if (confirm('Tem certeza que deseja sair do sistema?')) {
      Formulas.storageRemove('session');
      this.state.currentUser = null;
      this.state.currentRole = 'admin';
      document.getElementById('app').classList.add('hidden');
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('login-form').reset();
    }
  },

  /* === CARREGAMENTO DE DADOS === */
  
  async loadAllData() {
    this.showLoading('Carregando dados...');
    
    try {
      // Carregar em paralelo
      const [produtos, categorias, vendas, caixa, bombas, perdas, roubos, transferencias, fechamentos, movimentacoes] = await Promise.all([
        SupabaseAPI.getProdutos(),
        SupabaseAPI.getCategorias(),
        SupabaseAPI.getVendas(),
        SupabaseAPI.getCaixa(),
        SupabaseAPI.getBombas(),
        SupabaseAPI.getPerdas(),
        SupabaseAPI.getRoubos(),
        SupabaseAPI.getTransferencias(),
        SupabaseAPI.getFechamentos(),
        SupabaseAPI.getMovimentacoes()
      ]);

      this.state.produtos = produtos.data || [];
      this.state.categorias = categorias.data || [];
      this.state.vendas = vendas.data || [];
      this.state.caixa = caixa.data || [];
      this.state.bombas = bombas.data || [];
      this.state.perdas = perdas.data || [];
      this.state.roubos = roubos.data || [];
      this.state.transferencias = transferencias.data || [];
      this.state.fechamentos = fechamentos.data || [];
      this.state.movimentacoes = movimentacoes.data || [];

      // Verificar estado do dia
      this.checkDayStatus();
      
      // Gerar inventário
      this.generateInventario();
      
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      this.toast('Erro ao carregar dados. Usando cache local.', 'warning');
    }
    
    this.hideLoading();
  },

  async loadAllDataFresh() {
    return this.loadAllData();
  },

  updateUI() {
    this.loadDashboard();
  },

  checkDayStatus() {
    const hoje = Formulas.getHoje();
    const fechamentoHoje = this.state.fechamentos.find(f => {
      const dataF = f.data || f.created_at;
      return dataF && dataF.startsWith(hoje);
    });
    this.state.dayClosed = !!fechamentoHoje;
    
    const dayBtn = document.getElementById('btn-day-status');
    if (dayBtn) {
      dayBtn.innerHTML = this.state.dayClosed 
        ? '<i class="fas fa-moon"></i>' 
        : '<i class="fas fa-sun"></i>';
      dayBtn.title = this.state.dayClosed ? 'Dia Fechado' : 'Dia Aberto';
      dayBtn.style.color = this.state.dayClosed ? 'var(--danger)' : 'var(--success)';
    }
  },

  generateInventario() {
    this.state.inventario = this.state.produtos.map(p => {
      const vendasQtd = this.state.vendas
        .filter(v => v.itens?.some(i => i.produto_id === p.id))
        .reduce((sum, v) => sum + (v.itens?.filter(i => i.produto_id === p.id)
          .reduce((s, i) => s + (parseFloat(i.quantidade) || 0), 0) || 0), 0);
      
      const perdasQtd = this.state.perdas
        .filter(per => per.produto_id === p.id)
        .reduce((sum, per) => sum + (parseFloat(per.quantidade) || 0), 0);
      
      const roubosQtd = this.state.roubos
        .filter(r => r.produto_id === p.id)
        .reduce((sum, r) => sum + (parseFloat(r.quantidade) || 0), 0);
      
      const qtdInicial = parseFloat(p.quantidade) || 0;
      const qtdAtual = Math.max(0, qtdInicial - vendasQtd - perdasQtd - roubosQtd);
      const precoCompra = parseFloat(p.preco_compra) || 0;
      const valorTotal = qtdAtual * precoCompra;
      
      return {
        ...p,
        quantidade_atual: qtdAtual,
        quantidade_vendida: vendasQtd,
        quantidade_perdas: perdasQtd,
        quantidade_roubos: roubosQtd,
        valor_total: valorTotal,
        status: Formulas.verificarEstoqueBaixo(qtdAtual, p.estoque_minimo || this.state.config.estoqueMinimo)
      };
    });
  },

  /* === DASHBOARD === */
  
  loadDashboard() {
    this.updateKPIs();
    this.renderCharts();
    this.renderEstoqueBaixo();
    this.renderActivityList();
  },

  updateKPIs() {
    const hoje = Formulas.getHoje();
    const vendasHoje = this.state.vendas.filter(v => {
      const dv = v.created_at || v.data;
      return dv && dv.startsWith(hoje);
    });
    const totalVendas = vendasHoje.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    document.getElementById('kpi-vendas').textContent = Formulas.formatCurrency(totalVendas);

    // Caixa
    const caixaHoje = this.state.caixa.filter(c => {
      const dc = c.created_at || c.data;
      return dc && dc.startsWith(hoje);
    });
    const entradas = caixaHoje.filter(c => c.tipo === 'entrada').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saidas = caixaHoje.filter(c => c.tipo === 'saida').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saldoCaixa = entradas - saidas;
    document.getElementById('kpi-caixa').textContent = Formulas.formatCurrency(saldoCaixa);

    // Combustível
    const totalComb = this.state.bombas.reduce((s, b) => s + (parseFloat(b.saldo_atual) || 0), 0);
    document.getElementById('kpi-combustivel').textContent = Formulas.formatNumber(totalComb, 0) + ' L';

    // Estoque baixo
    const estoqueBaixo = this.state.inventario.filter(i => i.status === 'baixo' || i.status === 'critico' || i.status === 'zerado').length;
    document.getElementById('kpi-estoque-baixo').textContent = estoqueBaixo;

    // Inventário
    document.getElementById('kpi-inventario').textContent = this.state.movimentacoes.filter(m => {
      const dm = m.created_at || m.data;
      return dm && dm.startsWith(hoje);
    }).length;

    // Perdas
    const perdasHoje = this.state.perdas.filter(p => {
      const dp = p.created_at || p.data;
      return dp && dp.startsWith(hoje);
    });
    const roubosHoje = this.state.roubos.filter(r => {
      const dr = r.created_at || r.data;
      return dr && dr.startsWith(hoje);
    });
    const totalPerdas = perdasHoje.length + roubosHoje.length;
    const valorPerdas = perdasHoje.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0) + 
                       roubosHoje.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
    document.getElementById('kpi-perdas').textContent = totalPerdas;
    document.getElementById('kpi-perdas-valor').textContent = Formulas.formatCurrency(valorPerdas);
  },

  renderCharts() {
    this.renderVendasChart();
    this.renderCategoriasChart();
  },

  renderVendasChart() {
    const ctx = document.getElementById('chart-vendas');
    if (!ctx) return;

    const dias = [];
    const valores = [];
    for (let i = 6; i >= 0; i--) {
      const d = Formulas.getDiasAtras(i);
      dias.push(d.split('-').reverse().join('/'));
      const vendasDia = this.state.vendas.filter(v => {
        const dv = v.created_at || v.data;
        return dv && dv.startsWith(d);
      });
      valores.push(vendasDia.reduce((s, v) => s + (parseFloat(v.total) || 0), 0));
    }

    if (this.charts.vendas) this.charts.vendas.destroy();
    
    this.charts.vendas = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dias,
        datasets: [{
          label: 'Vendas (MT)',
          data: valores,
          borderColor: '#1a237e',
          backgroundColor: 'rgba(26,35,126,0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#d4a843',
          pointBorderColor: '#1a237e',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: {
              callback: v => 'MT ' + v.toLocaleString('pt-MZ')
            }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  },

  renderCategoriasChart() {
    const ctx = document.getElementById('chart-categorias');
    if (!ctx) return;

    const categorias = {};
    this.state.vendas.forEach(v => {
      v.itens?.forEach(item => {
        const prod = this.state.produtos.find(p => p.id === item.produto_id);
        if (prod) {
          const cat = prod.categoria || 'Outro';
          categorias[cat] = (categorias[cat] || 0) + ((parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_venda || item.preco_unitario) || 0));
        }
      });
    });

    const labels = Object.keys(categorias);
    const data = Object.values(categorias);
    const colors = ['#1a237e', '#d4a843', '#10b981', '#ef4444', '#8b5cf6', '#f97316', '#3b82f6'];

    if (this.charts.categorias) this.charts.categorias.destroy();
    
    this.charts.categorias = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 15, font: { size: 11 } }
          }
        }
      }
    });
  },

  renderEstoqueBaixo() {
    const tbody = document.querySelector('#table-estoque-baixo tbody');
    if (!tbody) return;
    
    const produtosAlerta = this.state.inventario
      .filter(i => i.status === 'baixo' || i.status === 'critico' || i.status === 'zerado')
      .slice(0, 5);

    if (produtosAlerta.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell"><div class="empty-state"><i class="fas fa-check-circle"></i><p>Todos os produtos com estoque adequado</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = produtosAlerta.map(p => {
      const statusClass = p.status === 'zerado' ? 'status-danger' : p.status === 'critico' ? 'status-danger' : 'status-warning';
      const statusText = p.status === 'zerado' ? 'Zerado' : p.status === 'critico' ? 'Crítico' : 'Baixo';
      return `
        <tr>
          <td>${p.nome}</td>
          <td>${p.codigo || '-'}</td>
          <td>${p.quantidade_atual}</td>
          <td>${p.estoque_minimo || this.state.config.estoqueMinimo}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        </tr>
      `;
    }).join('');
  },

  renderActivityList() {
    const container = document.getElementById('activity-list');
    if (!container) return;

    const atividades = [
      ...this.state.vendas.slice(0, 3).map(v => ({
        icon: 'fa-cash-register',
        color: 'bg-green',
        text: `Venda realizada: ${Formulas.formatCurrency(v.total)}`,
        time: Formulas.formatDateTime(v.created_at)
      })),
      ...this.state.movimentacoes.slice(0, 3).map(m => ({
        icon: m.tipo === 'entrada' ? 'fa-arrow-down' : 'fa-arrow-up',
        color: m.tipo === 'entrada' ? 'bg-blue' : 'bg-orange',
        text: `${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}: ${m.produto_nome || m.descricao || 'Movimentação'}`,
        time: Formulas.formatDateTime(m.created_at)
      })),
      ...this.state.perdas.slice(0, 2).map(p => ({
        icon: 'fa-exclamation-triangle',
        color: 'bg-red',
        text: `Perda registrada: ${p.produto_nome || 'Produto'}`,
        time: Formulas.formatDateTime(p.created_at)
      }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 6);

    if (atividades.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Sem atividades recentes</p></div>';
      return;
    }

    container.innerHTML = atividades.map(a => `
      <div class="activity-item">
        <div class="activity-icon ${a.color}"><i class="fas ${a.icon}"></i></div>
        <div class="activity-content">
          <div class="activity-text">${a.text}</div>
          <div class="activity-time">${a.time}</div>
        </div>
      </div>
    `).join('');
  },

  /* === PRODUTOS === */
  
  loadProdutosPage() {
    this.renderProdutosTable(this.state.produtos);
    this.updateCategoriasFilter();
    
    // Setup action buttons
    document.getElementById('btn-novo-produto').onclick = () => this.showProdutoModal();
    document.getElementById('btn-categorias').onclick = () => this.showCategoriasModal();
    document.getElementById('btn-importar-produtos').onclick = () => this.showImportModal('produtos');
    document.getElementById('btn-exportar-produtos').onclick = () => this.exportData('produtos');
    document.getElementById('btn-filtrar-produtos').onclick = () => this.filtrarProdutos();
  },

  renderProdutosTable(produtos) {
    const tbody = document.querySelector('#table-produtos tbody');
    if (!tbody) return;

    if (produtos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-cell"><div class="empty-state"><i class="fas fa-boxes"></i><h3>Sem produtos</h3><p>Adicione seu primeiro produto</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = produtos.map(p => {
      const margem = Formulas.calcularMargemLucro(p.preco_compra, p.preco_venda);
      const status = Formulas.verificarEstoqueBaixo(p.quantidade, p.estoque_minimo || this.state.config.estoqueMinimo);
      const statusClass = status === 'ok' ? 'status-active' : status === 'baixo' ? 'status-warning' : 'status-danger';
      const statusText = status === 'ok' ? 'OK' : status === 'baixo' ? 'Baixo' : status === 'critico' ? 'Crítico' : 'Zerado';
      
      return `
        <tr>
          <td><code>${p.codigo || '-'}</code></td>
          <td><strong>${p.nome}</strong></td>
          <td>${p.categoria || '-'}</td>
          <td>${Formulas.formatCurrency(p.preco_compra)}</td>
          <td>${Formulas.formatCurrency(p.preco_venda)}</td>
          <td class="${this.state.currentRole !== 'admin' && this.state.currentRole !== 'manager' ? 'profit-hide' : ''}">${margem.toFixed(1)}%</td>
          <td>${p.quantidade || 0}</td>
          <td>${p.unidade || 'un'}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td class="actions">
            <button class="btn-edit" onclick="App.editProduto('${p.id}')" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn-delete" onclick="App.deleteProduto('${p.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  updateCategoriasFilter() {
    const select = document.getElementById('filtro-categoria');
    if (!select) return;
    const cats = [...new Set(this.state.categorias.map(c => c.nome).filter(Boolean))];
    select.innerHTML = '<option value="">Todas Categorias</option>' + 
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
  },

  filtrarProdutos() {
    const texto = document.getElementById('filtro-produto')?.value?.toLowerCase() || '';
    const categoria = document.getElementById('filtro-categoria')?.value || '';
    
    const filtrados = this.state.produtos.filter(p => {
      const matchTexto = !texto || 
        p.nome?.toLowerCase().includes(texto) || 
        p.codigo?.toLowerCase().includes(texto) ||
        p.categoria?.toLowerCase().includes(texto);
      const matchCat = !categoria || p.categoria === categoria;
      return matchTexto && matchCat;
    });
    
    this.renderProdutosTable(filtrados);
  },

  showProdutoModal(produto = null) {
    const isEdit = !!produto;
    const title = isEdit ? 'Editar Produto' : 'Novo Produto';
    
    this.openModal(title, `
      <form id="produto-form">
        <input type="hidden" id="prod-id" value="${produto?.id || ''}">
        <div class="form-row">
          <div class="form-group">
            <label>Nome do Produto *</label>
            <input type="text" id="prod-nome" class="form-input" value="${produto?.nome || ''}" required>
          </div>
          <div class="form-group">
            <label>Categoria *</label>
            <select id="prod-categoria" class="form-input" required>
              <option value="">Selecione...</option>
              ${this.state.categorias.map(c => `<option value="${c.nome}" ${produto?.categoria === c.nome ? 'selected' : ''}>${c.nome}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Preço de Compra *</label>
            <input type="number" id="prod-preco-compra" class="form-input" step="0.01" min="0" value="${produto?.preco_compra || ''}" required>
          </div>
          <div class="form-group">
            <label>Preço de Venda *</label>
            <input type="number" id="prod-preco-venda" class="form-input" step="0.01" min="0" value="${produto?.preco_venda || ''}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Quantidade Inicial</label>
            <input type="number" id="prod-quantidade" class="form-input" min="0" value="${produto?.quantidade || '0'}">
          </div>
          <div class="form-group">
            <label>Estoque Mínimo</label>
            <input type="number" id="prod-estoque-min" class="form-input" min="0" value="${produto?.estoque_minimo || this.state.config.estoqueMinimo}">
          </div>
          <div class="form-group">
            <label>Unidade</label>
            <select id="prod-unidade" class="form-input">
              <option value="un" ${produto?.unidade === 'un' ? 'selected' : ''}>Unidade</option>
              <option value="kg" ${produto?.unidade === 'kg' ? 'selected' : ''}>Kg</option>
              <option value="lt" ${produto?.unidade === 'lt' ? 'selected' : ''}>Litro</option>
              <option value="cx" ${produto?.unidade === 'cx' ? 'selected' : ''}>Caixa</option>
              <option value="dz" ${produto?.unidade === 'dz' ? 'selected' : ''}>Dúzia</option>
              <option value="mt" ${produto?.unidade === 'mt' ? 'selected' : ''}>Metro</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <textarea id="prod-descricao" class="form-textarea" rows="2">${produto?.descricao || ''}</textarea>
        </div>
        ${isEdit ? '' : '<p class="form-hint">O código será gerado automaticamente</p>'}
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.confirmSaveProduto()">${isEdit ? 'Atualizar' : 'Criar'} Produto</button>
    `);
  },

  async confirmSaveProduto() {
    const id = document.getElementById('prod-id')?.value;
    const nome = document.getElementById('prod-nome')?.value?.trim();
    const categoria = document.getElementById('prod-categoria')?.value;
    const precoCompra = document.getElementById('prod-preco-compra')?.value;
    const precoVenda = document.getElementById('prod-preco-venda')?.value;
    const quantidade = document.getElementById('prod-quantidade')?.value || 0;
    const estoqueMin = document.getElementById('prod-estoque-min')?.value || this.state.config.estoqueMinimo;
    const unidade = document.getElementById('prod-unidade')?.value || 'un';
    const descricao = document.getElementById('prod-descricao')?.value;

    const produto = { nome, categoria, preco_compra: precoCompra, preco_venda: precoVenda, quantidade: parseFloat(quantidade), estoque_minimo: parseFloat(estoqueMin), unidade, descricao };

    const validacao = Formulas.validarProduto(produto, id ? [] : this.state.produtos);
    
    if (!validacao.valido) {
      const duplo = validacao.errors.find(e => e.startsWith('PRODUTO_JA_EXISTE'));
      if (duplo) {
        const nomeExistente = duplo.split(':')[1];
        this.showDuplicateOptions(nomeExistente, produto);
        return;
      }
      this.toast(validacao.errors.join('. '), 'error');
      return;
    }

    // Preview
    const margem = Formulas.calcularMargemLucro(precoCompra, precoVenda);
    this.openModal('Confirmar Dados', `
      <div class="confirm-preview">
        <p><strong>Nome:</strong> ${nome}</p>
        <p><strong>Categoria:</strong> ${categoria}</p>
        <p><strong>Preço Compra:</strong> ${Formulas.formatCurrency(precoCompra)}</p>
        <p><strong>Preço Venda:</strong> ${Formulas.formatCurrency(precoVenda)}</p>
        <p><strong>Margem:</strong> ${margem.toFixed(1)}%</p>
        <p><strong>Quantidade:</strong> ${quantidade}</p>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="App.showProdutoModal({id:'${id}',nome:'${nome}',categoria:'${categoria}',preco_compra:${precoCompra},preco_venda:${precoVenda},quantidade:${quantidade},estoque_minimo:${estoqueMin},unidade:'${unidade}',descricao:'${descricao}'})">Voltar</button>
      <button class="btn btn-primary" onclick="App.saveProdutoData('${id}')">Confirmar e Salvar</button>
    `);
  },

  showDuplicateOptions(nomeExistente, novoProduto) {
    this.openModal('Produto Já Existe', `
      <div class="confirm-dialog">
        <i class="fas fa-exclamation-circle"></i>
        <h4>Produto já cadastrado</h4>
        <p>O produto "<strong>${nomeExistente}</strong>" já existe no sistema.</p>
        <p>O que deseja fazer?</p>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.adicionarStockExistente('${nomeExistente}', ${novoProduto.quantidade})">Adicionar Stock</button>
      <button class="btn btn-warning" onclick="App.editProdutoByName('${nomeExistente}')">Editar Produto</button>
    `);
  },

  async saveProdutoData(id) {
    const nome = document.getElementById('prod-nome')?.value?.trim();
    const categoria = document.getElementById('prod-categoria')?.value;
    const precoCompra = parseFloat(document.getElementById('prod-preco-compra')?.value) || 0;
    const precoVenda = parseFloat(document.getElementById('prod-preco-venda')?.value) || 0;
    const quantidade = parseFloat(document.getElementById('prod-quantidade')?.value) || 0;
    const estoqueMin = parseFloat(document.getElementById('prod-estoque-min')?.value) || this.state.config.estoqueMinimo;
    const unidade = document.getElementById('prod-unidade')?.value || 'un';
    const descricao = document.getElementById('prod-descricao')?.value;

    const produto = {
      nome, categoria, preco_compra: precoCompra, preco_venda: precoVenda,
      quantidade, estoque_minimo: estoqueMin, unidade, descricao,
      margem_lucro: Formulas.calcularMargemLucro(precoCompra, precoVenda)
    };

    if (id) {
      produto.id = id;
      const result = await SupabaseAPI.update('produtos', id, produto);
      if (result.error) { this.toast('Erro ao atualizar: ' + result.error, 'error'); return; }
      const idx = this.state.produtos.findIndex(p => p.id === id);
      if (idx >= 0) this.state.produtos[idx] = result.data;
      this.toast('Produto atualizado com sucesso!', 'success');
    } else {
      produto.codigo = Formulas.gerarCodigoProduto(nome, categoria);
      produto.quantidade_armazem = quantidade;
      produto.quantidade_loja = 0;
      const result = await SupabaseAPI.saveProduto(produto);
      if (result.error) { this.toast('Erro ao salvar: ' + result.error, 'error'); return; }
      this.state.produtos.push(result.data);
      this.toast('Produto criado com sucesso!', 'success');
      
      // Registrar movimentação
      await this.registrarMovimentacao('entrada', result.data.id, nome, quantidade, 0, quantidade, 'Cadastro inicial de produto');
    }

    this.closeModal();
    this.loadProdutosPage();
    this.generateInventario();
    this.updateKPIs();
  },

  async adicionarStockExistente(nome, qtd) {
    const produto = this.state.produtos.find(p => p.nome === nome);
    if (!produto) return;
    
    const novaQtd = (parseFloat(produto.quantidade) || 0) + qtd;
    const result = await SupabaseAPI.update('produtos', produto.id, { 
      quantidade: novaQtd, 
      quantidade_armazem: (parseFloat(produto.quantidade_armazem) || 0) + qtd 
    });
    
    if (!result.error) {
      produto.quantidade = novaQtd;
      await this.registrarMovimentacao('entrada', produto.id, nome, qtd, parseFloat(produto.quantidade) - qtd, novaQtd, 'Adição de stock a produto existente');
      this.toast(`Stock adicionado: +${qtd} unidades de ${nome}`, 'success');
      this.closeModal();
      this.loadProdutosPage();
      this.generateInventario();
    }
  },

  editProduto(id) {
    const produto = this.state.produtos.find(p => p.id === id);
    if (produto) this.showProdutoModal(produto);
  },

  editProdutoByName(nome) {
    const produto = this.state.produtos.find(p => p.nome === nome);
    if (produto) { this.closeModal(); this.showProdutoModal(produto); }
  },

  async deleteProduto(id) {
    if (!confirm('Tem certeza que deseja eliminar este produto?\n\nEsta ação não pode ser desfeita.')) return;
    
    const result = await SupabaseAPI.deleteProduto(id);
    if (result.error) { this.toast('Erro ao eliminar', 'error'); return; }
    
    this.state.produtos = this.state.produtos.filter(p => p.id !== id);
    this.toast('Produto eliminado', 'success');
    this.loadProdutosPage();
    this.generateInventario();
  },

  /* === CATEGORIAS === */
  
  showCategoriasModal() {
    this.openModal('Gerenciar Categorias', `
      <form id="categoria-form" class="form-row">
        <div class="form-group" style="flex:1">
          <label>Nova Categoria</label>
          <input type="text" id="nova-categoria" class="form-input" placeholder="Nome da categoria">
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end">
          <button type="button" class="btn btn-primary" onclick="App.addCategoria()">Adicionar</button>
        </div>
      </form>
      <div style="margin-top:20px">
        <table class="data-table">
          <thead><tr><th>Nome</th><th>Ações</th></tr></thead>
          <tbody>
            ${this.state.categorias.map(c => `
              <tr>
                <td>${c.nome}</td>
                <td class="actions">
                  <button class="btn-delete" onclick="App.deleteCategoria('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `, '<button class="btn btn-secondary" onclick="App.closeModal()">Fechar</button>');
  },

  async addCategoria() {
    const nome = document.getElementById('nova-categoria')?.value?.trim();
    if (!nome) { this.toast('Digite um nome', 'warning'); return; }
    
    if (this.state.categorias.some(c => c.nome.toLowerCase() === nome.toLowerCase())) {
      this.toast('Categoria já existe', 'warning'); return;
    }
    
    const result = await SupabaseAPI.saveCategoria({ nome });
    if (!result.error) {
      this.state.categorias.push(result.data);
      this.toast('Categoria adicionada', 'success');
      this.showCategoriasModal();
    }
  },

  async deleteCategoria(id) {
    if (!confirm('Eliminar esta categoria?')) return;
    await SupabaseAPI.deleteCategoria(id);
    this.state.categorias = this.state.categorias.filter(c => c.id !== id);
    this.showCategoriasModal();
  },


  /* === VENDAS === */
  
  loadVendasPage() {
    this.renderVendasTable();
    
    document.getElementById('btn-nova-venda').onclick = () => this.showVendaModal();
    document.getElementById('btn-importar-vendas').onclick = () => this.showImportModal('vendas');
    document.getElementById('btn-exportar-vendas').onclick = () => this.exportData('vendas');
    document.getElementById('btn-filtrar-vendas').onclick = () => this.filtrarVendas();
  },

  renderVendasTable(vendas = this.state.vendas) {
    const tbody = document.querySelector('#table-vendas tbody');
    if (!tbody) return;

    if (vendas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell"><div class="empty-state"><i class="fas fa-cash-register"></i><h3>Sem vendas</h3><p>Registre sua primeira venda</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = vendas.map(v => {
      const numItens = v.itens?.length || 0;
      const lucro = v.itens?.reduce((s, i) => {
        const prod = this.state.produtos.find(p => p.id === i.produto_id);
        return s + (prod ? Formulas.calcularLucro(prod.preco_compra, i.preco_venda || i.preco_unitario, i.quantidade) : 0);
      }, 0) || 0;
      
      return `
        <tr>
          <td>#${v.id?.slice(-6) || '-'}</td>
          <td>${Formulas.formatDateTime(v.created_at)}</td>
          <td>${numItens} produto(s)</td>
          <td>${Formulas.formatCurrency(v.subtotal)}</td>
          <td>${v.desconto || 0}%</td>
          <td><strong>${Formulas.formatCurrency(v.total)}</strong></td>
          <td class="${this.state.currentRole !== 'admin' ? 'profit-hide' : ''}">${Formulas.formatCurrency(lucro)}</td>
          <td class="actions">
            <button class="btn-edit" onclick="App.viewVenda('${v.id}')" title="Ver"><i class="fas fa-eye"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  showVendaModal() {
    if (this.state.dayClosed) { this.toast('O dia está fechado. Não é possível registar vendas.', 'warning'); return; }
    
    const produtosOptions = this.state.produtos.map(p => 
      `<option value="${p.id}" data-preco="${p.preco_venda}" data-compra="${p.preco_compra}">${p.nome} - ${Formulas.formatCurrency(p.preco_venda)}</option>`
    ).join('');

    this.openModal('Nova Venda', `
      <form id="venda-form">
        <div id="venda-itens">
          <div class="venda-item" data-index="0">
            <div class="form-row">
              <div class="form-group" style="flex:2">
                <label>Produto</label>
                <select class="form-input venda-produto" onchange="App.updateVendaItem(0)" required>
                  <option value="">Selecione...</option>
                  ${produtosOptions}
                </select>
              </div>
              <div class="form-group">
                <label>Qtd</label>
                <input type="number" class="form-input venda-qtd" value="1" min="1" onchange="App.updateVendaItem(0)">
              </div>
              <div class="form-group">
                <label>Preço Unit</label>
                <input type="number" class="form-input venda-preco" step="0.01" readonly>
              </div>
              <div class="form-group">
                <label>Total</label>
                <input type="text" class="form-input venda-total" readonly style="font-weight:700">
              </div>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-secondary" onclick="App.addVendaItem()"><i class="fas fa-plus"></i> Adicionar Produto</button>
        <hr style="margin:20px 0;border:none;border-top:1px solid var(--gray-200)">
        <div class="form-row">
          <div class="form-group">
            <label>Subtotal</label>
            <input type="text" id="venda-subtotal" class="form-input" readonly style="font-weight:700;font-size:16px">
          </div>
          <div class="form-group">
            <label>Desconto (%)</label>
            <input type="number" id="venda-desconto" class="form-input" value="0" min="0" max="100" onchange="App.calcularTotalVenda()">
          </div>
          <div class="form-group">
            <label>Total Final</label>
            <input type="text" id="venda-total" class="form-input" readonly style="font-weight:800;font-size:18px;color:var(--primary)">
          </div>
        </div>
        <div class="form-group">
          <label>Observação</label>
          <textarea id="venda-obs" class="form-textarea" rows="2"></textarea>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.confirmVenda()">Finalizar Venda</button>
    `, 'modal-lg');

    // Atualizar primeiro item
    setTimeout(() => this.updateVendaItem(0), 100);
  },

  vendaItemCount: 1,

  addVendaItem() {
    const idx = this.vendaItemCount++;
    const produtosOptions = this.state.produtos.map(p => 
      `<option value="${p.id}" data-preco="${p.preco_venda}" data-compra="${p.preco_compra}">${p.nome} - ${Formulas.formatCurrency(p.preco_venda)}</option>`
    ).join('');
    
    const div = document.createElement('div');
    div.className = 'venda-item';
    div.dataset.index = idx;
    div.innerHTML = `
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label>Produto</label>
          <select class="form-input venda-produto" onchange="App.updateVendaItem(${idx})" required>
            <option value="">Selecione...</option>
            ${produtosOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Qtd</label>
          <input type="number" class="form-input venda-qtd" value="1" min="1" onchange="App.updateVendaItem(${idx})">
        </div>
        <div class="form-group">
          <label>Preço Unit</label>
          <input type="number" class="form-input venda-preco" step="0.01" readonly>
        </div>
        <div class="form-group">
          <label>Total</label>
          <input type="text" class="form-input venda-total" readonly style="font-weight:700">
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end">
          <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.venda-item').remove();App.calcularTotalVenda()"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `;
    document.getElementById('venda-itens').appendChild(div);
  },

  updateVendaItem(idx) {
    const item = document.querySelector(`.venda-item[data-index="${idx}"]`);
    if (!item) return;
    
    const select = item.querySelector('.venda-produto');
    const qtdInput = item.querySelector('.venda-qtd');
    const precoInput = item.querySelector('.venda-preco');
    const totalInput = item.querySelector('.venda-total');
    
    const option = select.selectedOptions[0];
    if (!option || !option.value) return;
    
    const preco = parseFloat(option.dataset.preco) || 0;
    const qtd = parseFloat(qtdInput.value) || 0;
    const total = preco * qtd;
    
    precoInput.value = preco.toFixed(2);
    totalInput.value = Formulas.formatCurrency(total);
    
    this.calcularTotalVenda();
  },

  calcularTotalVenda() {
    let subtotal = 0;
    document.querySelectorAll('.venda-item').forEach(item => {
      const select = item.querySelector('.venda-produto');
      const option = select?.selectedOptions[0];
      const qtd = parseFloat(item.querySelector('.venda-qtd')?.value) || 0;
      const preco = option ? parseFloat(option.dataset.preco) || 0 : 0;
      subtotal += preco * qtd;
    });
    
    const desconto = parseFloat(document.getElementById('venda-desconto')?.value) || 0;
    const total = Formulas.calcularTotal(subtotal, Formulas.calcularDesconto(subtotal, desconto));
    
    document.getElementById('venda-subtotal').value = Formulas.formatCurrency(subtotal);
    document.getElementById('venda-total').value = Formulas.formatCurrency(total);
  },

  confirmVenda() {
    this.calcularTotalVenda();
    const subtotal = document.getElementById('venda-subtotal')?.value;
    const total = document.getElementById('venda-total')?.value;
    
    this.openModal('Confirmar Venda', `
      <div class="confirm-preview">
        <h4>Resumo da Venda</h4>
        <p><strong>Subtotal:</strong> ${subtotal}</p>
        <p><strong>Desconto:</strong> ${document.getElementById('venda-desconto')?.value}%</p>
        <p style="font-size:18px;color:var(--primary)"><strong>Total:</strong> ${total}</p>
        <p class="form-hint">Confirme para registar a venda e dar baixa no estoque.</p>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="App.showVendaModal()">Voltar</button>
      <button class="btn btn-primary" onclick="App.saveVenda()">Confirmar Venda</button>
    `);
  },

  async saveVenda() {
    const itens = [];
    let valid = true;
    
    document.querySelectorAll('.venda-item').forEach(item => {
      const select = item.querySelector('.venda-produto');
      const produtoId = select?.value;
      if (!produtoId) { valid = false; return; }
      
      const option = select.selectedOptions[0];
      const qtd = parseFloat(item.querySelector('.venda-qtd')?.value) || 0;
      const preco = parseFloat(option.dataset.preco) || 0;
      const precoCompra = parseFloat(option.dataset.compra) || 0;
      
      // Verificar estoque
      const produto = this.state.produtos.find(p => p.id === produtoId);
      const qtdAtual = parseFloat(produto?.quantidade) || 0;
      if (qtd > qtdAtual) {
        this.toast(`Estoque insuficiente para ${produto?.nome}. Disponível: ${qtdAtual}`, 'error');
        valid = false;
        return;
      }
      
      itens.push({ produto_id: produtoId, quantidade: qtd, preco_venda: preco, preco_compra: precoCompra, produto_nome: produto?.nome });
    });

    if (!valid || itens.length === 0) return;

    const desconto = parseFloat(document.getElementById('venda-desconto')?.value) || 0;
    const subtotal = Formulas.calcularSubtotal(itens);
    const total = Formulas.calcularTotal(subtotal, Formulas.calcularDesconto(subtotal, desconto));
    const obs = document.getElementById('venda-obs')?.value || '';

    const venda = {
      itens,
      subtotal,
      desconto,
      total,
      observacao: obs,
      utilizador: this.state.currentUser?.email || 'Sistema'
    };

    const result = await SupabaseAPI.saveVenda(venda);
    if (result.error) { this.toast('Erro ao registar venda', 'error'); return; }

    // Dar baixa no estoque
    for (const item of itens) {
      const prod = this.state.produtos.find(p => p.id === item.produto_id);
      if (prod) {
        const novaQtd = Math.max(0, (parseFloat(prod.quantidade) || 0) - item.quantidade);
        await SupabaseAPI.update('produtos', prod.id, { quantidade: novaQtd });
        prod.quantidade = novaQtd;
        
        await this.registrarMovimentacao('saida', prod.id, prod.nome, item.quantidade, parseFloat(prod.quantidade) + item.quantidade, novaQtd, `Venda #${result.data.id?.slice(-6)}`);
      }
    }

    // Atualizar caixa
    await SupabaseAPI.saveCaixa({
      tipo: 'entrada',
      valor: total,
      descricao: `Venda #${result.data.id?.slice(-6)}`,
      categoria: 'venda',
      utilizador: this.state.currentUser?.email || 'Sistema'
    });

    this.state.vendas.unshift(result.data);
    this.closeModal();
    this.toast('Venda registada com sucesso!', 'success');
    this.loadAllDataFresh().then(() => { this.loadVendasPage(); this.generateInventario(); this.updateKPIs(); });
  },

  viewVenda(id) {
    const venda = this.state.vendas.find(v => v.id === id);
    if (!venda) return;
    
    this.openModal('Detalhes da Venda', `
      <p><strong>ID:</strong> #${venda.id?.slice(-6)}</p>
      <p><strong>Data:</strong> ${Formulas.formatDateTime(venda.created_at)}</p>
      <p><strong>Utilizador:</strong> ${venda.utilizador || '-'}</p>
      <hr style="margin:12px 0">
      <table class="data-table">
        <thead><tr><th>Produto</th><th>Qtd</th><th>Preço Unit</th><th>Total</th></tr></thead>
        <tbody>
          ${venda.itens?.map(i => `
            <tr>
              <td>${i.produto_nome || this.state.produtos.find(p => p.id === i.produto_id)?.nome || '-'}</td>
              <td>${i.quantidade}</td>
              <td>${Formulas.formatCurrency(i.preco_venda || i.preco_unitario)}</td>
              <td>${Formulas.formatCurrency((i.quantidade || 0) * (i.preco_venda || i.preco_unitario || 0))}</td>
            </tr>
          `).join('') || '<tr><td colspan="4">Sem itens</td></tr>'}
        </tbody>
      </table>
      <hr style="margin:12px 0">
      <p><strong>Subtotal:</strong> ${Formulas.formatCurrency(venda.subtotal)}</p>
      <p><strong>Desconto:</strong> ${venda.desconto || 0}%</p>
      <p style="font-size:16px"><strong>Total:</strong> ${Formulas.formatCurrency(venda.total)}</p>
    `, '<button class="btn btn-secondary" onclick="App.closeModal()">Fechar</button>');
  },

  filtrarVendas() {
    const inicio = document.getElementById('vendas-data-inicio')?.value;
    const fim = document.getElementById('vendas-data-fim')?.value;
    
    let filtradas = [...this.state.vendas];
    if (inicio) filtradas = filtradas.filter(v => (v.created_at || v.data) >= inicio + 'T00:00:00');
    if (fim) filtradas = filtradas.filter(v => (v.created_at || v.data) <= fim + 'T23:59:59');
    
    this.renderVendasTable(filtradas);
  },

  /* === ARMAZÉM === */
  
  loadArmazemPage() {
    this.renderArmazemTable();
    
    const totalArmazem = this.state.produtos.reduce((s, p) => s + ((parseFloat(p.quantidade_armazem) || 0) * (parseFloat(p.preco_compra) || 0)), 0);
    const kpiTotal = document.getElementById('kpi-total-armazem');
    const kpiProd = document.getElementById('kpi-produtos-armazem');
    const kpiEnt = document.getElementById('kpi-entradas-hoje');
    if (kpiTotal) kpiTotal.textContent = Formulas.formatCurrency(totalArmazem);
    if (kpiProd) kpiProd.textContent = this.state.produtos.length;
    
    const hoje = Formulas.getHoje();
    const entradasHoje = this.state.movimentacoes.filter(m => m.tipo === 'entrada' && (m.created_at || '').startsWith(hoje)).length;
    if (kpiEnt) kpiEnt.textContent = entradasHoje;
    
    document.getElementById('btn-add-stock').onclick = () => this.showAddStockModal();
    document.getElementById('btn-exportar-armazem').onclick = () => this.exportData('armazem');
    document.getElementById('filtro-armazem').oninput = Formulas.debounce(e => this.filtrarArmazem(e.target.value), 300);
  },

  renderArmazemTable(produtos = this.state.produtos) {
    const tbody = document.querySelector('#table-armazem tbody');
    if (!tbody) return;

    if (produtos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell"><div class="empty-state"><i class="fas fa-warehouse"></i><h3>Armazém vazio</h3></div></td></tr>';
      return;
    }

    tbody.innerHTML = produtos.map(p => {
      const qtdArm = parseFloat(p.quantidade_armazem) || 0;
      const qtdLoja = parseFloat(p.quantidade_loja) || 0;
      const total = qtdArm + qtdLoja;
      const custo = parseFloat(p.preco_compra) || 0;
      return `
        <tr>
          <td><strong>${p.nome}</strong></td>
          <td>${p.codigo || '-'}</td>
          <td>${qtdArm}</td>
          <td>${qtdLoja}</td>
          <td>${total}</td>
          <td>${Formulas.formatCurrency(custo)}</td>
          <td>${Formulas.formatCurrency(total * custo)}</td>
          <td class="actions">
            <button class="btn-edit" onclick="App.showTransferenciaModal('${p.id}', 'armazem')" title="Transferir para Loja"><i class="fas fa-exchange-alt"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filtrarArmazem(texto) {
    const filtrados = this.state.produtos.filter(p => 
      p.nome?.toLowerCase().includes(texto.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(texto.toLowerCase())
    );
    this.renderArmazemTable(filtrados);
  },

  showAddStockModal() {
    const produtosOptions = this.state.produtos.map(p => 
      `<option value="${p.id}" data-qtd="${p.quantidade}" data-arm="${p.quantidade_armazem || 0}">${p.nome} (Stock: ${p.quantidade || 0})</option>`
    ).join('');

    this.openModal('Adicionar Stock ao Armazém', `
      <form id="add-stock-form">
        <div class="form-group">
          <label>Produto *</label>
          <select id="stock-produto" class="form-input" required>
            <option value="">Selecione...</option>
            ${produtosOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Quantidade a Adicionar *</label>
            <input type="number" id="stock-qtd" class="form-input" min="1" required>
          </div>
          <div class="form-group">
            <label>Custo Unitário (opcional)</label>
            <input type="number" id="stock-custo" class="form-input" step="0.01" min="0">
          </div>
        </div>
        <div class="form-group">
          <label>Observação</label>
          <textarea id="stock-obs" class="form-textarea" rows="2">Entrada de stock</textarea>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.confirmAddStock()">Confirmar Entrada</button>
    `);
  },

  async confirmAddStock() {
    const prodId = document.getElementById('stock-produto')?.value;
    const qtd = parseFloat(document.getElementById('stock-qtd')?.value) || 0;
    const custo = parseFloat(document.getElementById('stock-custo')?.value) || 0;
    const obs = document.getElementById('stock-obs')?.value || '';

    if (!prodId || qtd <= 0) { this.toast('Selecione um produto e quantidade válida', 'error'); return; }

    const produto = this.state.produtos.find(p => p.id === prodId);
    if (!produto) return;

    const qtdAtual = parseFloat(produto.quantidade) || 0;
    const armAtual = parseFloat(produto.quantidade_armazem) || 0;
    const novaQtd = qtdAtual + qtd;
    const novoArm = armAtual + qtd;

    // Calcular novo custo médio
    let novoCusto = parseFloat(produto.preco_compra) || 0;
    if (custo > 0) {
      novoCusto = Formulas.calcularCustoMedio(parseFloat(produto.preco_compra) || 0, qtdAtual, custo, qtd);
    }

    this.openModal('Confirmar Entrada de Stock', `
      <div class="confirm-preview">
        <p><strong>Produto:</strong> ${produto.nome}</p>
        <p><strong>Quantidade Atual:</strong> ${qtdAtual}</p>
        <p><strong>Quantidade a Adicionar:</strong> +${qtd}</p>
        <p><strong>Nova Quantidade:</strong> ${novaQtd}</p>
        ${custo > 0 ? `<p><strong>Novo Custo Médio:</strong> ${Formulas.formatCurrency(novoCusto)}</p>` : ''}
      </div>
    `, `
      <button class="btn btn-secondary" onclick="App.showAddStockModal()">Voltar</button>
      <button class="btn btn-primary" onclick="App.saveStock('${prodId}', ${qtd}, ${custo}, ${novaQtd}, ${novoArm}, ${novoCusto}, '${obs}')">Confirmar</button>
    `);
  },

  async saveStock(prodId, qtd, custo, novaQtd, novoArm, novoCusto, obs) {
    const produto = this.state.produtos.find(p => p.id === prodId);
    const updateData = { quantidade: novaQtd, quantidade_armazem: novoArm };
    if (custo > 0) updateData.preco_compra = novoCusto;

    const result = await SupabaseAPI.update('produtos', prodId, updateData);
    if (result.error) { this.toast('Erro ao adicionar stock', 'error'); return; }

    Object.assign(produto, updateData);
    
    await this.registrarMovimentacao('entrada', prodId, produto.nome, qtd, produto.quantidade - qtd, novaQtd, obs);
    
    this.closeModal();
    this.toast('Stock adicionado com sucesso!', 'success');
    this.loadArmazemPage();
    this.generateInventario();
  },

  /* === LOJA === */
  
  loadLojaPage() {
    const produtosLoja = this.state.produtos.filter(p => (parseFloat(p.quantidade_loja) || 0) > 0);
    const tbody = document.querySelector('#table-loja tbody');
    if (!tbody) return;

    if (produtosLoja.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell"><div class="empty-state"><i class="fas fa-store-alt"></i><h3>Loja vazia</h3><p>Transfira produtos do armazém</p></div></td></tr>';
    } else {
      tbody.innerHTML = produtosLoja.map(p => {
        const qtdLoja = parseFloat(p.quantidade_loja) || 0;
        const disponivel = qtdLoja > 0 ? 'Disponível' : 'Indisponível';
        return `
          <tr>
            <td><strong>${p.nome}</strong></td>
            <td>${p.codigo || '-'}</td>
            <td>${qtdLoja}</td>
            <td>${Formulas.formatCurrency(p.preco_venda)}</td>
            <td><span class="status-badge ${qtdLoja > 0 ? 'status-active' : 'status-danger'}">${disponivel}</span></td>
            <td class="actions">
              <button class="btn-edit" onclick="App.showVendaRapida('${p.id}')" title="Vender"><i class="fas fa-cash-register"></i></button>
            </td>
          </tr>
        `;
      }).join('');
    }

    document.getElementById('btn-transferir-armazem').onclick = () => this.showTransferenciaModal();
    document.getElementById('btn-nova-venda-loja').onclick = () => this.showVendaModal();
    document.getElementById('filtro-loja').oninput = Formulas.debounce(e => this.filtrarLoja(e.target.value), 300);
  },

  filtrarLoja(texto) {
    const produtosLoja = this.state.produtos.filter(p => {
      const qtdLoja = parseFloat(p.quantidade_loja) || 0;
      return qtdLoja > 0 && (p.nome?.toLowerCase().includes(texto.toLowerCase()) || p.codigo?.toLowerCase().includes(texto.toLowerCase()));
    });
    const tbody = document.querySelector('#table-loja tbody');
    if (!tbody) return;
    
    if (produtosLoja.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>Nenhum produto encontrado</p></div></td></tr>';
      return;
    }
    
    tbody.innerHTML = produtosLoja.map(p => {
      const qtdLoja = parseFloat(p.quantidade_loja) || 0;
      return `
        <tr>
          <td><strong>${p.nome}</strong></td>
          <td>${p.codigo || '-'}</td>
          <td>${qtdLoja}</td>
          <td>${Formulas.formatCurrency(p.preco_venda)}</td>
          <td><span class="status-badge ${qtdLoja > 0 ? 'status-active' : 'status-danger'}">${qtdLoja > 0 ? 'Disponível' : 'Indisponível'}</span></td>
          <td class="actions">
            <button class="btn-edit" onclick="App.showVendaRapida('${p.id}')" title="Vender"><i class="fas fa-cash-register"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  showTransferenciaModal(produtoId = null, origem = 'armazem') {
    const produtosOptions = this.state.produtos.map(p => 
      `<option value="${p.id}" ${produtoId === p.id ? 'selected' : ''}>${p.nome} (Armazém: ${p.quantidade_armazem || 0}, Loja: ${p.quantidade_loja || 0})</option>`
    ).join('');

    this.openModal('Transferência - Armazém para Loja', `
      <form id="transferencia-form">
        <div class="form-group">
          <label>Produto *</label>
          <select id="transf-produto" class="form-input" required>
            <option value="">Selecione...</option>
            ${produtosOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Quantidade *</label>
            <input type="number" id="transf-qtd" class="form-input" min="1" required>
          </div>
          <div class="form-group">
            <label>Origem</label>
            <input type="text" class="form-input" value="Armazém" readonly>
          </div>
          <div class="form-group">
            <label>Destino</label>
            <input type="text" class="form-input" value="Loja" readonly>
          </div>
        </div>
        <div class="form-group">
          <label>Observação</label>
          <textarea id="transf-obs" class="form-textarea" rows="2">Transferência automática</textarea>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.confirmTransferencia()">Confirmar Transferência</button>
    `);
  },

  async confirmTransferencia() {
    const prodId = document.getElementById('transf-produto')?.value;
    const qtd = parseFloat(document.getElementById('transf-qtd')?.value) || 0;
    const obs = document.getElementById('transf-obs')?.value || '';

    if (!prodId || qtd <= 0) { this.toast('Dados inválidos', 'error'); return; }

    const produto = this.state.produtos.find(p => p.id === prodId);
    if (!produto) return;

    const armAtual = parseFloat(produto.quantidade_armazem) || 0;
    if (qtd > armAtual) { this.toast(`Stock insuficiente no armazém. Disponível: ${armAtual}`, 'error'); return; }

    const novoArm = armAtual - qtd;
    const novoLoja = (parseFloat(produto.quantidade_loja) || 0) + qtd;

    this.openModal('Confirmar Transferência', `
      <div class="confirm-preview">
        <p><strong>Produto:</strong> ${produto.nome}</p>
        <p><strong>Quantidade:</strong> ${qtd}</p>
        <p><strong>De:</strong> Armazém (${novoArm} restante)</p>
        <p><strong>Para:</strong> Loja (${novoLoja} total)</p>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="App.showTransferenciaModal()">Voltar</button>
      <button class="btn btn-primary" onclick="App.saveTransferencia('${prodId}', ${qtd}, ${novoArm}, ${novoLoja}, '${obs}')">Confirmar</button>
    `);
  },

  async saveTransferencia(prodId, qtd, novoArm, novoLoja, obs) {
    const produto = this.state.produtos.find(p => p.id === prodId);
    const result = await SupabaseAPI.update('produtos', prodId, { 
      quantidade_armazem: novoArm, 
      quantidade_loja: novoLoja 
    });
    
    if (result.error) { this.toast('Erro na transferência', 'error'); return; }

    produto.quantidade_armazem = novoArm;
    produto.quantidade_loja = novoLoja;

    await SupabaseAPI.saveTransferencia({
      produto_id: prodId,
      produto_nome: produto.nome,
      de: 'armazem',
      para: 'loja',
      quantidade: qtd,
      observacao: obs,
      utilizador: this.state.currentUser?.email || 'Sistema'
    });

    await this.registrarMovimentacao('transferencia', prodId, produto.nome, qtd, produto.quantidade, produto.quantidade, obs);

    this.closeModal();
    this.toast('Transferência realizada!', 'success');
    this.loadArmazemPage();
    this.loadLojaPage();
    this.generateInventario();
  },

  showVendaRapida(produtoId) {
    this.showVendaModal();
    setTimeout(() => {
      const firstSelect = document.querySelector('.venda-produto');
      if (firstSelect) { firstSelect.value = produtoId; this.updateVendaItem(0); }
    }, 200);
  },


  /* === INVENTÁRIO === */
  
  loadInventarioPage() {
    this.generateInventario();
    this.renderInventarioTable();
    this.renderMovimentacoesTable();

    const valorTotal = this.state.inventario.reduce((s, i) => s + (parseFloat(i.valor_total) || 0), 0);
    const custoMedio = this.state.inventario.length > 0 ? valorTotal / this.state.inventario.length : 0;

    const kpiValor = document.getElementById('kpi-valor-total');
    const kpiCusto = document.getElementById('kpi-custo-medio');
    const kpiMov = document.getElementById('kpi-total-mov');
    if (kpiValor) kpiValor.textContent = Formulas.formatCurrency(valorTotal);
    if (kpiCusto) kpiCusto.textContent = Formulas.formatCurrency(custoMedio);
    if (kpiMov) kpiMov.textContent = this.state.movimentacoes.length;

    document.getElementById('btn-inventario-fisico').onclick = () => this.showInventarioFisicoModal();
    document.getElementById('btn-exportar-inventario').onclick = () => this.exportData('inventario');
  },

  renderInventarioTable() {
    const tbody = document.querySelector('#table-inventario tbody');
    if (!tbody) return;

    if (this.state.inventario.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-cell"><div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>Sem dados de inventário</h3></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.state.inventario.map(p => {
      const statusClass = p.status === 'ok' ? 'status-active' : p.status === 'baixo' ? 'status-warning' : 'status-danger';
      const statusText = p.status === 'ok' ? 'OK' : p.status === 'baixo' ? 'Baixo' : p.status === 'critico' ? 'Crítico' : 'Zerado';
      return `
        <tr>
          <td><strong>${p.nome}</strong></td>
          <td>${p.codigo || '-'}</td>
          <td>${p.quantidade_atual}</td>
          <td>${Formulas.formatCurrency(p.preco_compra)}</td>
          <td>${Formulas.formatCurrency(p.valor_total)}</td>
          <td>${p.quantidade_vendida}</td>
          <td>${p.quantidade_perdas}</td>
          <td>${p.quantidade_roubos}</td>
          <td>${p.estoque_minimo || this.state.config.estoqueMinimo}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        </tr>
      `;
    }).join('');
  },

  renderMovimentacoesTable() {
    const tbody = document.querySelector('#table-movimentacoes tbody');
    if (!tbody) return;

    if (this.state.movimentacoes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell"><div class="empty-state"><i class="fas fa-history"></i><p>Sem movimentações</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.state.movimentacoes.slice(0, 50).map(m => `
      <tr>
        <td>${Formulas.formatDateTime(m.created_at)}</td>
        <td>${m.utilizador || '-'}</td>
        <td><span class="status-badge ${m.tipo === 'entrada' ? 'status-active' : m.tipo === 'saida' ? 'status-danger' : 'status-info'}">${Formulas.capitalize(m.tipo)}</span></td>
        <td>${m.produto_nome || '-'}</td>
        <td>${m.quantidade}</td>
        <td>${m.saldo_anterior ?? '-'}</td>
        <td>${m.saldo_atual ?? '-'}</td>
        <td>${m.observacao || '-'}</td>
      </tr>
    `).join('');
  },

  async registrarMovimentacao(tipo, produtoId, produtoNome, quantidade, saldoAnterior, saldoAtual, observacao) {
    const mov = {
      tipo,
      produto_id: produtoId,
      produto_nome: produtoNome,
      quantidade,
      saldo_anterior: saldoAnterior,
      saldo_atual: saldoAtual,
      observacao,
      utilizador: this.state.currentUser?.email || 'Sistema'
    };
    await SupabaseAPI.saveMovimentacao(mov);
    this.state.movimentacoes.unshift(mov);
  },

  showInventarioFisicoModal() {
    this.openModal('Realizar Inventário Físico', `
      <form id="inv-fisico-form">
        <p style="margin-bottom:16px;color:var(--gray-600)">Digite a contagem física para cada produto. O sistema calculará as diferenças automaticamente.</p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Produto</th><th>Sistema</th><th>Contagem Física *</th></tr>
            </thead>
            <tbody>
              ${this.state.inventario.map(p => `
                <tr>
                  <td><strong>${p.nome}</strong><br><small>${p.codigo || ''}</small></td>
                  <td>${p.quantidade_atual}</td>
                  <td><input type="number" class="form-input inv-contagem" data-id="${p.id}" data-sistema="${p.quantidade_atual}" min="0" placeholder="Contagem"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.processarInventarioFisico()">Calcular Diferenças</button>
    `, 'modal-xl');
  },

  processarInventarioFisico() {
    const diferencas = [];
    document.querySelectorAll('.inv-contagem').forEach(input => {
      const id = input.dataset.id;
      const sistema = parseFloat(input.dataset.sistema) || 0;
      const fisico = parseFloat(input.value);
      if (isNaN(fisico)) return;
      
      const diff = fisico - sistema;
      if (diff !== 0) {
        const produto = this.state.inventario.find(p => p.id === id);
        diferencas.push({ id, nome: produto?.nome, sistema, fisico, diff, valor: Math.abs(diff) * (parseFloat(produto?.preco_compra) || 0) });
      }
    });

    if (diferencas.length === 0) {
      this.openModal('Inventário Físico', `
        <div class="confirm-dialog">
          <i class="fas fa-check-circle" style="color:var(--success)"></i>
          <h4>Inventário Conferido!</h4>
          <p>Nenhuma diferença encontrada entre o sistema e a contagem física.</p>
        </div>
      `, '<button class="btn btn-primary" onclick="App.closeModal()">OK</button>');
      return;
    }

    this.openModal('Diferenças Encontradas', `
      <p>Foram encontradas <strong>${diferencas.length}</strong> diferença(s):</p>
      <div class="table-responsive" style="margin-top:12px">
        <table class="data-table">
          <thead>
            <tr><th>Produto</th><th>Sistema</th><th>Físico</th><th>Diferença</th><th>Valor</th></tr>
          </thead>
          <tbody>
            ${diferencas.map(d => `
              <tr style="${d.diff < 0 ? 'background:var(--danger-light)' : d.diff > 0 ? 'background:var(--success-light)' : ''}">
                <td>${d.nome}</td>
                <td>${d.sistema}</td>
                <td><strong>${d.fisico}</strong></td>
                <td style="color:${d.diff < 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700">${d.diff > 0 ? '+' : ''}${d.diff}</td>
                <td>${Formulas.formatCurrency(d.valor)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p class="form-hint" style="margin-top:12px">Deseja ajustar o sistema para corresponder à contagem física?</p>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Não Ajustar</button>
      <button class="btn btn-primary" onclick="App.ajustarInventario(${JSON.stringify(diferencas).replace(/"/g, '&quot;')})">Ajustar Sistema</button>
    `);
  },

  async ajustarInventario(diferencas) {
    for (const d of diferencas) {
      const produto = this.state.produtos.find(p => p.id === d.id);
      if (!produto) continue;
      
      await SupabaseAPI.update('produtos', d.id, { quantidade: d.fisico, quantidade_armazem: d.fisico });
      produto.quantidade = d.fisico;
      produto.quantidade_armazem = d.fisico;
      
      await this.registrarMovimentacao('ajuste', d.id, d.nome, Math.abs(d.diff), d.sistema, d.fisico, `Ajuste inventário físico: ${d.diff > 0 ? 'sobra' : 'falta'} de ${Math.abs(d.diff)}`);
    }

    this.closeModal();
    this.toast(`${diferencas.length} produto(s) ajustado(s)`, 'success');
    this.generateInventario();
    this.loadInventarioPage();
  },

  /* === COMBUSTÍVEL === */
  
  loadCombustivelPage() {
    this.renderBombasTable();
    this.renderMovCombustivelTable();
    
    const gasolina = this.state.bombas.filter(b => b.tipo === 'gasolina').reduce((s, b) => s + (parseFloat(b.saldo_atual) || 0), 0);
    const gasoleo = this.state.bombas.filter(b => b.tipo === 'gasoleo').reduce((s, b) => s + (parseFloat(b.saldo_atual) || 0), 0);
    const totalVendas = this.state.movCombustivel.filter(m => m.tipo === 'venda').reduce((s, m) => s + (parseFloat(m.valor) || 0), 0);
    const alertas = this.state.bombas.filter(b => {
      const status = Formulas.verificarCombustivelBaixo(parseFloat(b.saldo_atual) || 0, this.state.config.alertaCombustivel);
      return status !== 'ok';
    }).length;

    document.getElementById('kpi-gasolina').textContent = Formulas.formatNumber(gasolina, 0) + ' L';
    document.getElementById('kpi-gasoleo').textContent = Formulas.formatNumber(gasoleo, 0) + ' L';
    document.getElementById('kpi-vendas-comb').textContent = Formulas.formatCurrency(totalVendas);
    document.getElementById('kpi-alertas-comb').textContent = alertas;

    document.getElementById('btn-novo-abastecimento').onclick = () => this.showAbastecimentoModal();
    document.getElementById('btn-add-combustivel').onclick = () => this.showEntradaCombustivelModal();
    document.getElementById('btn-exportar-combustivel').onclick = () => this.exportData('combustivel');
  },

  renderBombasTable() {
    const tbody = document.querySelector('#table-bombas tbody');
    if (!tbody) return;

    if (this.state.bombas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell"><div class="empty-state"><i class="fas fa-gas-pump"></i><h3>Sem bombas cadastradas</h3><p>Adicione uma bomba de combustível</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.state.bombas.map(b => {
      const status = Formulas.verificarCombustivelBaixo(parseFloat(b.saldo_atual) || 0, this.state.config.alertaCombustivel);
      const statusClass = status === 'ok' ? 'status-active' : status === 'baixo' ? 'status-warning' : 'status-danger';
      const statusText = status === 'ok' ? 'Normal' : status === 'baixo' ? 'Baixo' : 'Crítico';
      return `
        <tr>
          <td><strong>${b.nome}</strong></td>
          <td>${Formulas.capitalize(b.tipo || 'Desconhecido')}</td>
          <td>${Formulas.formatNumber(b.saldo_atual, 0)} L</td>
          <td>${Formulas.formatDateTime(b.ultimo_abastecimento)}</td>
          <td>${Formulas.formatNumber(b.total_vendido, 0)} L</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td class="actions">
            <button class="btn-edit" onclick="App.showAbastecimentoModal('${b.id}')" title="Abastecer"><i class="fas fa-plus"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderMovCombustivelTable() {
    const tbody = document.querySelector('#table-mov-comb tbody');
    if (!tbody) return;

    if (this.state.movCombustivel.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell"><div class="empty-state"><p>Sem movimentações</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.state.movCombustivel.slice(0, 50).map(m => `
      <tr>
        <td>${Formulas.formatDateTime(m.created_at)}</td>
        <td><span class="status-badge ${m.tipo === 'entrada' ? 'status-active' : m.tipo === 'venda' ? 'status-info' : 'status-warning'}">${Formulas.capitalize(m.tipo)}</span></td>
        <td>${m.bomba_nome || '-'}</td>
        <td>${Formulas.formatNumber(m.litros, 2)} L</td>
        <td>${Formulas.formatCurrency(m.valor)}</td>
        <td>${m.observacao || '-'}</td>
      </tr>
    `).join('');
  },

  showAbastecimentoModal(bombaId = null) {
    const bombasOptions = this.state.bombas.map(b => 
      `<option value="${b.id}" data-saldo="${b.saldo_atual}" ${bombaId === b.id ? 'selected' : ''}>${b.nome} (${Formulas.capitalize(b.tipo)}) - ${Formulas.formatNumber(b.saldo_atual, 0)}L</option>`
    ).join('');

    this.openModal('Novo Abastecimento', `
      <form id="abastecimento-form">
        <div class="form-group">
          <label>Bomba *</label>
          <select id="ab-bomba" class="form-input" required>
            <option value="">Selecione...</option>
            ${bombasOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Litros *</label>
            <input type="number" id="ab-litros" class="form-input" step="0.01" min="0.1" required>
          </div>
          <div class="form-group">
            <label>Valor Total *</label>
            <input type="number" id="ab-valor" class="form-input" step="0.01" min="0" required>
          </div>
        </div>
        <div class="form-group">
          <label>Observação</label>
          <textarea id="ab-obs" class="form-textarea" rows="2">Abastecimento</textarea>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.confirmAbastecimento()">Confirmar</button>
    `);
  },

  async confirmAbastecimento() {
    const bombaId = document.getElementById('ab-bomba')?.value;
    const litros = parseFloat(document.getElementById('ab-litros')?.value) || 0;
    const valor = parseFloat(document.getElementById('ab-valor')?.value) || 0;
    const obs = document.getElementById('ab-obs')?.value || '';

    if (!bombaId || litros <= 0 || valor <= 0) { this.toast('Dados inválidos', 'error'); return; }

    const bomba = this.state.bombas.find(b => b.id === bombaId);
    if (!bomba) return;

    const novoSaldo = Math.max(0, (parseFloat(bomba.saldo_atual) || 0) - litros);
    const totalVendido = (parseFloat(bomba.total_vendido) || 0) + litros;

    this.openModal('Confirmar Abastecimento', `
      <div class="confirm-preview">
        <p><strong>Bomba:</strong> ${bomba.nome}</p>
        <p><strong>Litros:</strong> ${litros}</p>
        <p><strong>Valor:</strong> ${Formulas.formatCurrency(valor)}</p>
        <p><strong>Saldo Atual:</strong> ${Formulas.formatNumber(bomba.saldo_atual, 0)} L</p>
        <p><strong>Saldo Após:</strong> ${Formulas.formatNumber(novoSaldo, 0)} L</p>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="App.showAbastecimentoModal('${bombaId}')">Voltar</button>
      <button class="btn btn-primary" onclick="App.saveAbastecimento('${bombaId}', ${litros}, ${valor}, ${novoSaldo}, ${totalVendido}, '${obs}')">Confirmar</button>
    `);
  },

  async saveAbastecimento(bombaId, litros, valor, novoSaldo, totalVendido, obs) {
    const bomba = this.state.bombas.find(b => b.id === bombaId);
    await SupabaseAPI.update('bombas', bombaId, { saldo_atual: novoSaldo, total_vendido: totalVendido, ultimo_abastecimento: Formulas.getAgora() });
    bomba.saldo_atual = novoSaldo;
    bomba.total_vendido = totalVendido;
    bomba.ultimo_abastecimento = Formulas.getAgora();

    await SupabaseAPI.saveMovimentacaoCombustivel({
      tipo: 'venda', bomba_id: bombaId, bomba_nome: bomba.nome, litros, valor, observacao: obs,
      utilizador: this.state.currentUser?.email || 'Sistema'
    });

    await SupabaseAPI.saveCaixa({
      tipo: 'entrada', valor, descricao: `Venda combustível - ${bomba.nome}`, categoria: 'combustivel',
      utilizador: this.state.currentUser?.email || 'Sistema'
    });

    this.closeModal();
    this.toast('Abastecimento registado!', 'success');
    this.loadCombustivelPage();
    this.loadAllDataFresh();
  },

  showEntradaCombustivelModal() {
    const bombasOptions = this.state.bombas.map(b => 
      `<option value="${b.id}">${b.nome} (${Formulas.capitalize(b.tipo)})</option>`
    ).join('');

    this.openModal('Entrada de Combustível', `
      <form id="entrada-comb-form">
        <div class="form-group">
          <label>Bomba *</label>
          <select id="ent-bomba" class="form-input" required>
            <option value="">Selecione...</option>
            ${bombasOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Litros *</label>
            <input type="number" id="ent-litros" class="form-input" step="0.01" min="0.1" required>
          </div>
          <div class="form-group">
            <label>Custo Total</label>
            <input type="number" id="ent-custo" class="form-input" step="0.01" min="0">
          </div>
        </div>
        <div class="form-group">
          <label>Observação</label>
          <textarea id="ent-obs" class="form-textarea" rows="2">Entrada de combustível</textarea>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.saveEntradaCombustivel()">Confirmar</button>
    `);
  },

  async saveEntradaCombustivel() {
    const bombaId = document.getElementById('ent-bomba')?.value;
    const litros = parseFloat(document.getElementById('ent-litros')?.value) || 0;
    const custo = parseFloat(document.getElementById('ent-custo')?.value) || 0;
    const obs = document.getElementById('ent-obs')?.value || '';

    if (!bombaId || litros <= 0) { this.toast('Dados inválidos', 'error'); return; }

    const bomba = this.state.bombas.find(b => b.id === bombaId);
    const novoSaldo = (parseFloat(bomba.saldo_atual) || 0) + litros;

    await SupabaseAPI.update('bombas', bombaId, { saldo_atual: novoSaldo });
    bomba.saldo_atual = novoSaldo;

    await SupabaseAPI.saveMovimentacaoCombustivel({
      tipo: 'entrada', bomba_id: bombaId, bomba_nome: bomba.nome, litros, valor: custo, observacao: obs,
      utilizador: this.state.currentUser?.email || 'Sistema'
    });

    this.closeModal();
    this.toast('Entrada de combustível registada!', 'success');
    this.loadCombustivelPage();
  },

  /* === CAIXA === */
  
  loadCaixaPage() {
    this.renderCaixaTable();
    
    const hoje = Formulas.getHoje();
    const caixaHoje = this.state.caixa.filter(c => (c.created_at || c.data || '').startsWith(hoje));
    const entradas = caixaHoje.filter(c => c.tipo === 'entrada').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saidas = caixaHoje.filter(c => c.tipo === 'saida').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saldo = entradas - saidas;

    document.getElementById('kpi-entradas-caixa').textContent = Formulas.formatCurrency(entradas);
    document.getElementById('kpi-saidas-caixa').textContent = Formulas.formatCurrency(saidas);
    document.getElementById('kpi-saldo-caixa').textContent = Formulas.formatCurrency(saldo);

    document.getElementById('btn-abrir-caixa').onclick = () => this.showCaixaModal('entrada');
    document.getElementById('btn-movimento-caixa').onclick = () => this.showCaixaModal('saida');
    document.getElementById('btn-exportar-caixa').onclick = () => this.exportData('caixa');
  },

  renderCaixaTable() {
    const tbody = document.querySelector('#table-caixa tbody');
    if (!tbody) return;

    if (this.state.caixa.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell"><div class="empty-state"><i class="fas fa-coins"></i><h3>Sem movimentações</h3></div></td></tr>';
      return;
    }

    let saldoAcumulado = 0;
    const caixaOrdenado = [...this.state.caixa].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    tbody.innerHTML = caixaOrdenado.slice(-50).reverse().map(c => {
      if (c.tipo === 'entrada') saldoAcumulado += parseFloat(c.valor) || 0;
      else saldoAcumulado -= parseFloat(c.valor) || 0;

      return `
        <tr>
          <td>${Formulas.formatDateTime(c.created_at)}</td>
          <td><span class="status-badge ${c.tipo === 'entrada' ? 'status-active' : 'status-danger'}">${c.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
          <td>${c.descricao || '-'}</td>
          <td style="color:var(--success);font-weight:600">${c.tipo === 'entrada' ? Formulas.formatCurrency(c.valor) : '-'}</td>
          <td style="color:var(--danger);font-weight:600">${c.tipo === 'saida' ? Formulas.formatCurrency(c.valor) : '-'}</td>
          <td style="font-weight:700">${Formulas.formatCurrency(saldoAcumulado)}</td>
          <td>${c.utilizador || '-'}</td>
          <td class="actions">
            <button class="btn-delete" onclick="App.deleteCaixa('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  showCaixaModal(tipo = 'entrada') {
    const titulo = tipo === 'entrada' ? 'Entrada no Caixa' : 'Saída do Caixa';
    this.openModal(titulo, `
      <form id="caixa-form">
        <input type="hidden" id="cx-tipo" value="${tipo}">
        <div class="form-group">
          <label>Valor (MT) *</label>
          <input type="number" id="cx-valor" class="form-input" step="0.01" min="0.01" required>
        </div>
        <div class="form-group">
          <label>Descrição *</label>
          <input type="text" id="cx-desc" class="form-input" required placeholder="Ex: Venda, Despesa, etc.">
        </div>
        <div class="form-group">
          <label>Categoria</label>
          <select id="cx-cat" class="form-input">
            <option value="geral">Geral</option>
            <option value="venda">Venda</option>
            <option value="combustivel">Combustível</option>
            <option value="despesa">Despesa</option>
            <option value="salario">Salário</option>
            <option value="outro">Outro</option>
          </select>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.saveCaixa()">Confirmar ${tipo === 'entrada' ? 'Entrada' : 'Saída'}</button>
    `);
  },

  async saveCaixa() {
    const tipo = document.getElementById('cx-tipo')?.value;
    const valor = parseFloat(document.getElementById('cx-valor')?.value) || 0;
    const descricao = document.getElementById('cx-desc')?.value?.trim();
    const categoria = document.getElementById('cx-cat')?.value || 'geral';

    if (valor <= 0 || !descricao) { this.toast('Preencha todos os campos obrigatórios', 'error'); return; }

    const mov = { tipo, valor, descricao, categoria, utilizador: this.state.currentUser?.email || 'Sistema' };
    const result = await SupabaseAPI.saveCaixa(mov);
    
    if (result.error) { this.toast('Erro ao registar', 'error'); return; }
    
    this.state.caixa.unshift(result.data);
    this.closeModal();
    this.toast(`${tipo === 'entrada' ? 'Entrada' : 'Saída'} registada!`, 'success');
    this.loadCaixaPage();
  },

  async deleteCaixa(id) {
    if (!confirm('Eliminar esta movimentação?')) return;
    await SupabaseAPI.delete('caixa', id);
    this.state.caixa = this.state.caixa.filter(c => c.id !== id);
    this.loadCaixaPage();
  },

  /* === PERDAS === */
  
  loadPerdasPage() {
    this.renderPerdasTable();
    document.getElementById('btn-registrar-perda').onclick = () => this.showPerdaModal();
    document.getElementById('btn-exportar-perdas').onclick = () => this.exportData('perdas');
  },

  renderPerdasTable(perdas = this.state.perdas) {
    const tbody = document.querySelector('#table-perdas tbody');
    if (!tbody) return;

    if (perdas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell"><div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Sem perdas registadas</h3></div></td></tr>';
      return;
    }

    tbody.innerHTML = perdas.map(p => `
      <tr>
        <td>${Formulas.formatDateTime(p.created_at)}</td>
        <td>${p.produto_nome || this.state.produtos.find(pr => pr.id === p.produto_id)?.nome || '-'}</td>
        <td>${p.quantidade}</td>
        <td>${Formulas.formatCurrency(p.valor)}</td>
        <td>${p.motivo || '-'}</td>
        <td>${p.local || '-'}</td>
        <td>${p.utilizador || '-'}</td>
        <td class="actions">
          <button class="btn-delete" onclick="App.deletePerda('${p.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  },

  showPerdaModal() {
    if (this.state.dayClosed) { this.toast('O dia está fechado.', 'warning'); return; }
    
    const produtosOptions = this.state.produtos.map(p => 
      `<option value="${p.id}" data-qtd="${p.quantidade}">${p.nome} (Disp: ${p.quantidade || 0})</option>`
    ).join('');

    this.openModal('Registrar Perda', `
      <form id="perda-form">
        <div class="form-group">
          <label>Produto *</label>
          <select id="perda-produto" class="form-input" required>
            <option value="">Selecione...</option>
            ${produtosOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Quantidade *</label>
            <input type="number" id="perda-qtd" class="form-input" min="1" required>
          </div>
          <div class="form-group">
            <label>Valor Estimado</label>
            <input type="number" id="perda-valor" class="form-input" step="0.01" min="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Motivo</label>
            <select id="perda-motivo" class="form-input">
              <option value="">Selecione...</option>
              <option value="avariado">Avariado</option>
              <option value="vencido">Vencido</option>
              <option value="quebrado">Quebrado</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div class="form-group">
            <label>Local</label>
            <select id="perda-local" class="form-input">
              <option value="loja">Loja</option>
              <option value="armazem">Armazém</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <textarea id="perda-desc" class="form-textarea" rows="2"></textarea>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-danger" onclick="App.confirmPerda()">Confirmar Perda</button>
    `);
  },

  async confirmPerda() {
    const prodId = document.getElementById('perda-produto')?.value;
    const qtd = parseFloat(document.getElementById('perda-qtd')?.value) || 0;
    const valor = parseFloat(document.getElementById('perda-valor')?.value) || 0;
    const motivo = document.getElementById('perda-motivo')?.value;
    const local = document.getElementById('perda-local')?.value;
    const desc = document.getElementById('perda-desc')?.value;

    if (!prodId || qtd <= 0) { this.toast('Dados inválidos', 'error'); return; }

    const produto = this.state.produtos.find(p => p.id === prodId);
    if (!produto) return;

    const qtdAtual = parseFloat(produto.quantidade) || 0;
    if (qtd > qtdAtual) { this.toast(`Estoque insuficiente. Disponível: ${qtdAtual}`, 'error'); return; }

    this.openModal('Confirmar Perda', `
      <div class="confirm-preview">
        <p><strong>Produto:</strong> ${produto.nome}</p>
        <p><strong>Quantidade:</strong> ${qtd}</p>
        <p><strong>Motivo:</strong> ${motivo || 'Não especificado'}</p>
        <p><strong>Local:</strong> ${local === 'loja' ? 'Loja' : 'Armazém'}</p>
        <p class="form-hint">Esta operação reduzirá o estoque permanentemente.</p>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="App.showPerdaModal()">Voltar</button>
      <button class="btn btn-danger" onclick="App.savePerda('${prodId}', ${qtd}, ${valor}, '${motivo}', '${local}', '${desc}')">Confirmar Perda</button>
    `);
  },

  async savePerda(prodId, qtd, valor, motivo, local, desc) {
    const produto = this.state.produtos.find(p => p.id === prodId);
    const novaQtd = Math.max(0, (parseFloat(produto.quantidade) || 0) - qtd);
    
    await SupabaseAPI.update('produtos', prodId, { quantidade: novaQtd });
    produto.quantidade = novaQtd;

    const perda = {
      produto_id: prodId, produto_nome: produto.nome, quantidade: qtd, valor,
      motivo, local, descricao: desc,
      utilizador: this.state.currentUser?.email || 'Sistema'
    };

    await SupabaseAPI.savePerda(perda);
    await this.registrarMovimentacao('perda', prodId, produto.nome, qtd, produto.quantidade + qtd, novaQtd, `Perda: ${motivo}`);

    this.state.perdas.unshift(perda);
    this.closeModal();
    this.toast('Perda registada!', 'success');
    this.loadPerdasPage();
    this.generateInventario();
    this.updateKPIs();
  },

  async deletePerda(id) {
    if (!confirm('Eliminar registro de perda?')) return;
    await SupabaseAPI.delete('perdas', id);
    this.state.perdas = this.state.perdas.filter(p => p.id !== id);
    this.loadPerdasPage();
  },

  /* === ROUBOS === */
  
  loadRoubosPage() {
    this.renderRoubosTable();
    document.getElementById('btn-registrar-roubo').onclick = () => this.showRouboModal();
    document.getElementById('btn-exportar-roubos').onclick = () => this.exportData('roubos');
  },

  renderRoubosTable(roubos = this.state.roubos) {
    const tbody = document.querySelector('#table-roubos tbody');
    if (!tbody) return;

    if (roubos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell"><div class="empty-state"><i class="fas fa-shield-alt"></i><h3>Sem roubos registados</h3></div></td></tr>';
      return;
    }

    tbody.innerHTML = roubos.map(r => `
      <tr>
        <td>${Formulas.formatDateTime(r.created_at)}</td>
        <td>${r.produto_nome || this.state.produtos.find(p => p.id === r.produto_id)?.nome || '-'}</td>
        <td>${r.quantidade}</td>
        <td>${Formulas.formatCurrency(r.valor)}</td>
        <td>${r.descricao || '-'}</td>
        <td>${r.local || '-'}</td>
        <td>${r.utilizador || '-'}</td>
        <td class="actions">
          <button class="btn-delete" onclick="App.deleteRoubo('${r.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  },

  showRouboModal() {
    if (this.state.dayClosed) { this.toast('O dia está fechado.', 'warning'); return; }
    
    const produtosOptions = this.state.produtos.map(p => 
      `<option value="${p.id}">${p.nome}</option>`
    ).join('');

    this.openModal('Registrar Roubo', `
      <form id="roubo-form">
        <div class="form-group">
          <label>Produto *</label>
          <select id="roubo-produto" class="form-input" required>
            <option value="">Selecione...</option>
            ${produtosOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Quantidade *</label>
            <input type="number" id="roubo-qtd" class="form-input" min="1" required>
          </div>
          <div class="form-group">
            <label>Valor Estimado</label>
            <input type="number" id="roubo-valor" class="form-input" step="0.01" min="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Local</label>
            <select id="roubo-local" class="form-input">
              <option value="loja">Loja</option>
              <option value="armazem">Armazém</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data do Ocorrido</label>
            <input type="datetime-local" id="roubo-data" class="form-input">
          </div>
        </div>
        <div class="form-group">
          <label>Descrição / Detalhes *</label>
          <textarea id="roubo-desc" class="form-textarea" rows="3" placeholder="Descreva o ocorrido..." required></textarea>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-danger" onclick="App.confirmRoubo()">Confirmar Roubo</button>
    `);
  },

  async confirmRoubo() {
    const prodId = document.getElementById('roubo-produto')?.value;
    const qtd = parseFloat(document.getElementById('roubo-qtd')?.value) || 0;
    const valor = parseFloat(document.getElementById('roubo-valor')?.value) || 0;
    const local = document.getElementById('roubo-local')?.value;
    const desc = document.getElementById('roubo-desc')?.value;

    if (!prodId || qtd <= 0 || !desc) { this.toast('Preencha todos os campos obrigatórios', 'error'); return; }

    const produto = this.state.produtos.find(p => p.id === prodId);
    const novaQtd = Math.max(0, (parseFloat(produto.quantidade) || 0) - qtd);

    await SupabaseAPI.update('produtos', prodId, { quantidade: novaQtd });
    produto.quantidade = novaQtd;

    const roubo = {
      produto_id: prodId, produto_nome: produto.nome, quantidade: qtd, valor,
      local, descricao: desc,
      utilizador: this.state.currentUser?.email || 'Sistema'
    };

    await SupabaseAPI.saveRoubo(roubo);
    await this.registrarMovimentacao('roubo', prodId, produto.nome, qtd, produto.quantidade + qtd, novaQtd, `Roubo: ${desc.substring(0, 50)}`);

    this.state.roubos.unshift(roubo);
    this.closeModal();
    this.toast('Roubo registado!', 'success');
    this.loadRoubosPage();
    this.generateInventario();
    this.updateKPIs();
  },

  async deleteRoubo(id) {
    if (!confirm('Eliminar registro de roubo?')) return;
    await SupabaseAPI.delete('roubos', id);
    this.state.roubos = this.state.roubos.filter(r => r.id !== id);
    this.loadRoubosPage();
  },

  /* === TRANSFERÊNCIAS === */
  
  loadTransferenciasPage() {
    this.renderTransferenciasTable();
    document.getElementById('btn-nova-transferencia').onclick = () => this.showTransferenciaModal();
  },

  renderTransferenciasTable() {
    const tbody = document.querySelector('#table-transferencias tbody');
    if (!tbody) return;

    if (this.state.transferencias.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell"><div class="empty-state"><i class="fas fa-exchange-alt"></i><h3>Sem transferências</h3></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.state.transferencias.map(t => `
      <tr>
        <td>${Formulas.formatDateTime(t.created_at)}</td>
        <td>${t.produto_nome || '-'}</td>
        <td>${t.de === 'armazem' ? 'Armazém' : 'Loja'}</td>
        <td>${t.para === 'loja' ? 'Loja' : 'Armazém'}</td>
        <td>${t.quantidade}</td>
        <td>${t.utilizador || '-'}</td>
        <td><span class="status-badge status-active">Concluída</span></td>
        <td class="actions">
          <button class="btn-edit" onclick="App.viewTransferencia('${t.id}')" title="Ver"><i class="fas fa-eye"></i></button>
        </td>
      </tr>
    `).join('');
  },

  viewTransferencia(id) {
    const t = this.state.transferencias.find(tr => tr.id === id);
    if (!t) return;
    this.openModal('Detalhes da Transferência', `
      <p><strong>Produto:</strong> ${t.produto_nome || '-'}</p>
      <p><strong>De:</strong> ${t.de === 'armazem' ? 'Armazém' : 'Loja'}</p>
      <p><strong>Para:</strong> ${t.para === 'loja' ? 'Loja' : 'Armazém'}</p>
      <p><strong>Quantidade:</strong> ${t.quantidade}</p>
      <p><strong>Observação:</strong> ${t.observacao || '-'}</p>
      <p><strong>Utilizador:</strong> ${t.utilizador || '-'}</p>
      <p><strong>Data:</strong> ${Formulas.formatDateTime(t.created_at)}</p>
    `, '<button class="btn btn-secondary" onclick="App.closeModal()">Fechar</button>');
  },


  /* === RECONCILIAÇÃO === */
  
  async reconciliarSistema() {
    if (this.state.dayClosed) { this.toast('O dia já está fechado.', 'warning'); return; }
    
    this.showLoading('A reconciliar sistema...');
    await new Promise(r => setTimeout(r, 800));

    const hoje = Formulas.getHoje();
    const vendasDia = this.state.vendas.filter(v => (v.created_at || '').startsWith(hoje));
    const perdasDia = this.state.perdas.filter(p => (p.created_at || '').startsWith(hoje));
    const roubosDia = this.state.roubos.filter(r => (r.created_at || '').startsWith(hoje));
    const transfDia = this.state.transferencias.filter(t => (t.created_at || '').startsWith(hoje));
    const caixaDia = this.state.caixa.filter(c => (c.created_at || '').startsWith(hoje));
    const combDia = this.state.movCombustivel.filter(m => (m.created_at || '').startsWith(hoje));

    const totalVendas = vendasDia.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    const totalPerdas = perdasDia.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    const totalRoubos = roubosDia.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
    const totalComb = combDia.filter(m => m.tipo === 'venda').reduce((s, m) => s + (parseFloat(m.valor) || 0), 0);
    const entradasCaixa = caixaDia.filter(c => c.tipo === 'entrada').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saidasCaixa = caixaDia.filter(c => c.tipo === 'saida').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saldoReal = entradasCaixa - saidasCaixa;
    const diferenca = Math.abs(saldoReal - totalVendas - totalComb);

    this.hideLoading();

    // Mostrar resultado
    document.getElementById('reconciliacao-result').classList.remove('hidden');
    
    document.getElementById('reconciliacao-status').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px">
        <i class="fas fa-check-circle" style="font-size:48px;color:var(--success)"></i>
        <div>
          <h3 style="font-size:20px;margin-bottom:4px">Reconciliação Concluída</h3>
          <p style="color:var(--gray-500)">Dados verificados em ${Formulas.formatDateTime(Formulas.getAgora())}</p>
          ${diferenca > 0.01 ? `<p style="color:var(--warning);font-weight:600"><i class="fas fa-exclamation-triangle"></i> Diferença detectada: ${Formulas.formatCurrency(diferenca)}</p>` : '<p style="color:var(--success);font-weight:600"><i class="fas fa-check"></i> Tudo reconciliado</p>'}
        </div>
      </div>
    `;

    document.getElementById('reconc-loja').innerHTML = `
      <p><strong>Total em Vendas:</strong> ${Formulas.formatCurrency(totalVendas)}</p>
      <p><strong>Nº de Vendas:</strong> ${vendasDia.length}</p>
      <p><strong>Produtos Vendidos:</strong> ${vendasDia.reduce((s, v) => s + (v.itens?.length || 0), 0)}</p>
    `;

    document.getElementById('reconc-armazem').innerHTML = `
      <p><strong>Produtos em Stock:</strong> ${this.state.inventario.length}</p>
      <p><strong>Valor Total:</strong> ${Formulas.formatCurrency(this.state.inventario.reduce((s, i) => s + (parseFloat(i.valor_total) || 0), 0))}</p>
      <p><strong>Estoque Baixo:</strong> ${this.state.inventario.filter(i => i.status !== 'ok').length}</p>
    `;

    document.getElementById('reconc-perdas').innerHTML = `
      <p><strong>Total em Perdas:</strong> ${Formulas.formatCurrency(totalPerdas)}</p>
      <p><strong>Nº de Registros:</strong> ${perdasDia.length}</p>
      <p><strong>Quantidade:</strong> ${perdasDia.reduce((s, p) => s + (parseFloat(p.quantidade) || 0), 0)}</p>
    `;

    document.getElementById('reconc-roubos').innerHTML = `
      <p><strong>Total em Roubos:</strong> ${Formulas.formatCurrency(totalRoubos)}</p>
      <p><strong>Nº de Registros:</strong> ${roubosDia.length}</p>
      <p><strong>Quantidade:</strong> ${roubosDia.reduce((s, r) => s + (parseFloat(r.quantidade) || 0), 0)}</p>
    `;

    document.getElementById('reconc-resumo').innerHTML = `
      <div class="kpi-grid three" style="margin-bottom:0">
        <div class="kpi-card" style="margin-bottom:0">
          <div class="kpi-icon bg-green"><i class="fas fa-arrow-down"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Entradas Caixa</span>
            <span class="kpi-value">${Formulas.formatCurrency(entradasCaixa)}</span>
          </div>
        </div>
        <div class="kpi-card" style="margin-bottom:0">
          <div class="kpi-icon bg-red"><i class="fas fa-arrow-up"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Saídas Caixa</span>
            <span class="kpi-value">${Formulas.formatCurrency(saidasCaixa)}</span>
          </div>
        </div>
        <div class="kpi-card" style="margin-bottom:0">
          <div class="kpi-icon bg-gold"><i class="fas fa-balance-scale"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Saldo Real</span>
            <span class="kpi-value">${Formulas.formatCurrency(saldoReal)}</span>
          </div>
        </div>
      </div>
      <hr style="margin:20px 0;border:none;border-top:1px solid var(--gray-200)">
      <div class="form-row">
        <div style="text-align:center;flex:1">
          <p style="font-size:12px;color:var(--gray-500)">Lucro Real (Vendas)</p>
          <p style="font-size:22px;font-weight:800;color:var(--primary)">${Formulas.formatCurrency(totalVendas)}</p>
        </div>
        <div style="text-align:center;flex:1">
          <p style="font-size:12px;color:var(--gray-500)">Combustível</p>
          <p style="font-size:22px;font-weight:800;color:var(--orange)">${Formulas.formatCurrency(totalComb)}</p>
        </div>
        <div style="text-align:center;flex:1">
          <p style="font-size:12px;color:var(--gray-500)">Prejuízo (Perdas+Roubos)</p>
          <p style="font-size:22px;font-weight:800;color:var(--danger)">${Formulas.formatCurrency(totalPerdas + totalRoubos)}</p>
        </div>
      </div>
    `;

    // Guardar reconciliação
    await SupabaseAPI.insert('reconciliacoes', {
      data: hoje, total_vendas: totalVendas, total_perdas: totalPerdas,
      total_roubos: totalRoubos, total_combustivel: totalComb,
      saldo_real: saldoReal, diferenca, utilizador: this.state.currentUser?.email || 'Sistema'
    });

    this.toast('Reconciliação concluída!', 'success');
  },

  /* === FECHAMENTO DO DIA === */
  
  async fecharDia() {
    if (this.state.dayClosed) { this.toast('O dia já está fechado!', 'warning'); return; }
    
    if (!confirm('ATENÇÃO: O fechamento do dia é irreversível.\n\nDeseja continuar?')) return;
    
    this.showLoading('A fechar o dia...');
    await new Promise(r => setTimeout(r, 1000));

    const hoje = Formulas.getHoje();
    const vendasDia = this.state.vendas.filter(v => (v.created_at || '').startsWith(hoje));
    const perdasDia = this.state.perdas.filter(p => (p.created_at || '').startsWith(hoje));
    const roubosDia = this.state.roubos.filter(r => (r.created_at || '').startsWith(hoje));
    const caixaDia = this.state.caixa.filter(c => (c.created_at || '').startsWith(hoje));
    const combDia = this.state.movCombustivel.filter(m => (m.created_at || '').startsWith(hoje));

    const totalVendas = vendasDia.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    const totalPerdas = perdasDia.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    const totalRoubos = roubosDia.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
    const totalComb = combDia.filter(m => m.tipo === 'venda').reduce((s, m) => s + (parseFloat(m.valor) || 0), 0);
    const entradas = caixaDia.filter(c => c.tipo === 'entrada').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saidas = caixaDia.filter(c => c.tipo === 'saida').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);

    const fechamento = {
      data: hoje,
      total_vendas: totalVendas,
      num_vendas: vendasDia.length,
      total_perdas: totalPerdas,
      num_perdas: perdasDia.length,
      total_roubos: totalRoubos,
      num_roubos: roubosDia.length,
      total_combustivel: totalComb,
      entradas_caixa: entradas,
      saidas_caixa: saidas,
      saldo_final: entradas - saidas,
      produtos_inventario: this.state.inventario.length,
      valor_inventario: this.state.inventario.reduce((s, i) => s + (parseFloat(i.valor_total) || 0), 0),
      status: 'fechado',
      utilizador: this.state.currentUser?.email || 'Sistema'
    };

    await SupabaseAPI.saveFechamento(fechamento);
    this.state.fechamentos.unshift(fechamento);
    this.state.dayClosed = true;

    this.hideLoading();
    this.renderFechamentoResumo(fechamento);
    this.checkDayStatus();
    this.toast('Dia fechado com sucesso!', 'success');
  },

  renderFechamentoResumo(f) {
    document.getElementById('fechamento-resumo').classList.remove('hidden');
    
    document.getElementById('fecha-vendas').innerHTML = `
      <p><strong>Total:</strong> ${Formulas.formatCurrency(f.total_vendas)}</p>
      <p><strong>Nº Vendas:</strong> ${f.num_vendas}</p>
      <p><strong>Média/Venda:</strong> ${Formulas.formatCurrency(f.num_vendas > 0 ? f.total_vendas / f.num_vendas : 0)}</p>
    `;
    document.getElementById('fecha-armazem').innerHTML = `
      <p><strong>Produtos:</strong> ${f.produtos_inventario}</p>
      <p><strong>Valor em Stock:</strong> ${Formulas.formatCurrency(f.valor_inventario)}</p>
    `;
    document.getElementById('fecha-perdas').innerHTML = `
      <p><strong>Valor:</strong> ${Formulas.formatCurrency(f.total_perdas)}</p>
      <p><strong>Ocorrências:</strong> ${f.num_perdas}</p>
    `;
    document.getElementById('fecha-roubos').innerHTML = `
      <p><strong>Valor:</strong> ${Formulas.formatCurrency(f.total_roubos)}</p>
      <p><strong>Ocorrências:</strong> ${f.num_roubos}</p>
    `;
    document.getElementById('fecha-combustivel').innerHTML = `
      <p><strong>Total Vendas:</strong> ${Formulas.formatCurrency(f.total_combustivel)}</p>
    `;
    document.getElementById('fecha-caixa').innerHTML = `
      <p><strong>Entradas:</strong> ${Formulas.formatCurrency(f.entradas_caixa)}</p>
      <p><strong>Saídas:</strong> ${Formulas.formatCurrency(f.saidas_caixa)}</p>
      <p><strong>Saldo Final:</strong> ${Formulas.formatCurrency(f.saldo_final)}</p>
    `;
    document.getElementById('fecha-resumo').innerHTML = `
      <div class="kpi-grid three" style="margin-bottom:0">
        <div style="text-align:center">
          <p style="font-size:12px;color:var(--gray-500)">Receita Total</p>
          <p style="font-size:24px;font-weight:800;color:var(--success)">${Formulas.formatCurrency(f.total_vendas + f.total_combustivel)}</p>
        </div>
        <div style="text-align:center">
          <p style="font-size:12px;color:var(--gray-500)">Despesas</p>
          <p style="font-size:24px;font-weight:800;color:var(--danger)">${Formulas.formatCurrency(f.total_perdas + f.total_roubos + f.saidas_caixa)}</p>
        </div>
        <div style="text-align:center">
          <p style="font-size:12px;color:var(--gray-500)">Saldo Líquido</p>
          <p style="font-size:24px;font-weight:800;color:var(--primary)">${Formulas.formatCurrency(f.saldo_final)}</p>
        </div>
      </div>
      <p style="text-align:center;margin-top:16px;color:var(--gray-500)">
        <i class="fas fa-lock"></i> Dia ${Formulas.formatDate(f.data)} - Fechado por ${f.utilizador}
      </p>
    `;
  },

  async iniciarNovoDia() {
    if (!this.state.dayClosed) {
      if (!confirm('O dia ainda não foi fechado. Deseja iniciar um novo dia mesmo assim?')) return;
    }
    
    this.showLoading('A preparar novo dia...');
    await new Promise(r => setTimeout(r, 800));

    this.state.dayClosed = false;
    this.checkDayStatus();
    document.getElementById('fechamento-resumo').classList.add('hidden');
    
    this.hideLoading();
    this.toast('Novo dia iniciado!', 'success');
    this.navigateTo('dashboard');
  },

  showFechamentoHistorico() {
    if (this.state.fechamentos.length === 0) {
      this.openModal('Histórico de Fechamentos', '<p>Sem fechamentos registados.</p>', '<button class="btn btn-secondary" onclick="App.closeModal()">Fechar</button>');
      return;
    }

    this.openModal('Histórico de Fechamentos', `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr><th>Data</th><th>Vendas</th><th>Perdas</th><th>Roubos</th><th>Saldo</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${this.state.fechamentos.map(f => `
              <tr>
                <td>${Formulas.formatDate(f.data)}</td>
                <td>${Formulas.formatCurrency(f.total_vendas)}</td>
                <td>${Formulas.formatCurrency(f.total_perdas)}</td>
                <td>${Formulas.formatCurrency(f.total_roubos)}</td>
                <td><strong>${Formulas.formatCurrency(f.saldo_final)}</strong></td>
                <td><span class="status-badge status-closed"><i class="fas fa-lock"></i> Fechado</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `, '<button class="btn btn-secondary" onclick="App.closeModal()">Fechar</button>', 'modal-lg');
  },

  showDayStatus() {
    const status = this.state.dayClosed ? 'fechado' : 'aberto';
    const icon = this.state.dayClosed ? 'fa-moon' : 'fa-sun';
    const color = this.state.dayClosed ? 'var(--danger)' : 'var(--success)';
    this.toast(`Dia ${Formulas.formatDate(Formulas.getHoje())}: ${status.toUpperCase()}`, this.state.dayClosed ? 'warning' : 'success');
  },

  /* === RELATÓRIOS === */
  
  currentReport: null,

  showReport(type) {
    this.currentReport = type;
    document.getElementById('report-viewer').classList.remove('hidden');
    
    const titles = {
      vendas: 'Relatório de Vendas', estoque: 'Relatório de Estoque',
      inventario: 'Relatório de Inventário', perdas: 'Relatório de Perdas',
      roubos: 'Relatório de Roubos', combustivel: 'Relatório de Combustível',
      caixa: 'Relatório de Caixa', lucro: 'Relatório de Lucro',
      reconciliacao: 'Relatório de Reconciliação'
    };
    document.getElementById('report-title').innerHTML = `<i class="fas fa-file-alt"></i> ${titles[type] || type}`;
    
    // Pre-definir datas
    const hoje = Formulas.getHoje();
    const inicioMes = hoje.substring(0, 8) + '01';
    document.getElementById('report-data-inicio').value = inicioMes;
    document.getElementById('report-data-fim').value = hoje;

    document.getElementById('btn-gerar-relatorio').onclick = () => this.gerarRelatorio();
    document.getElementById('btn-exportar-relatorio').onclick = () => this.exportRelatorio();
    
    // Scroll to viewer
    document.getElementById('report-viewer').scrollIntoView({ behavior: 'smooth' });
  },

  gerarRelatorio() {
    const inicio = document.getElementById('report-data-inicio')?.value;
    const fim = document.getElementById('report-data-fim')?.value;
    const type = this.currentReport;

    let dados = [];
    let html = '';

    switch (type) {
      case 'vendas':
        dados = this.state.vendas.filter(v => {
          const d = v.created_at || '';
          return (!inicio || d >= inicio + 'T00:00:00') && (!fim || d <= fim + 'T23:59:59');
        });
        html = this.gerarRelatorioVendas(dados);
        break;
      case 'estoque':
        html = this.gerarRelatorioEstoque();
        break;
      case 'inventario':
        html = this.gerarRelatorioInventario();
        break;
      case 'perdas':
        dados = this.state.perdas.filter(p => {
          const d = p.created_at || '';
          return (!inicio || d >= inicio + 'T00:00:00') && (!fim || d <= fim + 'T23:59:59');
        });
        html = this.gerarRelatorioPerdas(dados);
        break;
      case 'roubos':
        dados = this.state.roubos.filter(r => {
          const d = r.created_at || '';
          return (!inicio || d >= inicio + 'T00:00:00') && (!fim || d <= fim + 'T23:59:59');
        });
        html = this.gerarRelatorioRoubos(dados);
        break;
      case 'combustivel':
        dados = this.state.movCombustivel.filter(m => {
          const d = m.created_at || '';
          return (!inicio || d >= inicio + 'T00:00:00') && (!fim || d <= fim + 'T23:59:59');
        });
        html = this.gerarRelatorioCombustivel(dados);
        break;
      case 'caixa':
        dados = this.state.caixa.filter(c => {
          const d = c.created_at || '';
          return (!inicio || d >= inicio + 'T00:00:00') && (!fim || d <= fim + 'T23:59:59');
        });
        html = this.gerarRelatorioCaixa(dados);
        break;
      case 'lucro':
        dados = this.state.vendas.filter(v => {
          const d = v.created_at || '';
          return (!inicio || d >= inicio + 'T00:00:00') && (!fim || d <= fim + 'T23:59:59');
        });
        html = this.gerarRelatorioLucro(dados);
        break;
      default:
        html = '<p>Selecione um tipo de relatório.</p>';
    }

    document.getElementById('report-content').innerHTML = html;
  },

  gerarRelatorioVendas(vendas) {
    const total = vendas.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    const subtotal = vendas.reduce((s, v) => s + (parseFloat(v.subtotal) || 0), 0);
    const descontoTotal = subtotal - total;
    
    return `
      <div class="kpi-grid three" style="margin-bottom:20px">
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Nº Vendas</span><span class="kpi-value">${vendas.length}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Subtotal</span><span class="kpi-value">${Formulas.formatCurrency(subtotal)}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Total Líquido</span><span class="kpi-value">${Formulas.formatCurrency(total)}</span></div></div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Data</th><th>Itens</th><th>Subtotal</th><th>Desconto</th><th>Total</th></tr></thead>
          <tbody>${vendas.map(v => `<tr><td>${Formulas.formatDateTime(v.created_at)}</td><td>${v.itens?.length || 0}</td><td>${Formulas.formatCurrency(v.subtotal)}</td><td>${v.desconto || 0}%</td><td><strong>${Formulas.formatCurrency(v.total)}</strong></td></tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  },

  gerarRelatorioEstoque() {
    const totalValor = this.state.inventario.reduce((s, i) => s + (parseFloat(i.valor_total) || 0), 0);
    return `
      <div class="kpi-grid three" style="margin-bottom:20px">
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Total Produtos</span><span class="kpi-value">${this.state.inventario.length}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Valor Total</span><span class="kpi-value">${Formulas.formatCurrency(totalValor)}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Estoque Baixo</span><span class="kpi-value">${this.state.inventario.filter(i => i.status !== 'ok').length}</span></div></div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Produto</th><th>Código</th><th>Qtd</th><th>Custo</th><th>Valor Total</th><th>Status</th></tr></thead>
          <tbody>${this.state.inventario.map(i => `<tr><td>${i.nome}</td><td>${i.codigo || '-'}</td><td>${i.quantidade_atual}</td><td>${Formulas.formatCurrency(i.preco_compra)}</td><td>${Formulas.formatCurrency(i.valor_total)}</td><td><span class="status-badge ${i.status === 'ok' ? 'status-active' : 'status-warning'}">${i.status}</span></td></tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  },

  gerarRelatorioInventario() {
    return this.gerarRelatorioEstoque();
  },

  gerarRelatorioPerdas(perdas) {
    const total = perdas.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    return `
      <div class="kpi-grid three" style="margin-bottom:20px">
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Total Ocorrências</span><span class="kpi-value">${perdas.length}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Valor Total</span><span class="kpi-value">${Formulas.formatCurrency(total)}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Qtd Perdida</span><span class="kpi-value">${perdas.reduce((s, p) => s + (parseFloat(p.quantidade) || 0), 0)}</span></div></div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Valor</th><th>Motivo</th><th>Local</th></tr></thead>
          <tbody>${perdas.map(p => `<tr><td>${Formulas.formatDateTime(p.created_at)}</td><td>${p.produto_nome || '-'}</td><td>${p.quantidade}</td><td>${Formulas.formatCurrency(p.valor)}</td><td>${p.motivo || '-'}</td><td>${p.local || '-'}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  },

  gerarRelatorioRoubos(roubos) {
    const total = roubos.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
    return `
      <div class="kpi-grid three" style="margin-bottom:20px">
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Total Ocorrências</span><span class="kpi-value">${roubos.length}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Valor Total</span><span class="kpi-value">${Formulas.formatCurrency(total)}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Qtd Roubada</span><span class="kpi-value">${roubos.reduce((s, r) => s + (parseFloat(r.quantidade) || 0), 0)}</span></div></div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Valor</th><th>Local</th><th>Descrição</th></tr></thead>
          <tbody>${roubos.map(r => `<tr><td>${Formulas.formatDateTime(r.created_at)}</td><td>${r.produto_nome || '-'}</td><td>${r.quantidade}</td><td>${Formulas.formatCurrency(r.valor)}</td><td>${r.local || '-'}</td><td>${r.descricao || '-'}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  },

  gerarRelatorioCombustivel(movs) {
    const vendas = movs.filter(m => m.tipo === 'venda');
    const entradas = movs.filter(m => m.tipo === 'entrada');
    const totalVendas = vendas.reduce((s, m) => s + (parseFloat(m.valor) || 0), 0);
    const totalLitros = vendas.reduce((s, m) => s + (parseFloat(m.litros) || 0), 0);
    
    return `
      <div class="kpi-grid three" style="margin-bottom:20px">
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Total Vendas</span><span class="kpi-value">${Formulas.formatCurrency(totalVendas)}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Litros Vendidos</span><span class="kpi-value">${Formulas.formatNumber(totalLitros, 0)} L</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Entradas</span><span class="kpi-value">${entradas.reduce((s, m) => s + (parseFloat(m.litros) || 0), 0)} L</span></div></div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Data</th><th>Tipo</th><th>Bomba</th><th>Litros</th><th>Valor</th></tr></thead>
          <tbody>${movs.map(m => `<tr><td>${Formulas.formatDateTime(m.created_at)}</td><td><span class="status-badge ${m.tipo === 'entrada' ? 'status-active' : 'status-info'}">${Formulas.capitalize(m.tipo)}</span></td><td>${m.bomba_nome || '-'}</td><td>${m.litros}</td><td>${Formulas.formatCurrency(m.valor)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  },

  gerarRelatorioCaixa(caixa) {
    const entradas = caixa.filter(c => c.tipo === 'entrada').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saidas = caixa.filter(c => c.tipo === 'saida').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    
    return `
      <div class="kpi-grid three" style="margin-bottom:20px">
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Entradas</span><span class="kpi-value">${Formulas.formatCurrency(entradas)}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Saídas</span><span class="kpi-value">${Formulas.formatCurrency(saidas)}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Saldo</span><span class="kpi-value">${Formulas.formatCurrency(entradas - saidas)}</span></div></div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead>
          <tbody>${caixa.map(c => `<tr><td>${Formulas.formatDateTime(c.created_at)}</td><td><span class="status-badge ${c.tipo === 'entrada' ? 'status-active' : 'status-danger'}">${c.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td><td>${c.descricao || '-'}</td><td style="color:${c.tipo === 'entrada' ? 'var(--success)' : 'var(--danger)'};font-weight:700">${Formulas.formatCurrency(c.valor)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  },

  gerarRelatorioLucro(vendas) {
    let totalCusto = 0;
    let totalVenda = 0;
    
    vendas.forEach(v => {
      totalVenda += parseFloat(v.total) || 0;
      v.itens?.forEach(i => {
        const prod = this.state.produtos.find(p => p.id === i.produto_id);
        if (prod) totalCusto += (parseFloat(prod.preco_compra) || 0) * (parseFloat(i.quantidade) || 0);
      });
    });
    
    const lucro = totalVenda - totalCusto;
    const margem = totalVenda > 0 ? (lucro / totalVenda) * 100 : 0;
    
    return `
      <div class="kpi-grid three" style="margin-bottom:20px">
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Receita Total</span><span class="kpi-value">${Formulas.formatCurrency(totalVenda)}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Custo Total</span><span class="kpi-value">${Formulas.formatCurrency(totalCusto)}</span></div></div>
        <div class="kpi-card" style="margin-bottom:0"><div class="kpi-info"><span class="kpi-label">Lucro Líquido</span><span class="kpi-value" style="color:${lucro >= 0 ? 'var(--success)' : 'var(--danger)'}">${Formulas.formatCurrency(lucro)}</span></div></div>
      </div>
      <p style="text-align:center;font-size:18px;font-weight:700;color:var(--primary)">Margem de Lucro: ${margem.toFixed(1)}%</p>
      <div class="table-responsive" style="margin-top:20px">
        <table class="data-table">
          <thead><tr><th>Venda</th><th>Receita</th><th>Custo</th><th>Lucro</th></tr></thead>
          <tbody>${vendas.map(v => {
            const custo = v.itens?.reduce((s, i) => {
              const prod = this.state.produtos.find(p => p.id === i.produto_id);
              return s + ((parseFloat(prod?.preco_compra) || 0) * (parseFloat(i.quantidade) || 0));
            }, 0) || 0;
            const lucroV = (parseFloat(v.total) || 0) - custo;
            return `<tr><td>#${v.id?.slice(-6)}</td><td>${Formulas.formatCurrency(v.total)}</td><td>${Formulas.formatCurrency(custo)}</td><td style="color:${lucroV >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700">${Formulas.formatCurrency(lucroV)}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    `;
  },

  exportRelatorio() {
    const format = document.getElementById('report-export-format')?.value || 'pdf';
    const content = document.getElementById('report-content');
    if (!content || !this.currentReport) return;

    const title = document.getElementById('report-title')?.textContent || 'Relatorio';
    const inicio = document.getElementById('report-data-inicio')?.value || '';
    const fim = document.getElementById('report-data-fim')?.value || '';

    switch (format) {
      case 'pdf':
        this.exportToPDF(content.innerHTML, title, inicio, fim);
        break;
      case 'csv':
        this.exportReportToCSV(this.currentReport);
        break;
      case 'json':
        this.exportReportToJSON(this.currentReport);
        break;
      case 'xlsx':
        this.exportReportToXLSX(this.currentReport);
        break;
      default:
        this.toast(`Formato ${format.toUpperCase()} será baixado como HTML`, 'info');
        Formulas.downloadFile(content.innerText, `${title.replace(/\s/g, '_')}.txt`, 'text/plain');
    }
  },


  /* === IMPORT / EXPORT === */
  
  showImportModal(tipo) {
    this.openModal(`Importar ${Formulas.capitalize(tipo)}`, `
      <form id="import-form">
        <div class="form-group">
          <label>Arquivo (XLSX, CSV, JSON, XML, TXT, ODS, TSV)</label>
          <input type="file" id="import-file" class="form-input" accept=".xlsx,.xls,.csv,.json,.xml,.txt,.ods,.tsv" required>
        </div>
        <div class="form-group">
          <label>Formato Detectado</label>
          <input type="text" id="import-formato" class="form-input" readonly placeholder="Será detectado automaticamente">
        </div>
        <p class="form-hint">O sistema detectará o formato automaticamente e mostrará uma pré-visualização.</p>
        <div id="import-preview" style="display:none;margin-top:16px">
          <h4>Pré-visualização</h4>
          <div class="table-responsive" id="import-preview-table"></div>
        </div>
      </form>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.processImport('${tipo}')" id="btn-confirm-import" style="display:none">Confirmar Importação</button>
    `, 'modal-lg');

    document.getElementById('import-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) {
        const formato = Formulas.detectarFormatoArquivo(file.name);
        document.getElementById('import-formato').value = formato.toUpperCase();
        this.previewImport(file, formato);
      }
    });
  },

  async previewImport(file, formato) {
    try {
      let dados = [];
      const text = await file.text();
      
      switch (formato) {
        case 'csv':
        case 'tsv':
          dados = this.parseCSV(text);
          break;
        case 'json':
          dados = JSON.parse(text);
          break;
        case 'excel':
          const wb = XLSX.read(text, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          dados = XLSX.utils.sheet_to_json(ws);
          break;
        default:
          dados = this.parseCSV(text);
      }

      this._importData = dados;
      
      if (dados.length > 0) {
        const cols = Object.keys(dados[0]);
        document.getElementById('import-preview-table').innerHTML = `
          <table class="data-table">
            <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${dados.slice(0, 5).map(row => `<tr>${cols.map(c => `<td>${row[c] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          <p class="form-hint">Mostrando ${Math.min(5, dados.length)} de ${dados.length} registos</p>
        `;
        document.getElementById('import-preview').style.display = 'block';
        document.getElementById('btn-confirm-import').style.display = 'inline-flex';
      }
    } catch (err) {
      this.toast('Erro ao ler arquivo: ' + err.message, 'error');
    }
  },

  parseCSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => obj[h] = values[i] || '');
      return obj;
    });
  },

  async processImport(tipo) {
    const dados = this._importData || [];
    if (dados.length === 0) { this.toast('Nenhum dado para importar', 'error'); return; }

    let importados = 0;
    
    for (const row of dados) {
      try {
        if (tipo === 'produtos') {
          const produto = {
            nome: row.nome || row.Nome || row.NAME || '',
            categoria: row.categoria || row.Categoria || row.CATEGORY || 'Geral',
            preco_compra: parseFloat(row.preco_compra || row['Preço Compra'] || row.custo || 0),
            preco_venda: parseFloat(row.preco_venda || row['Preço Venda'] || row.preco || 0),
            quantidade: parseFloat(row.quantidade || row.Quantidade || row.stock || 0),
            unidade: row.unidade || row.Unidade || 'un',
            codigo: row.codigo || row.Código || Formulas.gerarCodigoProduto(row.nome || '', row.categoria || '')
          };
          if (produto.nome) {
            const result = await SupabaseAPI.saveProduto(produto);
            if (!result.error) importados++;
          }
        } else if (tipo === 'vendas') {
          // Importação de vendas requer estrutura específica
          this.toast('Importação de vendas requer formato específico', 'warning');
          break;
        }
      } catch (err) {
        console.warn('Erro ao importar linha:', err);
      }
    }

    this.closeModal();
    this.toast(`${importados} registos importados com sucesso!`, 'success');
    this.loadAllDataFresh();
  },

  exportData(tipo) {
    this.openModal('Exportar Dados', `
      <div class="form-group">
        <label>Formato</label>
        <select id="export-formato" class="form-input">
          <option value="csv">CSV</option>
          <option value="xlsx">XLSX (Excel)</option>
          <option value="json">JSON</option>
          <option value="xml">XML</option>
          <option value="pdf">PDF</option>
        </select>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="App.confirmExport('${tipo}')">Exportar</button>
    `);
  },

  async confirmExport(tipo) {
    const formato = document.getElementById('export-formato')?.value || 'csv';
    let dados = [];
    let nome = '';

    switch (tipo) {
      case 'produtos': dados = this.state.produtos; nome = 'produtos'; break;
      case 'vendas': dados = this.state.vendas; nome = 'vendas'; break;
      case 'armazem': dados = this.state.produtos; nome = 'armazem'; break;
      case 'caixa': dados = this.state.caixa; nome = 'caixa'; break;
      case 'perdas': dados = this.state.perdas; nome = 'perdas'; break;
      case 'roubos': dados = this.state.roubos; nome = 'roubos'; break;
      case 'combustivel': dados = this.state.movCombustivel; nome = 'combustivel'; break;
      case 'inventario': dados = this.state.inventario; nome = 'inventario'; break;
      default: dados = []; nome = 'dados';
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${nome}_${timestamp}`;

    switch (formato) {
      case 'csv':
        Formulas.downloadFile(Formulas.toCSV(dados), `${filename}.csv`, 'text/csv;charset=utf-8');
        break;
      case 'json':
        Formulas.downloadFile(JSON.stringify(dados, null, 2), `${filename}.json`, 'application/json');
        break;
      case 'xlsx':
        this.exportToXLSX(dados, filename);
        break;
      case 'pdf':
        this.exportToPDFTable(dados, nome, filename);
        break;
      case 'xml':
        Formulas.downloadFile(this.toXML(dados, nome), `${filename}.xml`, 'application/xml');
        break;
      default:
        Formulas.downloadFile(Formulas.toCSV(dados), `${filename}.csv`, 'text/csv');
    }

    this.closeModal();
    this.toast(`Dados exportados em ${formato.toUpperCase()}`, 'success');
  },

  exportToXLSX(dados, filename) {
    try {
      const ws = XLSX.utils.json_to_sheet(dados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dados');
      XLSX.writeFile(wb, `${filename}.xlsx`);
    } catch {
      this.toast('Biblioteca XLSX não disponível, exportando como CSV', 'warning');
      Formulas.downloadFile(Formulas.toCSV(dados), `${filename}.csv`, 'text/csv');
    }
  },

  exportToPDFTable(dados, title, filename) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(title.toUpperCase(), 14, 20);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${Formulas.formatDateTime(Formulas.getAgora())}`, 14, 30);
      
      let y = 45;
      if (dados.length > 0) {
        const cols = Object.keys(dados[0]).slice(0, 6);
        cols.forEach((col, i) => {
          doc.text(String(col).substring(0, 15), 14 + (i * 30), y);
        });
        y += 10;
        doc.line(10, y - 5, 200, y - 5);
        
        dados.slice(0, 50).forEach(row => {
          if (y > 270) { doc.addPage(); y = 20; }
          cols.forEach((col, i) => {
            doc.text(String(row[col] ?? '').substring(0, 15), 14 + (i * 30), y);
          });
          y += 7;
        });
      }
      
      doc.save(`${filename}.pdf`);
    } catch {
      this.toast('Biblioteca PDF não disponível', 'error');
    }
  },

  exportToPDF(htmlContent, title, inicio, fim) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(title, 14, 20);
      doc.setFontSize(10);
      if (inicio) doc.text(`Período: ${inicio} a ${fim}`, 14, 30);
      doc.text(`Gerado em: ${Formulas.formatDateTime(Formulas.getAgora())}`, 14, 38);
      
      // Adicionar conteúdo simplificado
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      const text = tempDiv.innerText;
      const lines = doc.splitTextToSize(text, 180);
      
      let y = 50;
      lines.forEach(line => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(line, 14, y);
        y += 6;
      });
      
      doc.save(`${title.replace(/\s/g, '_')}.pdf`);
    } catch {
      this.toast('Erro ao gerar PDF', 'error');
    }
  },

  exportReportToCSV(tipo) {
    let dados = [];
    switch (tipo) {
      case 'vendas': dados = this.state.vendas; break;
      case 'estoque': case 'inventario': dados = this.state.inventario; break;
      case 'perdas': dados = this.state.perdas; break;
      case 'roubos': dados = this.state.roubos; break;
      case 'combustivel': dados = this.state.movCombustivel; break;
      case 'caixa': dados = this.state.caixa; break;
      case 'lucro': dados = this.state.vendas; break;
    }
    Formulas.downloadFile(Formulas.toCSV(dados), `relatorio_${tipo}.csv`, 'text/csv;charset=utf-8');
  },

  exportReportToJSON(tipo) {
    let dados = [];
    switch (tipo) {
      case 'vendas': dados = this.state.vendas; break;
      case 'estoque': case 'inventario': dados = this.state.inventario; break;
      case 'perdas': dados = this.state.perdas; break;
      case 'roubos': dados = this.state.roubos; break;
      case 'combustivel': dados = this.state.movCombustivel; break;
      case 'caixa': dados = this.state.caixa; break;
    }
    Formulas.downloadFile(JSON.stringify(dados, null, 2), `relatorio_${tipo}.json`, 'application/json');
  },

  exportReportToXLSX(tipo) {
    let dados = [];
    switch (tipo) {
      case 'vendas': dados = this.state.vendas; break;
      case 'estoque': case 'inventario': dados = this.state.inventario; break;
      case 'perdas': dados = this.state.perdas; break;
      case 'roubos': dados = this.state.roubos; break;
      case 'combustivel': dados = this.state.movCombustivel; break;
      case 'caixa': dados = this.state.caixa; break;
    }
    this.exportToXLSX(dados, `relatorio_${tipo}`);
  },

  toXML(dados, rootName) {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;
    dados.forEach(item => {
      xml += '  <item>\n';
      Object.entries(item).forEach(([key, val]) => {
        xml += `    <${key}>${String(val ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</${key}>\n`;
      });
      xml += '  </item>\n';
    });
    xml += `</${rootName}>`;
    return xml;
  },

  /* === CONFIGURAÇÕES === */
  
  saveSupabaseConfig() {
    const url = document.getElementById('config-supabase-url')?.value?.trim();
    const key = document.getElementById('config-supabase-key')?.value?.trim();
    
    if (!url || !key) { this.toast('Preencha URL e Key', 'error'); return; }
    
    SupabaseAPI.setConfig(url, key).then(() => {
      this.toast('Configuração Salva! Testando conexão...', 'success');
      this.testSupabaseConnection();
    });
  },

  async testSupabaseConnection() {
    this.showLoading('A testar conexão...');
    const ok = await SupabaseAPI.testConnection();
    this.hideLoading();
    
    if (ok) {
      this.toast('Conexão com Supabase OK!', 'success');
      document.getElementById('sync-status').innerHTML = '<i class="fas fa-wifi"></i><span>Online</span>';
      document.getElementById('sync-status').classList.remove('offline');
    } else {
      this.toast('Falha na conexão. Verifique as credenciais.', 'error');
      document.getElementById('sync-status').innerHTML = '<i class="fas fa-wifi-slash"></i><span>Offline</span>';
      document.getElementById('sync-status').classList.add('offline');
    }
  },

  saveGeneralConfig() {
    const nome = document.getElementById('config-nome-loja')?.value?.trim();
    const estoqueMin = parseFloat(document.getElementById('config-estoque-minimo')?.value) || 10;
    const alertaComb = parseFloat(document.getElementById('config-alerta-combustivel')?.value) || 500;
    
    this.state.config = { nomeLoja: nome || this.state.config.nomeLoja, estoqueMinimo: estoqueMin, alertaCombustivel: alertaComb };
    Formulas.storageSet('app_config', this.state.config);
    
    if (nome) document.title = `${nome} - Shop Administration`;
    this.toast('Configurações salvas!', 'success');
  },

  clearLocalData() {
    if (!confirm('Limpar todos os dados locais?\n\nOs dados no Supabase não serão afetados.')) return;
    
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('table_') || key === 'sync_queue') {
        localStorage.removeItem(key);
      }
    });
    this.toast('Dados locais limpos', 'success');
  },

  clearAllData() {
    if (!confirm('ATENÇÃO: Isto eliminará TODOS os dados locais!\n\nEsta ação não pode ser desfeita.')) return;
    if (!confirm('TEM CERTEZA? Todos os dados serão perdidos!')) return;
    
    localStorage.clear();
    this.toast('Todos os dados eliminados. Recarregue a página.', 'success');
  },

  /* === GLOBAL SEARCH === */
  
  handleGlobalSearch(query) {
    if (!query || query.length < 2) return;
    
    const q = query.toLowerCase();
    const resultados = [];
    
    // Procurar produtos
    this.state.produtos.forEach(p => {
      if (p.nome?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q)) {
        resultados.push({ tipo: 'Produto', nome: p.nome, codigo: p.codigo, id: p.id });
      }
    });
    
    if (resultados.length > 0) {
      this.openModal(`Resultados para "${query}"`, `
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Tipo</th><th>Nome</th><th>Código</th></tr></thead>
            <tbody>
              ${resultados.slice(0, 10).map(r => `
                <tr style="cursor:pointer" onclick="App.navigateTo('produtos');App.closeModal()">
                  <td><span class="status-badge status-info">${r.tipo}</span></td>
                  <td>${r.nome}</td>
                  <td>${r.codigo || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `, '<button class="btn btn-secondary" onclick="App.closeModal()">Fechar</button>');
    }
  },

  /* === NOTIFICATIONS === */
  
  showNotifications() {
    const notifs = [];
    
    // Estoque baixo
    const estoqueBaixo = this.state.inventario.filter(i => i.status === 'baixo' || i.status === 'critico' || i.status === 'zerado');
    estoqueBaixo.forEach(p => {
      notifs.push({ tipo: 'warning', msg: `Estoque ${p.status}: ${p.nome} (${p.quantidade_atual} un)` });
    });
    
    // Combustível baixo
    this.state.bombas.forEach(b => {
      const status = Formulas.verificarCombustivelBaixo(parseFloat(b.saldo_atual) || 0, this.state.config.alertaCombustivel);
      if (status !== 'ok') {
        notifs.push({ tipo: 'warning', msg: `Combustível ${status}: ${b.nome} (${b.saldo_atual} L)` });
      }
    });
    
    // Dia fechado
    if (this.state.dayClosed) {
      notifs.push({ tipo: 'info', msg: 'O dia atual está fechado. Inicie um novo dia para continuar operações.' });
    }

    // Atualizar badge
    document.getElementById('notif-badge').textContent = notifs.length;

    if (notifs.length === 0) {
      this.openModal('Notificações', '<p>Sem notificações.</p>', '<button class="btn btn-secondary" onclick="App.closeModal()">Fechar</button>');
      return;
    }

    this.openModal(`Notificações (${notifs.length})`, `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${notifs.map(n => `
          <div style="padding:12px 16px;border-radius:8px;background:${n.tipo === 'warning' ? 'var(--warning-light)' : n.tipo === 'error' ? 'var(--danger-light)' : 'var(--info-light)'};color:${n.tipo === 'warning' ? 'var(--warning)' : n.tipo === 'error' ? 'var(--danger)' : 'var(--info)'};font-size:13px">
            <i class="fas ${n.tipo === 'warning' ? 'fa-exclamation-triangle' : n.tipo === 'error' ? 'fa-times-circle' : 'fa-info-circle'}"></i> ${n.msg}
          </div>
        `).join('')}
      </div>
    `, '<button class="btn btn-secondary" onclick="App.closeModal()">Fechar</button>');
  },

  /* === MODAL SYSTEM === */
  
  openModal(title, body, footer = '', size = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer;
    
    const modal = document.getElementById('modal');
    modal.className = 'modal' + (size ? ' ' + size : '');
    
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  },

  /* === TOAST SYSTEM === */
  
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  /* === LOADING === */
  
  showLoading(text = 'Carregando...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.remove('hidden');
  },

  hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
  }
};

// Inicializar aplicação quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// Expor globalmente
window.App = App;
