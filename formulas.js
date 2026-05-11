/* ============================================
   SHOP ADMINISTRATION ERP
   formulas.js - Utilitários, Cálculos, Validações
   ============================================ */

const Formulas = {
  /* === MOEDA / FORMATAÇÃO === */
  
  formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return 'MT 0,00';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return 'MT ' + num.toLocaleString('pt-MZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  formatNumber(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return num.toLocaleString('pt-MZ', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  },

  formatDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pt-MZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  },

  formatDateTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pt-MZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  parseCurrency(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    return parseFloat(value.toString().replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;
  },

  /* === CÁLCULOS FINANCEIROS === */
  
  calcularMargemLucro(precoCompra, precoVenda) {
    const compra = this.parseCurrency(precoCompra);
    const venda = this.parseCurrency(precoVenda);
    if (!compra || compra <= 0) return 0;
    return ((venda - compra) / compra) * 100;
  },

  calcularLucro(precoCompra, precoVenda, quantidade = 1) {
    const compra = this.parseCurrency(precoCompra);
    const venda = this.parseCurrency(precoVenda);
    return (venda - compra) * quantidade;
  },

  calcularCustoMedio(custoAtual, qtdAtual, novoCusto, novaQtd) {
    const totalQtd = qtdAtual + novaQtd;
    if (totalQtd <= 0) return 0;
    const totalCusto = (custoAtual * qtdAtual) + (novoCusto * novaQtd);
    return totalCusto / totalQtd;
  },

  calcularSubtotal(itens) {
    return itens.reduce((total, item) => {
      const qtd = parseFloat(item.quantidade) || 0;
      const preco = this.parseCurrency(item.preco_venda || item.precoVenda || 0);
      return total + (qtd * preco);
    }, 0);
  },

  calcularDesconto(valor, percentual) {
    return valor * (percentual / 100);
  },

  calcularTotal(subtotal, desconto = 0, taxa = 0) {
    return subtotal - desconto + taxa;
  },

  /* === CÓDIGO AUTOMÁTICO INTELIGENTE === */
  
  gerarCodigoProduto(nome, categoria, peso = '', tamanho = '') {
    const timestamp = Date.now().toString(36).toUpperCase().slice(-3);
    const nomePart = this.normalizarTexto(nome).substring(0, 3).toUpperCase();
    const catPart = this.normalizarTexto(categoria).substring(0, 3).toUpperCase();
    const pesoPart = peso ? '-' + String(peso).replace(/[^0-9]/g, '').substring(0, 3) : '';
    const tamPart = tamanho ? '-' + String(tamanho).replace(/[^0-9]/g, '').substring(0, 2) : '';
    const year = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
    return `${catPart}-${nomePart}${pesoPart}${tamPart}-${year}-${random}`;
  },

  normalizarTexto(texto) {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '');
  },

  /* === VALIDAÇÕES === */
  
  validarProduto(produto, produtosExistentes = []) {
    const errors = [];
    
    if (!produto.nome || produto.nome.trim().length < 2) {
      errors.push('Nome do produto deve ter pelo menos 2 caracteres');
    }
    
    if (!produto.categoria || produto.categoria.trim() === '') {
      errors.push('Categoria é obrigatória');
    }
    
    if (!produto.preco_compra || parseFloat(produto.preco_compra) <= 0) {
      errors.push('Preço de compra deve ser maior que zero');
    }
    
    if (!produto.preco_venda || parseFloat(produto.preco_venda) <= 0) {
      errors.push('Preço de venda deve ser maior que zero');
    }
    
    if (parseFloat(produto.preco_venda) <= parseFloat(produto.preco_compra)) {
      errors.push('Preço de venda deve ser maior que o preço de compra');
    }
    
    if (produto.quantidade !== undefined && parseFloat(produto.quantidade) < 0) {
      errors.push('Quantidade não pode ser negativa');
    }

    // Verificar duplicados
    if (produtosExistentes.length > 0 && produto.nome) {
      const nomeNormalizado = this.normalizarTexto(produto.nome).toLowerCase();
      const duplicado = produtosExistentes.find(p => {
        const existente = this.normalizarTexto(p.nome).toLowerCase();
        return existente === nomeNormalizado || 
               (existente.length > 3 && nomeNormalizado.length > 3 && 
                (existente.includes(nomeNormalizado) || nomeNormalizado.includes(existente)));
      });
      if (duplicado) {
        errors.push(`PRODUTO_JA_EXISTE:${existente.nome || existente}`);
      }
    }
    
    return {
      valido: errors.length === 0,
      errors
    };
  },

  validarVenda(venda) {
    const errors = [];
    
    if (!venda.itens || venda.itens.length === 0) {
      errors.push('Adicione pelo menos um produto à venda');
    }
    
    venda.itens?.forEach((item, i) => {
      if (!item.produto_id) errors.push(`Item ${i+1}: Produto não selecionado`);
      if (!item.quantidade || item.quantidade <= 0) errors.push(`Item ${i+1}: Quantidade inválida`);
    });
    
    if (venda.desconto && (venda.desconto < 0 || venda.desconto > 100)) {
      errors.push('Desconto deve estar entre 0 e 100%');
    }
    
    return { valido: errors.length === 0, errors };
  },

  validarMovimentoCaixa(movimento) {
    const errors = [];
    if (!movimento.tipo || !['entrada', 'saida'].includes(movimento.tipo)) {
      errors.push('Tipo de movimento inválido');
    }
    if (!movimento.valor || movimento.valor <= 0) {
      errors.push('Valor deve ser maior que zero');
    }
    if (!movimento.descricao || movimento.descricao.trim() === '') {
      errors.push('Descrição é obrigatória');
    }
    return { valido: errors.length === 0, errors };
  },

  /* === SIMILARIDADE DE TEXTO === */
  
  calcularSimilaridade(str1, str2) {
    const s1 = this.normalizarTexto(str1).toLowerCase();
    const s2 = this.normalizarTexto(str2).toLowerCase();
    if (s1 === s2) return 1;
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1;
    
    const costs = [];
    for (let i = 0; i <= shorter.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= longer.length; j++) {
        if (i === 0) { costs[j] = j; }
        else if (j > 0) {
          let newValue = costs[j - 1];
          if (shorter[i - 1] !== longer[j - 1]) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[longer.length] = lastValue;
    }
    return (longer.length - costs[longer.length]) / longer.length;
  },

  produtosSimilares(nome, produtos, limiar = 0.6) {
    const similares = [];
    const nomeNorm = this.normalizarTexto(nome).toLowerCase();
    produtos.forEach(p => {
      const sim = this.calcularSimilaridade(nomeNorm, this.normalizarTexto(p.nome).toLowerCase());
      if (sim >= limiar) similares.push({ produto: p, similaridade: sim });
    });
    return similares.sort((a, b) => b.similaridade - a.similaridade);
  },

  /* === ESTOQUE / ALERTAS === */
  
  verificarEstoqueBaixo(quantidade, minimo = 10) {
    if (quantidade <= 0) return 'zerado';
    if (quantidade <= minimo * 0.3) return 'critico';
    if (quantidade <= minimo) return 'baixo';
    return 'ok';
  },

  verificarCombustivelBaixo(litros, minimo = 500) {
    if (litros <= minimo * 0.2) return 'critico';
    if (litros <= minimo) return 'baixo';
    return 'ok';
  },

  /* === DATA / HORA === */
  
  getHoje() {
    return new Date().toISOString().split('T')[0];
  },

  getAgora() {
    return new Date().toISOString();
  },

  getInicioDia(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  },

  getFimDia(date = new Date()) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  },

  getDiasAtras(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString().split('T')[0];
  },

  /* === ESTATÍSTICAS === */
  
  calcularTotais(dados, campo) {
    return dados.reduce((sum, item) => sum + (parseFloat(item[campo]) || 0), 0);
  },

  calcularMedia(dados, campo) {
    if (!dados.length) return 0;
    return this.calcularTotais(dados, campo) / dados.length;
  },

  calcularTendencia(dados, campo) {
    if (dados.length < 2) return 0;
    const recente = this.calcularTotais(dados.slice(-Math.ceil(dados.length / 2)), campo);
    const antigo = this.calcularTotais(dados.slice(0, Math.floor(dados.length / 2)), campo);
    if (antigo === 0) return 0;
    return ((recente - antigo) / antigo) * 100;
  },

  agruparPor(data, campo) {
    return data.reduce((acc, item) => {
      const key = item[campo] || 'Outro';
      acc[key] = (acc[key] || 0) + (parseFloat(item.valor || item.total || 0) || 0);
      return acc;
    }, {});
  },

  /* === GERADORES DE ID === */
  
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5).toUpperCase();
  },

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /* === LOCAL STORAGE === */
  
  storageGet(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch { return defaultValue; }
  },

  storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  },

  storageRemove(key) {
    try { localStorage.removeItem(key); return true; }
    catch { return false; }
  },

  /* === UTILITÁRIOS === */
  
  debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  truncate(str, max = 50) {
    return str.length > max ? str.substring(0, max) + '...' : str;
  },

  /* === EXPORT HELPERS === */
  
  toCSV(dados, headers = null) {
    if (!dados || !dados.length) return '';
    const cols = headers || Object.keys(dados[0]);
    const escape = v => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const lines = [cols.map(h => escape(h)).join(',')];
    dados.forEach(row => {
      lines.push(cols.map(c => escape(row[c])).join(','));
    });
    return '\uFEFF' + lines.join('\n');
  },

  downloadFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /* === DETECÇÃO DE FORMATO === */
  
  detectarFormatoArquivo(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const formatos = {
      'xlsx': 'excel', 'xls': 'excel',
      'csv': 'csv',
      'json': 'json',
      'xml': 'xml',
      'txt': 'texto',
      'pdf': 'pdf',
      'docx': 'word', 'doc': 'word',
      'ods': 'ods',
      'tsv': 'tsv',
      'sql': 'sql'
    };
    return formatos[ext] || 'desconhecido';
  }
};

// Make available globally
window.Formulas = Formulas;
